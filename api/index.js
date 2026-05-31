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

// Helper to resolve generic city dropdown values to operator-specific names and IDs
function resolveCityNamesAndIds(fromVal, toVal) {
  let fromName = '';
  let toName = '';
  let lxmiFromId = null;
  let lxmiToId = null;
  let rdlhFromId = null;
  let rdlhToId = null;

  // Resolve Names and local IDs first
  if (fromVal.startsWith('rd-')) {
    const rdlhId = fromVal.replace('rd-', '');
    const c = (OPERATORS.rdlh.cities || []).find(x => x.id === rdlhId);
    if (c) fromName = c.name;
    rdlhFromId = rdlhId;
  } else {
    const c = (OPERATORS.lxmi.cities || []).find(x => x.id === fromVal);
    if (c) fromName = c.name;
    lxmiFromId = fromVal;
  }

  if (toVal.startsWith('rd-')) {
    const rdlhId = toVal.replace('rd-', '');
    const c = (OPERATORS.rdlh.cities || []).find(x => x.id === rdlhId);
    if (c) toName = c.name;
    rdlhToId = rdlhId;
  } else {
    const c = (OPERATORS.lxmi.cities || []).find(x => x.id === toVal);
    if (c) toName = c.name;
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

// API: Get combined cities mapping
app.get('/api/cities', async (req, res) => {
  try {
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

    res.json({ success: true, cities: mergedCities });
  } catch (error) {
    console.error("API /cities error:", error.message);
    res.status(500).json({ success: false, error: error.message });
  }
});

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
    console.log(`Session expired for ${op.name} during search, re-authenticating...`);
    await performLogin(opKey);
    return searchOperatorBuses(opKey, fromId, toId, date);
  }

  const searchText = await searchRes.text();
  const searchJson = JSON.parse(searchText);

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

// Helper: generate simulated SeatSeller competitor buses
function generateSeatSellerBuses(fromName, toName, baseFareValue) {
  const competitorOperators = [
    { name: "Zingbus", type: "A/C Sleeper (2+1)", duration: "12h 45m", dep: "06:00 PM", arr: "06:45 AM" },
    { name: "IntrCity SmartBus", type: "Volvo Multi-Axle A/C Sleeper (2+1)", duration: "12h 15m", dep: "07:30 PM", arr: "07:45 AM" },
    { name: "RS Yadav Travels", type: "A/C Sleeper (2+1) Bharat Benz", duration: "13h 00m", dep: "08:45 PM", arr: "09:45 AM" },
    { name: "Safar Express Pvt Ltd", type: "A/C Sleeper (2+1)", duration: "12h 30m", dep: "09:30 PM", arr: "10:00 AM" }
  ];

  return competitorOperators.map((op, index) => {
    const priceShift = (index % 2 === 0 ? 50 : -80) * (index + 1);
    const fare = Math.max(700, baseFareValue + priceShift);
    
    const boardingPoints = [
      { id: `bp-ss-${index}-1`, time: op.dep, name: `${fromName} Bypass`, landmark: "Near Highway" },
      { id: `bp-ss-${index}-2`, time: op.dep, name: `${fromName} Main Bus Stand`, landmark: "Counter No 4" }
    ];
    
    const droppingPoints = [
      { id: `dp-ss-${index}-1`, time: op.arr, name: `${toName} Kashmiri Gate`, landmark: "Metro Station Exit" },
      { id: `dp-ss-${index}-2`, time: op.arr, name: `${toName} Anand Vihar`, landmark: "Double Kaushambi road" }
    ];

    return {
      resId: `ss-${index + 1}-${fromName.substring(0,3).toLowerCase()}-${toName.substring(0,3).toLowerCase()}-${fare}`,
      routeId: `ss-route-${index}`,
      operator: op.name,
      routeName: `${fromName} to ${toName}`,
      busType: op.type,
      departure: op.dep,
      arrival: op.arr,
      arrivalDate: "",
      duration: op.duration,
      seatsLeft: Math.floor(Math.random() * 20) + 8,
      fareString: `${fare}`,
      minFare: fare,
      maxFare: fare,
      boardingPoints: boardingPoints,
      droppingPoints: droppingPoints
    };
  });
}

// Helper: generate a simulated seat layout for SeatSeller competitor buses
function generateSimulatedLayout(resId) {
  const parts = resId.split('-');
  const fare = parts.length >= 5 ? parseFloat(parts[parts.length - 1]) : 1200;

  const seats = [];
  const maxRow = 6;
  const maxCol = 5;

  for (let r = 0; r < maxRow; r++) {
    for (let c = 0; c < maxCol; c++) {
      if (c === 2) {
        seats.push({
          isGangway: true,
          row: r,
          col: c,
          rowspan: 1,
          colspan: 1
        });
        continue;
      }

      const colLetter = c < 2 ? "L" : "R";
      const seatNo = `${r + 1}${colLetter}${c < 2 ? c + 1 : c - 2}`;
      
      const seed = (r * maxCol + c + parseInt(parts[1] || 1)) % 7;
      const isBooked = seed === 0 || seed === 3;
      const isLadies = seed === 2;
      const isSleeper = r >= 4; // last 2 rows are sleepers

      seats.push({
        seatNo,
        available: !isBooked,
        booked: isBooked,
        ladies: isLadies,
        sleeper: isSleeper,
        row: r,
        col: c,
        rowspan: isSleeper ? 2 : 1,
        colspan: 1,
        fare: isSleeper ? fare + 200 : fare
      });
    }
  }

  const finalSeats = [];
  const occupiedGrid = {};
  seats.forEach(s => {
    const key = `${s.row}_${s.col}`;
    if (occupiedGrid[key]) return;
    
    occupiedGrid[key] = true;
    if (s.rowspan > 1) {
      for (let offset = 1; offset < s.rowspan; offset++) {
        occupiedGrid[`${s.row + offset}_${s.col}`] = true;
      }
    }
    finalSeats.push(s);
  });

  return {
    seats: finalSeats,
    maxRow,
    maxCol,
    ladiesAdjacent: [],
    gentsAdjacent: []
  };
}

// API: Search buses
app.get('/api/search', async (req, res) => {
  const { from, to, date } = req.query; // date format: DD/MM/YYYY
  if (!from || !to || !date) {
    return res.status(400).json({ success: false, error: "Missing required query parameters: from, to, date" });
  }

  try {
    // Make sure we have dynamic cities loaded
    if (!OPERATORS.lxmi.cities || OPERATORS.lxmi.cities.length === 0) {
      OPERATORS.lxmi.cities = await fetchCities('lxmi');
    }
    if (!OPERATORS.rdlh.cities || OPERATORS.rdlh.cities.length === 0) {
      OPERATORS.rdlh.cities = await fetchCities('rdlh');
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

    // Merge real operator buses
    let realBuses = [...lxmiBuses, ...rdlhBuses];

    // Determine baseline fare for simulator
    let baseFareValue = 1200;
    if (realBuses.length > 0) {
      const fares = realBuses.map(b => b.minFare).filter(f => f > 0);
      if (fares.length > 0) {
        baseFareValue = Math.round(fares.reduce((a, b) => a + b, 0) / fares.length);
      }
    }

    // Generate competitor buses (SeatSeller)
    const ssBuses = generateSeatSellerBuses(fromName, toName, baseFareValue);

    // Combine all buses (real ones first, simulator competitors last)
    const buses = [...realBuses, ...ssBuses];

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
    if (resId.startsWith('ss-')) {
      console.log(`Generating simulated seat layout for SeatSeller competitor bus: ${resId}`);
      const layoutData = generateSimulatedLayout(resId);
      return res.json({ success: true, ...layoutData });
    }

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
      console.log(`Session expired for ${op.name} during layout query, re-authenticating...`);
      await performLogin(opKey);
      return res.redirect(req.originalUrl);
    }

    const jsText = await layoutRes.text();
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
