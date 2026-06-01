const express = require('express');
const cors = require('cors');
const cheerio = require('cheerio');
const path = require('path');
const fs = require('fs');

const app = express();
const PORT = process.env.PORT || 3000;

app.use(cors());
app.use(express.json());

// Serve static frontend files from public directory
app.use(express.static(path.join(__dirname, '..', 'public')));

// B2B Portal configurations for both Laxmi and Ram Dalal
const OPERATORS = {
  lxmi: {
    username: process.env.LXMI_USERNAME || 'lxmi.cheap',
    password: process.env.LXMI_PASSWORD || '[REDACTED]',
    url: process.env.LXMI_PORTAL_URL || 'https://lxmi.laxmiholidays.com',
    name: 'Laxmi Holidays Pvt Ltd',
    sessionCookies: [],
    csrfToken: '',
    lastLoginTime: 0,
    cities: []
  },
  rdlh: {
    username: process.env.RDLH_USERNAME || 'cheap',
    password: process.env.RDLH_PASSWORD || '[REDACTED]',
    url: process.env.RDLH_PORTAL_URL || 'https://rdlh.ticketsimply.com',
    name: 'Ram Dalal Holidays',
    sessionCookies: [],
    csrfToken: '',
    lastLoginTime: 0,
    cities: []
  }
};

// Helper to extract CSRF token and cookies for a specific operator B2B portal
async function performLogin(opKey) {
  const op = OPERATORS[opKey];
  if (!op) throw new Error(`Unknown operator key: ${opKey}`);
  console.log(`Starting B2B portal login sequence for ${op.name}...`);
  try {
    // 1. Fetch main page to get initial cookies and CSRF token
    const initialRes = await fetch(op.url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
      }
    });
    const text = await initialRes.text();
    const headers = initialRes.headers;
    
    // Extract CSRF token
    const tokenMatch = text.match(/name="csrf-token" content="([^"]+)"/) || text.match(/name="authenticity_token" value="([^"]+)"/);
    op.csrfToken = tokenMatch ? tokenMatch[1] : '';
    
    // Extract cookies
    const cookies = [];
    headers.forEach((value, name) => {
      if (name.toLowerCase() === 'set-cookie') {
        cookies.push(value.split(';')[0]);
      }
    });

    if (!op.csrfToken) {
      throw new Error(`Could not retrieve authenticity token from ${op.name} login page.`);
    }

    // 2. Perform POST to signin endpoint
    const bodyParams = new URLSearchParams();
    bodyParams.append("login", op.username);
    bodyParams.append("password", op.password);
    bodyParams.append("login_flag", "");
    bodyParams.append("authenticity_token", op.csrfToken);

    const loginRes = await fetch(`${op.url}/account/signin`, {
      method: "POST",
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
        "Cookie": cookies.join("; "),
        "User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
        "Referer": `${op.url}/`,
        "X-CSRF-Token": op.csrfToken,
        "X-Requested-With": "XMLHttpRequest"
      },
      body: bodyParams.toString(),
      redirect: "manual"
    });

    const finalCookies = [...cookies];
    loginRes.headers.forEach((value, name) => {
      if (name.toLowerCase() === 'set-cookie') {
        finalCookies.push(value.split(';')[0]);
      }
    });

    op.sessionCookies = finalCookies;
    op.lastLoginTime = Date.now();
    console.log(`Logged in successfully to ${op.name}! Cookies locked.`);
    return true;
  } catch (error) {
    console.error(`Login attempt failed for ${op.name}:`, error.message);
    throw error;
  }
}

// Ensure valid session is active for a specific operator B2B portal
async function ensureSession(opKey) {
  const op = OPERATORS[opKey];
  if (!op) throw new Error(`Unknown operator key: ${opKey}`);
  const SESSION_TIMEOUT = 10 * 60 * 1000; // 10 minutes cache
  if (op.sessionCookies.length === 0 || (Date.now() - op.lastLoginTime) > SESSION_TIMEOUT) {
    await performLogin(opKey);
  }
}

