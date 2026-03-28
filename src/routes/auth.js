const express = require('express');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const crypto = require('crypto');
const { Resend } = require('resend');
const pool = require('../db/pool');
const { authenticate } = require('../middleware/auth');
const { sendSMSOTP, sendWhatsAppOTP, sendPasswordResetSMS } = require('../services/nextsms');
const { getTranslator } = require('../i18n');

const router = express.Router();

// ── Email via Resend HTTP API (works on Render — no SMTP ports needed) ──
const resendApiKey = process.env.RESEND_API_KEY;
const resend = resendApiKey ? new Resend(resendApiKey) : null;
const emailFrom = process.env.EMAIL_FROM || 'Laundry Connect <info@laundryconnect.app>';

if (resend) {
  console.log('Resend email configured | FROM:', emailFrom);
  console.log('RESEND_API_KEY length:', resendApiKey?.length, '| starts with:', resendApiKey?.substring(0, 6) + '...');
} else {
  console.warn('RESEND_API_KEY not set — emails will not be sent. Get a free key at https://resend.com');
}

// ── Cryptographically secure OTP ─────────────────────────
function generateOTP() {
  return crypto.randomInt(100000, 999999).toString();
}

function generateToken(user) {
  return jwt.sign(
    { id: user.id, role: user.role },
    process.env.JWT_SECRET,
    { expiresIn: process.env.JWT_EXPIRES_IN || '1h' }
  );
}

function generateRefreshToken(user) {
  return jwt.sign(
    { id: user.id },
    process.env.JWT_REFRESH_SECRET,
    { expiresIn: process.env.JWT_REFRESH_EXPIRES_IN || '7d' }
  );
}

// ── Input validators ─────────────────────────────────────
function isValidEmail(email) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) && email.length <= 254;
}

function isValidPhone(phone) {
  const cleaned = phone.replace(/[\s\-()]/g, '');
  return /^(\+?255|0)\d{9}$/.test(cleaned);
}

function isStrongPassword(password) {
  return password.length >= 8 &&
    /[A-Z]/.test(password) &&
    /[a-z]/.test(password) &&
    /\d/.test(password);
}

function sanitizeString(str, maxLen = 200) {
  if (typeof str !== 'string') return '';
  return str.trim().substring(0, maxLen);
}

// ── Login attempt tracking (in-memory, per IP+email) ─────
const loginAttempts = new Map();
const MAX_LOGIN_ATTEMPTS = 5;
const LOCKOUT_DURATION = 15 * 60 * 1000;

function getAttemptKey(ip, identifier) {
  return `${ip}:${identifier}`;
}

function checkLoginLockout(ip, identifier) {
  const key = getAttemptKey(ip, identifier);
  const record = loginAttempts.get(key);
  if (!record) return { locked: false };

  if (record.lockedUntil && Date.now() < record.lockedUntil) {
    const remainingMs = record.lockedUntil - Date.now();
    const remainingMin = Math.ceil(remainingMs / 60000);
    return { locked: true, remainingMin };
  }

  if (record.lockedUntil && Date.now() >= record.lockedUntil) {
    loginAttempts.delete(key);
    return { locked: false };
  }

  return { locked: false };
}

function recordFailedLogin(ip, identifier) {
  const key = getAttemptKey(ip, identifier);
  const record = loginAttempts.get(key) || { count: 0 };
  record.count++;
  record.lastAttempt = Date.now();

  if (record.count >= MAX_LOGIN_ATTEMPTS) {
    record.lockedUntil = Date.now() + LOCKOUT_DURATION;
  }

  loginAttempts.set(key, record);
}

function clearLoginAttempts(ip, identifier) {
  loginAttempts.delete(getAttemptKey(ip, identifier));
}

