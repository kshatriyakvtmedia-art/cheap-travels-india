// Provider aggregator. Calls every configured scraper in parallel and merges results.
// To add a new provider: write lib/scraper/<name>.js with the same exports as laxmi.js,
// import it here, and push into PROVIDERS.

import * as laxmi from './laxmi.js';
import * as mock from './mock.js';

const PROVIDERS = [laxmi];

export async function aggregateBuses({ from, to, date }) {
  const active = PROVIDERS.filter(p => p.isConfigured?.());
  if (active.length === 0) {
    // No real providers configured — return mock data so the UI still works.
    return await mock.fetchBuses({ from, to, date });
  }
  const results = await Promise.allSettled(
    active.map(p => p.fetchBuses({ from, to, date }))
  );
  const merged = [];
  for (const r of results) if (r.status === 'fulfilled') merged.push(...r.value);
  // Dedup by operator + departure (same physical bus across providers — keep first/best)
  const seen = new Set();
  return merged.filter(b => {
    const k = `${b.operator}__${b.departure}`;
    if (seen.has(k)) return false;
    seen.add(k);
    return true;
  });
}

export async function fetchSeatsForBus(busExternalId, provider) {
  const mod = provider === 'laxmi' ? laxmi : null;
  if (mod && mod.isConfigured?.()) return mod.fetchSeats(busExternalId);
  return mock.fetchSeats(busExternalId);
}

export async function bookOnProvider(order) {
  const mod = order.provider === 'laxmi' ? laxmi : null;
  if (mod && mod.isConfigured?.()) return mod.placeProviderBooking(order);
  return mock.placeProviderBooking(order);
}
