// Playwright scraper for Laxmi Holidays B2B portal (lxmi.laxmiholidays.com).
//
// The actual selectors below are PLACEHOLDERS — they need to be confirmed by
// running this scraper against the live portal with Chrome connected to the
// session, then adjusted to match the real DOM. The structure of the code is
// production-ready; the selectors are the part to refine once we map the portal.
//
// To activate: set LXMI_USERNAME and LXMI_PASSWORD in env. With them blank, the
// aggregator falls back to lib/scraper/mock.js.

import { chromium } from 'playwright';

const LOGIN_URL = process.env.LAXMI_LOGIN_URL || 'https://lxmi.laxmiholidays.com/';
const USER = process.env.LXMI_USERNAME || '';
const PASS = process.env.LXMI_PASSWORD || '';

// Cache the browser context across requests so we don't re-login on every search.
let _ctx = null;
let _ctxExpiresAt = 0;
const CTX_TTL_MS = 1000 * 60 * 25; // 25 minutes — most B2B sessions last 30+

async function getContext() {
  const now = Date.now();
  if (_ctx && now < _ctxExpiresAt) return _ctx;
  if (_ctx) { try { await _ctx.close(); } catch {} }

  const browser = await chromium.launch({ headless: true, args: ['--no-sandbox'] });
  const ctx = await browser.newContext({
    userAgent: 'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 Chrome/120 Safari/537.36',
    viewport: { width: 1366, height: 900 },
  });
  await login(ctx);
  _ctx = ctx;
  _ctxExpiresAt = now + CTX_TTL_MS;
  return ctx;
}

async function login(ctx) {
  const page = await ctx.newPage();
  await page.goto(LOGIN_URL, { waitUntil: 'domcontentloaded', timeout: 30000 });
  // PLACEHOLDER selectors — confirm against actual portal:
  await page.fill('input[name="username"], input[type="text"]', USER);
  await page.fill('input[name="password"], input[type="password"]', PASS);
  await Promise.all([
    page.waitForLoadState('networkidle', { timeout: 30000 }).catch(() => {}),
    page.click('button[type="submit"], input[type="submit"]'),
  ]);
  await page.close();
}

/** Search buses for a route+date. Returns canonical Bus[] shape (same as mock). */
export async function fetchBuses({ from, to, date }) {
  if (!USER || !PASS) throw new Error('LXMI_USERNAME / LXMI_PASSWORD not set');
  const ctx = await getContext();
  const page = await ctx.newPage();
  try {
    await page.goto(LOGIN_URL.replace(/\/$/, '') + '/Booking/Bus', { waitUntil: 'domcontentloaded' });
    // PLACEHOLDER — most B2B bus portals have something like:
    //   <input id="fromCity">, <input id="toCity">, <input id="travelDate" type="date">
    await page.fill('#fromCity', from);
    await page.fill('#toCity', to);
    await page.fill('#travelDate', date); // YYYY-MM-DD
    await Promise.all([
      page.waitForLoadState('networkidle', { timeout: 45000 }).catch(() => {}),
      page.click('#btnSearch'),
    ]);

    // Parse the results table. PLACEHOLDER selectors:
    const rows = await page.$$eval('.bus-result-row', (els) => els.map((el) => {
      const text = (sel) => el.querySelector(sel)?.textContent?.trim() || '';
      const num = (s) => Number((s || '').replace(/[^\d.]/g, '')) || 0;
      return {
        externalId: el.getAttribute('data-bus-id') || '',
        operator: text('.operator-name'),
        busType: text('.bus-type'),
        departure: text('.dep-time'),
        arrival: text('.arr-time'),
        durationMins: 0, // compute below
        netFare: num(text('.net-fare')),
        providerCommissionPct: num(text('.commission-pct')),
        seatsAvailable: num(text('.seats-left')),
        amenities: Array.from(el.querySelectorAll('.amenity')).map(a => a.textContent.trim()),
        boardingPoints: [],
        droppingPoints: [],
      };
    }));

    // Enrich each with boarding/dropping points (usually a modal or expand row)
    for (const bus of rows) {
      try {
        const points = await page.evaluate((id) => {
          const el = document.querySelector(`[data-bus-id="${id}"] .points-container`);
          if (!el) return { boarding: [], dropping: [] };
          const parse = (sel) => Array.from(el.querySelectorAll(sel)).map(p => ({
            id: p.getAttribute('data-point-id') || p.textContent.trim(),
            name: p.querySelector('.point-name')?.textContent?.trim() || p.textContent.trim(),
            address: p.querySelector('.point-address')?.textContent?.trim() || '',
            time: p.querySelector('.point-time')?.textContent?.trim() || '',
          }));
          return { boarding: parse('.boarding-point'), dropping: parse('.dropping-point') };
        }, bus.externalId);
        bus.boardingPoints = points.boarding;
        bus.droppingPoints = points.dropping;
        bus.durationMins = diffMins(bus.departure, bus.arrival);
        bus.provider = 'laxmi';
      } catch {}
    }
    return rows;
  } finally {
    await page.close();
  }
}

