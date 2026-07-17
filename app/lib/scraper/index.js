// Provider aggregator. Calls every configured scraper in parallel and merges results.

import * as laxmi from './laxmi.js';
import * as ramdal from './ramdal.js';
import * as mock from './mock.js';

const PROVIDERS = [laxmi, ramdal];
const BY_NAME = { laxmi, ramdal };

export async function aggregateBuses({ from, to, date }) {
  const active = PROVIDERS.filter(p => p.isConfigured?.());
  if (active.length === 0) {
    return mock.fetchBuses({ from, to, date });
  }
  const results = await Promise.allSettled(
    active.map(p => p.fetchBuses({ from, to, date }))
  );
  const merged = [];
  for (const r of results) {
    if (r.status === 'fulfilled') merged.push(...r.value);
    else console.error('[aggregator] provider error:', r.reason?.message || r.reason);
  }
  if (merged.length === 0) {
    return mock.fetchBuses({ from, to, date });
  }
  // Dedup by operator + departure
  const seen = new Set();
  return merged.filter(b => {
    const k = `${b.operator}__${b.departure}`;
    if (seen.has(k)) return false;
    seen.add(k);
    return true;
  });
}

export async function fetchSeatsForBus(busExternalId, provider) {
  const mod = BY_NAME[provider];
  if (mod?.isConfigured?.()) return mod.fetchSeats(busExternalId);
  return mock.fetchSeats(busExternalId);
}

export async function bookOnProvider(order) {
  const mod = BY_NAME[order.provider];
  if (mod?.isConfigured?.()) return mod.placeProviderBooking(order);
  return mock.placeProviderBooking(order);
}
