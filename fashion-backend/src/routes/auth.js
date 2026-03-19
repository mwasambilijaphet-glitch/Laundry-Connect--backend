const express = require('express');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const { body, validationResult } = require('express-validator');
const pool = require('../db/pool');
const { sendOTP } = require('../services/email');
const { authenticate } = require('../middleware/auth');

const router = express.Router();

function generateOTP() {
  return Math.floor(100000 + Math.random() * 900000).toString();
}

function signToken(user) {
  return jwt.sign(
    { id: user.id, email: user.email, role: user.role },
    process.env.JWT_SECRET,
    { expiresIn: process.env.JWT_EXPIRES_IN || '7d' }
  );
}

// ── POST /api/auth/signup ──────────────────────────────────────────────────
router.post(
  '/signup',
  [
    body('email').isEmail().normalizeEmail().withMessage('Valid email required'),
    body('password').isLength({ min: 8 }).withMessage('Password must be at least 8 characters'),
    body('fullName').trim().notEmpty().withMessage('Full name required'),
  ],
  async (req, res, next) => {
    try {
      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        return res.status(422).json({ success: false, errors: errors.array() });
      }

      const { email, password, fullName, preferredLanguage = 'en' } = req.body;

      // Check if email already registered
      const existing = await pool.query('SELECT id, is_verified FROM users WHERE email = $1', [email]);
      if (existing.rows.length > 0) {
        if (!existing.rows[0].is_verified) {
          // Re-send OTP for unverified users
          const otp = generateOTP();
          const expiresAt = new Date(Date.now() + 10 * 60 * 1000);

          await pool.query('UPDATE otps SET used = true WHERE user_id = $1', [existing.rows[0].id]);
          await pool.query(
            'INSERT INTO otps (user_id, code, expires_at) VALUES ($1, $2, $3)',
            [existing.rows[0].id, otp, expiresAt]
          );
          await sendOTP(email, fullName, otp);

          return res.status(200).json({
            success: true,
            message: 'A new verification code has been sent to your email.',
            userId: existing.rows[0].id,
          });
        }
        return res.status(409).json({ success: false, message: 'Email is already registered' });
      }

      const passwordHash = await bcrypt.hash(password, 12);

      const newUser = await pool.query(
        `INSERT INTO users (email, password_hash, full_name, preferred_language)
         VALUES ($1, $2, $3, $4) RETURNING id, email, full_name`,
        [email, passwordHash, fullName, preferredLanguage]
      );
      const user = newUser.rows[0];

      const otp = generateOTP();
      const expiresAt = new Date(Date.now() + 10 * 60 * 1000);

      await pool.query(
        'INSERT INTO otps (user_id, code, expires_at) VALUES ($1, $2, $3)',
        [user.id, otp, expiresAt]
      );

      await sendOTP(email, fullName, otp);

      res.status(201).json({
        success: true,
        message: 'Account created. Please check your email for a verification code.',
        userId: user.id,
      });
    } catch (err) {
      next(err);
    }
  }
);

// ── POST /api/auth/verify-otp ──────────────────────────────────────────────
router.post(
  '/verify-otp',
  [
    body('userId').notEmpty().withMessage('User ID required'),
    body('otp').isLength({ min: 6, max: 6 }).isNumeric().withMessage('Valid 6-digit OTP required'),
  ],
  async (req, res, next) => {
    try {
      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        return res.status(422).json({ success: false, errors: errors.array() });
      }

      const { userId, otp } = req.body;

      const otpResult = await pool.query(
        `SELECT id FROM otps
         WHERE user_id = $1 AND code = $2 AND used = false AND expires_at > NOW()
         ORDER BY created_at DESC LIMIT 1`,
        [userId, otp]
      );

      if (otpResult.rows.length === 0) {
        return res.status(400).json({ success: false, message: 'Invalid or expired verification code' });
      }

      // Mark OTP used and verify user
      await pool.query('UPDATE otps SET used = true WHERE id = $1', [otpResult.rows[0].id]);
      const userResult = await pool.query(
        `UPDATE users SET is_verified = true, updated_at = NOW()
         WHERE id = $1 RETURNING id, email, full_name, role, preferred_language, avatar_url`,
        [userId]
      );
      const user = userResult.rows[0];
      const token = signToken(user);

      res.json({
        success: true,
        message: 'Email verified successfully. Welcome to Fashion.co.tz!',
        token,
        user: {
          id: user.id,
          email: user.email,
          fullName: user.full_name,
          role: user.role,
          preferredLanguage: user.preferred_language,
          avatarUrl: user.avatar_url,
        },
      });
    } catch (err) {
      next(err);
    }
  }
);

