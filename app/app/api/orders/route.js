import { NextResponse } from 'next/server';
import { prisma, createOrder } from '@/lib/db.js';
import { priceForCustomer } from '@/lib/commission.js';
import { getSession } from '@/lib/session.js';
import { randomBytes } from 'crypto';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

const HOLD_MIN    = 8;
const SIGNUP_BONUS = 51;

export async function POST(req) {
  const body = await req.json().catch(() => ({}));
  const required = [
    'bus_external_id', 'operator', 'bus_type', 'from_city', 'to_city',
    'journey_date', 'departure', 'arrival', 'seat_no',
    'boarding_point', 'dropping_point', 'net_fare',
  ];
  for (const k of required) {
    if (!body[k]) return NextResponse.json({ error: `missing field: ${k}` }, { status: 400 });
  }

  const session     = getSession(req);
  const userId      = session?.sub ?? null;
  let bonusApplied  = false;

  // Check signup bonus eligibility
  if (userId) {
    const user = await prisma.user.findUnique({
      where  : { id: userId },
      include: {
        orders: {
          where : { status: 'confirmed' },
          take  : 1,
          select: { id: true },
        },
      },
    });
    bonusApplied = !!(user?.bonusEligible && user.orders.length === 0);
  }

  const p         = priceForCustomer(Number(body.net_fare));
  const bonusCredit = bonusApplied ? SIGNUP_BONUS : 0;
  const totalPayable = Math.max(0, p.displayedFare - bonusCredit);

  const id         = 'CT' + randomBytes(4).toString('hex').toUpperCase();
  const held_until = new Date(Date.now() + HOLD_MIN * 60_000).toISOString();

  const order = {
    id,
    user_id        : userId,
    provider       : body.provider || 'laxmi',
    bus_external_id: body.bus_external_id,
    operator       : body.operator,
    bus_type       : body.bus_type,
    from_city      : body.from_city,
    to_city        : body.to_city,
    journey_date   : body.journey_date,
    departure      : body.departure,
    arrival        : body.arrival,
    seat_no        : body.seat_no,
    boarding_point : body.boarding_point,
    dropping_point : body.dropping_point,
    passenger_name : body.passenger_name || null,
    passenger_age  : body.passenger_age ? Number(body.passenger_age) : null,
    passenger_gender: body.passenger_gender || null,
    customer_phone : body.customer_phone || null,
    customer_email : body.customer_email || null,
    base_fare      : Number(body.net_fare),
    our_margin     : p.ourMargin,
    customer_discount: p.customerDiscount + bonusCredit,
    total_payable  : totalPayable,
    bonus_applied  : bonusApplied,
    held_until,
  };

  try {
    await createOrder(order);

    // If bonus was applied, mark user as no longer bonus-eligible (one use only)
    if (bonusApplied && userId) {
      await prisma.user.update({
        where: { id: userId },
        data : { bonusEligible: false },
      });
    }

    return NextResponse.json({ id, total: totalPayable, heldUntil: held_until });
  } catch (e) {
    return NextResponse.json({ error: String(e?.message || e) }, { status: 500 });
  }
}
