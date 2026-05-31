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

// B2B Portal credentials (loaded from process.env with default fallbacks)
const USERNAME = process.env.B2B_USERNAME || 'lxmi.cheap';
const PASSWORD = process.env.B2B_PASSWORD || '[REDACTED]';
const PORTAL_URL = process.env.B2B_PORTAL_URL || 'https://lxmi.laxmiholidays.com';

// Session state
let sessionCookies = [];
let csrfToken = '';
let lastLoginTime = 0;

// Helper to extract CSRF token and cookies
async function performLogin() {
  console.log("Starting B2B B2B portal login sequence...");
  try {
    // 1. Fetch main page to get initial cookies and CSRF token
    const initialRes = await fetch(PORTAL_URL, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
      }
    });
    const text = await initialRes.text();
    const headers = initialRes.headers;
    
    // Extract CSRF token
    const tokenMatch = text.match(/name="csrf-token" content="([^"]+)"/) || text.match(/name="authenticity_token" value="([^"]+)"/);
    csrfToken = tokenMatch ? tokenMatch[1] : '';
    
    // Extract cookies
    const cookies = [];
    headers.forEach((value, name) => {
      if (name.toLowerCase() === 'set-cookie') {
        cookies.push(value.split(';')[0]);
      }
    });

    if (!csrfToken) {
      throw new Error("Could not retrieve authenticity token from login page.");
    }

    // 2. Perform POST to signin endpoint
    const bodyParams = new URLSearchParams();
    bodyParams.append("login", USERNAME);
    bodyParams.append("password", PASSWORD);
    bodyParams.append("login_flag", "");
    bodyParams.append("authenticity_token", csrfToken);

    const loginRes = await fetch(`${PORTAL_URL}/account/signin`, {
      method: "POST",
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
        "Cookie": cookies.join("; "),
        "User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
        "Referer": `${PORTAL_URL}/`,
        "X-CSRF-Token": csrfToken,
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

    sessionCookies = finalCookies;
    lastLoginTime = Date.now();
    console.log("Logged in successfully! Cookies locked.");
    return true;
  } catch (error) {
    console.error("Login attempt failed:", error.message);
    throw error;
  }
}

// Ensure valid session is active
async function ensureSession() {
  const SESSION_TIMEOUT = 10 * 60 * 1000; // 10 minutes cache
  if (sessionCookies.length === 0 || (Date.now() - lastLoginTime) > SESSION_TIMEOUT) {
    await performLogin();
  }
}

// API: Get cities mapping from agent_dynamic_js_content.js
app.get('/api/cities', async (req, res) => {
  try {
    await ensureSession();
    console.log("Fetching dynamic B2B JS file for destinations...");
    
    const jsRes = await fetch(`${PORTAL_URL}/agent_dynamic_js_content.js`, {
      headers: {
        "Cookie": sessionCookies.join("; "),
        "User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
        "Referer": `${PORTAL_URL}/bookings`
      }
    });

    if (jsRes.status === 401) {
      console.log("Session expired (401), re-authenticating...");
      await performLogin();
      return res.redirect(req.originalUrl);
    }

    const jsText = await jsRes.text();
    
    // Extract destinations_map variable
    const startIdx = jsText.indexOf('var destinations_map =');
    if (startIdx === -1) {
      throw new Error("Could not find destinations_map variable in B2B JS.");
    }
    const endIdx = jsText.indexOf(']]}', startIdx) + 3;
    const decl = jsText.substring(startIdx, endIdx);
    
    // Parse the JSON part out of the declaration
    const jsonStr = decl.substring(decl.indexOf('{'), decl.lastIndexOf('}') + 1);
    const dataMap = JSON.parse(jsonStr);

    if (!dataMap.destinations) {
      throw new Error("Parsed destinations mapping is empty.");
    }

    const cities = dataMap.destinations.map(d => ({
      name: d[0],
      id: d[1]
    })).sort((a, b) => a.name.localeCompare(b.name));

    res.json({ success: true, cities });
  } catch (error) {
    console.error("API /cities error:", error.message);
    res.status(500).json({ success: false, error: error.message });
  }
});

// API: Search buses
app.get('/api/search', async (req, res) => {
  const { from, to, date } = req.query; // date format: DD/MM/YYYY
  if (!from || !to || !date) {
    return res.status(400).json({ success: false, error: "Missing required query parameters: from, to, date" });
  }

  try {
    await ensureSession();
    console.log(`Searching buses from ID ${from} to ID ${to} on ${date}...`);

    const queryParams = new URLSearchParams();
    queryParams.append("searchbus[from]", from);
    queryParams.append("searchbus[to]", to);
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

    const searchUrl = `${PORTAL_URL}/ibooking/bookings/search_service?${queryParams.toString()}`;
    const searchRes = await fetch(searchUrl, {
      headers: {
        "Cookie": sessionCookies.join("; "),
        "User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
        "Referer": `${PORTAL_URL}/bookings`,
        "X-CSRF-Token": csrfToken,
        "X-Requested-With": "XMLHttpRequest"
      }
    });

    if (searchRes.status === 401) {
      console.log("Session expired during search, re-authenticating...");
      await performLogin();
      return res.redirect(req.originalUrl);
    }

    const searchText = await searchRes.text();
    const searchJson = JSON.parse(searchText);

    if (!searchJson.data) {
      return res.json({ success: true, buses: [] });
    }

    // Normalize buses
    const buses = searchJson.data.map(bus => {
      const details = bus[11] || {};
      const summary = bus[12] || {};
      
      // Parse fare string to get min and max
      const fareStr = summary.fare || "";
      const fareParts = fareStr.split('/').map(f => parseFloat(f.trim())).filter(f => !isNaN(f));
      const minFare = fareParts.length > 0 ? Math.min(...fareParts) : 0;
      const maxFare = fareParts.length > 0 ? Math.max(...fareParts) : 0;

      return {
        resId: summary.res_id || details.res_id,
        routeId: summary.route_id || details.route_id,
        operator: "Laxmi Holidays Pvt Ltd",
        routeName: summary.number || details.number || "Laxmi Service",
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
    await ensureSession();
    console.log(`Fetching seat layout for reservation ID ${resId}...`);

    // Pre-initialize B2B session route by performing a quick search first
    console.log(`Pre-initializing session route: From ID ${from} to ID ${to} on ${date}...`);
    const initParams = new URLSearchParams();
    initParams.append("searchbus[from]", from);
    initParams.append("searchbus[to]", to);
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

    const searchInitUrl = `${PORTAL_URL}/ibooking/bookings/search_service?${initParams.toString()}`;
    await fetch(searchInitUrl, {
      headers: {
        "Cookie": sessionCookies.join("; "),
        "User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
        "Referer": `${PORTAL_URL}/bookings`,
        "X-CSRF-Token": csrfToken,
        "X-Requested-With": "XMLHttpRequest"
      }
    });

    const layoutUrl = `${PORTAL_URL}/ibooking/bookings/select_seat/${resId}?searchbus_params[from]=${from}&searchbus_params[to]=${to}&searchbus_params[depart]=${date}&searchbus_params[terminal]=0&searchbus_params[code]=&booking_return_date=`;
    
    const layoutRes = await fetch(layoutUrl, {
      headers: {
        "Cookie": sessionCookies.join("; "),
        "User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
        "Referer": `${PORTAL_URL}/bookings`,
        "X-CSRF-Token": csrfToken,
        "X-Requested-With": "XMLHttpRequest",
        "Cache-Control": "no-cache",
        "Pragma": "no-cache"
      }
    });

    if (layoutRes.status === 401) {
      console.log("Session expired during layout query, re-authenticating...");
      await performLogin();
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

    $('#seat_layout_table tr').each((rowIndex, tr) => {
      $(tr).find('td').each((colIndex, td) => {
        const seatNo = $(td).attr('data-seatnumber');
        const title = $(td).attr('title') || '';
        const isGangway = title.toLowerCase() === 'gangway' || $(td).hasClass('ganway_col') || !seatNo;

        if (isGangway) {
          seats.push({
            isGangway: true,
            row: rowIndex,
            col: colIndex
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

        if (rowIndex > maxRow) maxRow = rowIndex;
        if (colIndex > maxCol) maxCol = colIndex;

        seats.push({
          seatNo,
          available: isAvailable,
          booked: isBooked,
          ladies: isLadies,
          sleeper: isSleeper,
          row: rowIndex,
          col: colIndex,
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
      await performLogin();
    } catch (err) {
      console.error("Warning: Initial login during startup failed. Will retry on first client request.");
    }
  });
}

module.exports = app;
