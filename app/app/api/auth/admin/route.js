import { NextResponse } from 'next/server';
import { prisma } from '@/lib/db.js';
import bcrypt from 'bcryptjs';
import { signToken } from '@/lib/session.js';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

const COOKIE_TTL = 8 * 60 * 60; // 8 hours

// Same error whether the user doesn't exist, has wrong role, or wrong password
const FAIL = () => NextResponse.json({ error: 'Invalid credentials.' }, { status: 401 });

export async function POST(req) {
  const body = await req.json().catch(() => ({}));
  const { identifier, password } = body; // identifier = email OR mobile

  if (!identifier || !password) return FAIL();

  const user = await prisma.user.findFirst({
    where: {
      OR  : [{ email: identifier }, { mobile: identifier }],
      role: { in: ['admin', 'super_admin'] },
    },
  });

  // Guard: must exist, have admin role, and have a passwordHash
  if (!user || !user.passwordHash) return FAIL();

  const match = await bcrypt.compare(String(password), user.passwordHash);
  if (!match) return FAIL();

  const token = signToken(
    { sub: user.id, role: user.role, name: user.name },
    '8h'
  );

  const res = NextResponse.json({ ok: true });
  res.cookies.set('cti_admin_session', token, {
    httpOnly: true,
    secure  : process.env.NODE_ENV === 'production',
    sameSite: 'strict',
    maxAge  : COOKIE_TTL,
    path    : '/',
  });
  return res;
}

export async function DELETE(req) {
  // Logout: clear the admin cookie
  const res = NextResponse.json({ ok: true });
  res.cookies.set('cti_admin_session', '', { maxAge: 0, path: '/' });
  return res;
}
