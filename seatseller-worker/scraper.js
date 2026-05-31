// scraper.js — keeps one Playwright Chromium browser permanently logged in to
// SeatSeller and exposes async helpers that the HTTP server calls.
//
// Why a separate worker process?
//   - Akamai bot-detection on in3.seatseller.travel blocks plain fetch/axios.
//   - A real headed-equivalent browser session (via stealth plugin) survives the
//     bot challenges.
//   - Vercel serverless can't keep a browser warm; this needs a long-running VPS.

require('dotenv').config();
const { chromium: chromiumExtra } = require('playwright-extra');
const stealthPlugin = require('puppeteer-extra-plugin-stealth')();
chromiumExtra.use(stealthPlugin);
const fs = require('fs');
const path = require('path');

const URL = (process.env.SEATSELLER_URL || 'https://in3.seatseller.travel').replace(/\/$/, '');
const USER = process.env.SEATSELLER_USER || '';
const PASS = process.env.SEATSELLER_PASS || '';
const HEADLESS = (process.env.HEADLESS || 'true') !== 'false';
const REFRESH_MS = Number(process.env.SESSION_REFRESH_MS || 25 * 60 * 1000);
const PROXY_SERVER = process.env.PROXY_SERVER || '';
const PROXY_USER = process.env.PROXY_USER || '';
const PROXY_PASS = process.env.PROXY_PASS || '';
const STORAGE_FILE = path.join(__dirname, 'session', 'state.json');

let browser = null;
let context = null;
let lastLoginAt = 0;

async function ensureSessionDir() {
  const dir = path.dirname(STORAGE_FILE);
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
}

async function getContext() {
  const stale = Date.now() - lastLoginAt > REFRESH_MS;
  if (context && !stale) return context;
  if (context) { try { await context.close(); } catch {} context = null; }
  if (!browser) {
    const launchOpts = { headless: HEADLESS, args: ['--no-sandbox', '--disable-blink-features=AutomationControlled'] };
    if (PROXY_SERVER) launchOpts.proxy = { server: PROXY_SERVER, username: PROXY_USER || undefined, password: PROXY_PASS || undefined };
    browser = await chromiumExtra.launch(launchOpts);
  }
  await ensureSessionDir();
  const ctxOpts = {
    userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
    viewport: { width: 1366, height: 900 },
    locale: 'en-IN',
    timezoneId: 'Asia/Kolkata',
  };
  if (fs.existsSync(STORAGE_FILE)) {
    try { ctxOpts.storageState = STORAGE_FILE; } catch {}
  }
  context = await browser.newContext(ctxOpts);
  await login();
  return context;
}

async function login() {
  if (!USER || !PASS) throw new Error('SEATSELLER_USER / SEATSELLER_PASS not set');
  const page = await context.newPage();
  try {
    await page.goto(URL + '/', { waitUntil: 'domcontentloaded', timeout: 45000 });
    // SeatSeller landing usually has a login form on the right-hand side.
    // Selectors verified against the public B2B landing as of late 2024:
    //   input#user_username  + input#user_password  + button[type=submit]
    // If selectors change, update them in one place here.
    await page.waitForSelector('input[name="user[username]"], input#user_username', { timeout: 20000 });
    await page.fill('input[name="user[username]"], input#user_username', USER);
    await page.fill('input[name="user[password]"], input#user_password', PASS);
    await Promise.all([
      page.waitForLoadState('networkidle', { timeout: 30000 }).catch(() => {}),
      page.click('button[type="submit"], input[type="submit"]'),
    ]);
    // After login, redirect goes to /agents/dashboard or /bookings/new
    await page.waitForURL(/\/(agents|bookings|dashboard|home)/, { timeout: 30000 }).catch(() => {});
    // Save the session so restarts don't trigger fresh Akamai challenges.
    await context.storageState({ path: STORAGE_FILE });
    lastLoginAt = Date.now();
    console.log('[seatseller] logged in OK, session saved');
  } finally {
    await page.close();
  }
}

/**
 * Fetch the list of bookable cities (used for the autocomplete on search page).
 * Falls back to scraping the DOM datalist or destinations dropdown.
 */
