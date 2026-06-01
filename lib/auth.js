const jwt = require('jsonwebtoken');
const bcrypt = require('bcryptjs');
const { prisma } = require('./db');

const JWT_SECRET = process.env.JWT_SECRET || 'cti_jwt_fallback_secret_key_123!';
const JWT_REFRESH_SECRET = process.env.JWT_REFRESH_SECRET || 'cti_jwt_refresh_fallback_secret_key_123!';

// Generate random 6-digit OTP
function generateOtpCode() {
  return Math.floor(100000 + Math.random() * 900000).toString();
}

// Generate JWT tokens
function generateAccessToken(user) {
  return jwt.sign(
    { id: user.id, email: user.email, mobile: user.mobile, role: user.role, name: user.name },
    JWT_SECRET,
    { expiresIn: '15m' }
  );
}

function generateRefreshToken(user) {
  return jwt.sign(
    { id: user.id },
    JWT_REFRESH_SECRET,
    { expiresIn: '7d' }
  );
}

// Verify JWT token
function verifyAccessToken(token) {
  try {
    return jwt.verify(token, JWT_SECRET);
  } catch (err) {
    return null;
  }
}

function verifyRefreshToken(token) {
  try {
    return jwt.verify(token, JWT_REFRESH_SECRET);
  } catch (err) {
    return null;
  }
}

// Send OTP function (mock delivery in dev, saves to DB)
async function sendOtp(mobile) {
  // Clear any previous unverified OTPs for this number to clean up
  await prisma.otpVerification.deleteMany({
    where: { mobile, verified: false }
  });

  const code = generateOtpCode();
  const expiresAt = new Date(Date.now() + 5 * 60 * 1000); // 5 minutes expiry

  const otp = await prisma.otpVerification.create({
    data: {
      mobile,
      code,
      expiresAt,
      verified: false
    }
  });

  // WhatsApp stub/mock notification
  console.log(`\n=============================================`);
  console.log(`[SMS/WhatsApp OTP Service]`);
  console.log(`TO: ${mobile}`);
  console.log(`CODE: ${code}`);
  console.log(`EXPIRES IN: 5 minutes`);
  console.log(`=============================================\n`);

  return { success: true, otpId: otp.id };
}

// Verify OTP function
async function verifyOtp(mobile, code) {
  const record = await prisma.otpVerification.findFirst({
    where: {
      mobile,
      code,
      verified: false,
      expiresAt: { gt: new Date() }
    },
    orderBy: { createdAt: 'desc' }
  });

  if (!record) {
    return { success: false, error: 'Invalid or expired OTP code.' };
  }

  // Mark verification as used/verified
  await prisma.otpVerification.update({
    where: { id: record.id },
    data: { verified: true }
  });

  // Find or automatically create user
  let user = await prisma.user.findFirst({
    where: { mobile }
  });

  let isNewUser = false;
  if (!user) {
    user = await prisma.user.create({
      data: {
        mobile,
        role: 'customer',
        name: `Guest User ${mobile.slice(-4)}`
      }
    });
    isNewUser = true;
  }

  const accessToken = generateAccessToken(user);
  const refreshToken = generateRefreshToken(user);

  return {
    success: true,
    user,
    accessToken,
    refreshToken,
    isNewUser
  };
}

// Helper to hash password
async function hashPassword(password) {
  return await bcrypt.hash(password, 12);
}

// Helper to compare password
async function comparePassword(password, hash) {
  return await bcrypt.compare(password, hash);
}

module.exports = {
  sendOtp,
  verifyOtp,
  generateAccessToken,
  generateRefreshToken,
  verifyAccessToken,
  verifyRefreshToken,
  hashPassword,
  comparePassword,
  JWT_SECRET,
  JWT_REFRESH_SECRET
};