// ── Email senders (via Resend HTTP API) ──────────────────
async function sendOTPEmail(email, otp, lang = 'en') {
  const t = getTranslator(lang);
  if (!resend) {
    console.error('Cannot send OTP email — RESEND_API_KEY not set');
    return false;
  }
  try {
    console.log('Sending OTP email | from:', emailFrom, '| to:', email);
    const { data, error } = await resend.emails.send({
      from: emailFrom,
      to: email,
      subject: t('emailOtpSubject'),
      html: `
        <div style="font-family: sans-serif; max-width: 400px; margin: 0 auto; padding: 20px;">
          <h2 style="color: #16a34a;">Laundry<span style="color: #22c55e;">Connect</span></h2>
          <p>${t('emailOtpGreeting')}</p>
          <div style="background: #f0fdf4; padding: 20px; text-align: center; border-radius: 12px; margin: 20px 0; border: 1px solid #bbf7d0;">
            <span style="font-size: 32px; font-weight: bold; letter-spacing: 8px; color: #1e293b;">${otp}</span>
          </div>
          <p style="color: #64748b; font-size: 14px;">${t('emailOtpFooter')}</p>
        </div>
      `,
    });
    if (error) {
      console.error('Resend OTP email error:', error);
      return false;
    }
    console.log('OTP email sent to:', email, '| ID:', data.id);
    return true;
  } catch (err) {
    console.error('Failed to send OTP email to:', email, '| Error:', err.message);
    return false;
  }
}

async function sendPasswordResetEmail(email, otp, lang = 'en') {
  const t = getTranslator(lang);
  if (!resend) {
    console.error('Cannot send reset email — RESEND_API_KEY not set');
    return false;
  }
  const frontendUrl = (process.env.FRONTEND_URL || 'https://laundry-connect-frontend-s33t.vercel.app').replace(/\/+$/, '');
  const resetLink = `${frontendUrl}/reset-password?email=${encodeURIComponent(email)}&code=${otp}`;
  try {
    console.log('Sending reset email | from:', emailFrom, '| to:', email);
    const { data, error } = await resend.emails.send({
      from: emailFrom,
      to: email,
      subject: t('emailResetSubject'),
      html: `
        <div style="font-family: sans-serif; max-width: 480px; margin: 0 auto; padding: 30px 20px;">
          <div style="text-align: center; margin-bottom: 24px;">
            <h2 style="color: #16a34a; margin: 0;">Laundry<span style="color: #22c55e;">Connect</span></h2>
          </div>
          <p style="color: #334155; font-size: 15px;">${t('emailResetGreeting')}</p>
          <p style="color: #334155; font-size: 15px;">${t('emailResetInstruction')}</p>
          <div style="text-align: center; margin: 28px 0;">
            <a href="${resetLink}" style="display: inline-block; background: #16a34a; color: #ffffff; padding: 14px 36px; border-radius: 12px; text-decoration: none; font-weight: bold; font-size: 16px;">
              ${t('emailResetButton')}
            </a>
          </div>
          <p style="color: #64748b; font-size: 13px;">${t('emailResetLinkNote')}</p>
          <p style="color: #16a34a; font-size: 13px; word-break: break-all;">${resetLink}</p>
          <div style="background: #f0fdf4; padding: 14px; border-radius: 10px; margin: 20px 0; border: 1px solid #bbf7d0;">
            <p style="color: #15803d; font-size: 13px; margin: 0;">${t('emailResetCodeLabel')} <strong style="letter-spacing: 4px; font-size: 18px;">${otp}</strong></p>
          </div>
          <p style="color: #94a3b8; font-size: 12px;">${t('emailResetFooter')}</p>
        </div>
      `,
    });
    if (error) {
      console.error('Resend reset email error:', error);
      return false;
    }
    console.log('Password reset email sent to:', email, '| ID:', data.id);
    return true;
  } catch (err) {
    console.error('Failed to send reset email:', err.message);
    return false;
  }
}