// Helper to fetch destinations from operator JS file
async function fetchCities(opKey) {
  const op = OPERATORS[opKey];
  await ensureSession(opKey);
  console.log(`Fetching dynamic B2B JS file for destinations of ${op.name}...`);
  
  const jsRes = await fetch(`${op.url}/agent_dynamic_js_content.js`, {
    headers: {
      "Cookie": op.sessionCookies.join("; "),
      "User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
      "Referer": `${op.url}/bookings`
    }
  });

  if (jsRes.status === 401) {
    console.log(`Session expired for ${op.name} while fetching cities, re-authenticating...`);
    await performLogin(opKey);
    return fetchCities(opKey);
  }

  const jsText = await jsRes.text();
  
  const startIdx = jsText.indexOf('var destinations_map =');
  if (startIdx === -1) {
    throw new Error(`Could not find destinations_map variable in ${op.name} B2B JS.`);
  }
  const endIdx = jsText.indexOf(']]}', startIdx) + 3;
  const decl = jsText.substring(startIdx, endIdx);
  
  const jsonStr = decl.substring(decl.indexOf('{'), decl.lastIndexOf('}') + 1);
  const dataMap = JSON.parse(jsonStr);

  if (!dataMap.destinations) {
    throw new Error(`Parsed destinations mapping for ${op.name} is empty.`);
  }

  return dataMap.destinations.map(d => ({
    name: d[0],
    id: String(d[1])
  }));
}

// Load static routes_data.json as a fallback database for city name lookup
let staticRoutesData = null;
try {
  const routesPath = path.join(__dirname, '..', 'public', 'routes_data.json');
  if (fs.existsSync(routesPath)) {
    staticRoutesData = JSON.parse(fs.readFileSync(routesPath, 'utf8'));
    console.log("Loaded static routes_data.json fallback successfully.");
  }
} catch (err) {
  console.error("Failed to load static routes_data.json:", err.message);
}

// Helper to resolve generic city dropdown values to operator-specific names and IDs
function resolveCityNamesAndIds(fromVal, toVal) {
  let fromName = '';
  let toName = '';
  let lxmiFromId = null;
  let lxmiToId = null;
  let rdlhFromId = null;
  let rdlhToId = null;

  const getCityFromStatic = (id) => {
    if (!staticRoutesData) return null;
    const all = [...(staticRoutesData.origins || []), ...(staticRoutesData.destinations || [])];
    return all.find(x => x.id === id);
  };

  // Resolve Names and local IDs first
  if (fromVal.startsWith('rd-')) {
    const rdlhId = fromVal.replace('rd-', '');
    const c = (OPERATORS.rdlh.cities || []).find(x => x.id === rdlhId);
    if (c) {
      fromName = c.name;
    } else {
      const fallback = getCityFromStatic(rdlhId);
      if (fallback) fromName = fallback.name;
    }
    rdlhFromId = rdlhId;
  } else {
    const c = (OPERATORS.lxmi.cities || []).find(x => x.id === fromVal);
    if (c) {
      fromName = c.name;
    } else {
      const fallback = getCityFromStatic(fromVal);
      if (fallback) fromName = fallback.name;
    }
    lxmiFromId = fromVal;
  }

  if (toVal.startsWith('rd-')) {
    const rdlhId = toVal.replace('rd-', '');
    const c = (OPERATORS.rdlh.cities || []).find(x => x.id === rdlhId);
    if (c) {
      toName = c.name;
    } else {
      const fallback = getCityFromStatic(rdlhId);
      if (fallback) toName = fallback.name;
    }
    rdlhToId = rdlhId;
  } else {
    const c = (OPERATORS.lxmi.cities || []).find(x => x.id === toVal);
    if (c) {
      toName = c.name;
    } else {
      const fallback = getCityFromStatic(toVal);
      if (fallback) toName = fallback.name;
    }
    lxmiToId = toVal;
  }

  // Cross-reference IDs by name
  if (fromName) {
    if (!lxmiFromId) {
      const c = (OPERATORS.lxmi.cities || []).find(x => x.name.toLowerCase() === fromName.toLowerCase());
      if (c) lxmiFromId = c.id;
    }
    if (!rdlhFromId) {
      const c = (OPERATORS.rdlh.cities || []).find(x => x.name.toLowerCase() === fromName.toLowerCase());
      if (c) rdlhFromId = c.id;
    }
  }

  if (toName) {
    if (!lxmiToId) {
      const c = (OPERATORS.lxmi.cities || []).find(x => x.name.toLowerCase() === toName.toLowerCase());
      if (c) lxmiToId = c.id;
    }
    if (!rdlhToId) {
      const c = (OPERATORS.rdlh.cities || []).find(x => x.name.toLowerCase() === toName.toLowerCase());
      if (c) rdlhToId = c.id;
    }
  }

  return { fromName, toName, lxmiFromId, lxmiToId, rdlhFromId, rdlhToId };
}

