// HTTP client for Laxmi Holidays B2B portal (lxmi.laxmiholidays.com / TicketSimply).
// Login via Playwright (httpOnly session cookie can't be captured otherwise).
// All data fetching via plain fetch (fast JSON REST API under /ibooking/).
// Session is warmed up in background on module load so first user request is fast.

import { chromium } from 'playwright';
import { prisma } from '../db.js';
import { decrypt } from '../crypto.js';

const BASE_URL = 'https://lxmi.laxmiholidays.com';
const SESSION_TTL_MS = 25 * 60 * 1000;

// Use process-level storage so the session survives Next.js hot-module-reload
// (dev mode re-imports this module on each change, but `global` persists).
if (!global.__laxmiState) global.__laxmiState = { creds: null, session: null, loginPromise: null };
const _state = global.__laxmiState;

// Convenience aliases
const _creds = () => _state.creds;
const _setcreds = v => { _state.creds = v; };
const _session = () => _state.session;
const _setSession = v => { _state.session = v; };
const _loginPromise = () => _state.loginPromise;
const _setLoginPromise = v => { _state.loginPromise = v; };

async function getCredentials() {
  if (_creds()) return _creds();
  const row = await prisma.provider.findFirst({
    where: { providerName: { contains: 'Laxmi' } },
  });
  if (!row?.encryptedUsername) throw new Error('Laxmi creds not in DB');
  _setcreds({ user: decrypt(row.encryptedUsername), pass: decrypt(row.encryptedPassword) });
  return _creds();
}

// Playwright login — only called when session is cold or expired
async function doLogin() {
  const { user, pass } = await getCredentials();
  const browser = await chromium.launch({ headless: true, args: ['--no-sandbox'] });
  try {
    const ctx = await browser.newContext({ viewport: { width: 1366, height: 768 } });
    const page = await ctx.newPage();
    await page.goto(`${BASE_URL}/account/signin`, { waitUntil: 'domcontentloaded', timeout: 20000 });
    await page.fill('#login', user);
    await page.fill('#password-field', pass);
    await Promise.all([
      page.waitForNavigation({ waitUntil: 'domcontentloaded', timeout: 15000 }).catch(() => {}),
      page.click('#login_button'),
    ]);
    const cookies = await ctx.cookies(BASE_URL);
    const cookie = cookies.map(c => `${c.name}=${c.value}`).join('; ');
    const csrf = await page.$eval('meta[name="csrf-token"]', e => e.content).catch(() => '');
    _setSession({ cookie, csrf, expiresAt: Date.now() + SESSION_TTL_MS });
    return _session();
  } finally {
    await browser.close();
  }
}

function getSession() {
  const s = _session();
  if (s && Date.now() < s.expiresAt) return Promise.resolve(s);
  if (!_loginPromise()) {
    _setLoginPromise(
      doLogin()
        .catch(e => { console.error('[laxmi] login failed:', e.message); throw e; })
        .finally(() => _setLoginPromise(null))
    );
  }
  return _loginPromise();
}

// Kick off session warmup immediately when module loads so it's ready before first request
getSession().catch(() => {});

// ── City ID map (from #searchbus_from dropdown on the portal) ──────────────
const CITY_IDS = {
  varanasi: 31, delhi: 3, agra: 22, allahabad: 30, prayagraj: 30,
  lucknow: 55, kanpur: 48, mumbai: 12, pune: 19, jaipur: 43,
  gorakhpur: 39, ayodhya: 134, azamgarh: 170, mathura: 59,
};

function cityId(name) {
  const key = String(name).toLowerCase().trim();
  if (CITY_IDS[key]) return CITY_IDS[key];
  for (const [k, v] of Object.entries(CITY_IDS)) {
    if (key.includes(k) || k.includes(key)) return v;
  }
  return null;
}

// YYYY-MM-DD → DD/MM/YYYY
function fmtDate(iso) {
  const [y, m, d] = String(iso).split('-');
  return `${d}/${m}/${y}`;
}