// ── POST /api/auth/register ───────────────────────────────
router.post('/register', async (req, res, next) => {
  try {
    const full_name = sanitizeString(req.body.full_name, 100);
    const phone = sanitizeString(req.body.phone, 20);
    const email = sanitizeString(req.body.email, 254).toLowerCase();
    const password = req.body.password || '';
    const role = req.body.role;

    if (!full_name || !phone || !email || !password) {
      return res.status(400).json({ success: false, message: req.t('allFieldsRequired') });
    }

    if (!isValidEmail(email)) {
      return res.status(400).json({ success: false, message: req.t('invalidEmail') });
    }

    if (!isValidPhone(phone)) {
      return res.status(400).json({ success: false, message: req.t('invalidPhone') });
    }

    if (!isStrongPassword(password)) {
      return res.status(400).json({
        success: false,
        message: req.t('weakPassword'),
      });
    }

    if (!['customer', 'owner'].includes(role)) {
      return res.status(400).json({ success: false, message: req.t('invalidRole') });
    }

    const existing = await pool.query(
      'SELECT id FROM users WHERE LOWER(email) = $1 OR phone = $2',
      [email, phone]
    );
    if (existing.rows.length > 0) {
      return res.status(409).json({ success: false, message: req.t('alreadyRegistered') });
    }

    const password_hash = await bcrypt.hash(password, 12);

    // Generate unique referral code
    const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
    let referral_code = '';
    for (let i = 0; i < 6; i++) referral_code += chars.charAt(Math.floor(Math.random() * chars.length));

    const result = await pool.query(
      `INSERT INTO users (full_name, phone, email, password_hash, role, is_verified, referral_code)
       VALUES ($1, $2, $3, $4, $5, FALSE, $6)
       RETURNING id, full_name, phone, email, role, referral_code`,
      [full_name, phone, email, password_hash, role, referral_code]
    );

    const otp = generateOTP();
    const expiresAt = new Date(Date.now() + 10 * 60 * 1000);

    await pool.query(
      'INSERT INTO otp_codes (email, otp_code, expires_at) VALUES ($1, $2, $3)',
      [email, otp, expiresAt]
    );

    // Send OTP via both email and SMS
    const [emailSent, smsResult] = await Promise.all([
      sendOTPEmail(email, otp, req.lang),
      sendSMSOTP(phone, otp, req.lang),
    ]);

    const otpSent = emailSent || smsResult.success;

    res.status(201).json({
      success: true,
      message: otpSent
        ? req.t('registrationSuccess')
        : req.t('otpFailed'),
      channel: emailSent && smsResult.success ? 'both' : emailSent ? 'email' : smsResult.success ? 'sms' : 'failed',
      user: result.rows[0],
    });
  } catch (err) {
    next(err);
  }
});

// ── POST /api/auth/verify-otp ─────────────────────────────
router.post('/verify-otp', async (req, res, next) => {
  try {
    const email = sanitizeString(req.body.email, 254).toLowerCase();
    const otp_code = sanitizeString(req.body.otp_code, 6);

    if (!email || !otp_code || otp_code.length !== 6 || !/^\d{6}$/.test(otp_code)) {
      return res.status(400).json({ success: false, message: req.t('invalidOtpFormat') });
    }

    const result = await pool.query(
      `SELECT * FROM otp_codes
       WHERE email = $1 AND otp_code = $2 AND is_used = FALSE AND expires_at > NOW()
       ORDER BY created_at DESC LIMIT 1`,
      [email, otp_code]
    );

    if (result.rows.length === 0) {
      return res.status(400).json({ success: false, message: req.t('invalidOrExpiredOtp') });
    }

    await pool.query('UPDATE otp_codes SET is_used = TRUE WHERE id = $1', [result.rows[0].id]);

    const userResult = await pool.query(
      'UPDATE users SET is_verified = TRUE WHERE LOWER(email) = $1 RETURNING id, full_name, phone, email, role',
      [email]
    );

    if (userResult.rows.length === 0) {
      return res.status(404).json({ success: false, message: req.t('userNotFound') });
    }

    const user = userResult.rows[0];
    const token = generateToken(user);
    const refreshToken = generateRefreshToken(user);

    res.json({
      success: true,
      message: req.t('emailVerified'),
      token,
      refreshToken,
      user,
    });
  } catch (err) {
    next(err);
  }
});

