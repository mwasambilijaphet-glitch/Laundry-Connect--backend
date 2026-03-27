const express = require('express');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const crypto = require('crypto');
const { Resend } = require('resend');
const pool = require('../db/pool');
const { authenticate } = require('../middleware/auth');
const { sendSMSOTP, sendWhatsAppOTP, sendPasswordResetSMS } = require('../services/briq');

const router = express.Router();

// ── Email via Resend HTTP API (works on Render — no SMTP ports needed) ──
const resendApiKey = process.env.RESEND_API_KEY;
const resend = resendApiKey ? new Resend(resendApiKey) : null;
const emailFrom = process.env.EMAIL_FROM || 'Laundry Connect <onboarding@resend.dev>';

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
async function sendOTPEmail(email, otp) {
  if (!resend) {
    console.error('Cannot send OTP email — RESEND_API_KEY not set');
    return false;
  }
  try {
    console.log('Sending OTP email | from:', emailFrom, '| to:', email);
    const { data, error } = await resend.emails.send({
      from: emailFrom,
      to: email,
      subject: 'Your Laundry Connect Verification Code',
      html: `
        <div style="font-family: sans-serif; max-width: 400px; margin: 0 auto; padding: 20px;">
          <h2 style="color: #16a34a;">Laundry<span style="color: #22c55e;">Connect</span></h2>
          <p>Karibu! Your verification code is:</p>
          <div style="background: #f0fdf4; padding: 20px; text-align: center; border-radius: 12px; margin: 20px 0; border: 1px solid #bbf7d0;">
            <span style="font-size: 32px; font-weight: bold; letter-spacing: 8px; color: #1e293b;">${otp}</span>
          </div>
          <p style="color: #64748b; font-size: 14px;">This code expires in 10 minutes. If you didn't request this, ignore this email.</p>
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

async function sendPasswordResetEmail(email, otp) {
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
      subject: 'Reset Your Laundry Connect Password',
      html: `
        <div style="font-family: sans-serif; max-width: 480px; margin: 0 auto; padding: 30px 20px;">
          <div style="text-align: center; margin-bottom: 24px;">
            <h2 style="color: #16a34a; margin: 0;">Laundry<span style="color: #22c55e;">Connect</span></h2>
          </div>
          <p style="color: #334155; font-size: 15px;">Habari! You requested a password reset for your account.</p>
          <p style="color: #334155; font-size: 15px;">Click the button below to set a new password:</p>
          <div style="text-align: center; margin: 28px 0;">
            <a href="${resetLink}" style="display: inline-block; background: #16a34a; color: #ffffff; padding: 14px 36px; border-radius: 12px; text-decoration: none; font-weight: bold; font-size: 16px;">
              Reset Password
            </a>
          </div>
          <p style="color: #64748b; font-size: 13px;">Or copy this link into your browser:</p>
          <p style="color: #16a34a; font-size: 13px; word-break: break-all;">${resetLink}</p>
          <div style="background: #f0fdf4; padding: 14px; border-radius: 10px; margin: 20px 0; border: 1px solid #bbf7d0;">
            <p style="color: #15803d; font-size: 13px; margin: 0;">Your reset code is: <strong style="letter-spacing: 4px; font-size: 18px;">${otp}</strong></p>
          </div>
          <p style="color: #94a3b8; font-size: 12px;">This link expires in 10 minutes. If you didn't request this, your account is safe — just ignore this email.</p>
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
      return res.status(400).json({ success: false, message: 'All fields are required' });
    }

    if (!isValidEmail(email)) {
      return res.status(400).json({ success: false, message: 'Invalid email address' });
    }

    if (!isValidPhone(phone)) {
      return res.status(400).json({ success: false, message: 'Invalid Tanzanian phone number (e.g. 0768188065)' });
    }

    if (!isStrongPassword(password)) {
      return res.status(400).json({
        success: false,
        message: 'Password must be at least 8 characters with uppercase, lowercase, and a number',
      });
    }

    if (!['customer', 'owner'].includes(role)) {
      return res.status(400).json({ success: false, message: 'Invalid role' });
    }

    const existing = await pool.query(
      'SELECT id FROM users WHERE LOWER(email) = $1 OR phone = $2',
      [email, phone]
    );
    if (existing.rows.length > 0) {
      return res.status(409).json({ success: false, message: 'Email or phone already registered' });
    }

    const password_hash = await bcrypt.hash(password, 12);

    const result = await pool.query(
      `INSERT INTO users (full_name, phone, email, password_hash, role, is_verified)
       VALUES ($1, $2, $3, $4, $5, FALSE)
       RETURNING id, full_name, phone, email, role`,
      [full_name, phone, email, password_hash, role]
    );

    const otp = generateOTP();
    const expiresAt = new Date(Date.now() + 10 * 60 * 1000);

    await pool.query(
      'INSERT INTO otp_codes (email, otp_code, expires_at) VALUES ($1, $2, $3)',
      [email, otp, expiresAt]
    );

    // Send OTP via email (primary channel)
    let otpSent = await sendOTPEmail(email, otp);

    // Fallback to SMS/WhatsApp if email fails
    if (!otpSent) {
      const smsResult = await sendSMSOTP(phone, otp);
      otpSent = smsResult.success;
      if (!otpSent) {
        const waResult = await sendWhatsAppOTP(phone, otp);
        otpSent = waResult.success;
      }
    }

    res.status(201).json({
      success: true,
      message: otpSent
        ? 'Registration successful. Check your email for the verification code.'
        : 'Registration successful. OTP failed to send — contact support.',
      channel: otpSent ? 'email' : 'failed',
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
      return res.status(400).json({ success: false, message: 'Invalid OTP format' });
    }

    const result = await pool.query(
      `SELECT * FROM otp_codes
       WHERE email = $1 AND otp_code = $2 AND is_used = FALSE AND expires_at > NOW()
       ORDER BY created_at DESC LIMIT 1`,
      [email, otp_code]
    );

    if (result.rows.length === 0) {
      return res.status(400).json({ success: false, message: 'Invalid or expired OTP' });
    }

    await pool.query('UPDATE otp_codes SET is_used = TRUE WHERE id = $1', [result.rows[0].id]);

    const userResult = await pool.query(
      'UPDATE users SET is_verified = TRUE WHERE LOWER(email) = $1 RETURNING id, full_name, phone, email, role',
      [email]
    );

    if (userResult.rows.length === 0) {
      return res.status(404).json({ success: false, message: 'User not found' });
    }

    const user = userResult.rows[0];
    const token = generateToken(user);
    const refreshToken = generateRefreshToken(user);

    res.json({
      success: true,
      message: 'Email verified successfully',
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
      return res.status(400).json({ success: false, message: 'Email is required' });
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

    // Send OTP via email (primary channel)
    let otpSent = await sendOTPEmail(email, otp);

    // Fallback to SMS/WhatsApp if email fails
    if (!otpSent) {
      const phone = userResult.rows[0].phone;
      const smsResult = await sendSMSOTP(phone, otp);
      otpSent = smsResult.success;
      if (!otpSent) {
        const waResult = await sendWhatsAppOTP(phone, otp);
        otpSent = waResult.success;
      }
    }

    res.json({
      success: true,
      message: otpSent ? 'New OTP sent' : 'Failed to send OTP',
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
      return res.status(400).json({ success: false, message: 'Phone and password are required' });
    }

    const lockout = checkLoginLockout(req.ip, phone);
    if (lockout.locked) {
      return res.status(429).json({
        success: false,
        message: `Account temporarily locked. Try again in ${lockout.remainingMin} minutes.`,
      });
    }

    const result = await pool.query(
      'SELECT * FROM users WHERE phone = $1 OR LOWER(email) = LOWER($1)',
      [phone]
    );

    if (result.rows.length === 0) {
      recordFailedLogin(req.ip, phone);
      return res.status(401).json({ success: false, message: 'Invalid credentials' });
    }

    const user = result.rows[0];
    const validPassword = await bcrypt.compare(password, user.password_hash);

    if (!validPassword) {
      recordFailedLogin(req.ip, phone);
      return res.status(401).json({ success: false, message: 'Invalid credentials' });
    }

    if (!user.is_verified) {
      return res.status(403).json({ success: false, message: 'Please verify your account first' });
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
      return res.status(400).json({ success: false, message: 'Valid email is required' });
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

    const emailSent = await sendPasswordResetEmail(email, otp);

    const phone = userResult.rows[0].phone;
    if (phone) {
      await sendPasswordResetSMS(phone, otp);
    }

    res.json({
      success: true,
      message: emailSent
        ? 'Password reset link sent to your email'
        : 'If this email exists, a reset link has been sent',
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
      return res.status(400).json({ success: false, message: 'All fields are required' });
    }

    if (!isStrongPassword(new_password)) {
      return res.status(400).json({
        success: false,
        message: 'Password must be at least 8 characters with uppercase, lowercase, and a number',
      });
    }

    const otpResult = await pool.query(
      `SELECT * FROM otp_codes
       WHERE email = $1 AND otp_code = $2 AND is_used = FALSE AND expires_at > NOW()
       ORDER BY created_at DESC LIMIT 1`,
      [email, otp_code]
    );

    if (otpResult.rows.length === 0) {
      return res.status(400).json({ success: false, message: 'Invalid or expired reset code' });
    }

    await pool.query('UPDATE otp_codes SET is_used = TRUE WHERE id = $1', [otpResult.rows[0].id]);

    const password_hash = await bcrypt.hash(new_password, 12);
    await pool.query('UPDATE users SET password_hash = $1 WHERE LOWER(email) = $2', [password_hash, email]);

    res.json({
      success: true,
      message: 'Password reset successful. You can now log in with your new password.',
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
      return res.status(400).json({ success: false, message: 'Refresh token required' });
    }

    const decoded = jwt.verify(refreshToken, process.env.JWT_REFRESH_SECRET);
    const result = await pool.query('SELECT id, full_name, email, role FROM users WHERE id = $1', [decoded.id]);

    if (result.rows.length === 0) {
      return res.status(404).json({ success: false, message: 'User not found' });
    }

    const user = result.rows[0];
    const token = generateToken(user);

    res.json({ success: true, token });
  } catch (err) {
    return res.status(401).json({ success: false, message: 'Invalid refresh token' });
  }
});

// ── GET /api/auth/me ──────────────────────────────────────
router.get('/me', authenticate, async (req, res, next) => {
  try {
    const result = await pool.query(
      'SELECT id, full_name, phone, email, role, avatar_url, is_verified, created_at FROM users WHERE id = $1',
      [req.user.id]
    );
    if (result.rows.length === 0) {
      return res.status(404).json({ success: false, message: 'User not found' });
    }
    res.json({ success: true, user: result.rows[0] });
  } catch (err) {
    next(err);
  }
});

module.exports = router;
