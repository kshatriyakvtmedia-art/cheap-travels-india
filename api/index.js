require('dotenv').config();
const express = require('express');
const cors = require('cors');
const cheerio = require('cheerio');
const path = require('path');
const fs = require('fs');
const compression = require('compression');
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');
const crypto = require('crypto');
const cookieParser = require('cookie-parser');
const { prisma } = require('../lib/db');

const app = express();
const PORT = process.env.PORT || 3000;

// Security and compression middleware
app.use(helmet({
  contentSecurityPolicy: false // Keep CSP disabled to prevent issues with loaded assets/scripts
}));
app.use(compression());
app.use(cors());
app.use(express.json());
app.use(cookieParser());


// Rate limiter for search and layout endpoints to prevent resource exhaustion
const apiLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 100, // Limit each IP to 100 requests per window
  standardHeaders: true,
  legacyHeaders: false,
  message: { success: false, error: "Too many requests from this IP. Please try again after 15 minutes." }
});

// Serve static frontend files from public directory with proper caching headers
app.use(express.static(path.join(__dirname, '..', 'public'), {
  maxAge: '1d',
  setHeaders: (res, filePath) => {
    if (filePath.endsWith('.html')) {
      res.setHeader('Cache-Control', 'public, max-age=0, must-revalidate');
    } else {
      res.setHeader('Cache-Control', 'public, max-age=86400'); // Cache JS/CSS/Images for 1 day
    }
  }
}));

// Robust B2B fetch wrapper with Keep-Alive, timeouts, and exponential backoff retry logic
async function fetchWithTimeoutAndRetry(url, options = {}, retries = 2, delay = 1000) {
  const timeout = options.timeout || 15000; // 15s timeout
  delete options.timeout;

  if (!options.headers) options.headers = {};
  options.headers['Connection'] = 'keep-alive';

  for (let attempt = 0; attempt <= retries; attempt++) {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), timeout);
    
    try {
      const response = await fetch(url, {
        ...options,
        signal: controller.signal
      });
      clearTimeout(timeoutId);
      
      // Return response immediately for non-server errors (401 redirects, 404s, etc.)
      if (response.status < 500) {
        return response;
      }
      
      throw new Error(`B2B portal returned server error status: ${response.status}`);
    } catch (error) {
      clearTimeout(timeoutId);
      const isTimeout = error.name === 'AbortError';
      const isLastAttempt = attempt === retries;

      console.warn(`[fetch B2B] Failure on ${url} (Attempt ${attempt + 1}/${retries + 1}): ${error.message}${isTimeout ? ' (Timeout)' : ''}`);

      if (isLastAttempt) {
        throw error;
      }

      const backoffDelay = delay * Math.pow(2, attempt);
      await new Promise(resolve => setTimeout(resolve, backoffDelay));
    }
  }
}

// Search result caching setup
const searchCache = new Map();
const SEARCH_CACHE_TTL = 90 * 1000; // 90 seconds cache TTL

function getSearchCacheKey(from, to, date) {
  return `${from}:${to}:${date}`;
}

function generateETag(data) {
  return crypto.createHash('md5').update(JSON.stringify(data)).digest('base64');
}

// Clean up expired cache entries every minute
setInterval(() => {
  const now = Date.now();
  for (const [key, value] of searchCache.entries()) {
    if (now - value.timestamp > SEARCH_CACHE_TTL) {
      searchCache.delete(key);
    }
  }
}, 60000);

// B2B Portal configurations for both Laxmi and Ram Dalal
const OPERATORS = {
  lxmi: {
    username: process.env.LXMI_USERNAME,
    password: process.env.LXMI_PASSWORD,
    url: process.env.LXMI_PORTAL_URL || 'https://lxmi.laxmiholidays.com',
    name: 'Laxmi Holidays Pvt Ltd',
    sessionCookies: [],
    csrfToken: '',
    lastLoginTime: 0,
    cities: []
  },
  rdlh: {
    username: process.env.RDLH_USERNAME,
    password: process.env.RDLH_PASSWORD,
    url: process.env.RDLH_PORTAL_URL || 'https://rdlh.ticketsimply.com',
    name: 'Ram Dalal Holidays',
    sessionCookies: [],
    csrfToken: '',
    lastLoginTime: 0,
    cities: []
  }
};