// ── POST /api/auth/resend-otp ─────────────────────────────
router.post('/resend-otp', async (req, res, next) => {
  try {
    const email = sanitizeString(req.body.email, 254).toLowerCase();

    if (!email) {
      return res.status(400).json({ success: false, message: req.t('emailRequired') });
    }

    const userResult = await pool.query('SELECT id, phone FROM users WHERE LOWER(email) = $1', [email]);
    if (userResult.rows.length === 0) {
      return res.json({ success: true, message: 'If the account exists, a new OTP has been sent' });
    }

    // Invalidate old OTPs
    await pool.query('UPDATE otp_codes SET is_used = TRUE WHERE email = $1 AND is_used = FALSE', [email]);

    const otp = generateOTP();
    const expiresAt = new Date(Date.now() + 10 * 60 * 1000);

    await pool.query(
      'INSERT INTO otp_codes (email, otp_code, expires_at) VALUES ($1, $2, $3)',
      [email, otp, expiresAt]
    );

    // Send OTP via both email and SMS
    const phone = userResult.rows[0].phone;
    const [emailSent, smsResult] = await Promise.all([
      sendOTPEmail(email, otp, req.lang),
      sendSMSOTP(phone, otp, req.lang),
    ]);

    const otpSent = emailSent || smsResult.success;

    res.json({
      success: true,
      message: otpSent ? req.t('otpSentBoth') : req.t('otpSendFailed'),
    });
  } catch (err) {
    next(err);
  }
});

// ── POST /api/auth/login ──────────────────────────────────
router.post('/login', async (req, res, next) => {
  try {
    const phone = sanitizeString(req.body.phone, 254);
    const password = req.body.password || '';

    if (!phone || !password) {
      return res.status(400).json({ success: false, message: req.t('phonePasswordRequired') });
    }

    const lockout = checkLoginLockout(req.ip, phone);
    if (lockout.locked) {
      return res.status(429).json({
        success: false,
        message: req.t('accountLocked', lockout.remainingMin),
      });
    }

    const result = await pool.query(
      'SELECT * FROM users WHERE phone = $1 OR LOWER(email) = LOWER($1)',
      [phone]
    );

    if (result.rows.length === 0) {
      // Timing attack protection: always run bcrypt even if user not found
      await bcrypt.compare(password, '$2a$12$000000000000000000000uGEFnHBJcMjRk5E/V5Bh.4HqXGfjW8y');
      recordFailedLogin(req.ip, phone);
      return res.status(401).json({ success: false, message: req.t('invalidCredentials') });
    }

    const user = result.rows[0];
    const validPassword = await bcrypt.compare(password, user.password_hash);

    if (!validPassword) {
      recordFailedLogin(req.ip, phone);
      return res.status(401).json({ success: false, message: req.t('invalidCredentials') });
    }

    if (!user.is_verified) {
      return res.status(403).json({ success: false, message: req.t('verifyFirst') });
    }

    clearLoginAttempts(req.ip, phone);

    const token = generateToken(user);
    const refreshToken = generateRefreshToken(user);

    res.json({
      success: true,
      token,
      refreshToken,
      user: {
        id: user.id,
        full_name: user.full_name,
        phone: user.phone,
        email: user.email,
        role: user.role,
        avatar_url: user.avatar_url,
      },
    });
  } catch (err) {
    next(err);
  }
});