// ── POST /api/auth/resend-otp ──────────────────────────────────────────────
router.post('/resend-otp', async (req, res, next) => {
  try {
    const { userId } = req.body;
    if (!userId) return res.status(400).json({ success: false, message: 'User ID required' });

    const userResult = await pool.query(
      'SELECT id, email, full_name, is_verified FROM users WHERE id = $1',
      [userId]
    );
    if (userResult.rows.length === 0) {
      return res.status(404).json({ success: false, message: 'User not found' });
    }
    const user = userResult.rows[0];
    if (user.is_verified) {
      return res.status(400).json({ success: false, message: 'Account is already verified' });
    }

    // Rate limit: 1 OTP per minute
    const recentOtp = await pool.query(
      `SELECT id FROM otps WHERE user_id = $1 AND created_at > NOW() - INTERVAL '1 minute'`,
      [userId]
    );
    if (recentOtp.rows.length > 0) {
      return res.status(429).json({ success: false, message: 'Please wait 1 minute before requesting a new code' });
    }

    await pool.query('UPDATE otps SET used = true WHERE user_id = $1', [userId]);

    const otp = generateOTP();
    const expiresAt = new Date(Date.now() + 10 * 60 * 1000);
    await pool.query('INSERT INTO otps (user_id, code, expires_at) VALUES ($1, $2, $3)', [userId, otp, expiresAt]);

    await sendOTP(user.email, user.full_name, otp);

    res.json({ success: true, message: 'New verification code sent to your email' });
  } catch (err) {
    next(err);
  }
});

// ── POST /api/auth/login ───────────────────────────────────────────────────
router.post(
  '/login',
  [
    body('email').isEmail().normalizeEmail().withMessage('Valid email required'),
    body('password').notEmpty().withMessage('Password required'),
  ],
  async (req, res, next) => {
    try {
      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        return res.status(422).json({ success: false, errors: errors.array() });
      }

      const { email, password } = req.body;

      const result = await pool.query('SELECT * FROM users WHERE email = $1', [email]);
      if (result.rows.length === 0) {
        return res.status(401).json({ success: false, message: 'Invalid email or password' });
      }

      const user = result.rows[0];

      const passwordValid = await bcrypt.compare(password, user.password_hash);
      if (!passwordValid) {
        return res.status(401).json({ success: false, message: 'Invalid email or password' });
      }

      if (!user.is_verified) {
        // Re-send OTP
        const otp = generateOTP();
        const expiresAt = new Date(Date.now() + 10 * 60 * 1000);
        await pool.query('UPDATE otps SET used = true WHERE user_id = $1', [user.id]);
        await pool.query('INSERT INTO otps (user_id, code, expires_at) VALUES ($1, $2, $3)', [user.id, otp, expiresAt]);
        await sendOTP(user.email, user.full_name, otp);

        return res.status(403).json({
          success: false,
          code: 'UNVERIFIED',
          message: 'Please verify your email. A new code has been sent.',
          userId: user.id,
        });
      }

      const token = signToken(user);

      res.json({
        success: true,
        message: 'Login successful',
        token,
        user: {
          id: user.id,
          email: user.email,
          fullName: user.full_name,
          role: user.role,
          preferredLanguage: user.preferred_language,
          avatarUrl: user.avatar_url,
        },
      });
    } catch (err) {
      next(err);
    }
  }
);

// ── GET /api/auth/me ───────────────────────────────────────────────────────
router.get('/me', authenticate, async (req, res) => {
  res.json({
    success: true,
    user: {
      id: req.user.id,
      email: req.user.email,
      fullName: req.user.full_name,
      role: req.user.role,
      preferredLanguage: req.user.preferred_language,
      avatarUrl: req.user.avatar_url,
    },
  });
});

// ── POST /api/auth/forgot-password ────────────────────────────────────────
router.post('/forgot-password', async (req, res, next) => {
  try {
    const { email } = req.body;
    if (!email) return res.status(400).json({ success: false, message: 'Email required' });

    const result = await pool.query('SELECT id, full_name FROM users WHERE email = $1', [email]);
    // Always return 200 to avoid email enumeration
    if (result.rows.length === 0) {
      return res.json({ success: true, message: 'If that email exists, a reset code has been sent.' });
    }

    const user = result.rows[0];
    const otp = generateOTP();
    const expiresAt = new Date(Date.now() + 10 * 60 * 1000);

    await pool.query('UPDATE otps SET used = true WHERE user_id = $1', [user.id]);
    await pool.query('INSERT INTO otps (user_id, code, expires_at) VALUES ($1, $2, $3)', [user.id, otp, expiresAt]);
    await sendOTP(email, user.full_name, otp);

    res.json({ success: true, message: 'If that email exists, a reset code has been sent.', userId: user.id });
  } catch (err) {
    next(err);
  }
});

// ── POST /api/auth/reset-password ─────────────────────────────────────────
router.post(
  '/reset-password',
  [
    body('userId').notEmpty(),
    body('otp').isLength({ min: 6, max: 6 }).isNumeric(),
    body('newPassword').isLength({ min: 8 }),
  ],
  async (req, res, next) => {
    try {
      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        return res.status(422).json({ success: false, errors: errors.array() });
      }

      const { userId, otp, newPassword } = req.body;

      const otpResult = await pool.query(
        `SELECT id FROM otps WHERE user_id = $1 AND code = $2 AND used = false AND expires_at > NOW() ORDER BY created_at DESC LIMIT 1`,
        [userId, otp]
      );
      if (otpResult.rows.length === 0) {
        return res.status(400).json({ success: false, message: 'Invalid or expired code' });
      }

      const passwordHash = await bcrypt.hash(newPassword, 12);
      await pool.query('UPDATE otps SET used = true WHERE id = $1', [otpResult.rows[0].id]);
      await pool.query(
        'UPDATE users SET password_hash = $1, is_verified = true, updated_at = NOW() WHERE id = $2',
        [passwordHash, userId]
      );

      res.json({ success: true, message: 'Password reset successfully. You can now log in.' });
    } catch (err) {
      next(err);
    }
  }
);

module.exports = router;
