import { NextResponse } from 'next/server';
import { aggregateBuses } from '@/lib/scraper/index.js';
import { priceForCustomer } from '@/lib/commission.js';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

export async function GET(req) {
  const u = new URL(req.url);
  const from = (u.searchParams.get('from') || 'Azamgarh').trim();
  const to = (u.searchParams.get('to') || 'Delhi').trim();
  const date = (u.searchParams.get('date') || new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Kolkata' })).trim();

  try {
    const buses = await aggregateBuses({ from, to, date });
    const priced = buses.map(b => {
      const p = priceForCustomer(b.netFare);
      return { ...b, ...p, from, to, date };
    });
    // Sort by departure ascending by default
    priced.sort((a, b) => String(a.departure).localeCompare(String(b.departure)));
    return NextResponse.json({ buses: priced, from, to, date });
  } catch (e) {
    return NextResponse.json({ error: String(e?.message || e) }, { status: 500 });
  }
}
