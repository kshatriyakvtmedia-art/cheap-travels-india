import { NextResponse } from 'next/server';
import { prisma } from '@/lib/db.js';
import { signToken } from '@/lib/session.js';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

const MOBILE_RE  = /^[6-9]\d{9}$/;
const MAX_TRIES  = 5;              // invalidate OTP after 5 wrong attempts
const COOKIE_TTL = 7 * 24 * 60 * 60; // 7 days in seconds

// Single generic error — no hints about whether the number exists, the code
// was wrong, or the code expired. Prevents user-enumeration attacks.
const FAIL = () => NextResponse.json({ error: 'Invalid or expired code.' }, { status: 401 });

export async function POST(req) {
  const body   = await req.json().catch(() => ({}));
  const mobile = String(body.mobile || '').replace(/\D/g, '').replace(/^91/, '').trim();
  const code   = String(body.code   || '').trim();

  if (!MOBILE_RE.test(mobile) || !/^\d{6}$/.test(code)) return FAIL();

  // Find the newest unexpired, unverified OTP that hasn't exceeded max attempts
  const record = await prisma.otpVerification.findFirst({
    where: {
      mobile,
      verified : false,
      expiresAt: { gt: new Date() },
      attempts : { lt: MAX_TRIES },
    },
    orderBy: { createdAt: 'desc' },
  });

  if (!record) return FAIL();

  // Increment attempts BEFORE comparing — prevents timing-based brute-force
  await prisma.otpVerification.update({
    where: { id: record.id },
    data:  { attempts: { increment: 1 } },
  });

  if (record.code !== code) return FAIL();

  // Mark verified so it can't be replayed
  await prisma.otpVerification.update({
    where: { id: record.id },
    data:  { verified: true },
  });

  // Upsert user — new users get the ₹51 signup bonus flag
  const existing = await prisma.user.findUnique({ where: { mobile } });
  const isNew    = !existing;

  const user = await prisma.user.upsert({
    where:  { mobile },
    update: {},
    create: {
      mobile,
      role         : 'customer',
      name         : `User ${mobile.slice(-4)}`,
      bonusEligible: true,   // redeemed only on first confirmed order
    },
  });

  const token = signToken(
    { sub: user.id, mobile: user.mobile, role: user.role },
    '7d'
  );

  const res = NextResponse.json({
    ok  : true,
    user: { id: user.id, mobile: user.mobile, role: user.role },
    isNew,
  });

  res.cookies.set('cti_session', token, {
    httpOnly: true,
    secure  : process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    maxAge  : COOKIE_TTL,
    path    : '/',
  });

  return res;
}