// Global cache for merged cities
let cachedMergedCities = null;
let lastCitiesFetchTime = 0;
const CITIES_CACHE_TTL = 12 * 60 * 60 * 1000; // 12 hours cache

// API: Get combined cities mapping
app.get('/api/cities', async (req, res) => {
  try {
    if (cachedMergedCities && (Date.now() - lastCitiesFetchTime) < CITIES_CACHE_TTL) {
      return res.json({ success: true, cities: cachedMergedCities });
    }

    let lxmiCities = [];
    let rdlhCities = [];
    
    try {
      lxmiCities = await fetchCities('lxmi');
      OPERATORS.lxmi.cities = lxmiCities;
    } catch (err) {
      console.error("Failed to load cities for Laxmi:", err.message);
      lxmiCities = OPERATORS.lxmi.cities || [];
    }

    try {
      rdlhCities = await fetchCities('rdlh');
      OPERATORS.rdlh.cities = rdlhCities;
    } catch (err) {
      console.error("Failed to load cities for RDLH:", err.message);
      rdlhCities = OPERATORS.rdlh.cities || [];
    }

    const citiesMap = new Map();
    lxmiCities.forEach(c => {
      citiesMap.set(c.name.toLowerCase(), { name: c.name, lxmiId: c.id, rdlhId: null });
    });
    rdlhCities.forEach(c => {
      const existing = citiesMap.get(c.name.toLowerCase());
      if (existing) {
        existing.rdlhId = c.id;
      } else {
        citiesMap.set(c.name.toLowerCase(), { name: c.name, lxmiId: null, rdlhId: c.id });
      }
    });

    const mergedCities = Array.from(citiesMap.values()).map(c => {
      const id = c.lxmiId ? c.lxmiId : `rd-${c.rdlhId}`;
      return {
        name: c.name,
        id: id
      };
    }).sort((a, b) => a.name.localeCompare(b.name));

    // Update global cache
    cachedMergedCities = mergedCities;
    lastCitiesFetchTime = Date.now();

    res.json({ success: true, cities: mergedCities });
  } catch (error) {
    console.error("API /cities error:", error.message);
    res.status(500).json({ success: false, error: error.message });
  }
});

// (Laxmi and Ram Dalal Holidays integration below)

// Helper: search buses for a specific operator B2B portal
async function searchOperatorBuses(opKey, fromId, toId, date) {
  const op = OPERATORS[opKey];
  await ensureSession(opKey);
  console.log(`Searching buses for ${op.name} from ID ${fromId} to ID ${toId} on ${date}...`);

  const queryParams = new URLSearchParams();
  queryParams.append("searchbus[from]", fromId);
  queryParams.append("searchbus[to]", toId);
  queryParams.append("searchbus[depart]", date);
  queryParams.append("searchbus[code]", "");
  queryParams.append("get_all_services", "false");
  queryParams.append("rountrip_return", "");
  queryParams.append("render_new_dates", "true");
  queryParams.append("prev_date_for_cal", "");
  queryParams.append("is_from_modify_org_dest_service_ac", "");
  queryParams.append("is_pickup_confirm_phone_block", "false");
  queryParams.append("old_passanger_data_arr", "");
  queryParams.append("old_pnr_for_pickup_phone", "");
  queryParams.append("is_progressively_loading", "false");
  queryParams.append("is_round_trip_parallel_booking", "false");
  queryParams.append("show_connecting_services", "false");
  queryParams.append("searchbus_allocation", "0");
  queryParams.append("can_block_or_unblock", "false");

  const searchUrl = `${op.url}/ibooking/bookings/search_service?${queryParams.toString()}`;
  const searchRes = await fetch(searchUrl, {
    headers: {
      "Cookie": op.sessionCookies.join("; "),
      "User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
      "Referer": `${op.url}/bookings`,
      "X-CSRF-Token": op.csrfToken,
      "X-Requested-With": "XMLHttpRequest"
    }
  });

  if (searchRes.status === 401) {
    console.log(`Session expired for ${op.name} during search (401), re-authenticating...`);
    await performLogin(opKey);
    return searchOperatorBuses(opKey, fromId, toId, date);
  }

  const searchText = await searchRes.text();
  const trimmedText = searchText.trim();

  // If the response is HTML, it means the session expired and we got redirected to signin page
  if (trimmedText.startsWith('<!DOCTYPE') || trimmedText.startsWith('<html') || searchRes.status === 302 || trimmedText.includes('signin')) {
    console.log(`Received login/redirect HTML from ${op.name} during search. Re-authenticating...`);
    await performLogin(opKey);
    return searchOperatorBuses(opKey, fromId, toId, date);
  }

  let searchJson;
  try {
    searchJson = JSON.parse(searchText);
  } catch (err) {
    console.warn(`JSON parse failed for ${op.name} search response. Re-authenticating...`);
    await performLogin(opKey);
    return searchOperatorBuses(opKey, fromId, toId, date);
  }

  if (!searchJson.data) {
    return [];
  }

  const prefix = opKey === 'lxmi' ? 'lx-' : 'rd-';

  return searchJson.data.map(bus => {
    const details = bus[11] || {};
    const summary = bus[12] || {};
    
    const fareStr = summary.fare || "";
    const fareParts = fareStr.split('/').map(f => parseFloat(f.trim())).filter(f => !isNaN(f));
    const minFare = fareParts.length > 0 ? Math.min(...fareParts) : 0;
    const maxFare = fareParts.length > 0 ? Math.max(...fareParts) : 0;

    return {
      resId: `${prefix}${summary.res_id || details.res_id}`,
      routeId: summary.route_id || details.route_id,
      operator: op.name,
      routeName: summary.number || details.number || `${op.name} Service`,
      busType: summary.bus_type || details.bus_type || "AC Sleeper 2+1",
      departure: summary.depature || details.departure_time || "00:00 AM",
      arrival: summary.arrival ? summary.arrival.split('T')[1].substring(0, 5) : "00:00",
      arrivalDate: summary.arrival ? summary.arrival.split('T')[0] : "",
      duration: summary.duration || details.duration || "0h",
      seatsLeft: summary.available_seats || details.total_seats || 0,
      fareString: fareStr,
      minFare: minFare,
      maxFare: maxFare,
      boardingPoints: (summary.boarding_stage_detail_arr || []).map(bp => ({
        id: bp[0],
        time: bp[1],
        name: bp[2],
        landmark: bp[9] || ''
      })),
      droppingPoints: (summary.dropoff_stage_detail_arr || []).map(dp => ({
        id: dp[0],
        time: dp[1],
        name: dp[2],
        landmark: dp[9] || ''
      }))
    };
  });
}

