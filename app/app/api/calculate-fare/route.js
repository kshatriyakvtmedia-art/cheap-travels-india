// Server-side fare calculation.
// Accepts the provider's net fare + session context, returns the correct
// customer-facing price including any signup bonus credit.
// The frontend must call this before presenting the final payable amount.

import { NextResponse } from 'next/server';
import { prisma } from '@/lib/db.js';
import { priceForCustomer } from '@/lib/commission.js';
import { getSession } from '@/lib/session.js';
import { randomBytes } from 'crypto';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

const SIGNUP_BONUS = 51; // ₹51 first-order bonus

export async function POST(req) {
  const body = await req.json().catch(() => ({}));
  const { netFare, fromCity, toCity, journeyDate, seatCount = 1 } = body;

  if (!netFare || !fromCity || !toCity || !journeyDate) {
    return NextResponse.json({ error: 'Missing required fields.' }, { status: 400 });
  }
  if (Number(netFare) <= 0 || isNaN(Number(netFare))) {
    return NextResponse.json({ error: 'Invalid netFare.' }, { status: 400 });
  }

  const session       = getSession(req);
  let bonusApplicable = false;

  if (session?.sub) {
    const user = await prisma.user.findUnique({
      where  : { id: session.sub },
      include: {
        orders: {
          where: { status: 'confirmed' },
          take : 1,
          select: { id: true },
        },
      },
    });
    // Bonus eligible only if flagged AND no confirmed orders yet
    bonusApplicable = !!(user?.bonusEligible && user.orders.length === 0);
  }

  const fare        = priceForCustomer(Number(netFare));
  const bookingRef  = 'CT' + randomBytes(4).toString('hex').toUpperCase();
  const subtotal    = fare.displayedFare * Number(seatCount);
  const bonusCredit = bonusApplicable ? SIGNUP_BONUS : 0;
  const totalPayable = Math.max(0, subtotal - bonusCredit);

  return NextResponse.json({
    bookingRef,
    perSeatStrikeFare  : fare.strikeFare,
    perSeatDisplayedFare: fare.displayedFare,
    seatCount          : Number(seatCount),
    bonusApplicable,
    bonusCredit,
    subtotal,
    totalPayable,
  });
}
