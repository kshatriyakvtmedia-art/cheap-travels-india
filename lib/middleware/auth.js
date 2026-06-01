const { verifyAccessToken, verifyRefreshToken, generateAccessToken } = require('../auth');
const { prisma } = require('../db');
const rateLimit = require('express-rate-limit');

// Authentication middleware checking cookies or authorization headers
async function requireAuth(req, res, next) {
  let token = null;

  // 1. Try to read from cookies
  if (req.cookies && req.cookies.cti_access) {
    token = req.cookies.cti_access;
  }
  
  // 2. Fallback to authorization header
  if (!token && req.headers.authorization && req.headers.authorization.startsWith('Bearer ')) {
    token = req.headers.authorization.split(' ')[1];
  }

  if (!token) {
    // If no access token, try to perform silent refresh
    return await handleSilentRefresh(req, res, next);
  }

  const decoded = verifyAccessToken(token);
  if (!decoded) {
    // Token expired/invalid, try to perform silent refresh
    return await handleSilentRefresh(req, res, next);
  }

  // Fetch full user details from DB to make sure role/status is current
  const user = await prisma.user.findUnique({
    where: { id: decoded.id }
  });

  if (!user) {
    return res.status(401).json({ success: false, error: 'User associated with this token no longer exists.' });
  }

  req.user = user;
  next();
}

// Silent Refresh helper
async function handleSilentRefresh(req, res, next) {
  let refreshToken = null;

  if (req.cookies && req.cookies.cti_refresh) {
    refreshToken = req.cookies.cti_refresh;
  }

  if (!refreshToken) {
    return res.status(401).json({ success: false, error: 'Authentication required. Please login.' });
  }

  const decodedRefresh = verifyRefreshToken(refreshToken);
  if (!decodedRefresh) {
    return res.status(401).json({ success: false, error: 'Session expired. Please login again.' });
  }

  const user = await prisma.user.findUnique({
    where: { id: decodedRefresh.id }
  });

  if (!user) {
    return res.status(401).json({ success: false, error: 'User session invalid.' });
  }

  // Issue new access token
  const newAccessToken = generateAccessToken(user);

  // Set new cookie
  res.cookie('cti_access', newAccessToken, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'strict',
    maxAge: 15 * 60 * 1000 // 15 mins
  });

  req.user = user;
  next();
}

// Role Authorization middleware
function requireRole(allowedRoles) {
  return (req, res, next) => {
    if (!req.user) {
      return res.status(401).json({ success: false, error: 'Authentication required.' });
    }

    if (!allowedRoles.includes(req.user.role)) {
      return res.status(403).json({ success: false, error: 'Forbidden: Insufficient privileges.' });
    }

    next();
  };
}

// Audit logging helper
async function logAdminAction(req, action, entityType, entityId, metadata = {}) {
  try {
    const ipAddress = req.ip || req.headers['x-forwarded-for'] || req.connection.remoteAddress;
    const userId = req.user ? req.user.id : null;

    await prisma.auditLog.create({
      data: {
        action,
        userId,
        entityType,
        entityId: entityId ? String(entityId) : null,
        metadataJson: metadata,
        ipAddress
      }
    });
  } catch (error) {
    console.error('Failed to write audit log:', error.message);
  }
}

// Rate limiter for OTP sending (max 3 per IP/mobile per 10 minutes)
const otpRateLimiter = rateLimit({
  windowMs: 10 * 60 * 1000, // 10 minutes
  max: 5, // Max 5 requests per window
  standardHeaders: true,
  legacyHeaders: false,
  message: { success: false, error: 'Too many OTP requests. Please try again after 10 minutes.' }
});

// Rate limiter for admin logins
const loginRateLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 10, // Max 10 requests per window
  standardHeaders: true,
  legacyHeaders: false,
  message: { success: false, error: 'Too many login attempts. Please try again after 15 minutes.' }
});

module.exports = {
  requireAuth,
  requireRole,
  logAdminAction,
  otpRateLimiter,
  loginRateLimiter
};
