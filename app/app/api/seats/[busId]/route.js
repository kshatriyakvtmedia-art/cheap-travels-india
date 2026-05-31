import { NextResponse } from 'next/server';
import { fetchSeatsForBus } from '@/lib/scraper/index.js';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

export async function GET(req, { params }) {
  const { busId } = params;
  const provider = new URL(req.url).searchParams.get('provider') || 'laxmi';
  try {
    const data = await fetchSeatsForBus(busId, provider);
    if (!data) return NextResponse.json({ error: 'bus not found' }, { status: 404 });
    return NextResponse.json(data);
  } catch (e) {
    return NextResponse.json({ error: String(e?.message || e) }, { status: 500 });
  }
}
