const express = require('express');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const nodemailer = require('nodemailer');
const pool = require('../db/pool');
const { authenticate } = require('../middleware/auth');
const { sendSMSOTP, sendWhatsAppOTP, sendPasswordResetSMS } = require('../services/briq');

const router = express.Router();

// ── Email transporter (used for password reset) ──────────
const transporter = nodemailer.createTransport({
  host: process.env.SMTP_HOST || 'smtp.gmail.com',
  port: parseInt(process.env.SMTP_PORT || '587'),
  secure: false,
  auth: {
    user: process.env.SMTP_USER,
    pass: process.env.SMTP_PASS,
  },
});

// Verify email config on startup
transporter.verify((error) => {
  if (error) {
    console.error('SMTP config error:', error.message);
  } else {
    console.log('SMTP ready to send emails');
  }
});

function generateOTP() {
  return Math.floor(100000 + Math.random() * 900000).toString();
}

function generateToken(user) {
  return jwt.sign(
    { id: user.id, role: user.role, email: user.email },
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

async function sendOTPEmail(email, otp) {
  try {
    const info = await transporter.sendMail({
      from: `"Laundry Connect" <${process.env.SMTP_USER}>`,
      to: email,
      subject: 'Your Laundry Connect Verification Code',
      html: `
        <div style="font-family: sans-serif; max-width: 400px; margin: 0 auto; padding: 20px;">
          <h2 style="color: #2563EB;">Laundry Connect</h2>
          <p>Karibu! Your verification code is:</p>
          <div style="background: #f1f5f9; padding: 20px; text-align: center; border-radius: 12px; margin: 20px 0;">
            <span style="font-size: 32px; font-weight: bold; letter-spacing: 8px; color: #1e293b;">${otp}</span>
          </div>
          <p style="color: #64748b; font-size: 14px;">This code expires in 10 minutes. If you didn't request this, ignore this email.</p>
        </div>
      `,
    });
    console.log('OTP email sent to:', email, '| MessageID:', info.messageId);
    return true;
  } catch (err) {
    console.error('Failed to send OTP email to:', email, '| Error:', err.message);
    return false;
  }
}

async function sendPasswordResetEmail(email, otp) {
  const resetLink = `${process.env.FRONTEND_URL || 'http://localhost:5173'}/reset-password?email=${encodeURIComponent(email)}&code=${otp}`;
  try {
    await transporter.sendMail({
      from: `"Laundry Connect" <${process.env.SMTP_USER}>`,
      to: email,
      subject: 'Reset Your Laundry Connect Password',
      html: `
        <div style="font-family: sans-serif; max-width: 480px; margin: 0 auto; padding: 30px 20px;">
          <div style="text-align: center; margin-bottom: 24px;">
            <h2 style="color: #2563EB; margin: 0;">Laundry<span style="color: #22c55e;">Connect</span></h2>
          </div>
          <p style="color: #334155; font-size: 15px;">Habari! You requested a password reset for your account.</p>
          <p style="color: #334155; font-size: 15px;">Click the button below to set a new password:</p>
          <div style="text-align: center; margin: 28px 0;">
            <a href="${resetLink}" style="display: inline-block; background: #2563EB; color: #ffffff; padding: 14px 36px; border-radius: 12px; text-decoration: none; font-weight: bold; font-size: 16px;">
              Reset Password
            </a>
          </div>
          <p style="color: #64748b; font-size: 13px;">Or copy this link into your browser:</p>
          <p style="color: #2563EB; font-size: 13px; word-break: break-all;">${resetLink}</p>
          <div style="background: #fef3c7; padding: 14px; border-radius: 10px; margin: 20px 0;">
            <p style="color: #92400e; font-size: 13px; margin: 0;">Your reset code is: <strong style="letter-spacing: 4px; font-size: 18px;">${otp}</strong></p>
          </div>
          <p style="color: #94a3b8; font-size: 12px;">This link expires in 10 minutes. If you didn't request this, your account is safe — just ignore this email.</p>
        </div>
      `,
    });
    return true;
  } catch (err) {
    console.error('Failed to send reset email:', err.message);
    return false;
  }
}

// ── POST /api/auth/register ───────────────────────────────
router.post('/register', async (req, res, next) => {
  try {
    const { full_name, phone, email, password, role, otp_channel } = req.body;

    if (!full_name || !phone || !email || !password) {
      return res.status(400).json({ success: false, message: 'All fields are required' });
    }
    if (!['customer', 'owner'].includes(role)) {
      return res.status(400).json({ success: false, message: 'Invalid role' });
    }

    const existing = await pool.query(
      'SELECT id FROM users WHERE email = $1 OR phone = $2',
      [email, phone]
    );
    if (existing.rows.length > 0) {
      return res.status(409).json({ success: false, message: 'Email or phone already registered' });
    }

    const password_hash = await bcrypt.hash(password, 10);

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

    // Send OTP via chosen channel (default: sms via briq.tz)
    let otpSent = false;
    const channel = otp_channel || 'sms';

    if (channel === 'whatsapp') {
      const waResult = await sendWhatsAppOTP(phone, otp);
      otpSent = waResult.success;
      if (!otpSent) {
        // Fallback to SMS if WhatsApp fails
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
    const { email, otp_code } = req.body;

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
      'UPDATE users SET is_verified = TRUE WHERE email = $1 RETURNING id, full_name, phone, email, role',
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
    const { email, otp_channel } = req.body;

    if (!email) {
      return res.status(400).json({ success: false, message: 'Email is required' });
    }

    const userResult = await pool.query('SELECT id, phone FROM users WHERE email = $1', [email]);
    if (userResult.rows.length === 0) {
      return res.status(404).json({ success: false, message: 'User not found' });
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
    const { phone, password } = req.body;

    if (!phone || !password) {
      return res.status(400).json({ success: false, message: 'Phone and password are required' });
    }

    const result = await pool.query(
      'SELECT * FROM users WHERE phone = $1 OR email = $1',
      [phone]
    );

    if (result.rows.length === 0) {
      return res.status(401).json({ success: false, message: 'Invalid credentials' });
    }

    const user = result.rows[0];
    const validPassword = await bcrypt.compare(password, user.password_hash);

    if (!validPassword) {
      return res.status(401).json({ success: false, message: 'Invalid credentials' });
    }

    if (!user.is_verified) {
      return res.status(403).json({ success: false, message: 'Please verify your account first' });
    }

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
// Password reset is sent via EMAIL automatically
router.post('/forgot-password', async (req, res, next) => {
  try {
    const { email } = req.body;

    if (!email) {
      return res.status(400).json({ success: false, message: 'Email is required' });
    }

    const userResult = await pool.query('SELECT id, email, phone FROM users WHERE email = $1', [email]);
    if (userResult.rows.length === 0) {
      // Don't reveal if email exists or not
      return res.json({ success: true, message: 'If this email exists, a reset code has been sent' });
    }

    // Invalidate old OTPs
    await pool.query('UPDATE otp_codes SET is_used = TRUE WHERE email = $1 AND is_used = FALSE', [email]);

    const otp = generateOTP();
    const expiresAt = new Date(Date.now() + 10 * 60 * 1000);

    await pool.query(
      'INSERT INTO otp_codes (email, otp_code, expires_at) VALUES ($1, $2, $3)',
      [email, otp, expiresAt]
    );

    // Send password reset via EMAIL automatically
    const emailSent = await sendPasswordResetEmail(email, otp);

    // Also send via SMS as backup
    const phone = userResult.rows[0].phone;
    if (phone) {
      await sendPasswordResetSMS(phone, otp);
    }

    res.json({
      success: true,
      message: emailSent
        ? 'Password reset code sent to your email'
        : 'If this email exists, a reset code has been sent',
    });
  } catch (err) {
    next(err);
  }
});

// ── POST /api/auth/reset-password ─────────────────────────
router.post('/reset-password', async (req, res, next) => {
  try {
    const { email, otp_code, new_password } = req.body;

    if (!email || !otp_code || !new_password) {
      return res.status(400).json({ success: false, message: 'All fields are required' });
    }

    if (new_password.length < 6) {
      return res.status(400).json({ success: false, message: 'Password must be at least 6 characters' });
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
    const password_hash = await bcrypt.hash(new_password, 10);
    await pool.query('UPDATE users SET password_hash = $1 WHERE email = $2', [password_hash, email]);

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
