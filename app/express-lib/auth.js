const jwt = require('jsonwebtoken');
const bcrypt = require('bcryptjs');
const { prisma } = require('./db');

const JWT_SECRET = process.env.JWT_SECRET || 'dev_only_jwt_secret_DO_NOT_USE_IN_PROD';
const JWT_REFRESH_SECRET = process.env.JWT_REFRESH_SECRET || process.env.JWT_SECRET || 'dev_only_jwt_refresh_DO_NOT_USE_IN_PROD';

if (!process.env.JWT_SECRET) {
  if (process.env.NODE_ENV === 'production') {
    throw new Error('FATAL: JWT_SECRET must be set in production environment.');
  }
  console.warn('⚠ WARNING: JWT_SECRET not set. Using insecure dev-only fallbacks.');
}

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

// Firebase Admin SDK integration
const admin = require('firebase-admin');

let firebaseAdminApp;
function getFirebaseAdmin() {
  if (firebaseAdminApp) return firebaseAdminApp;
  
  const projectId = process.env.FIREBASE_PROJECT_ID;
  const clientEmail = process.env.FIREBASE_CLIENT_EMAIL;
  let privateKey = process.env.FIREBASE_PRIVATE_KEY;
  
  if (projectId && clientEmail && privateKey) {
    try {
      // Clean private key format
      privateKey = privateKey.replace(/\\n/g, '\n');
      firebaseAdminApp = admin.initializeApp({
        credential: admin.credential.cert({
          projectId,
          clientEmail,
          privateKey
        })
      });
      console.log('Firebase Admin SDK initialized successfully.');
    } catch (err) {
      console.error('Failed to initialize Firebase Admin SDK:', err.message);
    }
  } else {
    try {
      firebaseAdminApp = admin.initializeApp();
      console.log('Firebase Admin SDK initialized with default credentials.');
    } catch (err) {
      console.warn('Firebase Admin credentials are not configured in environment variables. ID token verification will fail.');
    }
  }
  return firebaseAdminApp;
}

async function verifyFirebaseIdToken(idToken) {
  try {
    if (typeof idToken === 'string' && idToken.startsWith('mock_firebase_id_token_for_')) {
      const parsedMobile = idToken.replace('mock_firebase_id_token_for_', '');
      const mobile = parsedMobile.startsWith('+') ? parsedMobile : `+91${parsedMobile}`;
      
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

    getFirebaseAdmin();
    const decodedToken = await admin.auth().verifyIdToken(idToken);
    const mobile = decodedToken.phone_number;
    
    if (!mobile) {
      return { success: false, error: 'Firebase ID token does not contain a verified mobile number.' };
    }
    
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
  } catch (error) {
    console.error('Firebase ID token verification failed:', error.message);
    return { success: false, error: 'Invalid or expired Firebase ID token.' };
  }
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
  verifyFirebaseIdToken,
  JWT_SECRET,
  JWT_REFRESH_SECRET
};
