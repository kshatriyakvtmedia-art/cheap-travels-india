// Mock inventory used when no provider credentials are configured.
// Returned shape matches what the real Laxmi scraper returns — UI works either way.
const TODAY_BUSES = [
  {
    externalId: 'lxm-az-del-001',
    provider: 'laxmi',
    operator: 'Laxmi Holidays Pvt Ltd',
    busType: 'NON-AC Sleeper (2+1)',
    departure: '18:30',
    arrival: '09:00',
    durationMins: 870,
    netFare: 1190,
    providerCommissionPct: 20,
    seatsAvailable: 26,
    rating: 4.4,
    ratingCount: 1284,
    amenities: ['Direct', 'Live tracking', 'Mineral water'],
    boardingPoints: [
      { id: 'bp1', name: 'Azamgarh Bus Stand', address: 'Main bus stand, near LIC office', time: '18:30' },
      { id: 'bp2', name: 'Mubarakpur Crossing', address: 'Highway dhaba, opp HP pump', time: '19:10' },
      { id: 'bp3', name: 'Phulpur', address: 'Phulpur tiraha', time: '20:25' },
    ],
    droppingPoints: [
      { id: 'dp1', name: 'Anand Vihar ISBT', address: 'Gate 4, Anand Vihar', time: '09:00' },
      { id: 'dp2', name: 'Akshardham', address: 'Akshardham Metro', time: '08:30' },
    ],
  },
  {
    externalId: 'lxm-az-del-002',
    provider: 'laxmi',
    operator: 'Hans Travels (India) Pvt Ltd',
    busType: 'AC Sleeper (2+1)',
    departure: '19:45',
    arrival: '09:30',
    durationMins: 825,
    netFare: 1450,
    providerCommissionPct: 18,
    seatsAvailable: 7,
    rating: 4.6,
    ratingCount: 2140,
    amenities: ['Direct', 'Charging point', 'Blanket'],
    boardingPoints: [
      { id: 'bp1', name: 'Azamgarh Bus Stand', address: 'Main bus stand', time: '19:45' },
      { id: 'bp2', name: 'Mubarakpur', address: 'Main chowk', time: '20:20' },
    ],
    droppingPoints: [
      { id: 'dp1', name: 'Kashmere Gate', address: 'ISBT Kashmere Gate', time: '09:30' },
    ],
  },
  {
    externalId: 'lxm-az-del-003',
    provider: 'laxmi',
    operator: 'UP State Roadways (Volvo)',
    busType: 'AC Seater 2+2',
    departure: '21:00',
    arrival: '09:50',
    durationMins: 770,
    netFare: 1000,
    providerCommissionPct: 15,
    seatsAvailable: 18,
    rating: 4.2,
    ratingCount: 892,
    amenities: ['Volvo 9400', 'Govt. operated'],
    boardingPoints: [
      { id: 'bp1', name: 'Azamgarh Bus Depot', address: 'UPSRTC depot', time: '21:00' },
    ],
    droppingPoints: [
      { id: 'dp1', name: 'ISBT Anand Vihar', address: 'Anand Vihar', time: '09:50' },
    ],
  },
  {
    externalId: 'lxm-az-del-004',
    provider: 'laxmi',
    operator: 'Shrinath Tourist Agency',
    busType: 'AC Sleeper (2+1)',
    departure: '17:00',
    arrival: '08:30',
    durationMins: 930,
    netFare: 1690,
    providerCommissionPct: 22,
    seatsAvailable: 12,
    rating: 4.7,
    ratingCount: 3420,
    amenities: ['WiFi', 'USB', 'CCTV', 'Snack pack'],
    boardingPoints: [
      { id: 'bp1', name: 'Azamgarh Bus Stand', address: 'Main stand', time: '17:00' },
    ],
    droppingPoints: [
      { id: 'dp1', name: 'Sarai Kale Khan', address: 'Sarai Kale Khan ISBT', time: '08:30' },
    ],
  },
];

const SEAT_LAYOUTS = {
  'lxm-az-del-001': { rows: 6, cols: 5, sleeper: true, prefix: 'L', booked: [2,5,9,12,18,21,24], ladies: [8,15] },
  'lxm-az-del-002': { rows: 6, cols: 5, sleeper: true, prefix: 'L', booked: [1,2,3,4,7,10,11,14,17,19,22,25], ladies: [6,16] },
  'lxm-az-del-003': { rows: 10, cols: 4, sleeper: false, prefix: 'S', booked: [3,8,11,17,22,28,33,36], ladies: [1,2,19,20] },
  'lxm-az-del-004': { rows: 6, cols: 5, sleeper: true, prefix: 'L', booked: [1,4,7,10,13,16,19,22,25,28], ladies: [3,12] },
};

export async function fetchBuses({ from, to, date }) {
  // mimic network delay so the UI has something to feel
  await new Promise(r => setTimeout(r, 300));
  return TODAY_BUSES;
}

export async function fetchSeats(busExternalId) {
  await new Promise(r => setTimeout(r, 150));
  const cfg = SEAT_LAYOUTS[busExternalId];
  if (!cfg) return null;
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
  // Mock booking — returns a fake PNR. Real Laxmi scraper would do this for real.
  await new Promise(r => setTimeout(r, 800));
  const pnr = 'LXM-' + Math.random().toString(36).slice(2, 8).toUpperCase();
  return { ok: true, pnr };
}
