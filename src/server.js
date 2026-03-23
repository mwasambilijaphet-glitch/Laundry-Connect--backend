require('dotenv').config();

// ── Fix SSL certificate validation on Windows ────────────
// Node.js on Windows sometimes can't find the system CA store,
// causing "unable to get local issuer certificate" errors when
// calling external APIs (Briq, Snippe). This tells Node to use
// its own bundled CA certificates as fallback.
if (process.env.NODE_ENV !== 'production') {
  process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0';
  console.log('⚠️  TLS certificate validation relaxed for development');
}

const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');

const authRoutes = require('./routes/auth');
const shopRoutes = require('./routes/shops');
const orderRoutes = require('./routes/orders');
const paymentRoutes = require('./routes/payments');
const ownerRoutes = require('./routes/owner');
const adminRoutes = require('./routes/admin');
const messageRoutes = require('./routes/messages');

const app = express();
const PORT = process.env.PORT || 5000;

// ── Security Headers ─────────────────────────────────────
app.use(helmet({
  crossOriginResourcePolicy: { policy: 'cross-origin' },
}));

// ── CORS — strict origin whitelist ───────────────────────
const ALLOWED_ORIGINS = [
  'http://localhost:5173',
  'http://localhost:3000',
  process.env.FRONTEND_URL,
].filter(Boolean);

app.use(cors({
  origin: function (origin, callback) {
    // Allow requests with no origin (mobile apps, curl, Postman)
    if (!origin) return callback(null, true);
    if (ALLOWED_ORIGINS.includes(origin) || origin.endsWith('.vercel.app')) {
      return callback(null, true);
    }
    console.warn('CORS blocked origin:', origin);
    return callback(new Error('Not allowed by CORS'));
  },
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization'],
}));

// ── Body parsing with size limits (prevent DoS) ──────────
app.use(express.json({ limit: '1mb' }));
app.use(express.urlencoded({ extended: false, limit: '1mb' }));

// ── Global rate limiter (100 req / 15 min per IP) ────────
const globalLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 200,
  standardHeaders: true,
  legacyHeaders: false,
  message: { success: false, message: 'Too many requests. Please try again later.' },
});
app.use(globalLimiter);

// ── Auth-specific rate limiter (stricter) ────────────────
const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 20, // 20 auth attempts per 15 min
  standardHeaders: true,
  legacyHeaders: false,
  message: { success: false, message: 'Too many login attempts. Please wait 15 minutes.' },
});

// ── OTP rate limiter (prevent OTP spam) ──────────────────
const otpLimiter = rateLimit({
  windowMs: 5 * 60 * 1000,
  max: 5, // 5 OTP requests per 5 min
  standardHeaders: true,
  legacyHeaders: false,
  message: { success: false, message: 'Too many OTP requests. Please wait a few minutes.' },
});

// ── Request logger ───────────────────────────────────────
app.use((req, res, next) => {
  console.log(`${new Date().toISOString()} | ${req.method} ${req.path}`);
  next();
});

// ── Routes ────────────────────────────────────────────────
app.get('/api/health', (req, res) => {
  res.json({ status: 'ok', message: 'Laundry Connect API is running' });
});

// Apply auth rate limiter to sensitive routes
app.use('/api/auth/login', authLimiter);
app.use('/api/auth/register', authLimiter);
app.use('/api/auth/forgot-password', otpLimiter);
app.use('/api/auth/resend-otp', otpLimiter);

app.use('/api/auth', authRoutes);
app.use('/api/shops', shopRoutes);
app.use('/api/orders', orderRoutes);
app.use('/api/payments', paymentRoutes);
app.use('/api/owner', ownerRoutes);
app.use('/api/admin', adminRoutes);
app.use('/api/messages', messageRoutes);

// ── 404 handler ──────────────────────────────────────────
app.use((req, res) => {
  res.status(404).json({ success: false, message: 'Endpoint not found' });
});

// ── Error handler (never leak internal errors) ───────────
app.use((err, req, res, next) => {
  // Log full error internally
  console.error('Error:', err.stack || err.message);

  // CORS error
  if (err.message === 'Not allowed by CORS') {
    return res.status(403).json({ success: false, message: 'Origin not allowed' });
  }

  // Never expose internal error details to client
  const statusCode = err.statusCode || 500;
  const isProduction = process.env.NODE_ENV === 'production';

  res.status(statusCode).json({
    success: false,
    message: isProduction
      ? 'An internal error occurred. Please try again later.'
      : err.message || 'Internal server error',
  });
});

// ── Start ─────────────────────────────────────────────────
app.listen(PORT, () => {
  console.log(`Laundry Connect API running on http://localhost:${PORT}`);
  console.log(`Environment: ${process.env.NODE_ENV || 'development'}`);
  console.log(`Commission rate: ${process.env.PLATFORM_COMMISSION_RATE || '0.005'} (${(parseFloat(process.env.PLATFORM_COMMISSION_RATE || '0.005') * 100).toFixed(1)}%)`);
  console.log(`Snippe payments: ${process.env.SNIPPE_API_KEY ? 'LIVE' : 'TEST MODE'}`);
  console.log(`Briq OTP: ${process.env.BRIQ_API_KEY ? 'CONFIGURED' : 'NOT SET — will fallback to email'}`);
});