// ── POST /api/auth/forgot-password ────────────────────────
router.post('/forgot-password', async (req, res, next) => {
  try {
    const email = sanitizeString(req.body.email, 254).toLowerCase();

    if (!email || !isValidEmail(email)) {
      return res.status(400).json({ success: false, message: req.t('validEmailRequired') });
    }

    const userResult = await pool.query('SELECT id, email, phone FROM users WHERE LOWER(email) = $1', [email]);
    if (userResult.rows.length === 0) {
      return res.json({ success: true, message: 'If this email exists, a reset link has been sent' });
    }

    await pool.query('UPDATE otp_codes SET is_used = TRUE WHERE email = $1 AND is_used = FALSE', [email]);

    const otp = generateOTP();
    const expiresAt = new Date(Date.now() + 10 * 60 * 1000);

    await pool.query(
      'INSERT INTO otp_codes (email, otp_code, expires_at) VALUES ($1, $2, $3)',
      [email, otp, expiresAt]
    );

    // Send reset code via both email and SMS
    const phone = userResult.rows[0].phone;
    const [emailSent, smsResult] = await Promise.all([
      sendPasswordResetEmail(email, otp, req.lang),
      phone ? sendPasswordResetSMS(phone, otp, req.lang) : Promise.resolve({ success: false }),
    ]);

    res.json({
      success: true,
      message: (emailSent || smsResult.success)
        ? req.t('resetCodeSent')
        : req.t('resetLinkSent'),
    });
  } catch (err) {
    next(err);
  }
});

// ── POST /api/auth/reset-password ─────────────────────────
router.post('/reset-password', async (req, res, next) => {
  try {
    const email = sanitizeString(req.body.email, 254).toLowerCase();
    const otp_code = sanitizeString(req.body.otp_code, 6);
    const new_password = req.body.new_password || '';

    if (!email || !otp_code || !new_password) {
      return res.status(400).json({ success: false, message: req.t('allFieldsRequired') });
    }

    if (!isStrongPassword(new_password)) {
      return res.status(400).json({
        success: false,
        message: req.t('weakPassword'),
      });
    }

    const otpResult = await pool.query(
      `SELECT * FROM otp_codes
       WHERE email = $1 AND otp_code = $2 AND is_used = FALSE AND expires_at > NOW()
       ORDER BY created_at DESC LIMIT 1`,
      [email, otp_code]
    );

    if (otpResult.rows.length === 0) {
      return res.status(400).json({ success: false, message: req.t('invalidResetCode') });
    }

    await pool.query('UPDATE otp_codes SET is_used = TRUE WHERE id = $1', [otpResult.rows[0].id]);

    const password_hash = await bcrypt.hash(new_password, 12);
    await pool.query('UPDATE users SET password_hash = $1 WHERE LOWER(email) = $2', [password_hash, email]);

    res.json({
      success: true,
      message: req.t('passwordResetSuccess'),
    });
  } catch (err) {
    next(err);
  }
});

// ── POST /api/auth/refresh ────────────────────────────────
router.post('/refresh', async (req, res, next) => {
  try {
    const { refreshToken } = req.body;
    if (!refreshToken) {
      return res.status(400).json({ success: false, message: req.t('refreshTokenRequired') });
    }

    const decoded = jwt.verify(refreshToken, process.env.JWT_REFRESH_SECRET);
    const result = await pool.query('SELECT id, full_name, email, role FROM users WHERE id = $1', [decoded.id]);

    if (result.rows.length === 0) {
      return res.status(404).json({ success: false, message: req.t('userNotFound') });
    }

    const user = result.rows[0];
    const token = generateToken(user);

    res.json({ success: true, token });
  } catch (err) {
    return res.status(401).json({ success: false, message: req.t('invalidRefreshToken') });
  }
});

// ── GET /api/auth/me ──────────────────────────────────────
router.get('/me', authenticate, async (req, res, next) => {
  try {
    const result = await pool.query(
      'SELECT id, full_name, phone, email, role, avatar_url, is_verified, created_at, referral_code, referral_balance FROM users WHERE id = $1',
      [req.user.id]
    );
    if (result.rows.length === 0) {
      return res.status(404).json({ success: false, message: req.t('userNotFound') });
    }
    res.json({ success: true, user: result.rows[0] });
  } catch (err) {
    next(err);
  }
});

module.exports = router;