// Simulator helpers removed

// API: Search buses
app.get('/api/search', async (req, res) => {
  const { from, to, date } = req.query; // date format: DD/MM/YYYY
  if (!from || !to || !date) {
    return res.status(400).json({ success: false, error: "Missing required query parameters: from, to, date" });
  }

  try {
    // Make sure we have dynamic cities loaded
    if (!OPERATORS.lxmi.cities || OPERATORS.lxmi.cities.length === 0) {
      try {
        OPERATORS.lxmi.cities = await fetchCities('lxmi');
      } catch (err) {
        console.error("Failed to load cities for Laxmi in search:", err.message);
      }
    }
    if (!OPERATORS.rdlh.cities || OPERATORS.rdlh.cities.length === 0) {
      try {
        OPERATORS.rdlh.cities = await fetchCities('rdlh');
      } catch (err) {
        console.error("Failed to load cities for RDLH in search:", err.message);
      }
    }

    const { fromName, toName, lxmiFromId, lxmiToId, rdlhFromId, rdlhToId } = resolveCityNamesAndIds(from, to);

    if (!fromName || !toName) {
      return res.status(400).json({ success: false, error: `Invalid city IDs: ${from}, ${to}` });
    }

    const searchPromises = [];

    // Query Laxmi if IDs exist
    if (lxmiFromId && lxmiToId) {
      searchPromises.push(
        searchOperatorBuses('lxmi', lxmiFromId, lxmiToId, date)
          .catch(err => {
            console.error("Laxmi Holidays search failed:", err.message);
            return [];
          })
      );
    } else {
      searchPromises.push(Promise.resolve([]));
    }

    // Query Ram Dalal if IDs exist
    if (rdlhFromId && rdlhToId) {
      searchPromises.push(
        searchOperatorBuses('rdlh', rdlhFromId, rdlhToId, date)
          .catch(err => {
            console.error("Ram Dalal search failed:", err.message);
            return [];
          })
      );
    } else {
      searchPromises.push(Promise.resolve([]));
    }

    const [lxmiBuses, rdlhBuses] = await Promise.all(searchPromises);

    // Merge and filter real operator buses to ensure they actually match the searched origin city name.
    // TicketSimply B2B portals sometimes return unrelated nearby routes (e.g. Azamgarh to Delhi for a Varanasi to Delhi search).
    let rawBuses = [...lxmiBuses, ...rdlhBuses];
    let realBuses = rawBuses.filter(bus => {
      const orig = fromName.toLowerCase();
      const routeMatches = bus.routeName.toLowerCase().includes(orig);
      const boardingMatches = bus.boardingPoints.some(bp => bp.name.toLowerCase().includes(orig));
      return routeMatches || boardingMatches;
    });

    let buses = realBuses;

    // Track search analytics
    trackEvent('search', { from: fromName, to: toName, date, realCount: realBuses.length, totalCount: buses.length });

    res.json({ success: true, buses });
  } catch (error) {
    console.error("API /search error:", error.message);
    res.status(500).json({ success: false, error: error.message });
  }
});