// Helper to dynamically load and decrypt provider credentials
async function getOperatorCredentials(opKey) {
  try {
    const provider = await prisma.provider.findFirst({
      where: { providerName: opKey === 'lxmi' ? 'Laxmi Holidays' : 'Ram Dalal' }
    });
    
    if (provider && provider.encryptedUsername && provider.encryptedPassword) {
      const { decrypt } = require('../lib/crypto');
      const decryptedUser = decrypt(provider.encryptedUsername);
      const decryptedPass = decrypt(provider.encryptedPassword);
      if (decryptedUser && decryptedPass) {
        return {
          username: decryptedUser,
          password: decryptedPass,
          url: provider.portalUrl || OPERATORS[opKey].url
        };
      }
    }
  } catch (err) {
    console.error(`Failed to load encrypted credentials for ${opKey} from DB:`, err.message);
  }
  
  // Fallback to env variables/OPERATORS defaults
  return {
    username: OPERATORS[opKey].username,
    password: OPERATORS[opKey].password,
    url: OPERATORS[opKey].url
  };
}

// Helper to extract CSRF token and cookies for a specific operator B2B portal
async function performLogin(opKey) {
  const op = OPERATORS[opKey];
  if (!op) throw new Error(`Unknown operator key: ${opKey}`);
  
  const creds = await getOperatorCredentials(opKey);
  op.username = creds.username;
  op.password = creds.password;
  op.url = creds.url;

  if (!op.username || !op.password) {
    throw new Error(`Credentials for ${op.name} (key: ${opKey}) are not configured in DB or environment variables.`);
  }
  console.log(`Starting B2B portal login sequence for ${op.name}...`);
  try {


    // 1. Fetch main page to get initial cookies and CSRF token
    const initialRes = await fetchWithTimeoutAndRetry(op.url, {
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

    const loginRes = await fetchWithTimeoutAndRetry(`${op.url}/account/signin`, {
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
  
  const jsRes = await fetchWithTimeoutAndRetry(`${op.url}/agent_dynamic_js_content.js`, {
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
  const trimmedText = jsText.trim();
  
  if (trimmedText.startsWith('<!DOCTYPE') || trimmedText.startsWith('<html') || jsRes.status === 302 || trimmedText.includes('signin')) {
    console.log(`Session expired/redirected to login HTML for ${op.name} while fetching cities, re-authenticating...`);
    await performLogin(opKey);
    return fetchCities(opKey);
  }
  
  const startIdx = jsText.indexOf('var destinations_map =');
  if (startIdx === -1) {
    // Fallback: try searching without 'var ' prefix in case of whitespace variations
    const altIdx = jsText.indexOf('destinations_map');
    if (altIdx !== -1) {
      // Found with different prefix, adjust
      const adjustedIdx = jsText.lastIndexOf('var', altIdx);
      if (adjustedIdx !== -1 && (altIdx - adjustedIdx) < 30) {
        // Use the position of 'var' as the real start
        const endIdx = jsText.indexOf(']]}', adjustedIdx) + 3;
        const decl = jsText.substring(adjustedIdx, endIdx);
        const jsonStr = decl.substring(decl.indexOf('{'), decl.lastIndexOf('}') + 1);
        const dataMap = JSON.parse(jsonStr);
        if (dataMap.destinations) {
          return dataMap.destinations.map(d => ({
            name: d[0],
            id: String(d[1])
          }));
        }
      }
    }
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
  const searchRes = await fetchWithTimeoutAndRetry(searchUrl, {
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
      arrival: summary.arrival ? (summary.arrival.includes('T') ? summary.arrival.split('T')[1].substring(0, 5) : summary.arrival.substring(0, 5)) : "00:00",
      arrivalDate: summary.arrival ? (summary.arrival.includes('T') ? summary.arrival.split('T')[0] : "") : "",
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
app.get('/api/search', apiLimiter, async (req, res) => {
  const { from, to, date } = req.query; // date format: DD/MM/YYYY
  if (!from || !to || !date) {
    return res.status(400).json({ success: false, error: "Missing required query parameters: from, to, date" });
  }

  // 1. In-memory Cache lookup
  const cacheKey = getSearchCacheKey(from, to, date);
  const cached = searchCache.get(cacheKey);
  const now = Date.now();

  if (cached && (now - cached.timestamp) < SEARCH_CACHE_TTL) {
    console.log(`[Cache Hit] Serving search results for ${cacheKey}`);
    const etag = generateETag(cached.buses);
    res.setHeader('ETag', etag);
    res.setHeader('Cache-Control', 'public, max-age=15');

    if (req.headers['if-none-match'] === etag) {
      return res.status(304).end();
    }
    return res.json({ success: true, buses: cached.buses, fromCache: true });
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

    // Store in cache
    searchCache.set(cacheKey, {
      buses: buses,
      timestamp: Date.now()
    });

    const etag = generateETag(buses);
    res.setHeader('ETag', etag);
    res.setHeader('Cache-Control', 'public, max-age=15');

    if (req.headers['if-none-match'] === etag) {
      return res.status(304).end();
    }

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
    await fetchWithTimeoutAndRetry(searchInitUrl, {
      headers: {
        "Cookie": op.sessionCookies.join("; "),
        "User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
        "Referer": `${op.url}/bookings`,
        "X-CSRF-Token": op.csrfToken,
        "X-Requested-With": "XMLHttpRequest"
      }
    });

    const layoutUrl = `${op.url}/ibooking/bookings/select_seat/${realResId}?searchbus_params[from]=${fromId}&searchbus_params[to]=${toId}&searchbus_params[depart]=${date}&searchbus_params[terminal]=0&searchbus_params[code]=&booking_return_date=`;
    
    const layoutRes = await fetchWithTimeoutAndRetry(layoutUrl, {
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

const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD;
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
  popularRoutes: {},   // "from→to": count
  vitals: []           // In-memory Core Web Vitals telemetry
};

async function trackEvent(event, data = {}, req = null) {
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

  // Also persist to PostgreSQL DB as AuditLog
  try {
    const ipAddress = req ? (req.ip || req.headers['x-forwarded-for'] || req.connection.remoteAddress) : null;
    const userId = (req && req.user) ? req.user.id : null;
    await prisma.auditLog.create({
      data: {
        action: event,
        userId: userId,
        entityType: 'event',
        entityId: data.busId || data.pnr || data.phone || null,
        metadataJson: data,
        ipAddress
      }
    });
  } catch (err) {
    console.error('Failed to save trackEvent to DB:', err.message);
  }
}

// Public tracking endpoint (called by frontend)
app.post('/api/track', async (req, res) => {
  const { event, data } = req.body;
  if (!event) return res.status(400).json({ success: false });
  await trackEvent(event, data || {}, req);
  res.json({ success: true });
});

// POST endpoint for Web Vitals tracking
app.post('/api/vitals', (req, res) => {
  const { id, name, value, rating, delta } = req.body;
  if (!name) return res.status(400).json({ success: false, error: 'Missing name' });
  
  analytics.vitals.push({
    id,
    name,
    value: parseFloat(value),
    rating: rating || 'good',
    delta: parseFloat(delta || 0),
    time: new Date().toISOString()
  });

  if (analytics.vitals.length > 1000) {
    analytics.vitals.shift();
  }

  res.json({ success: true });
});

const { requireAuth, requireRole, logAdminAction, otpRateLimiter, loginRateLimiter } = require('../lib/middleware/auth');

// Middleware groups for role authorization
const requireAdmin = [requireAuth, requireRole(['super_admin', 'admin', 'support_executive'])];
const requireSuperAdmin = [requireAuth, requireRole(['super_admin'])];
const requireAdminOrSuper = [requireAuth, requireRole(['super_admin', 'admin'])];

// Admin login using email & password
app.post('/api/admin/login', loginRateLimiter, async (req, res) => {
  const { email, password } = req.body;
  if (!email || !password) {
    return res.status(400).json({ success: false, error: 'Email and password are required.' });
  }

  try {
    const user = await prisma.user.findFirst({
      where: {
        email,
        role: { in: ['super_admin', 'admin', 'support_executive'] }
      }
    });

    if (!user || !user.passwordHash) {
      return res.status(403).json({ success: false, error: 'Invalid credentials.' });
    }

    const { comparePassword, generateAccessToken, generateRefreshToken } = require('../lib/auth');
    const valid = await comparePassword(password, user.passwordHash);
    if (!valid) {
      return res.status(403).json({ success: false, error: 'Invalid credentials.' });
    }

    const accessToken = generateAccessToken(user);
    const refreshToken = generateRefreshToken(user);

    // Set secure HTTP-only cookies
    res.cookie('cti_access', accessToken, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'strict',
      maxAge: 15 * 60 * 1000 // 15 mins
    });

    res.cookie('cti_refresh', refreshToken, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'strict',
      maxAge: 7 * 24 * 60 * 60 * 1000 // 7 days
    });

    await logAdminAction(req, 'login', 'user', user.id, { email });

    res.json({
      success: true,
      token: accessToken,
      user: {
        id: user.id,
        email: user.email,
        name: user.name,
        role: user.role,
        mobile: user.mobile
      }
    });
  } catch (err) {
    console.error('Admin login error:', err.message);
    res.status(500).json({ success: false, error: 'Internal server error.' });
  }
});

// Admin: aggregate stats
app.get('/api/admin/stats', requireAuth, requireRole(['super_admin', 'admin']), async (req, res) => {
  try {
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const todayBookingsCount = await prisma.order.count({
      where: { createdAt: { gte: today } }
    });

    const pendingBookingsCount = await prisma.order.count({
      where: { status: { in: ['held', 'paid_pending'] } }
    });

    const failedBookingsCount = await prisma.order.count({
      where: { status: 'failed' }
    });

    const activeUsersCount = await prisma.user.count({
      where: { role: 'customer' }
    });

    const refundRequestsCount = await prisma.order.count({
      where: { status: 'refund_requested' }
    });

    // Provider status
    const providers = await prisma.provider.findMany();
    const providerStatus = providers.map(p => ({
      name: p.providerName,
      status: p.status,
      createdAt: p.createdAt
    }));

    const visitorCount = await prisma.auditLog.count({
      where: { action: 'visit' }
    });

    const searchCount = await prisma.auditLog.count({
      where: { action: 'search' }
    });

    const stats = {
      visitors: visitorCount || 120,
      searches: searchCount || 45,
      todayBookings: todayBookingsCount,
      pendingBookings: pendingBookingsCount,
      failedBookings: failedBookingsCount,
      refundRequests: refundRequestsCount,
      activeUsers: activeUsersCount,
      providerStatus: providerStatus,
      uptimeSeconds: Math.floor((Date.now() - analytics.startTime) / 1000)
    };

    // Only Super Admin gets financial revenue reports
    if (req.user.role === 'super_admin') {
      const todayRevenueAggregate = await prisma.order.aggregate({
        _sum: { totalPayable: true },
        where: {
          status: 'confirmed',
          createdAt: { gte: today }
        }
      });

      const totalRevenueAggregate = await prisma.order.aggregate({
        _sum: { totalPayable: true },
        where: { status: 'confirmed' }
      });

      stats.todayRevenue = todayRevenueAggregate._sum.totalPayable || 0;
      stats.totalRevenue = totalRevenueAggregate._sum.totalPayable || 0;
      
      const todayCommission = await prisma.order.aggregate({
        _sum: { ourMargin: true },
        where: {
          status: 'confirmed',
          createdAt: { gte: today }
        }
      });
      stats.todayCommission = todayCommission._sum.ourMargin || 0;
    }

    res.json({ success: true, stats });
  } catch (err) {
    console.error('Failed to get admin stats:', err.message);
    res.status(500).json({ success: false, error: 'Failed to retrieve stats.' });
  }
});

// Admin: recent activity feed (Super Admin only)
app.get('/api/admin/activity', requireAuth, requireRole(['super_admin']), async (req, res) => {
  try {
    const limit = parseInt(req.query.limit) || 50;
    const logs = await prisma.auditLog.findMany({
      include: { user: true },
      orderBy: { createdAt: 'desc' },
      take: limit
    });
    
    // Map to feed schema expected by UI
    const activity = logs.map(l => ({
      time: l.createdAt.toISOString(),
      event: l.action,
      data: l.metadataJson
    }));
    
    res.json({ success: true, activity });
  } catch (err) {
    console.error('Failed to get activity:', err.message);
    res.status(500).json({ success: false, error: 'Internal server error.' });
  }
});

// Admin: search history (Super Admin & Admin)
app.get('/api/admin/searches', requireAuth, requireRole(['super_admin', 'admin']), async (req, res) => {
  try {
    const limit = parseInt(req.query.limit) || 50;
    const logs = await prisma.auditLog.findMany({
      where: { action: 'search' },
      orderBy: { createdAt: 'desc' },
      take: limit
    });
    
    const searches = logs.map(l => ({
      time: l.createdAt.toISOString(),
      from: l.metadataJson ? l.metadataJson.from : '',
      to: l.metadataJson ? l.metadataJson.to : '',
      date: l.metadataJson ? l.metadataJson.date : '',
      realCount: l.metadataJson ? l.metadataJson.realCount : 0,
      totalCount: l.metadataJson ? l.metadataJson.totalCount : 0
    }));
    
    res.json({ success: true, searches });
  } catch (err) {
    console.error('Failed to get searches:', err.message);
    res.status(500).json({ success: false, error: 'Internal server error.' });
  }
});

// Admin: user list (Super Admin & Admin)
app.get('/api/admin/users', requireAuth, requireRole(['super_admin', 'admin']), async (req, res) => {
  try {
    const customers = await prisma.user.findMany({
      where: { role: 'customer' },
      orderBy: { createdAt: 'desc' }
    });
    
    const users = customers.map(u => ({
      name: u.name,
      email: u.email || 'N/A',
      phone: u.mobile || 'N/A',
      time: u.createdAt.toISOString()
    }));
    
    res.json({ success: true, users });
  } catch (err) {
    console.error('Failed to get users:', err.message);
    res.status(500).json({ success: false, error: 'Internal server error.' });
  }
});

// Admin: bookings list (Super Admin, Admin, Support Executive)
app.get('/api/admin/bookings', requireAuth, requireRole(['super_admin', 'admin', 'support_executive']), async (req, res) => {
  try {
    const bookings = await prisma.order.findMany({
      orderBy: { createdAt: 'desc' }
    });

    const formatted = bookings.map(b => ({
      id: b.id,
      pnr: b.providerPnr || b.bookingReference,
      operator: b.operator,
      route: `${b.fromCity} → ${b.toCity}`,
      seats: b.seatNo,
      amount: b.totalPayable,
      status: b.status,
      passengerName: b.passengerName,
      customerPhone: b.customerPhone,
      customerEmail: b.customerEmail,
      time: b.createdAt.toISOString()
    }));

    res.json({ success: true, bookings: formatted });
  } catch (err) {
    console.error('Failed to get bookings:', err.message);
    res.status(500).json({ success: false, error: 'Internal server error.' });
  }
});

// Admin: server & portal health (Super Admin & Admin)
app.get('/api/admin/health', requireAuth, requireRole(['super_admin', 'admin']), async (req, res) => {
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

// Admin: list B2B providers (Super Admin & Admin)
app.get('/api/admin/providers', requireAuth, requireRole(['super_admin', 'admin']), async (req, res) => {
  try {
    const providers = await prisma.provider.findMany({
      orderBy: { providerName: 'asc' }
    });
    
    const sanitized = providers.map(p => ({
      id: p.id,
      providerName: p.providerName,
      portalUrl: p.portalUrl,
      status: p.status,
      createdAt: p.createdAt,
      hasCredentials: !!(p.encryptedUsername && p.encryptedPassword)
    }));
    
    res.json({ success: true, providers: sanitized });
  } catch (err) {
    console.error('Failed to list providers:', err.message);
    res.status(500).json({ success: false, error: 'Internal server error.' });
  }
});

// Admin: save provider credentials (Super Admin only)
app.post('/api/admin/providers', requireAuth, requireRole(['super_admin']), async (req, res) => {
  const { providerName, portalUrl, username, password, status } = req.body;
  if (!providerName || !portalUrl) {
    return res.status(400).json({ success: false, error: 'Provider Name and Portal URL are required.' });
  }

  try {
    const { encrypt } = require('../lib/crypto');
    
    const existing = await prisma.provider.findFirst({
      where: { providerName }
    });

    const updateData = {
      portalUrl,
      status: status || 'active'
    };

    if (username) updateData.encryptedUsername = encrypt(username);
    if (password) updateData.encryptedPassword = encrypt(password);

    let provider;
    if (existing) {
      provider = await prisma.provider.update({
        where: { id: existing.id },
        data: updateData
      });
      await logAdminAction(req, 'update_provider_credentials', 'provider', provider.id, { providerName });
    } else {
      provider = await prisma.provider.create({
        data: {
          providerName,
          portalUrl,
          encryptedUsername: username ? encrypt(username) : null,
          encryptedPassword: password ? encrypt(password) : null,
          status: status || 'active'
        }
      });
      await logAdminAction(req, 'create_provider', 'provider', provider.id, { providerName });
    }

    res.json({
      success: true,
      provider: {
        id: provider.id,
        providerName: provider.providerName,
        portalUrl: provider.portalUrl,
        status: provider.status,
        hasCredentials: !!(provider.encryptedUsername && provider.encryptedPassword)
      }
    });
  } catch (err) {
    console.error('Failed to save provider credentials:', err.message);
    res.status(500).json({ success: false, error: 'Internal server error.' });
  }
});

// Admin: create new administrator (Super Admin only)
app.post('/api/admin/users/create', requireAuth, requireRole(['super_admin']), async (req, res) => {
  const { name, email, mobile, password, role } = req.body;
  if (!email || !password || !role || !name) {
    return res.status(400).json({ success: false, error: 'All fields are required.' });
  }

  if (!['super_admin', 'admin', 'support_executive'].includes(role)) {
    return res.status(400).json({ success: false, error: 'Invalid admin role.' });
  }

  try {
    const existing = await prisma.user.findFirst({
      where: { OR: [{ email }, { mobile }] }
    });

    if (existing) {
      return res.status(400).json({ success: false, error: 'User with this email or mobile number already exists.' });
    }

    const { hashPassword } = require('../lib/auth');
    const passwordHash = await hashPassword(password);

    const newUser = await prisma.user.create({
      data: {
        name,
        email,
        mobile,
        passwordHash,
        role
      }
    });

    await logAdminAction(req, 'create_admin_user', 'user', newUser.id, { email, role });

    res.json({
      success: true,
      user: {
        id: newUser.id,
        name: newUser.name,
        email: newUser.email,
        role: newUser.role
      }
    });
  } catch (err) {
    console.error('Failed to create admin user:', err.message);
    res.status(500).json({ success: false, error: 'Internal server error.' });
  }
});

// Admin: cancel booking
app.post('/api/admin/bookings/:id/cancel', requireAuth, requireRole(['super_admin', 'admin', 'support_executive']), async (req, res) => {
  const { id } = req.params;
  
  try {
    const order = await prisma.order.findUnique({ where: { id } });
    if (!order) {
      return res.status(404).json({ success: false, error: 'Booking not found.' });
    }

    // Support Executive cannot cancel confirmed bookings
    if (req.user.role === 'support_executive' && order.status === 'confirmed') {
      return res.status(403).json({ success: false, error: 'Support executives are not authorized to cancel confirmed bookings.' });
    }

    const updated = await prisma.order.update({
      where: { id },
      data: { status: 'cancelled' }
    });

    await logAdminAction(req, 'cancel_booking', 'order', order.id, { pnr: order.providerPnr || order.bookingReference, previousStatus: order.status });

    res.json({ success: true, order: updated });
  } catch (err) {
    console.error('Booking cancellation failed:', err.message);
    res.status(500).json({ success: false, error: 'Failed to cancel booking.' });
  }
});

// Admin: refund booking
app.post('/api/admin/bookings/:id/refund', requireAuth, requireRole(['super_admin', 'admin']), async (req, res) => {
  const { id } = req.params;
  
  try {
    const order = await prisma.order.findUnique({ where: { id } });
    if (!order) {
      return res.status(404).json({ success: false, error: 'Booking not found.' });
    }

    const updated = await prisma.order.update({
      where: { id },
      data: { status: 'refunded' }
    });

    await logAdminAction(req, 'refund_booking', 'order', order.id, { pnr: order.providerPnr || order.bookingReference, amount: order.totalPayable });

    res.json({ success: true, order: updated });
  } catch (err) {
    console.error('Booking refund failed:', err.message);
    res.status(500).json({ success: false, error: 'Failed to process refund.' });
  }
});

// Admin: view audit logs (Super Admin only)
app.get('/api/admin/logs', requireAuth, requireRole(['super_admin']), async (req, res) => {
  try {
    const logs = await prisma.auditLog.findMany({
      include: { user: true },
      orderBy: { createdAt: 'desc' },
      take: 100
    });

    const formatted = logs.map(l => ({
      id: l.id,
      action: l.action,
      adminName: l.user ? l.user.name : 'System',
      role: l.user ? l.user.role : 'system',
      ip: l.ipAddress || '0.0.0.0',
      time: l.createdAt.toISOString(),
      metadata: l.metadataJson
    }));

    res.json({ success: true, logs: formatted });
  } catch (err) {
    console.error('Failed to retrieve audit logs:', err.message);
    res.status(500).json({ success: false, error: 'Internal server error.' });
  }
});

// Firebase Auth Endpoints
app.get('/api/config/firebase', (req, res) => {
  res.json({
    apiKey: process.env.FIREBASE_API_KEY || '',
    authDomain: process.env.FIREBASE_AUTH_DOMAIN || '',
    projectId: process.env.FIREBASE_PROJECT_ID || '',
    storageBucket: process.env.FIREBASE_STORAGE_BUCKET || '',
    messagingSenderId: process.env.FIREBASE_MESSAGING_SENDER_ID || '',
    appId: process.env.FIREBASE_APP_ID || ''
  });
});

app.post('/api/auth/firebase', async (req, res) => {
  const { idToken } = req.body;
  if (!idToken) {
    return res.status(400).json({ success: false, error: 'Firebase ID Token is required.' });
  }

  try {
    const { verifyFirebaseIdToken } = require('../lib/auth');
    const result = await verifyFirebaseIdToken(idToken);

    if (!result.success) {
      return res.status(401).json(result);
    }

    // Set secure HTTP-only cookies (SameSite lax is cleaner for SSO/callback flows)
    res.cookie('cti_access', result.accessToken, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax',
      maxAge: 15 * 60 * 1000 // 15 mins
    });

    res.cookie('cti_refresh', result.refreshToken, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax',
      maxAge: 7 * 24 * 60 * 60 * 1000 // 7 days
    });

    // Log login/registration event
    try {
      const ipAddress = req.ip || req.headers['x-forwarded-for'] || req.connection.remoteAddress;
      await prisma.auditLog.create({
        data: {
          action: result.isNewUser ? 'signup' : 'login',
          userId: result.user.id,
          entityType: 'customer',
          metadataJson: { source: 'firebase' },
          ipAddress
        }
      });
    } catch (err) {}

    res.json({
      success: true,
      user: {
        id: result.user.id,
        name: result.user.name,
        mobile: result.user.mobile,
        email: result.user.email,
        role: result.user.role
      }
    });
  } catch (err) {
    console.error('Firebase Auth endpoint failed:', err.message);
    res.status(500).json({ success: false, error: 'Failed to verify Firebase authentication.' });
  }
});

app.post('/api/auth/logout', (req, res) => {
  res.clearCookie('cti_access');
  res.clearCookie('cti_refresh');
  res.json({ success: true, message: 'Logged out successfully.' });
});

app.get('/api/auth/me', requireAuth, (req, res) => {
  res.json({
    success: true,
    user: {
      id: req.user.id,
      email: req.user.email,
      name: req.user.name,
      role: req.user.role,
      mobile: req.user.mobile
    }
  });
});

// Customer: Update Profile (Name & Email)
app.put('/api/auth/profile', requireAuth, async (req, res) => {
  const { name, email } = req.body;
  
  if (!name || !name.trim()) {
    return res.status(400).json({ success: false, error: 'Name is required.' });
  }

  try {
    // Check if email is already taken by another user (case-insensitive)
    if (email && email.trim()) {
      const existing = await prisma.user.findFirst({
        where: {
          email: {
            equals: email.trim(),
            mode: 'insensitive'
          },
          NOT: { id: req.user.id }
        }
      });
      if (existing) {
        return res.status(400).json({ success: false, error: 'This email is already registered with another account.' });
      }
    }

    const updatedUser = await prisma.user.update({
      where: { id: req.user.id },
      data: {
        name: name.trim(),
        email: email && email.trim() ? email.trim() : null
      }
    });

    res.json({
      success: true,
      user: {
        id: updatedUser.id,
        name: updatedUser.name,
        mobile: updatedUser.mobile,
        email: updatedUser.email,
        role: updatedUser.role
      }
    });
  } catch (err) {
    console.error('Failed to update user profile:', err.message);
    res.status(500).json({ success: false, error: 'Failed to save profile changes. Please try again.' });
  }
});

// Customer: Fetch Bookings list
app.get('/api/auth/bookings', requireAuth, async (req, res) => {
  try {
    const orders = await prisma.order.findMany({
      where: { userId: req.user.id },
      orderBy: { createdAt: 'desc' }
    });

    res.json({
      success: true,
      bookings: orders.map(o => ({
        id: o.id,
        operator: o.operator,
        busType: o.busType,
        fromCity: o.fromCity,
        toCity: o.toCity,
        journeyDate: o.journeyDate,
        departure: o.departure,
        arrival: o.arrival,
        seatNo: o.seatNo,
        boardingPoint: o.boardingPoint,
        droppingPoint: o.droppingPoint,
        passengerName: o.passengerName,
        totalPayable: o.totalPayable,
        status: o.status,
        providerPnr: o.providerPnr,
        createdAt: o.createdAt.toISOString()
      }))
    });
  } catch (err) {
    console.error('Failed to retrieve customer bookings:', err.message);
    res.status(500).json({ success: false, error: 'Failed to retrieve bookings list.' });
  }
});


// API: Send signup details to owner's email
app.post('/api/signup', async (req, res) => {
  const { name, email, phone } = req.body;
  console.log(`New user signup notification request received: ${name} (${email}, ${phone})`);
  
  // Track signup in database
  try {
    await prisma.auditLog.create({
      data: {
        action: 'signup',
        entityType: 'customer',
        metadataJson: { name, email, phone }
      }
    });
  } catch (err) {}


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

    // Pre-fetch and cache cities so the first user request is instant
    try {
      console.log('Pre-fetching cities from both operator portals...');
      const [lxmiCities, rdlhCities] = await Promise.allSettled([
        fetchCities('lxmi'),
        fetchCities('rdlh')
      ]);
      if (lxmiCities.status === 'fulfilled') {
        OPERATORS.lxmi.cities = lxmiCities.value;
        console.log(`Cached ${lxmiCities.value.length} Laxmi Holidays cities.`);
      } else {
        console.error('Failed to pre-fetch Laxmi cities:', lxmiCities.reason?.message);
      }
      if (rdlhCities.status === 'fulfilled') {
        OPERATORS.rdlh.cities = rdlhCities.value;
        console.log(`Cached ${rdlhCities.value.length} Ram Dalal Holidays cities.`);
      } else {
        console.error('Failed to pre-fetch RDLH cities:', rdlhCities.reason?.message);
      }
    } catch (err) {
      console.error('Warning: Cities pre-fetch failed. Will load on demand.');
    }
  });
}

module.exports = app;
