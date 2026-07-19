// Provider aggregator. Calls every configured scraper in parallel and merges results.

import * as laxmi from './laxmi.js';
import * as mock from './mock.js';

const PROVIDERS = [laxmi];
const BY_NAME = { laxmi };

// 15s: allows the ~8s Playwright login on cold start to complete.
// Mock kicks in only if a provider truly fails or takes longer than this.
const SCRAPER_TIMEOUT_MS = 15000;
function withTimeout(promise, ms) {
  return Promise.race([
    promise,
    new Promise((_, reject) =>
      setTimeout(() => reject(new Error(`scraper timeout (${ms}ms)`)), ms)
    ),
  ]);
}

export async function aggregateBuses({ from, to, date }) {
  const active = PROVIDERS.filter(p => p.isConfigured?.());
  if (active.length === 0) {
    return mock.fetchBuses({ from, to, date });
  }
  const results = await Promise.allSettled(
    active.map(p => withTimeout(p.fetchBuses({ from, to, date }), SCRAPER_TIMEOUT_MS))
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
  if (mod?.isConfigured?.()) {
    const data = await mod.fetchSeats(busExternalId);
    if (data) return data;
  }
  return mock.fetchSeats(busExternalId);
}

export async function bookOnProvider(order) {
  const mod = BY_NAME[order.provider];
  if (mod?.isConfigured?.()) return mod.placeProviderBooking(order);
  return mock.placeProviderBooking(order);
}