// "732/ 977/ 1026" → [732, 977, 1026]
function parseFares(fareStr) {
  return String(fareStr).split('/').map(s => Number(s.trim())).filter(n => n > 0);
}

// "13:45 hrs" → 825
function durMins(s) {
  const m = String(s).match(/(\d+):(\d+)/);
  return m ? Number(m[1]) * 60 + Number(m[2]) : 0;
}


export async function fetchBuses({ from, to, date }) {
  const fromId = cityId(from);
  const toId = cityId(to);
  if (!fromId || !toId) {
    console.error(`[laxmi] unknown city: "${from}" → "${to}"`);
    return [];
  }

  const { cookie, csrf } = await getSession();
  const depart = fmtDate(date);
  const [d, m, y] = depart.split('/');

  const params = new URLSearchParams({
    rountrip_return: '',
    render_new_dates: 'true',
    prev_date_for_cal: '',
    is_from_modify_org_dest_service_ac: '',
    is_pickup_confirm_phone_block: 'false',
    old_passanger_data_arr: '',
    old_pnr_for_pickup_phone: '',
    is_progressively_loading: 'true',
    is_round_trip_parallel_booking: 'false',
    get_all_services: 'false',
    'searchbus[from]': String(fromId),
    'searchbus[to]': String(toId),
    'searchbus[depart]': depart,
    'searchbus[depart(3i)]': d,
    'searchbus[depart(2i)]': m,
    'searchbus[depart(1i)]': y,
    'searchbus[return]': '',
    'searchbus[code]': '-1',
    show_connecting_services: 'false',
    searchbus_allocation: '0',
    can_block_or_unblock: 'false',
    per_page: '50',
    current_page: '1',
    is_last_request: 'true',
  });

  const resp = await fetch(`${BASE_URL}/ibooking/bookings/search_service?${params}`, {
    headers: {
      Cookie: cookie,
      'X-CSRF-Token': csrf,
      Accept: 'application/json, text/javascript, */*',
      'X-Requested-With': 'XMLHttpRequest',
      Referer: `${BASE_URL}/bookings`,
    },
  });
  if (!resp.ok) throw new Error(`Laxmi search API ${resp.status}`);

  const json = await resp.json();
  const buses = [];

  for (const row of json.data || []) {
    try {
      const det = row[11]; // details object  { res_id, departure_time, commission_arr, ... }
      const sum = row[12]; // summary object  { number, bus_type, depature, arrival, ... }
      if (!det?.res_id || !sum?.depature) continue;
      if (det.is_reservation_blocked) continue;

      const fares = parseFares(sum.fare);
      if (!fares.length) continue;

      // Encode route context in externalId (resId|fromId|toId|depart) so
      // fetchSeats can reconstruct the select_seat URL without in-memory state.
      const resId = String(det.res_id);
      const externalId = `${resId}|${fromId}|${toId}|${depart}`;

      buses.push({
        externalId,
        provider: 'laxmi',
        operator: 'Laxmi Holidays',
        busType: sum.bus_type || '',
        departure: sum.depature || '',
        arrival: sum.arrival || '',
        durationMins: durMins(sum.duration),
        netFare: Math.min(...fares),
        providerCommissionPct: parseFloat(det.commission_arr) || 0,
        seatsAvailable: Math.max(0, sum.available_seats || 0),
        amenities: [],
        boardingPoints: (sum.boarding_stage_detail_arr || []).map(p => ({
          id: String(p[0] || ''), name: String(p[2] || ''), address: '', time: String(p[1] || ''),
        })),
        droppingPoints: (sum.dropoff_stage_detail_arr || []).map(p => ({
          id: String(p[0] || ''), name: String(p[2] || ''), address: '', time: String(p[1] || ''),
        })),
      });
    } catch (e) {
      console.error('[laxmi] row parse error:', e.message);
    }
  }
  return buses;
}

