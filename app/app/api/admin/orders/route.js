import { NextResponse } from 'next/server';
import { listOrders } from '@/lib/db.js';
import { getAdminSession } from '@/lib/session.js';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

const unauth = () => NextResponse.json({ error: 'unauthorized' }, { status: 401 });

export async function GET(req) {
  if (!getAdminSession(req)) return unauth();
  const status = new URL(req.url).searchParams.get('status') || '';
  return NextResponse.json({ orders: await listOrders(status || undefined) });
}
