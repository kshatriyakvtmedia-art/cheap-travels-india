import { NextResponse } from 'next/server';
import { getSession } from '@/lib/session.js';
import { prisma } from '@/lib/db.js';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

export async function GET(req) {
  const session = getSession(req);
  if (!session) {
    return NextResponse.json(
      { success: false, error: 'Authentication required. Please login.' },
      { status: 401 }
    );
  }

  const orders = await prisma.order.findMany({
    where: { userId: session.sub },
    orderBy: { createdAt: 'desc' },
    take: 50,
    select: {
      id:           true,
      status:       true,
      fromCity:     true,
      toCity:       true,
      journeyDate:  true,
      departure:    true,
      arrival:      true,
      seatNo:       true,
      totalPayable: true,
      operator:     true,
      busType:      true,
      providerPnr:  true,
      passengerName: true,
      boardingPoint: true,
      droppingPoint: true,
      createdAt:    true,
    },
  });

  return NextResponse.json({ success: true, bookings: orders });
}
