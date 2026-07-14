// JWT session helpers — server-side only (API routes / Server Components).
// Never import this in client components.
//
// Env validation is intentionally deferred to request time (inside functions),
// not module load time. Next.js 15 imports every API route during `next build`
// to collect page data; throwing at the top level causes the build to fail even
// when the variable IS set in Vercel, because the static-analysis worker
// evaluates module code before runtime env vars are injected.

import jwt from 'jsonwebtoken';

const CUSTOMER_COOKIE = 'cti_session';
const ADMIN_COOKIE    = 'cti_admin_session';

/** Reads JWT_SECRET at call time so the build never throws on import. */
function getJwtSecret() {
  const secret = process.env.JWT_SECRET;
  if (!secret) throw new Error('JWT_SECRET environment variable is not set.');
  return secret;
}

function verify(token) {
  if (!token) return null;
  try {
    return jwt.verify(token, getJwtSecret());
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
  return jwt.sign(payload, getJwtSecret(), { expiresIn });
}
