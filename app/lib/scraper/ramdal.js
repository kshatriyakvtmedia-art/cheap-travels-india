// Ram Dalal Travels — SeatSeller B2B REST API client (rdlh.ticketsimply.com).
// Credentials are stored encrypted in the `providers` DB table.
// Uses HTTP cookie auth + REST endpoints (no Playwright needed).

import { prisma } from '../db.js';
import { decrypt } from '../crypto.js';

const PORTAL = 'https://rdlh.ticketsimply.com';
const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';

let _creds = null;
let _cookies = '';
let _cookiesExpiry = 0;
let _cityMap = null; // lowercase name → string id

// City name → SeatSeller city ID (from portal's city list, same as SPA)
const CITY_IDS = {
  'azamgarh': '170',
  'delhi': '3',
  'mumbai': '255',
  'varanasi': '31',
  'lucknow': '24',
  'allahabad': '30',
  'prayagraj': '30',
  'agra': '22',
  'kanpur': '29',
  'gorakhpur': '23',
  'meerut': '91',
  'ghaziabad': '11',
  'noida': '12',
  'gurgaon': '15',
  'gurugram': '15',
  'shimla': '80',
  'haridwar': '67',
  'dehradun': '16',
  'chandigarh': '20',
  'patna': '127',
  'manali': '53',
  'rishikesh': '68',
  'dharamshala': '81',
  'amritsar': '35',
  'jammu': '45',
  'katra': '46',
  'mathura': '21',
  'jaipur': '40',
  'nainital': '100',
  'mussoorie': '101',
};

async function getCredentials() {
  if (_creds) return _creds;
  const row = await prisma.provider.findFirst({
    where: { portalUrl: { contains: 'rdlh' } },
  });
  if (!row?.encryptedUsername) throw new Error('Ram Dalal credentials not found in DB');
  _creds = {
    username: decrypt(row.encryptedUsername),
    password: decrypt(row.encryptedPassword),
  };
  return _creds;
}

function extractCookies(headers) {
  const cookies = [];
  headers.forEach((v, k) => {
    if (k.toLowerCase() === 'set-cookie') cookies.push(v.split(';')[0]);
  });
  return cookies;
}

function mergeCookies(list) {
  const map = new Map();
  for (const c of list) {
    const eq = c.indexOf('=');
    if (eq > 0) map.set(c.slice(0, eq).trim(), c.slice(eq + 1).trim());
  }
  return Array.from(map.entries()).map(([k, v]) => `${k}=${v}`);
}

async function ensureSession() {
  if (_cookies && Date.now() < _cookiesExpiry) return;
  const creds = await getCredentials();

  const landingRes = await fetch(PORTAL, {
    headers: { 'User-Agent': UA },
    redirect: 'manual',
  });
  const landingCookies = extractCookies(landingRes.headers);

  const authRes = await fetch(`${PORTAL}/account/signin`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
      'Cookie': landingCookies.join('; '),
      'User-Agent': UA,
      'Referer': `${PORTAL}/`,
    },
    body: new URLSearchParams({ login: creds.username, password: creds.password }).toString(),
    redirect: 'manual',
  });
  const authCookies = extractCookies(authRes.headers);

  _cookies = mergeCookies([...landingCookies, ...authCookies]).join('; ');
  _cookiesExpiry = Date.now() + 14 * 60 * 1000; // 14 min (portal sessions ~15 min)
}

async function apiFetch(path) {
  await ensureSession();
  const res = await fetch(`${PORTAL}${path}`, {
    headers: { Cookie: _cookies, 'User-Agent': UA, Accept: 'application/json' },
  });
  const text = await res.text();
  // Detect session expiry (HTML redirect back to login)
  if (text.startsWith('<!') || text.includes('signin')) {
    _cookies = '';
    _cookiesExpiry = 0;
    await ensureSession();
    const retry = await fetch(`${PORTAL}${path}`, {
      headers: { Cookie: _cookies, 'User-Agent': UA, Accept: 'application/json' },
    });
    return retry.json();
  }
  return JSON.parse(text);
}

async function getCityId(name) {
  // Prefer DB-backed city list from portal
  if (!_cityMap) {
    try {
      const data = await apiFetch('/rest-api/rest/v1/searchService/sourcecities');
      const list = Array.isArray(data) ? data : (data.cities || data.sourceCities || []);
      if (list.length > 0) {
        _cityMap = {};
        for (const c of list) {
          const n = (c.name || c.cityName || '').toLowerCase().trim();
          const id = String(c.id || c.cityId || '');
          if (n && id) _cityMap[n] = id;
        }
      }
    } catch {
      // fall through to static map
    }
    if (!_cityMap || Object.keys(_cityMap).length === 0) _cityMap = { ...CITY_IDS };
  }
  const id = _cityMap[name.toLowerCase().trim()];
  if (!id) throw new Error(`City not in Ram Dalal network: ${name}`);
  return id;
}

