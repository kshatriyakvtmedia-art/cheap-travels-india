// Admin marks a paid_pending order as confirmed. We then call the provider
// to actually issue the operator ticket, and fire WhatsApp + email delivery.
import { NextResponse } from 'next/server';
import { getOrder, markConfirmed, markFailed } from '@/lib/db.js';
import { bookOnProvider } from '@/lib/scraper/index.js';
import { sendTicket } from '@/lib/whatsapp.js';
import { sendTicketEmail } from '@/lib/email.js';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

function unauth() { return NextResponse.json({ error: 'unauthorized' }, { status: 401 }); }

export async function POST(req, { params }) {
  const token = req.headers.get('x-admin-token');
  if (!token || token !== process.env.ADMIN_TOKEN) return unauth();

  const o = await getOrder(params.id);
  if (!o) return NextResponse.json({ error: 'not found' }, { status: 404 });
  if (o.status !== 'paid_pending') {
    return NextResponse.json({ error: `cannot reconcile from ${o.status}` }, { status: 409 });
  }

  // 1. Book on provider portal
  const booking = await bookOnProvider(o);
  if (!booking.ok) {
    await markFailed(o.id);
    return NextResponse.json({ ok: false, error: booking.error }, { status: 502 });
  }
  await markConfirmed(o.id, booking.pnr);

  // 2. Send WhatsApp + email (non-blocking — errors logged but don't fail the request)
  const route = `${o.from_city} → ${o.to_city}`;
  const dateTime = `${o.journey_date} · ${o.departure}`;
  const base = process.env.NEXT_PUBLIC_SITE_URL || '';
  const ticketUrl = `${base}/ticket/${booking.pnr}`;

  Promise.all([
    o.customer_phone && sendTicket({
      phone: o.customer_phone,
      name: o.passenger_name || 'Customer',
      pnr: booking.pnr, route, dateTime, ticketUrl,
    }),
    o.customer_email && sendTicketEmail({
      to: o.customer_email,
      subject: `Your Cheap Travels India ticket · PNR ${booking.pnr}`,
      html: `<p>Hi ${o.passenger_name || 'there'},</p>
             <p>Your seat <b>${o.seat_no}</b> on <b>${o.operator}</b> (${route}, ${dateTime}) is confirmed.</p>
             <p>PNR: <b>${booking.pnr}</b><br>
             View your ticket: <a href="${ticketUrl}">${ticketUrl}</a></p>
             <p>— Cheap Travels India</p>`,
    }),
  ]).catch(err => console.error('notify error', err));

  return NextResponse.json({ ok: true, pnr: booking.pnr });
}
