import { NextResponse } from 'next/server';
import { listOrders } from '@/lib/db.js';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

function unauthorized() {
  return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
}
function checkAuth(req) {
  const token = req.headers.get('x-admin-token') || new URL(req.url).searchParams.get('token');
  return token && token === process.env.ADMIN_TOKEN;
}

export async function GET(req) {
  if (!checkAuth(req)) return unauthorized();
  const status = new URL(req.url).searchParams.get('status') || '';
  return NextResponse.json({ orders: await listOrders(status || undefined) });
}
