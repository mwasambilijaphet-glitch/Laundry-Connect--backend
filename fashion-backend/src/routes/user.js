const express = require('express');
const { body, validationResult } = require('express-validator');
const bcrypt = require('bcryptjs');
const pool = require('../db/pool');
const { authenticate } = require('../middleware/auth');
const { attachSubscription } = require('../middleware/subscription');
const upload = require('../middleware/upload');
const { uploadImage } = require('../services/cloudinary');

const router = express.Router();
router.use(authenticate);

// ── GET /api/user/dashboard — Dashboard summary ───────────────────────────
router.get('/dashboard', attachSubscription, async (req, res, next) => {
  try {
    const [designsResult, outfitsResult, sessionsResult] = await Promise.all([
      pool.query(
        'SELECT id, prompt, image_url, created_at FROM ai_designs WHERE user_id = $1 AND is_saved = true ORDER BY created_at DESC LIMIT 6',
        [req.user.id]
      ),
      pool.query(
        'SELECT id, occasion, weather, style_preference, created_at FROM saved_outfits WHERE user_id = $1 ORDER BY created_at DESC LIMIT 4',
        [req.user.id]
      ),
      pool.query(
        'SELECT COUNT(*) FROM chat_sessions WHERE user_id = $1',
        [req.user.id]
      ),
    ]);

    const isSubActive = req.subscription?.payment_status === 'active'
      && req.subscription?.expiry_date
      && new Date(req.subscription.expiry_date) > new Date();

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
      subscription: {
        isActive: isSubActive,
        status: req.subscription?.payment_status || 'none',
        expiryDate: req.subscription?.expiry_date || null,
        startDate: req.subscription?.start_date || null,
      },
      stats: {
        designsCount: designsResult.rowCount,
        outfitsCount: outfitsResult.rowCount,
        chatsCount: Number(sessionsResult.rows[0].count),
      },
      recentDesigns: designsResult.rows.map(d => ({
        id: d.id,
        prompt: d.prompt,
        imageUrl: d.image_url,
        createdAt: d.created_at,
      })),
      recentOutfits: outfitsResult.rows,
    });
  } catch (err) {
    next(err);
  }
});

// ── PUT /api/user/profile — Update profile ────────────────────────────────
router.put(
  '/profile',
  upload.single('avatar'),
  [
    body('fullName').optional().trim().notEmpty().withMessage('Full name cannot be empty'),
    body('preferredLanguage').optional().isIn(['en', 'sw']).withMessage('Language must be en or sw'),
    body('bio').optional().trim().isLength({ max: 500 }),
  ],
  async (req, res, next) => {
    try {
      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        return res.status(422).json({ success: false, errors: errors.array() });
      }

      const { fullName, preferredLanguage, bio } = req.body;
      let avatarUrl = req.user.avatar_url;

      if (req.file) {
        const uploaded = await uploadImage(req.file.buffer, 'fashion-cotz/avatars');
        avatarUrl = uploaded.url;
      }

      const result = await pool.query(
        `UPDATE users
         SET full_name = COALESCE($1, full_name),
             preferred_language = COALESCE($2, preferred_language),
             bio = COALESCE($3, bio),
             avatar_url = $4,
             updated_at = NOW()
         WHERE id = $5
         RETURNING id, email, full_name, role, preferred_language, avatar_url, bio`,
        [fullName || null, preferredLanguage || null, bio || null, avatarUrl, req.user.id]
      );

      const user = result.rows[0];
      res.json({
        success: true,
        message: 'Profile updated',
        user: {
          id: user.id,
          email: user.email,
          fullName: user.full_name,
          role: user.role,
          preferredLanguage: user.preferred_language,
          avatarUrl: user.avatar_url,
          bio: user.bio,
        },
      });
    } catch (err) {
      next(err);
    }
  }
);

// ── PUT /api/user/change-password ─────────────────────────────────────────
router.put(
  '/change-password',
  [
    body('currentPassword').notEmpty(),
    body('newPassword').isLength({ min: 8 }).withMessage('New password must be at least 8 characters'),
  ],
  async (req, res, next) => {
    try {
      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        return res.status(422).json({ success: false, errors: errors.array() });
      }

      const { currentPassword, newPassword } = req.body;

      const result = await pool.query('SELECT password_hash FROM users WHERE id = $1', [req.user.id]);
      const valid = await bcrypt.compare(currentPassword, result.rows[0].password_hash);
      if (!valid) {
        return res.status(400).json({ success: false, message: 'Current password is incorrect' });
      }

      const newHash = await bcrypt.hash(newPassword, 12);
      await pool.query('UPDATE users SET password_hash = $1, updated_at = NOW() WHERE id = $2', [newHash, req.user.id]);

      res.json({ success: true, message: 'Password changed successfully' });
    } catch (err) {
      next(err);
    }
  }
);

module.exports = router;