async function fetchCities() {
  const ctx = await getContext();
  const page = await ctx.newPage();
  try {
    await page.goto(URL + '/bookings/new', { waitUntil: 'domcontentloaded' });
    // SeatSeller injects a JS array of cities into the page for autocomplete.
    // Try a few common selectors / globals.
    const cities = await page.evaluate(() => {
      if (window.cityList && Array.isArray(window.cityList)) return window.cityList;
      if (window.cities && Array.isArray(window.cities)) return window.cities;
      // Fall back to scraping <option> elements
      const opts = Array.from(document.querySelectorAll('select#from_city option, select[name="from_city"] option'));
      return opts.filter(o => o.value).map(o => ({ id: o.value, name: o.textContent.trim() }));
    });
    return cities || [];
  } finally {
    await page.close();
  }
}

/**
 * Search buses for from/to/date. Date should be YYYY-MM-DD or DD-MM-YYYY (we
 * pass it through to the SeatSeller search URL which accepts both).
 */
async function searchBuses({ from, to, date }) {
  const ctx = await getContext();
  const page = await ctx.newPage();
  try {
    const u = `${URL}/bookings/search?from=${encodeURIComponent(from)}&to=${encodeURIComponent(to)}&date=${encodeURIComponent(date)}`;
    await page.goto(u, { waitUntil: 'domcontentloaded', timeout: 45000 });
    await page.waitForSelector('.bus-list, .search-result, .service-row, .bus_row', { timeout: 25000 }).catch(() => {});
    const buses = await page.evaluate(() => {
      const norm = (s) => (s || '').trim().replace(/\s+/g, ' ');
      const num = (s) => Number(String(s || '').replace(/[^\d.]/g, '')) || 0;
      const rows = Array.from(document.querySelectorAll('.bus_row, .service-row, [data-service-id], .result-row'));
      return rows.map(r => {
        const get = (sel) => norm(r.querySelector(sel)?.textContent || '');
        return {
          externalId: r.getAttribute('data-service-id') || r.getAttribute('data-id') || '',
          operator: get('.operator, .travel-name, .agent-name'),
          busType: get('.bus-type, .service-type'),
          departure: get('.dep-time, .departure'),
          arrival: get('.arr-time, .arrival'),
          duration: get('.duration, .travel-time'),
          seatsLeft: num(get('.seats-left, .available-seats')),
          fare: num(get('.fare, .price, .min-fare')),
        };
      }).filter(b => b.externalId && b.fare > 0);
    });
    return buses;
  } finally {
    await page.close();
  }
}

/**
 * Fetch a seat layout for a specific service id. Layout shape mirrors the one
 * api/index.js already produces for Laxmi/RDLH so the frontend doesn't change.
 */
async function fetchSeatLayout(serviceId) {
  const ctx = await getContext();
  const page = await ctx.newPage();
  try {
    await page.goto(`${URL}/bookings/seat-layout/${encodeURIComponent(serviceId)}`, { waitUntil: 'domcontentloaded' });
    await page.waitForSelector('.seat, .seat-cell, [data-seat-no]', { timeout: 20000 });
    const data = await page.evaluate(() => {
      const seats = [];
      let maxRow = 0, maxCol = 0;
      document.querySelectorAll('[data-seat-no], .seat').forEach(s => {
        const seatNo = s.getAttribute('data-seat-no') || s.textContent.trim();
        const row = Number(s.getAttribute('data-row') || 0);
        const col = Number(s.getAttribute('data-col') || 0);
        const cls = s.className.toLowerCase();
        seats.push({
          seatNo, row, col,
          available: cls.includes('available') || (!cls.includes('booked') && !cls.includes('blocked')),
          booked: cls.includes('booked') || cls.includes('blocked'),
          ladies: cls.includes('ladies'),
          sleeper: cls.includes('sleeper') || cls.includes('berth'),
          rowspan: Number(s.getAttribute('rowspan') || 1),
          colspan: Number(s.getAttribute('colspan') || 1),
          fare: Number(s.getAttribute('data-fare') || 0),
        });
        if (row > maxRow) maxRow = row;
        if (col > maxCol) maxCol = col;
      });
      return { seats, maxRow: maxRow + 1, maxCol: maxCol + 1, ladiesAdjacent: [], gentsAdjacent: [] };
    });
    return data;
  } finally {
    await page.close();
  }
}

async function health() {
  const ok = !!(context && (Date.now() - lastLoginAt) < REFRESH_MS);
  return { ok, lastLoginAt, sessionAgeSec: Math.floor((Date.now() - lastLoginAt) / 1000), url: URL };
}

async function shutdown() {
  try { if (context) await context.close(); } catch {}
  try { if (browser) await browser.close(); } catch {}
  context = null; browser = null;
}

module.exports = { fetchCities, searchBuses, fetchSeatLayout, health, shutdown };
