import { NextResponse } from 'next/server';
import { getOrder, markPaidPending } from '@/lib/db.js';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

export async function GET(req, { params }) {
  const o = getOrder(params.id);
  if (!o) return NextResponse.json({ error: 'not found' }, { status: 404 });
  return NextResponse.json(o);
}

// Customer clicks "I have paid" — moves order to paid_pending.
export async function PATCH(req, { params }) {
  const body = await req.json().catch(() => ({}));
  const o = getOrder(params.id);
  if (!o) return NextResponse.json({ error: 'not found' }, { status: 404 });
  if (o.status !== 'held') {
    return NextResponse.json({ error: `order is in ${o.status} state` }, { status: 409 });
  }
  markPaidPending(params.id, body.utr || null);
  return NextResponse.json({ ok: true, status: 'paid_pending' });
}
