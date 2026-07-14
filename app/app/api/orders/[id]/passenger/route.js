import { NextResponse } from 'next/server';
import { getOrder, updatePassenger } from '@/lib/db.js';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

export async function PATCH(req, { params }) {
  const body = await req.json().catch(() => ({}));
  const o = await getOrder(params.id);
  if (!o) return NextResponse.json({ error: 'not found' }, { status: 404 });
  if (o.status !== 'held') {
    return NextResponse.json({ error: `order is in ${o.status} state` }, { status: 409 });
  }

  const { name, age, gender, phone, email } = body;
  if (!name?.trim() || !phone?.trim()) {
    return NextResponse.json({ error: 'Name and phone are required.' }, { status: 400 });
  }

  await updatePassenger(params.id, { name: name.trim(), age, gender, phone: phone.trim(), email: email?.trim() });
  return NextResponse.json({ ok: true });
}
