import { NextResponse } from 'next/server';
import { prisma } from '@/lib/db.js';
import { signToken } from '@/lib/session.js';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

const EMAIL_RE   = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const MAX_TRIES  = 5;
const COOKIE_TTL = 7 * 24 * 60 * 60; // 7 days in seconds

// Single generic error — no hints to prevent enumeration attacks
const FAIL = () => NextResponse.json({ error: 'Invalid or expired code.' }, { status: 401 });

export async function POST(req) {
  const body  = await req.json().catch(() => ({}));
  const email = String(body.email || '').trim().toLowerCase();
  const code  = String(body.code  || '').trim();
  const name  = String(body.name  || '').trim();

  if (!EMAIL_RE.test(email) || !/^\d{6}$/.test(code)) return FAIL();

  // OTP records are stored with mobile = email (the email is the lookup key)
  const record = await prisma.otpVerification.findFirst({
    where: {
      mobile  : email,
      verified: false,
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

  // Mark verified so it cannot be replayed
  await prisma.otpVerification.update({
    where: { id: record.id },
    data:  { verified: true },
  });

  // Upsert user by email — new users get the ₹51 signup bonus flag
  const existing = await prisma.user.findUnique({ where: { email } });
  const isNew    = !existing;

  const user = await prisma.user.upsert({
    where : { email },
    update: {},
    create: {
      email,
      name         : name || `User ${email.split('@')[0]}`,
      role         : 'customer',
      bonusEligible: true,
    },
  });

  const token = signToken(
    { sub: user.id, email: user.email, role: user.role },
    '7d'
  );

  const res = NextResponse.json({
    ok  : true,
    user: { id: user.id, email: user.email, name: user.name, role: user.role },
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
