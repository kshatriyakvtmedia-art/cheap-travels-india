// JWT session helpers — server-side only (API routes / Server Components).
// Never import this in client components.

import jwt from 'jsonwebtoken';

const JWT_SECRET = process.env.JWT_SECRET;

if (!JWT_SECRET && process.env.NODE_ENV === 'production') {
  throw new Error('FATAL: JWT_SECRET must be set in production.');
}

const CUSTOMER_COOKIE = 'cti_session';
const ADMIN_COOKIE    = 'cti_admin_session';

function verify(token) {
  if (!token || !JWT_SECRET) return null;
  try {
    return jwt.verify(token, JWT_SECRET);
  } catch {
    return null;
  }
}

/** Returns decoded customer session or null. */
export function getSession(req) {
  const cookie = req.cookies.get(CUSTOMER_COOKIE)?.value;
  return verify(cookie);
}

/** Returns decoded admin session or null. Rejects non-admin roles. */
export function getAdminSession(req) {
  const cookie = req.cookies.get(ADMIN_COOKIE)?.value;
  const session = verify(cookie);
  if (!session) return null;
  if (!['admin', 'super_admin'].includes(session.role)) return null;
  return session;
}

/** Signs a new JWT and returns the string. */
export function signToken(payload, expiresIn = '7d') {
  return jwt.sign(payload, JWT_SECRET, { expiresIn });
}