/** Fetch the seat layout for one bus. */
export async function fetchSeats(busExternalId) {
  if (!USER || !PASS) throw new Error('LXMI_USERNAME / LXMI_PASSWORD not set');
  const ctx = await getContext();
  const page = await ctx.newPage();
  try {
    await page.goto(`${LOGIN_URL.replace(/\/$/, '')}/Booking/Seat?busId=${encodeURIComponent(busExternalId)}`);
    await page.waitForSelector('.seat', { timeout: 15000 });
    const data = await page.evaluate(() => {
      const seats = Array.from(document.querySelectorAll('.seat')).map(s => ({
        no: s.getAttribute('data-seat-no') || s.textContent.trim(),
        status: s.classList.contains('booked') ? 'booked'
              : s.classList.contains('ladies') ? 'ladies'
              : 'available',
        sleeper: s.classList.contains('sleeper'),
      }));
      const layoutEl = document.querySelector('.seat-layout');
      return {
        rows: Number(layoutEl?.getAttribute('data-rows') || 6),
        cols: Number(layoutEl?.getAttribute('data-cols') || 5),
        sleeper: !!document.querySelector('.seat.sleeper'),
        seats,
      };
    });
    return data;
  } finally {
    await page.close();
  }
}

/** Actually book a held seat on the provider portal. Called ONLY after payment is confirmed. */
export async function placeProviderBooking(order) {
  if (!USER || !PASS) throw new Error('LXMI_USERNAME / LXMI_PASSWORD not set');
  const ctx = await getContext();
  const page = await ctx.newPage();
  try {
    await page.goto(`${LOGIN_URL.replace(/\/$/, '')}/Booking/Seat?busId=${encodeURIComponent(order.bus_external_id)}`);
    await page.click(`[data-seat-no="${order.seat_no}"]`);
    await page.fill('#passengerName', order.passenger_name || '');
    await page.fill('#passengerAge', String(order.passenger_age || 0));
    await page.selectOption('#passengerGender', order.passenger_gender || 'M');
    await page.fill('#mobile', order.customer_phone || '');
    await page.fill('#email', order.customer_email || '');
    await page.click('#proceedBoarding');
    await page.click(`[data-point-id="${order.boarding_point}"]`);
    await page.click('#confirmBooking');
    await page.waitForSelector('.pnr-display', { timeout: 30000 });
    const pnr = (await page.textContent('.pnr-display'))?.trim();
    if (!pnr) throw new Error('PNR not returned by provider');
    return { ok: true, pnr };
  } catch (e) {
    return { ok: false, error: String(e?.message || e) };
  } finally {
    await page.close();
  }
}

function diffMins(t1, t2) {
  const [h1, m1] = String(t1).split(':').map(Number);
  const [h2, m2] = String(t2).split(':').map(Number);
  if ([h1, m1, h2, m2].some(isNaN)) return 0;
  let mins = (h2 * 60 + m2) - (h1 * 60 + m1);
  if (mins < 0) mins += 24 * 60;
  return mins;
}

export function isConfigured() {
  return !!(USER && PASS);
}
