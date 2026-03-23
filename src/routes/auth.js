const express = require('express');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const crypto = require('crypto');
const nodemailer = require('nodemailer');
const pool = require('../db/pool');
const { authenticate } = require('../middleware/auth');
const { sendSMSOTP, sendWhatsAppOTP, sendPasswordResetSMS } = require('../services/briq');

const router = express.Router();

// ── Email transporter (Gmail SMTP) ───────────────────────
const transporter = nodemailer.createTransport({
  host: process.env.SMTP_HOST || 'smtp.gmail.com',
  port: parseInt(process.env.SMTP_PORT || '587'),
  secure: false,
  auth: {
    user: process.env.SMTP_USER,
    pass: process.env.SMTP_PASS,
  },
});

const EMAIL_FROM = `"Laundry Connect" <${process.env.SMTP_USER}>`;

// Verify email config on startup
transporter.verify((error) => {
  if (error) {
    console.error('❌ SMTP config error:', error.message);
  } else {
    console.log('✅ Email ready — sending as: Laundry Connect');
  }
});

// ── Cryptographically secure OTP ─────────────────────────
function generateOTP() {
  // Use crypto.randomInt instead of Math.random (SECURITY FIX)
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
  // Min 8 chars, at least 1 uppercase, 1 lowercase, 1 number
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
const LOCKOUT_DURATION = 15 * 60 * 1000; // 15 minutes

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

  // Reset if lockout expired
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

// ── Email branding ───────────────────────────────────────
function emailWrapper(content) {
  return `
<!DOCTYPE html>
<html lang="en">
<head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1.0"></head>
<body style="margin:0;padding:0;background:#f1f5f9;font-family:'Segoe UI',Roboto,Arial,sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background:#f1f5f9;padding:32px 0;">
    <tr><td align="center">
      <table width="480" cellpadding="0" cellspacing="0" style="background:#ffffff;border-radius:16px;overflow:hidden;box-shadow:0 4px 24px rgba(0,0,0,0.06);">
        <!-- Header -->
        <tr>
          <td style="background:linear-gradient(135deg,#2563EB 0%,#1d4ed8 100%);padding:28px 32px;text-align:center;">
            <h1 style="margin:0;font-size:26px;font-weight:800;color:#ffffff;letter-spacing:-0.5px;">
              Laundry<span style="color:#86efac;">Connect</span>
            </h1>
            <p style="margin:6px 0 0;font-size:12px;color:#bfdbfe;letter-spacing:1px;text-transform:uppercase;">Smart Laundry Service</p>
          </td>
        </tr>
        <!-- Body -->
        <tr>
          <td style="padding:32px;">
            ${content}
          </td>
        </tr>
        <!-- Footer -->
        <tr>
          <td style="background:#f8fafc;padding:20px 32px;border-top:1px solid #e2e8f0;text-align:center;">
            <p style="margin:0;font-size:12px;color:#94a3b8;">
              Laundry Connect &mdash; Huduma bora ya dobi karibu nawe
            </p>
            <p style="margin:6px 0 0;font-size:11px;color:#cbd5e1;">
              Dar es Salaam, Tanzania &bull; laundryconnect.co.tz
            </p>
            <p style="margin:8px 0 0;font-size:11px;color:#cbd5e1;">
              This is an automated message. Please do not reply to this email.
            </p>
          </td>
        </tr>
      </table>
    </td></tr>
  </table>
</body>
</html>`;
}

// ── Email senders (Gmail SMTP) ───────────────────────────
async function sendOTPEmail(email, otp) {
  try {
    const info = await transporter.sendMail({
      from: EMAIL_FROM,
      to: email,
      subject: 'Laundry Connect - Verification Code',
      html: emailWrapper(`
        <p style="color:#334155;font-size:15px;margin:0 0 8px;">Karibu! <strong>Laundry Connect</strong></p>
        <p style="color:#475569;font-size:14px;margin:0 0 24px;">Use the code below to verify your account:</p>
        <div style="background:#f0f9ff;border:2px dashed #2563EB;padding:24px;text-align:center;border-radius:12px;margin:0 0 24px;">
          <span style="font-size:36px;font-weight:800;letter-spacing:10px;color:#1e293b;">${otp}</span>
        </div>
        <p style="color:#64748b;font-size:13px;margin:0;">This code expires in <strong>10 minutes</strong>. If you didn't request this, you can safely ignore this email.</p>
      `),
    });
    console.log('OTP email sent to:', email, '| MessageID:', info.messageId);
    return true;
  } catch (err) {
    console.error('Failed to send OTP email to:', email, '| Error:', err.message);
    return false;
  }
}

async function sendPasswordResetEmail(email, otp) {
  const frontendUrl = process.env.FRONTEND_URL || 'http://localhost:5173';
  const resetLink = `${frontendUrl}/reset-password?email=${encodeURIComponent(email)}&code=${otp}`;
  try {
    await transporter.sendMail({
      from: EMAIL_FROM,
      to: email,
      subject: 'Laundry Connect - Password Reset',
      html: emailWrapper(`
        <p style="color:#334155;font-size:15px;margin:0 0 8px;">Habari!</p>
        <p style="color:#475569;font-size:14px;margin:0 0 24px;">You requested a password reset for your <strong>Laundry Connect</strong> account. Click the button below to set a new password:</p>
        <div style="text-align:center;margin:0 0 24px;">
          <a href="${resetLink}" style="display:inline-block;background:#2563EB;color:#ffffff;padding:14px 40px;border-radius:12px;text-decoration:none;font-weight:700;font-size:16px;">
            Reset Password
          </a>
        </div>
        <p style="color:#64748b;font-size:13px;margin:0 0 8px;">Or copy this link into your browser:</p>
        <p style="color:#2563EB;font-size:12px;word-break:break-all;background:#f0f9ff;padding:10px 14px;border-radius:8px;margin:0 0 20px;">${resetLink}</p>
        <div style="background:#fef3c7;padding:16px;border-radius:10px;margin:0 0 20px;text-align:center;">
          <p style="color:#92400e;font-size:13px;margin:0 0 4px;">Your reset code:</p>
          <span style="font-size:28px;font-weight:800;letter-spacing:6px;color:#92400e;">${otp}</span>
        </div>
        <p style="color:#94a3b8;font-size:12px;margin:0;">This link expires in <strong>10 minutes</strong>. If you didn't request this, your account is safe &mdash; just ignore this email.</p>
      `),
    });
    console.log('Password reset email sent to:', email);
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
    const otp_channel = req.body.otp_channel;

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

    const password_hash = await bcrypt.hash(password, 12); // 12 rounds (SECURITY: upgraded from 10)

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

    // Send OTP via chosen channel
    let otpSent = false;
    const channel = otp_channel || 'sms';

    if (channel === 'whatsapp') {
      const waResult = await sendWhatsAppOTP(phone, otp);
      otpSent = waResult.success;
      if (!otpSent) {
        const smsResult = await sendSMSOTP(phone, otp);
        otpSent = smsResult.success;
      }
    } else if (channel === 'sms') {
      const smsResult = await sendSMSOTP(phone, otp);
      otpSent = smsResult.success;
    }

    // Fallback to email if SMS/WhatsApp not configured or failed
    if (!otpSent) {
      otpSent = await sendOTPEmail(email, otp);
    }

    res.status(201).json({
      success: true,
      message: otpSent
        ? channel === 'whatsapp'
          ? 'Registration successful. Check your WhatsApp for the OTP.'
          : channel === 'sms'
            ? 'Registration successful. Check your phone for the OTP.'
            : 'Registration successful. Check your email for the OTP.'
        : 'Registration successful. OTP failed to send — contact support.',
      channel: otpSent ? channel : 'failed',
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
    const otp_channel = req.body.otp_channel;

    if (!email) {
      return res.status(400).json({ success: false, message: 'Email is required' });
    }

    const userResult = await pool.query('SELECT id, phone FROM users WHERE LOWER(email) = $1', [email]);
    if (userResult.rows.length === 0) {
      // Don't reveal if user exists (SECURITY)
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

    let otpSent = false;
    const phone = userResult.rows[0].phone;
    const channel = otp_channel || 'sms';

    if (channel === 'whatsapp') {
      const waResult = await sendWhatsAppOTP(phone, otp);
      otpSent = waResult.success;
      if (!otpSent) {
        const smsResult = await sendSMSOTP(phone, otp);
        otpSent = smsResult.success;
      }
    } else if (channel === 'sms') {
      const smsResult = await sendSMSOTP(phone, otp);
      otpSent = smsResult.success;
    }

    if (!otpSent) {
      otpSent = await sendOTPEmail(email, otp);
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

    // Check lockout
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

    // Clear failed attempts on success
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
      // Don't reveal if email exists (SECURITY)
      return res.json({ success: true, message: 'If this email exists, a reset link has been sent' });
    }

    // Invalidate old OTPs
    await pool.query('UPDATE otp_codes SET is_used = TRUE WHERE email = $1 AND is_used = FALSE', [email]);

    const otp = generateOTP();
    const expiresAt = new Date(Date.now() + 10 * 60 * 1000);

    await pool.query(
      'INSERT INTO otp_codes (email, otp_code, expires_at) VALUES ($1, $2, $3)',
      [email, otp, expiresAt]
    );

    // Send password reset link via EMAIL automatically
    const emailSent = await sendPasswordResetEmail(email, otp);

    // Also send OTP via SMS as backup
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

    // Verify OTP
    const otpResult = await pool.query(
      `SELECT * FROM otp_codes
       WHERE email = $1 AND otp_code = $2 AND is_used = FALSE AND expires_at > NOW()
       ORDER BY created_at DESC LIMIT 1`,
      [email, otp_code]
    );

    if (otpResult.rows.length === 0) {
      return res.status(400).json({ success: false, message: 'Invalid or expired reset code' });
    }

    // Mark OTP as used
    await pool.query('UPDATE otp_codes SET is_used = TRUE WHERE id = $1', [otpResult.rows[0].id]);

    // Update password
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
