# Cheap Travels India

Production-ready bus ticketing portal. Customer searches → sees aggregated provider inventory → pays via UPI → ticket is fetched from operator portal and pushed to WhatsApp/email.

Built with Next.js 14 (App Router), SQLite, Playwright, Tailwind.

---

## What's inside

| Path | What it does |
|---|---|
| `app/page.js` | Home / hero search |
| `app/search/page.js` | Bus list with commission-priced fares + live compare |
| `app/bus/[id]/page.js` | Seat selection + boarding points |
| `app/checkout/[orderId]/page.js` | UPI QR + passenger form |
| `app/ticket/[pnr]/page.js` | Branded e-ticket |
| `app/admin/page.js` | Order list + manual reconciliation panel |
| `app/api/*` | REST endpoints |
| `lib/scraper/laxmi.js` | Playwright scraper for Laxmi Holidays |
| `lib/scraper/mock.js` | Fallback inventory when no provider creds set |
| `lib/commission.js` | 20% / 15% / 5% split |
| `lib/db.js` | SQLite via better-sqlite3 |
| `lib/whatsapp.js` | AiSensy / Wati WhatsApp sender |
| `lib/email.js` | SMTP email sender |

---

## Run locally (5 min)

```bash
# 1. Install
cd app
npm install

# 2. Configure (defaults are fine for local testing)
cp .env.example .env.local

# 3. Run
npm run dev
```

Open <http://localhost:3000>. Mock bus data shows immediately. Admin panel at <http://localhost:3000/admin> (token `change-me-to-a-long-random-string` from env).

---

## Deploy to a real server

### Option A — Render.com (easiest, ~5 min)

1. Push this `app/` folder to a new GitHub repo.
2. Go to <https://render.com> → New → Web Service → connect the repo.
3. Build command: `npm install && npm run build`
4. Start command: `npm start`
5. Add environment variables from `.env.example` (set `LAXMI_USER`, `LAXMI_PASS`, `ADMIN_TOKEN`, `UPI_VPA`).
6. Deploy. Render gives you `https://your-app.onrender.com`. Point your domain to it.

### Option B — Hetzner / DigitalOcean VPS (₹400/month, full control — recommended for production)

```bash
# On a fresh Ubuntu 22.04 server
git clone YOUR_REPO_URL cheap-travels && cd cheap-travels/app
docker build -t cheaptravels .
docker run -d -p 80:3000 --env-file .env --name cheaptravels --restart unless-stopped cheaptravels
```

### Option C — Vercel (easy but Playwright won't run on serverless)

Vercel works for the frontend + API, but the Playwright scraper needs a long-running process. If you go Vercel, deploy the scraper as a separate worker on Render/Hetzner and call it via webhook. For most users, Option A or B is simpler.

---

## Going live — checklist

Code is ready. These steps require you, not me:

- [ ] **Domain**: register `cheaptravels.in` (Hostinger / GoDaddy India). Point DNS to your server.
- [ ] **HTTPS**: if you used Render, this is automatic. On VPS, run `certbot --nginx` after pointing the domain.
- [ ] **UPI VPA**: open a current account in "Cheap Travels India Pvt Ltd" name. The bank issues a VPA like `cheaptravels@hdfcbank`. Put it in `UPI_VPA`.
- [ ] **WhatsApp Business API**: sign up at <https://aisensy.com> (₹999/month), submit the `ticket_confirmation` template for Meta approval (takes 1–3 days), put the API key in `WHATSAPP_API_KEY`.
- [ ] **Email**: a Zoho Mail Lite account at `support@cheaptravels.in` (₹100/month). Put SMTP creds in env.
- [ ] **Laxmi credentials**: put your agent ID/password in `LAXMI_USER` / `LAXMI_PASS`. Restart the server. Scraper takes over from mock data.
- [ ] **Admin token**: change `ADMIN_TOKEN` to a long random string (`openssl rand -hex 32`).
- [ ] **First test booking**: from your own phone, end-to-end. Pay yourself, reconcile in admin, verify ticket arrives on WhatsApp.

---

## Adding more providers

Each provider needs a scraper module under `lib/scraper/`. Pattern: copy `laxmi.js`, rename, change selectors. The aggregator in `app/api/buses/route.js` calls every registered scraper in parallel.

When you share the other 2–3 agent IDs, I'll write those modules too.

---

## What it looks like

See `../03-mockup-cheap-travels.html` in the parent folder for the design reference. This app implements the same UX as a real running site.