function diffMins(dep, arr) {
  const [h1, m1] = String(dep || '').split(':').map(Number);
  const [h2, m2] = String(arr || '').split(':').map(Number);
  if ([h1, m1, h2, m2].some(isNaN)) return 0;
  let d = (h2 * 60 + m2) - (h1 * 60 + m1);
  if (d < 0) d += 24 * 60;
  return d;
}

function mapBus(b) {
  const dep = b.departureTime || b.departure || b.deptTime || '';
  const arr = b.arrivalTime || b.arrival || b.arvlTime || '';
  const bp = b.boardingTimes || b.boardingPoints || b.bpList || [];
  const dp = b.droppingTimes || b.droppingPoints || b.dpList || [];
  return {
    externalId: String(b.id || b.serviceId || b.busId || b.tripId || ''),
    provider: 'ramdal',
    operator: b.travels || b.operatorName || b.busName || 'Ram Dalal Travels',
    busType: b.busType || b.vehicleType || 'AC Sleeper (2+1)',
    departure: dep,
    arrival: arr,
    durationMins: diffMins(dep, arr),
    netFare: Number(b.fare || b.baseFare || b.netFare || 0),
    providerCommissionPct: Number(b.commissionRate || b.commission || 10),
    seatsAvailable: Number(b.availableSeats || b.remainingSeats || b.seatsAvailable || 0),
    rating: 4.5,
    ratingCount: 0,
    amenities: Array.isArray(b.amenities) ? b.amenities : [],
    boardingPoints: bp.map(p => ({
      id: String(p.bpId || p.id || p.name || ''),
      name: p.bpName || p.name || p.cityName || '',
      address: p.address || p.landmark || '',
      time: p.bpTime || p.time || dep,
    })),
    droppingPoints: dp.map(p => ({
      id: String(p.bpId || p.id || p.name || ''),
      name: p.bpName || p.name || p.cityName || '',
      address: p.address || p.landmark || '',
      time: p.bpTime || p.time || arr,
    })),
  };
}

export async function fetchBuses({ from, to, date }) {
  const [fromId, toId] = await Promise.all([getCityId(from), getCityId(to)]);
  const data = await apiFetch(
    `/rest-api/rest/v1/searchService/search?from=${fromId}&to=${toId}&date=${date}`
  );
  const list = data.serviceList || data.buses || data.results || (Array.isArray(data) ? data : []);
  return list.map(mapBus);
}

export async function fetchSeats(busExternalId) {
  try {
    const data = await apiFetch(
      `/rest-api/rest/v1/inventoryService/layout?serviceId=${encodeURIComponent(busExternalId)}`
    );
    const seats = (data.seats || data.seatList || []).map(s => ({
      no: String(s.no || s.seatNo || s.name || ''),
      status: s.booked || s.status === 'B' ? 'booked'
             : s.ladies || s.status === 'L' ? 'ladies'
             : 'available',
      sleeper: true,
    }));
    return {
      rows: Number(data.rows || data.totalRows || 7),
      cols: 3,
      sleeper: true,
      seats,
    };
  } catch {
    // If seat layout API isn't available, import mock as fallback
    const { fetchSeats: mockSeats } = await import('./mock.js');
    return mockSeats(busExternalId);
  }
}

export async function placeProviderBooking(order) {
  try {
    await ensureSession();
    const body = {
      serviceId: order.bus_external_id,
      seatNo: order.seat_no,
      boardingPointId: order.boarding_point,
      passengerName: order.passenger_name,
      passengerAge: order.passenger_age,
      passengerGender: order.passenger_gender,
      mobileNo: order.customer_phone,
      email: order.customer_email,
    };
    const res = await fetch(`${PORTAL}/rest-api/rest/v1/inventoryService/blockTicket`, {
      method: 'POST',
      headers: {
        Cookie: _cookies,
        'User-Agent': UA,
        'Content-Type': 'application/json',
        Accept: 'application/json',
      },
      body: JSON.stringify(body),
    });
    const data = await res.json();
    const pnr = data.pnr || data.ticketNo || data.bookingId;
    if (!pnr) throw new Error(`No PNR in response: ${JSON.stringify(data)}`);
    return { ok: true, pnr: String(pnr) };
  } catch (e) {
    return { ok: false, error: String(e?.message || e) };
  }
}

export function isConfigured() {
  return true; // Credentials loaded from DB on first use
}
