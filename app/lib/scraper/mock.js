// Mock inventory — only Ram Dalal and Laxmi Holidays, the two real operators.
// Used when LXMI_USERNAME / LXMI_PASSWORD are not set in env.
// Boarding/dropping city names are adapted at query time to match the actual from/to.

const BUSES = [
  {
    externalId: 'lxm-001',
    provider: 'laxmi',
    operator: 'Laxmi Holidays',
    busType: 'AC Sleeper (2+1)',
    departure: '19:00',
    arrival: '07:30',
    durationMins: 750,
    netFare: 900,
    providerCommissionPct: 20,
    seatsAvailable: 22,
    rating: 4.5,
    ratingCount: 3120,
    amenities: ['Direct', 'Charging point', 'Blanket', 'Mineral water'],
    boardingPoints: [
      { id: 'lxm-bp1', name: 'PLACEHOLDER_FROM Bus Stand', address: 'Main bus stand', time: '19:00' },
      { id: 'lxm-bp2', name: 'PLACEHOLDER_FROM Crossing', address: 'Highway dhaba', time: '19:45' },
    ],
    droppingPoints: [
      { id: 'lxm-dp1', name: 'PLACEHOLDER_TO ISBT', address: 'Main ISBT', time: '07:30' },
    ],
  },
  {
    externalId: 'lxm-002',
    provider: 'laxmi',
    operator: 'Laxmi Holidays',
    busType: 'NON-AC Sleeper (2+1)',
    departure: '21:30',
    arrival: '09:00',
    durationMins: 690,
    netFare: 700,
    providerCommissionPct: 20,
    seatsAvailable: 14,
    rating: 4.3,
    ratingCount: 1850,
    amenities: ['Direct', 'Live tracking'],
    boardingPoints: [
      { id: 'lxm2-bp1', name: 'PLACEHOLDER_FROM Bus Stand', address: 'Main bus stand', time: '21:30' },
    ],
    droppingPoints: [
      { id: 'lxm2-dp1', name: 'PLACEHOLDER_TO Terminus', address: 'Main terminus', time: '09:00' },
      { id: 'lxm2-dp2', name: 'PLACEHOLDER_TO Metro Gate', address: 'Metro station entry', time: '08:45' },
    ],
  },
  {
    externalId: 'rdl-001',
    provider: 'laxmi',
    operator: 'Ram Dalal Travels',
    busType: 'AC Sleeper (2+1)',
    departure: '18:00',
    arrival: '06:30',
    durationMins: 750,
    netFare: 850,
    providerCommissionPct: 20,
    seatsAvailable: 9,
    rating: 4.6,
    ratingCount: 2740,
    amenities: ['WiFi', 'USB charging', 'CCTV', 'Blanket'],
    boardingPoints: [
      { id: 'rdl-bp1', name: 'PLACEHOLDER_FROM Bus Stand', address: 'Main bus stand', time: '18:00' },
      { id: 'rdl-bp2', name: 'PLACEHOLDER_FROM Naka', address: 'Highway naka', time: '18:40' },
    ],
    droppingPoints: [
      { id: 'rdl-dp1', name: 'PLACEHOLDER_TO ISBT', address: 'Main ISBT', time: '06:30' },
    ],
  },
  {
    externalId: 'rdl-002',
    provider: 'laxmi',
    operator: 'Ram Dalal Travels',
    busType: 'NON-AC Sleeper (2+1)',
    departure: '20:30',
    arrival: '08:00',
    durationMins: 690,
    netFare: 650,
    providerCommissionPct: 20,
    seatsAvailable: 17,
    rating: 4.2,
    ratingCount: 980,
    amenities: ['Direct', 'Mineral water'],
    boardingPoints: [
      { id: 'rdl2-bp1', name: 'PLACEHOLDER_FROM Bus Stand', address: 'Main bus stand', time: '20:30' },
    ],
    droppingPoints: [
      { id: 'rdl2-dp1', name: 'PLACEHOLDER_TO Bus Terminal', address: 'Main terminal', time: '08:00' },
    ],
  },
];

// 2+1 sleeper layout: 3 berths per row (left-left-right), 7 rows = 21 lower berths
// Each bus has a clearly different occupancy so they don't look identical
const SEAT_LAYOUTS = {
  // Laxmi AC — mostly full, 6 booked, 1 ladies
  'lxm-001': { rows: 7, cols: 3, sleeper: true, prefix: 'L', booked: [1, 3, 6, 9, 15, 18], ladies: [12] },
  // Laxmi NON-AC — mostly empty, 3 booked
  'lxm-002': { rows: 7, cols: 3, sleeper: true, prefix: 'L', booked: [2, 8, 19], ladies: [5, 14] },
  // Ram Dalal AC — heavily booked (only 9 left shown in bus card)
  'rdl-001': { rows: 7, cols: 3, sleeper: true, prefix: 'L', booked: [1, 2, 4, 6, 7, 9, 10, 13, 16, 19, 20, 21], ladies: [3, 11] },
  // Ram Dalal NON-AC — half empty
  'rdl-002': { rows: 7, cols: 3, sleeper: true, prefix: 'L', booked: [3, 7, 12, 17], ladies: [9] },
};

const FALLBACK_LAYOUT = { rows: 7, cols: 3, sleeper: true, prefix: 'L', booked: [2, 5], ladies: [8] };

export async function fetchBuses({ from, to, date }) {
  await new Promise(r => setTimeout(r, 320));
  return BUSES.map(b => ({
    ...b,
    boardingPoints: b.boardingPoints.map(p => ({
      ...p,
      name: p.name.replace('PLACEHOLDER_FROM', from),
      address: p.address.replace('Main bus stand', `Main bus stand, ${from}`),
    })),
    droppingPoints: b.droppingPoints.map(p => ({
      ...p,
      name: p.name.replace('PLACEHOLDER_TO', to),
      address: p.address.replace('Main ISBT', `Main ISBT, ${to}`)
                        .replace('Main terminus', `Main terminus, ${to}`)
                        .replace('Metro station entry', `Metro station, ${to}`)
                        .replace('Main terminal', `Main terminal, ${to}`)
                        .replace('Main terminal', `Main terminal, ${to}`),
    })),
  }));
}

export async function fetchSeats(busExternalId) {
  await new Promise(r => setTimeout(r, 180));
  const cfg = SEAT_LAYOUTS[busExternalId] || FALLBACK_LAYOUT;
  const seats = [];
  const total = cfg.rows * cfg.cols;
  for (let i = 1; i <= total; i++) {
    const label = (cfg.prefix || '') + i;
    let status = 'available';
    if (cfg.booked?.includes(i)) status = 'booked';
    else if (cfg.ladies?.includes(i)) status = 'ladies';
    seats.push({ no: label, status, sleeper: cfg.sleeper });
  }
  return { rows: cfg.rows, cols: cfg.cols, sleeper: cfg.sleeper, seats };
}

export async function placeProviderBooking(order) {
  await new Promise(r => setTimeout(r, 800));
  const pnr = 'LXM-' + Math.random().toString(36).slice(2, 8).toUpperCase();
  return { ok: true, pnr };
}
