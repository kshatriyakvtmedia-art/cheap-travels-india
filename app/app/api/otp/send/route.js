import { NextResponse } from 'next/server';
import { prisma } from '@/lib/db.js';
import { sendOtpWhatsApp } from '@/lib/whatsapp-otp.js';
import { randomInt } from 'crypto';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

// Regex: Indian mobile — starts with 6-9, 10 digits total
const MOBILE_RE = /^[6-9]\d{9}$/;
const WINDOW_MS = 10 * 60 * 1000; // 10 minutes
const MAX_SENDS  = 3;              // max OTP sends per window

export async function POST(req) {
  const body   = await req.json().catch(() => ({}));
  const mobile = String(body.mobile || '').replace(/\D/g, '').replace(/^91/, '').trim();

  if (!MOBILE_RE.test(mobile)) {
    return NextResponse.json({ error: 'Enter a valid 10-digit Indian mobile number.' }, { status: 400 });
  }

  // Rate-limit: count OTP records created in the last 10 minutes for this number
  const since = new Date(Date.now() - WINDOW_MS);
  const recentCount = await prisma.otpVerification.count({
    where: { mobile, createdAt: { gte: since } },
  });

  if (recentCount >= MAX_SENDS) {
    return NextResponse.json(
      { error: 'Too many OTP requests. Please wait 10 minutes before trying again.' },
      { status: 429 }
    );
  }

  const code      = randomInt(100_000, 1_000_000).toString();
  const expiresAt = new Date(Date.now() + 5 * 60 * 1000);

  await prisma.otpVerification.create({ data: { mobile, code, expiresAt } });

  const delivery = await sendOtpWhatsApp(mobile, code);
  if (!delivery.ok && !delivery.mocked) {
    // Log server-side; do not expose reason to client
    console.error('[otp/send] WhatsApp delivery failed:', delivery.error);
  }

  // Always return success — prevents enumeration of whether a number is registered
  return NextResponse.json({ ok: true });
}
