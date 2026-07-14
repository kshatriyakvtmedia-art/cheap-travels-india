import { NextResponse } from 'next/server';
import { prisma } from '@/lib/db.js';
import { sendEmailOtp } from '@/lib/email-otp.js';
import { randomInt } from 'crypto';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

const EMAIL_RE  = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const WINDOW_MS = 10 * 60 * 1000; // 10 minutes
const MAX_SENDS = 3;               // max OTP sends per window per email

export async function POST(req) {
  const body  = await req.json().catch(() => ({}));
  const email = String(body.email || '').trim().toLowerCase();

  if (!EMAIL_RE.test(email)) {
    return NextResponse.json({ error: 'Enter a valid email address.' }, { status: 400 });
  }

  // Rate-limit: count OTP records for this email in the last 10 minutes.
  // We store email in the `mobile` column (string key — no schema change needed).
  const since = new Date(Date.now() - WINDOW_MS);
  const recentCount = await prisma.otpVerification.count({
    where: { mobile: email, createdAt: { gte: since } },
  });

  if (recentCount >= MAX_SENDS) {
    return NextResponse.json(
      { error: 'Too many OTP requests. Please wait 10 minutes before trying again.' },
      { status: 429 }
    );
  }

  const code      = randomInt(100_000, 1_000_000).toString();
  const expiresAt = new Date(Date.now() + 5 * 60 * 1000);

  // Store email in the `mobile` field — it is used only as a lookup key
  await prisma.otpVerification.create({ data: { mobile: email, code, expiresAt } });

  // Throws in production if RESEND_API_KEY is not set — intentional
  const delivery = await sendEmailOtp(email, code);
  if (!delivery.ok) {
    console.error('[otp/send] email delivery failed:', delivery.error);
  }

  // Always return success — prevents enumeration of registered accounts
  return NextResponse.json({ ok: true });
}