// Helper to extract HTML strings from jQuery .html("...") calls in the JS response
function extractHtmlFromJs(jsText) {
  let accumulatedHtml = "";
  let pos = 0;
  while (true) {
    const startIdx = jsText.indexOf('.html("', pos);
    if (startIdx === -1) break;
    
    const stringStart = startIdx + '.html("'.length;
    let stringEnd = -1;
    for (let i = stringStart; i < jsText.length; i++) {
      if (jsText[i] === '"') {
        let backslashCount = 0;
        let j = i - 1;
        while (j >= stringStart && jsText[j] === '\\') {
          backslashCount++;
          j--;
        }
        if (backslashCount % 2 === 0) {
          stringEnd = i;
          break;
        }
      }
    }
    
    if (stringEnd !== -1) {
      const escapedStr = jsText.substring(stringStart, stringEnd);
      const unescapedStr = escapedStr
        .replace(/\\"/g, '"')
        .replace(/\\'/g, "'")
        .replace(/\\n/g, '\n')
        .replace(/\\t/g, '\t')
        .replace(/\\r/g, '\r')
        .replace(/\\\//g, '/');
      accumulatedHtml += unescapedStr + "\n";
      pos = stringEnd + 1;
    } else {
      pos = stringStart;
    }
  }
  return accumulatedHtml;
}

// API: Get coach layout for seat selection
app.get('/api/layout/:resId', async (req, res) => {
  const { resId } = req.params;
  const { from, to, date } = req.query;

  if (!from || !to || !date) {
    return res.status(400).json({ success: false, error: "Missing required parameters: from, to, date" });
  }

  try {


    const opKey = resId.startsWith('lx-') ? 'lxmi' : 'rdlh';
    const realResId = resId.replace('lx-', '').replace('rd-', '');
    const op = OPERATORS[opKey];

    await ensureSession(opKey);
    console.log(`Fetching seat layout from ${op.name} for reservation ID ${realResId}...`);

    const { lxmiFromId, lxmiToId, rdlhFromId, rdlhToId } = resolveCityNamesAndIds(from, to);
    const fromId = opKey === 'lxmi' ? lxmiFromId : rdlhFromId;
    const toId = opKey === 'lxmi' ? lxmiToId : rdlhToId;

    if (!fromId || !toId) {
      return res.status(400).json({ success: false, error: `Invalid city IDs for ${op.name} layout search: from=${from}, to=${to}` });
    }

    // Pre-initialize B2B session route by performing a quick search first
    console.log(`Pre-initializing ${op.name} session route: From ID ${fromId} to ID ${toId} on ${date}...`);
    const initParams = new URLSearchParams();
    initParams.append("searchbus[from]", fromId);
    initParams.append("searchbus[to]", toId);
    initParams.append("searchbus[depart]", date);
    initParams.append("searchbus[code]", "");
    initParams.append("get_all_services", "false");
    initParams.append("rountrip_return", "");
    initParams.append("render_new_dates", "true");
    initParams.append("prev_date_for_cal", "");
    initParams.append("is_from_modify_org_dest_service_ac", "");
    initParams.append("is_pickup_confirm_phone_block", "false");
    initParams.append("old_passanger_data_arr", "");
    initParams.append("old_pnr_for_pickup_phone", "");
    initParams.append("is_progressively_loading", "false");
    initParams.append("is_round_trip_parallel_booking", "false");
    initParams.append("show_connecting_services", "false");
    initParams.append("searchbus_allocation", "0");
    initParams.append("can_block_or_unblock", "false");

    const searchInitUrl = `${op.url}/ibooking/bookings/search_service?${initParams.toString()}`;
    await fetch(searchInitUrl, {
      headers: {
        "Cookie": op.sessionCookies.join("; "),
        "User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
        "Referer": `${op.url}/bookings`,
        "X-CSRF-Token": op.csrfToken,
        "X-Requested-With": "XMLHttpRequest"
      }
    });

    const layoutUrl = `${op.url}/ibooking/bookings/select_seat/${realResId}?searchbus_params[from]=${fromId}&searchbus_params[to]=${toId}&searchbus_params[depart]=${date}&searchbus_params[terminal]=0&searchbus_params[code]=&booking_return_date=`;
    
    const layoutRes = await fetch(layoutUrl, {
      headers: {
        "Cookie": op.sessionCookies.join("; "),
        "User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
        "Referer": `${op.url}/bookings`,
        "X-CSRF-Token": op.csrfToken,
        "X-Requested-With": "XMLHttpRequest",
        "Cache-Control": "no-cache",
        "Pragma": "no-cache"
      }
    });

    if (layoutRes.status === 401) {
      console.log(`Session expired for ${op.name} during layout query (401), re-authenticating...`);
      await performLogin(opKey);
      return res.redirect(req.originalUrl);
    }

    const jsText = await layoutRes.text();
    const trimmedJs = jsText.trim();
    
    // If the response is HTML, it means the session expired and we got redirected to signin page
    if (trimmedJs.startsWith('<!DOCTYPE') || trimmedJs.startsWith('<html') || layoutRes.status === 302 || trimmedJs.includes('signin') || !trimmedJs.includes('.html(')) {
      console.log(`Received login/redirect HTML from ${op.name} during layout query. Re-authenticating...`);
      await performLogin(opKey);
      return res.redirect(req.originalUrl);
    }

    const html = extractHtmlFromJs(jsText);
    const $ = cheerio.load(html);

    // Parse the seatwise fare hash
    let seatwiseFareHash = {};
    const fareHashVal = $('#seatwise_fare_hash').val();
    if (fareHashVal) {
      try {
        seatwiseFareHash = JSON.parse(fareHashVal);
      } catch (e) {
        console.error("Failed to parse seatwise_fare_hash:", e.message);
      }
    }

    const ladiesAdjacent = ($('#ladies_adjacent_seats').val() || '').split(',').map(s => s.trim()).filter(Boolean);
    const gentsAdjacent = ($('#gents_adjacent_seats').val() || '').split(',').map(s => s.trim()).filter(Boolean);
    const ladiesQuota = ($('#ladies_quota_seats').val() || '').split(',').map(s => s.trim()).filter(Boolean);

    // Parse the seat layout table
    const seats = [];
    let maxRow = 0;
    let maxCol = 0;

    $('#seat_layout_table tr').each((trIndex, tr) => {
      $(tr).find('td').each((tdIndex, td) => {
        const id = $(td).attr('id') || '';
        const match = id.match(/span_(\d+)_(\d+)/);
        if (!match) return; // Skip if not a valid grid cell
        
        const row = parseInt(match[1]);
        const col = parseInt(match[2]);

        const seatNo = $(td).attr('data-seatnumber');
        const title = $(td).attr('title') || '';
        const isGangway = title.toLowerCase() === 'gangway' || $(td).hasClass('ganway_col') || !seatNo;

        if (isGangway) {
          seats.push({
            isGangway: true,
            row: row,
            col: col
          });
          return;
        }

        const isAvailable = $(td).hasClass('available_seat');
        const isBooked = $(td).hasClass('booked_seat') || $(td).hasClass('blocked_seat') || $(td).hasClass('phone_blocked_seat') || $(td).hasClass('booked_by_ladies_seat') || $(td).hasClass('booked_by_gents_seat');
        const isLadies = $(td).hasClass('booked_by_ladies_seat') || $(td).hasClass('ladies_adjacent_seat') || $(td).hasClass('ladies_seat') || ladiesAdjacent.includes(seatNo) || ladiesQuota.includes(seatNo);
        
        // Determine seat type (Sleeper vs Seater)
        const typeVal = $(td).attr('data-seattypevalue');
        const isSleeper = $(td).hasClass('Sleeper') || $(td).hasClass('sleeper') || seatNo.toUpperCase().startsWith('U') || seatNo.toUpperCase().startsWith('DU') || typeVal === '2';

        const rowspan = parseInt($(td).attr('rowspan') || 1);
        const colspan = parseInt($(td).attr('colspan') || 1);

        if (row > maxRow) maxRow = row;
        if (col > maxCol) maxCol = col;

        seats.push({
          seatNo,
          available: isAvailable,
          booked: isBooked,
          ladies: isLadies,
          sleeper: isSleeper,
          row: row,
          col: col,
          rowspan,
          colspan,
          fare: parseFloat(seatwiseFareHash[seatNo] || 0)
        });
      });
    });

    res.json({
      success: true,
      seats,
      maxRow: maxRow + 1,
      maxCol: maxCol + 1,
      ladiesAdjacent,
      gentsAdjacent
    });
  } catch (error) {
    console.error("API /layout error:", error.message);
    res.status(500).json({ success: false, error: error.message });
  }
});


// ═══════════════════════════════════════════════
//  ANALYTICS & ADMIN DASHBOARD
// ═══════════════════════════════════════════════

const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || '[REDACTED]';
const adminTokens = new Set();

// In-memory analytics store
const analytics = {
  startTime: Date.now(),
  visitors: 0,
  searches: 0,
  seatViews: 0,
  checkouts: 0,
  bookings: 0,
  signups: 0,
  activity: [],       // { time, event, data }
  searchHistory: [],   // { time, from, to, date, realCount, totalCount }
  userSignups: [],     // { time, name, email, phone }
  bookingsList: [],    // { time, operator, route, seats, amount, pnr }
  popularRoutes: {}    // "from→to": count
};

function trackEvent(event, data = {}) {
  const entry = { time: new Date().toISOString(), event, data };
  analytics.activity.unshift(entry);
  if (analytics.activity.length > 500) analytics.activity.length = 500;

  switch (event) {
    case 'visit': analytics.visitors++; break;
    case 'search':
      analytics.searches++;
      const routeKey = `${data.from || '?'} → ${data.to || '?'}`;
      analytics.popularRoutes[routeKey] = (analytics.popularRoutes[routeKey] || 0) + 1;
      analytics.searchHistory.unshift({ time: entry.time, ...data });
      if (analytics.searchHistory.length > 200) analytics.searchHistory.length = 200;
      break;
    case 'view_seats': analytics.seatViews++; break;
    case 'checkout': analytics.checkouts++; break;
    case 'booking': 
      analytics.bookings++; 
      analytics.bookingsList.unshift({ time: entry.time, ...data });
      if (analytics.bookingsList.length > 200) analytics.bookingsList.length = 200;
      break;
    case 'signup': analytics.signups++; break;
  }
}

// Public tracking endpoint (called by frontend)
app.post('/api/track', (req, res) => {
  const { event, data } = req.body;
  if (!event) return res.status(400).json({ success: false });
  trackEvent(event, data || {});
  res.json({ success: true });
});

// Admin auth middleware
function requireAdmin(req, res, next) {
  const authHeader = req.headers['authorization'] || '';
  const token = authHeader.replace('Bearer ', '');
  if (!token || !adminTokens.has(token)) {
    return res.status(401).json({ success: false, error: 'Unauthorized' });
  }
  next();
}

// Admin login
app.post('/api/admin/login', (req, res) => {
  const { password } = req.body;
  if (password === ADMIN_PASSWORD) {
    const token = 'cti_' + Date.now().toString(36) + Math.random().toString(36).substr(2, 8);
    adminTokens.add(token);
    // Cleanup old tokens (keep last 10)
    if (adminTokens.size > 10) {
      const arr = Array.from(adminTokens);
      arr.slice(0, arr.length - 10).forEach(t => adminTokens.delete(t));
    }
    res.json({ success: true, token });
  } else {
    res.status(403).json({ success: false, error: 'Invalid password' });
  }
});

// Admin: aggregate stats
app.get('/api/admin/stats', requireAdmin, (req, res) => {
  const uptime = Math.floor((Date.now() - analytics.startTime) / 1000);
  const topRoutes = Object.entries(analytics.popularRoutes)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 10)
    .map(([route, count]) => ({ route, count }));

  res.json({
    success: true,
    stats: {
      visitors: analytics.visitors,
      searches: analytics.searches,
      seatViews: analytics.seatViews,
      checkouts: analytics.checkouts,
      bookings: analytics.bookings,
      signups: analytics.signups,
      uptimeSeconds: uptime,
      topRoutes
    }
  });
});

// Admin: recent activity feed
app.get('/api/admin/activity', requireAdmin, (req, res) => {
  const limit = parseInt(req.query.limit) || 50;
  res.json({ success: true, activity: analytics.activity.slice(0, limit) });
});

// Admin: search history
app.get('/api/admin/searches', requireAdmin, (req, res) => {
  const limit = parseInt(req.query.limit) || 50;
  res.json({ success: true, searches: analytics.searchHistory.slice(0, limit) });
});

// Admin: user signups
app.get('/api/admin/users', requireAdmin, (req, res) => {
  res.json({ success: true, users: analytics.userSignups });
});

// Admin: bookings list
app.get('/api/admin/bookings', requireAdmin, (req, res) => {
  res.json({ success: true, bookings: analytics.bookingsList });
});

// Admin: server & portal health
app.get('/api/admin/health', requireAdmin, async (req, res) => {
  const uptime = Math.floor((Date.now() - analytics.startTime) / 1000);
  const now = Date.now();

  res.json({
    success: true,
    health: {
      serverUptime: uptime,
      lxmi: {
        name: OPERATORS.lxmi.name,
        sessionActive: OPERATORS.lxmi.sessionCookies.length > 0,
        lastLogin: OPERATORS.lxmi.lastLoginTime ? new Date(OPERATORS.lxmi.lastLoginTime).toISOString() : null,
        sessionAge: OPERATORS.lxmi.lastLoginTime ? Math.floor((now - OPERATORS.lxmi.lastLoginTime) / 1000) : null,
        citiesLoaded: (OPERATORS.lxmi.cities || []).length
      },
      rdlh: {
        name: OPERATORS.rdlh.name,
        sessionActive: OPERATORS.rdlh.sessionCookies.length > 0,
        lastLogin: OPERATORS.rdlh.lastLoginTime ? new Date(OPERATORS.rdlh.lastLoginTime).toISOString() : null,
        sessionAge: OPERATORS.rdlh.lastLoginTime ? Math.floor((now - OPERATORS.rdlh.lastLoginTime) / 1000) : null,
        citiesLoaded: (OPERATORS.rdlh.cities || []).length
      }
    }
  });
});


// API: Send signup details to owner's email
app.post('/api/signup', async (req, res) => {
  const { name, email, phone } = req.body;
  console.log(`New user signup notification request received: ${name} (${email}, ${phone})`);
  
  // Track signup in analytics
  trackEvent('signup', { name, email, phone });
  analytics.userSignups.unshift({ time: new Date().toISOString(), name, email, phone });
  if (analytics.userSignups.length > 200) analytics.userSignups.length = 200;

  const nodemailer = require('nodemailer');
  const smtpHost = process.env.SMTP_HOST;
  const smtpPort = Number(process.env.SMTP_PORT || 587);
  const smtpUser = process.env.SMTP_USER;
  const smtpPass = process.env.SMTP_PASS;
  const smtpFrom = process.env.SMTP_FROM || 'Cheap Travels India <cheaptravels.in@gmail.com>';
  
  if (smtpHost && smtpUser && smtpPass) {
    try {
      const transporter = nodemailer.createTransport({
        host: smtpHost,
        port: smtpPort,
        secure: smtpPort === 465,
        auth: { user: smtpUser, pass: smtpPass }
      });
      
      const mailOptions = {
        from: smtpFrom,
        to: 'cheaptravels.in@gmail.com',
        subject: `New User Registration: ${name}`,
        html: `
          <h3>New User Registration Details</h3>
          <p><b>Name:</b> ${name}</p>
          <p><b>Email:</b> ${email}</p>
          <p><b>Mobile Number:</b> ${phone}</p>
          <p><b>Registration Date:</b> ${new Date().toLocaleString('en-IN', { timeZone: 'Asia/Kolkata' })}</p>
        `
      };
      
      await transporter.sendMail(mailOptions);
      console.log(`Successfully sent new user signup notification email to cheaptravels.in@gmail.com`);
    } catch (err) {
      console.error(`Failed to send signup notification email:`, err.message);
    }
  } else {
    console.log(`SMTP environment variables not configured. Logging signup details locally:`, { name, email, phone });
  }
  
  res.json({ success: true });
});

// Serve frontend fallback
app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, '..', 'public', 'index.html'));
});

// Run server and login on startup (only if run directly, not as serverless function)
if (require.main === module) {
  app.listen(PORT, async () => {
    console.log(`=========================================`);
    console.log(`Cheap Travels India Live server listening on port ${PORT}`);
    console.log(`Local URL: http://localhost:${PORT}`);
    console.log(`=========================================`);
    
    try {
      await performLogin('lxmi');
    } catch (err) {
      console.error("Warning: Initial B2B login for Laxmi Holidays failed. Will retry on demand.");
    }
    try {
      await performLogin('rdlh');
    } catch (err) {
      console.error("Warning: Initial B2B login for Ram Dalal Holidays failed. Will retry on demand.");
    }
  });
}

module.exports = app;
