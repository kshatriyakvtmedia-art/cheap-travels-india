// server.js — small Express server exposing the SeatSeller scraper to the main
// api/index.js backend. Protected by a shared WORKER_TOKEN header so the public
// internet can't drain your B2B session.

require('dotenv').config();
const express = require('express');
const scraper = require('./scraper');

const PORT = Number(process.env.PORT || 4001);
const TOKEN = process.env.WORKER_TOKEN || '';

const app = express();
app.use(express.json({ limit: '1mb' }));

function auth(req, res, next) {
  if (!TOKEN) return next(); // no token configured — open mode, dev only
  const h = req.headers['x-worker-token'] || '';
  if (h !== TOKEN) return res.status(401).json({ error: 'unauthorized' });
  next();
}

app.get('/health', async (req, res) => {
  try { res.json(await scraper.health()); }
  catch (e) { res.status(500).json({ ok: false, error: String(e?.message || e) }); }
});

app.get('/cities', auth, async (req, res) => {
  try { res.json({ ok: true, cities: await scraper.fetchCities() }); }
  catch (e) { res.status(500).json({ ok: false, error: String(e?.message || e) }); }
});

app.get('/search', auth, async (req, res) => {
  const { from, to, date } = req.query;
  if (!from || !to || !date) return res.status(400).json({ ok: false, error: 'missing from/to/date' });
  try { res.json({ ok: true, buses: await scraper.searchBuses({ from, to, date }) }); }
  catch (e) { res.status(500).json({ ok: false, error: String(e?.message || e) }); }
});

app.get('/layout/:serviceId', auth, async (req, res) => {
  try { res.json({ ok: true, ...(await scraper.fetchSeatLayout(req.params.serviceId)) }); }
  catch (e) { res.status(500).json({ ok: false, error: String(e?.message || e) }); }
});

// Graceful shutdown so the browser closes cleanly on systemd/Docker stop
async function shutdown(signal) {
  console.log(`[worker] received ${signal}, shutting down...`);
  await scraper.shutdown();
  process.exit(0);
}
process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('SIGINT', () => shutdown('SIGINT'));

app.listen(PORT, () => {
  console.log(`[seatseller-worker] listening on http://0.0.0.0:${PORT}`);
  console.log(`[seatseller-worker] auth: ${TOKEN ? 'enabled' : 'DISABLED (set WORKER_TOKEN)'}`);
});
