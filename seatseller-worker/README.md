# SeatSeller Worker

A small Node.js + Playwright service that keeps one Chromium browser permanently
logged in to **in3.seatseller.travel** and exposes a tiny HTTP API for your main
backend (`api/index.js`) to call.

Run this on a small VPS (Hetzner CX11 ~₹400/month, or DigitalOcean basic
droplet). **Do not deploy on Vercel** — it needs a long-running process.

---

## Quick deploy (Ubuntu 22.04 VPS)

```bash
# 1. Install Node 20 + Chromium system deps
curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -
sudo apt-get install -y nodejs

# 2. Get the code
git clone YOUR_REPO_URL && cd YOUR_REPO/seatseller-worker

# 3. Install dependencies + Chromium binary (one-time)
npm install
npx playwright install chromium --with-deps

# 4. Configure
cp .env.example .env
nano .env       # fill in SeatSeller creds + a long WORKER_TOKEN

# 5. Run with PM2 (auto-restart, runs on boot)
sudo npm install -g pm2
pm2 start server.js --name seatseller-worker
pm2 save
pm2 startup    # follow the printed instruction
```

Worker now runs on `http://YOUR_VPS_IP:4001`.

### Lock it down

Only your Vercel app should be able to reach it. Two ways:

**A. Firewall (simpler)**
```bash
sudo ufw allow ssh
sudo ufw allow from <VERCEL_IP_RANGE> to any port 4001
sudo ufw enable
```
But Vercel uses many IPs, so this is awkward. Better: tunnel.

**B. Cloudflare Tunnel (recommended, free)**
1. `wget https://github.com/cloudflare/cloudflared/releases/latest/download/cloudflared-linux-amd64.deb && sudo dpkg -i cloudflared*.deb`
2. `cloudflared tunnel login` (uses your Cloudflare account)
3. `cloudflared tunnel create seatseller-worker`
4. Add a hostname like `worker.cheaptravels.in` pointing to `http://localhost:4001` in the Zero Trust dashboard.
5. `cloudflared tunnel run seatseller-worker`
6. Your main backend now calls `https://worker.cheaptravels.in/search?...` with the `X-Worker-Token` header.

---

## Endpoints

All require `X-Worker-Token: <your token>` header (except `/health`).

| Method | Path | Returns |
|---|---|---|
| GET | `/health` | `{ ok, lastLoginAt, sessionAgeSec, url }` |
| GET | `/cities` | `{ ok, cities: [{ id, name }] }` |
| GET | `/search?from=&to=&date=` | `{ ok, buses: [...] }` |
| GET | `/layout/:serviceId` | `{ ok, seats, maxRow, maxCol, ladiesAdjacent, gentsAdjacent }` |

Bus and layout shapes mirror what `api/index.js` already returns for Laxmi /
RDLH, so the frontend doesn't change.

---

## What to put in your main backend

Add these to your Vercel env vars:

```
SEATSELLER_WORKER_URL=https://worker.cheaptravels.in
SEATSELLER_WORKER_TOKEN=same_long_random_string_as_in_worker_env
```

The patch in `../api/index.js` reads these and calls the worker. If the worker
is down or env is unset, the search endpoint just skips SeatSeller and returns
Laxmi + RDLH results as before — no breakage.

---

## When the official redBus Partner API gets approved

Replace `scraper.js` with a thin HTTP client to the real API. The `server.js`
HTTP shape (`/cities`, `/search`, `/layout/:id`) stays identical, so
`api/index.js` and the frontend continue to work unchanged.

---

## Selectors will drift

SeatSeller's HTML/CSS changes every few weeks. When buses stop coming back:

1. SSH in: `pm2 logs seatseller-worker`
2. Set `HEADLESS=false` in `.env`, restart, watch the browser open via VNC/X11.
3. Update selectors in `scraper.js` (search for the comments labelled
   "Selectors verified against ..." — adjust to the current DOM).
4. `pm2 restart seatseller-worker`.

Typical fix takes 10–20 min. This is the cost of scraping vs official API.

---

## Cost

- Hetzner CX11 (2 vCPU, 4 GB) ≈ **€4/month (~₹400)**
- Cloudflare Tunnel: free
- Total infra: **₹400/month** until the partner API replaces it.