export async function fetchSeats(busExternalId) {
  const { cookie, csrf } = await getSession();
  // externalId format: "resId|fromId|toId|depart" — decode it
  const parts = String(busExternalId).split('|');
  const resId = parts[0];
  const fromId = parts[1] || 0;
  const toId = parts[2] || 0;
  const depart = parts[3] || '';

  // 1. Seat count summary
  const availResp = await fetch(`${BASE_URL}/ibooking/bookings/seater_sleeper_availability_data`, {
    method: 'POST',
    headers: {
      Cookie: cookie, 'X-CSRF-Token': csrf,
      'Content-Type': 'application/x-www-form-urlencoded',
      'X-Requested-With': 'XMLHttpRequest',
    },
    body: `res_ids=${encodeURIComponent(resId)}`,
  });
  const availJson = await availResp.json();
  const avail = availJson[resId] || {};
  const isSleeper = (avail.sleeper_count || 0) > 0;

  // 2. Per-seat status + position (full JS response — requires text/javascript Accept)
  const seatResp = await fetch(
    `${BASE_URL}/ibooking/bookings/select_seat/${encodeURIComponent(resId)}` +
    `?searchbus_params[from]=${fromId}&searchbus_params[to]=${toId}` +
    `&searchbus_params[depart]=${encodeURIComponent(depart)}` +
    `&searchbus_params[terminal]=0&searchbus_params[code]=-1`,
    {
      headers: {
        Cookie: cookie, 'X-CSRF-Token': csrf,
        'X-Requested-With': 'XMLHttpRequest',
        Accept: 'text/javascript, */*',
        Referer: `${BASE_URL}/bookings`,
      },
    }
  );
  const seatJs = await seatResp.text();

  // seat_data_hash: { "1A": [statusCode, type, fare, ...] }  — statusCode 0 = available
  // seat_no_row_cols_hash: { "1A": "rowIdx_colIdx_..." }
  const sdRaw = seatJs.match(/var\s+seat_data_hash\s*=\s*(\{[^{}]+\})/)?.[1];
  const rcRaw = seatJs.match(/var\s+seat_no_row_cols_hash\s*=\s*(\{[^{}]+\})/)?.[1];

  if (!sdRaw || !rcRaw || sdRaw === '{}' || rcRaw === '{}') {
    const total = avail.total_seats || 36;
    const cols = isSleeper ? 3 : 4;
    return {
      rows: Math.ceil(total / cols), cols, sleeper: isSleeper,
      seats: Array.from({ length: total }, (_, i) => ({
        no: String(i + 1), status: 'available', sleeper: isSleeper,
      })),
    };
  }

  let seatData, rowColData;
  try {
    seatData = JSON.parse(sdRaw.replace(/\\"/g, '"'));
    rowColData = JSON.parse(rcRaw.replace(/\\"/g, '"'));
  } catch (e) {
    console.error('[laxmi] seat parse error:', e.message);
    return null;
  }

  let maxRow = 0, maxCol = 0;
  const seats = [];
  for (const [seatNo, arr] of Object.entries(seatData)) {
    const parts = (rowColData[seatNo] || '0_0').split('_');
    const row = parseInt(parts[0], 10) || 0;
    const col = parseInt(parts[1], 10) || 0;
    maxRow = Math.max(maxRow, row);
    maxCol = Math.max(maxCol, col);
    seats.push({
      no: seatNo,
      status: (Array.isArray(arr) ? arr[0] : 1) === 0 ? 'available' : 'booked',
      sleeper: isSleeper,
      row, col,
    });
  }

  return { rows: maxRow + 1, cols: maxCol + 1, sleeper: isSleeper, seats };
}

export async function placeProviderBooking(order) {
  console.error('[laxmi] placeProviderBooking not yet implemented');
  return { ok: false, error: 'Laxmi provider booking not yet implemented' };
}

export function isConfigured() {
  return true;
}
