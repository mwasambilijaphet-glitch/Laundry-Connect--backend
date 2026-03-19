const express = require('express');
const { body, validationResult } = require('express-validator');
const pool = require('../db/pool');
const { authenticate, authorize } = require('../middleware/auth');
const { requireSubscription } = require('../middleware/subscription');
const upload = require('../middleware/upload');
const { uploadImage, deleteImage } = require('../services/cloudinary');
const { analyzeDesignerWork } = require('../services/ai');

const router = express.Router();

// ── GET /api/designer/portfolio — Public portfolio listings ───────────────
router.get('/portfolio', async (req, res, next) => {
  try {
    const { page = 1, limit = 12, userId } = req.query;
    const offset = (page - 1) * limit;

    let query = `
      SELECT dp.id, dp.title, dp.description, dp.image_url, dp.style_tags,
             dp.likes, dp.created_at, u.full_name AS designer_name, u.avatar_url AS designer_avatar
      FROM designer_portfolios dp
      JOIN users u ON u.id = dp.user_id
      WHERE dp.is_published = true`;
    const params = [limit, offset];

    if (userId) {
      query += ` AND dp.user_id = $3`;
      params.push(userId);
    }

    query += ` ORDER BY dp.created_at DESC LIMIT $1 OFFSET $2`;

    const result = await pool.query(query, params);
    const countResult = await pool.query(
      `SELECT COUNT(*) FROM designer_portfolios WHERE is_published = true${userId ? ' AND user_id = $1' : ''}`,
      userId ? [userId] : []
    );

    res.json({
      success: true,
      items: result.rows,
      total: Number(countResult.rows[0].count),
      page: Number(page),
      limit: Number(limit),
    });
  } catch (err) {
    next(err);
  }
});

// ── GET /api/designer/portfolio/:id — Single portfolio item ───────────────
router.get('/portfolio/:id', async (req, res, next) => {
  try {
    const result = await pool.query(
      `SELECT dp.*, u.full_name AS designer_name, u.avatar_url AS designer_avatar, u.bio AS designer_bio
       FROM designer_portfolios dp
       JOIN users u ON u.id = dp.user_id
       WHERE dp.id = $1 AND dp.is_published = true`,
      [req.params.id]
    );
    if (result.rows.length === 0) {
      return res.status(404).json({ success: false, message: 'Portfolio item not found' });
    }
    res.json({ success: true, item: result.rows[0] });
  } catch (err) {
    next(err);
  }
});

// ── POST /api/designer/upload — Upload design to portfolio ────────────────
router.post(
  '/upload',
  authenticate,
  requireSubscription,
  upload.single('image'),
  [
    body('title').trim().isLength({ min: 3, max: 120 }).withMessage('Title must be 3–120 characters'),
    body('description').optional().trim().isLength({ max: 1000 }),
    body('styleTags').optional(),
  ],
  async (req, res, next) => {
    try {
      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        return res.status(422).json({ success: false, errors: errors.array() });
      }

      if (!req.file) {
        return res.status(400).json({ success: false, message: 'Image is required' });
      }

      const { title, description } = req.body;
      let styleTags = [];
      try {
        styleTags = JSON.parse(req.body.styleTags || '[]');
      } catch {
        styleTags = [];
      }

      const uploaded = await uploadImage(req.file.buffer, 'fashion-cotz/portfolio');

      // Get AI feedback
      let aiFeedback = null;
      try {
        aiFeedback = await analyzeDesignerWork({
          imageUrl: uploaded.url,
          title,
          description,
        });
      } catch {
        // Non-critical — continue without AI feedback
      }

      const result = await pool.query(
        `INSERT INTO designer_portfolios
           (user_id, title, description, image_url, cloudinary_id, ai_feedback, style_tags)
         VALUES ($1, $2, $3, $4, $5, $6, $7)
         RETURNING *`,
        [req.user.id, title, description || null, uploaded.url, uploaded.publicId, aiFeedback, JSON.stringify(styleTags)]
      );

      res.status(201).json({
        success: true,
        message: 'Design uploaded successfully',
        item: result.rows[0],
      });
    } catch (err) {
      next(err);
    }
  }
);

// ── DELETE /api/designer/portfolio/:id — Delete portfolio item ────────────
router.delete('/portfolio/:id', authenticate, async (req, res, next) => {
  try {
    const result = await pool.query(
      'SELECT cloudinary_id FROM designer_portfolios WHERE id = $1 AND user_id = $2',
      [req.params.id, req.user.id]
    );
    if (result.rows.length === 0) {
      return res.status(404).json({ success: false, message: 'Portfolio item not found' });
    }

    if (result.rows[0].cloudinary_id) {
      await deleteImage(result.rows[0].cloudinary_id).catch(() => {});
    }

    await pool.query('DELETE FROM designer_portfolios WHERE id = $1', [req.params.id]);
    res.json({ success: true, message: 'Portfolio item deleted' });
  } catch (err) {
    next(err);
  }
});

// ── POST /api/designer/portfolio/:id/like — Like a portfolio item ─────────
router.post('/portfolio/:id/like', authenticate, async (req, res, next) => {
  try {
    const result = await pool.query(
      'UPDATE designer_portfolios SET likes = likes + 1 WHERE id = $1 AND is_published = true RETURNING likes',
      [req.params.id]
    );
    if (result.rows.length === 0) {
      return res.status(404).json({ success: false, message: 'Item not found' });
    }
    res.json({ success: true, likes: result.rows[0].likes });
  } catch (err) {
    next(err);
  }
});

// ── GET /api/designer/my-portfolio — Authenticated designer's own items ────
router.get('/my-portfolio', authenticate, async (req, res, next) => {
  try {
    const result = await pool.query(
      `SELECT id, title, description, image_url, ai_feedback, style_tags, likes, is_published, created_at
       FROM designer_portfolios WHERE user_id = $1 ORDER BY created_at DESC`,
      [req.user.id]
    );
    res.json({ success: true, items: result.rows });
  } catch (err) {
    next(err);
  }
});

module.exports = router;
