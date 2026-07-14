import { PrismaClient } from '@prisma/client';

let prisma;
if (process.env.NODE_ENV === 'production') {
  prisma = new PrismaClient();
} else {
  if (!global.prisma) {
    global.prisma = new PrismaClient();
  }
  prisma = global.prisma;
}

export { prisma };

function mapPrismaToSqlite(o) {
  if (!o) return null;
  return {
    id: o.id,
    provider: o.provider,
    bus_external_id: o.busExternalId,
    operator: o.operator,
    bus_type: o.busType,
    from_city: o.fromCity,
    to_city: o.toCity,
    journey_date: o.journeyDate,
    departure: o.departure,
    arrival: o.arrival,
    seat_no: o.seatNo,
    boarding_point: o.boardingPoint,
    dropping_point: o.droppingPoint,
    passenger_name: o.passengerName,
    passenger_age: o.passengerAge,
    passenger_gender: o.passengerGender,
    customer_phone: o.customerPhone,
    customer_email: o.customerEmail,
    base_fare: o.baseFare,
    our_margin: o.ourMargin,
    customer_discount: o.customerDiscount,
    total_payable: o.totalPayable,
    status: o.status,
    bonus_applied: o.bonusApplied,
    upi_utr: o.upiUtr,
    provider_pnr: o.providerPnr,
    held_until: o.heldUntil,
    created_at: o.createdAt ? o.createdAt.toISOString() : null,
    confirmed_at: o.confirmedAt ? o.confirmedAt.toISOString() : null
  };
}

function mapSqliteToPrisma(o) {
  if (!o) return null;
  return {
    id: o.id,
    userId: o.user_id ?? null,
    provider: o.provider,
    busExternalId: o.bus_external_id,
    operator: o.operator,
    busType: o.bus_type,
    fromCity: o.from_city,
    toCity: o.to_city,
    journeyDate: o.journey_date,
    departure: o.departure,
    arrival: o.arrival,
    seatNo: o.seat_no,
    boardingPoint: o.boarding_point,
    droppingPoint: o.dropping_point,
    passengerName: o.passenger_name,
    passengerAge: o.passenger_age,
    passengerGender: o.passenger_gender,
    customerPhone: o.customer_phone,
    customerEmail: o.customer_email,
    baseFare: o.base_fare,
    ourMargin: o.our_margin,
    customerDiscount: o.customer_discount,
    totalPayable: o.total_payable,
    status: o.status || 'held',
    bonusApplied: o.bonus_applied ?? false,
    upiUtr: o.upi_utr,
    providerPnr: o.provider_pnr,
    heldUntil: o.held_until,
    confirmedAt: o.confirmed_at ? new Date(o.confirmed_at) : null
  };
}

export function db() {
  return prisma;
}

export async function createOrder(o) {
  const data = mapSqliteToPrisma(o);
  return await prisma.order.create({ data });
}

export async function getOrder(id) {
  const o = await prisma.order.findUnique({ where: { id } });
  return mapPrismaToSqlite(o);
}

export async function getOrderByPnr(pnr) {
  const o = await prisma.order.findFirst({ where: { providerPnr: pnr } });
  return mapPrismaToSqlite(o);
}

export async function listOrders(status) {
  const orders = await prisma.order.findMany({
    where: status ? { status } : {},
    orderBy: { createdAt: 'desc' }
  });
  return orders.map(mapPrismaToSqlite);
}

export async function markPaidPending(id, utr) {
  return await prisma.order.update({
    where: { id },
    data: { status: 'paid_pending', upiUtr: utr || null }
  });
}

export async function markConfirmed(id, pnr) {
  return await prisma.order.update({
    where: { id },
    data: { status: 'confirmed', providerPnr: pnr, confirmedAt: new Date() }
  });
}

export async function markFailed(id) {
  return await prisma.order.update({
    where: { id },
    data: { status: 'failed' }
  });
}

export async function updatePassenger(id, { name, age, gender, phone, email }) {
  return await prisma.order.update({
    where: { id },
    data: {
      passengerName: name || null,
      passengerAge: age ? String(age) : null,
      passengerGender: gender || null,
      customerPhone: phone || null,
      customerEmail: email || null,
    },
  });
}
