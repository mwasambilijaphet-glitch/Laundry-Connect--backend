const express = require('express');
const { body, validationResult } = require('express-validator');
const pool = require('../db/pool');
const { authenticate } = require('../middleware/auth');
const { requireSubscription } = require('../middleware/subscription');
const upload = require('../middleware/upload');
const { generateDesign, recommendOutfit, chatWithAssistant } = require('../services/ai');
const { uploadImage } = require('../services/cloudinary');

const router = express.Router();

// All AI routes require authentication + active subscription
router.use(authenticate, requireSubscription);

// ── POST /api/ai/generate-design ──────────────────────────────────────────
router.post(
  '/generate-design',
  upload.single('inspiration'),
  [
    body('prompt')
      .trim()
      .isLength({ min: 10, max: 500 })
      .withMessage('Prompt must be between 10 and 500 characters'),
  ],
  async (req, res, next) => {
    try {
      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        return res.status(422).json({ success: false, errors: errors.array() });
      }

      const { prompt } = req.body;
      let inspirationImageUrl = null;

      // Upload inspiration image to Cloudinary if provided
      if (req.file) {
        const uploaded = await uploadImage(req.file.buffer, 'fashion-cotz/inspirations');
        inspirationImageUrl = uploaded.url;
      }

      const result = await generateDesign({ prompt, inspirationImageUrl });

      // Persist the generated design image to Cloudinary
      const savedImage = await uploadImage(result.imageUrl, 'fashion-cotz/designs');

      // Save design to database
      const dbResult = await pool.query(
        `INSERT INTO ai_designs
           (user_id, prompt, image_url, cloudinary_id, description, fabrics, color_palette, inspiration_url)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
         RETURNING id, created_at`,
        [
          req.user.id,
          prompt,
          savedImage.url,
          savedImage.publicId,
          result.description,
          JSON.stringify(result.fabrics),
          JSON.stringify(result.colorPalette),
          inspirationImageUrl,
        ]
      );

      res.json({
        success: true,
        design: {
          id: dbResult.rows[0].id,
          prompt,
          imageUrl: savedImage.url,
          description: result.description,
          fabrics: result.fabrics,
          colorPalette: result.colorPalette,
          inspirationUrl: inspirationImageUrl,
          createdAt: dbResult.rows[0].created_at,
        },
      });
    } catch (err) {
      next(err);
    }
  }
);

// ── GET /api/ai/designs — List user's saved designs ───────────────────────
router.get('/designs', async (req, res, next) => {
  try {
    const { page = 1, limit = 12 } = req.query;
    const offset = (page - 1) * limit;

    const result = await pool.query(
      `SELECT id, prompt, image_url, description, fabrics, color_palette, created_at
       FROM ai_designs
       WHERE user_id = $1 AND is_saved = true
       ORDER BY created_at DESC
       LIMIT $2 OFFSET $3`,
      [req.user.id, limit, offset]
    );

    const countResult = await pool.query(
      'SELECT COUNT(*) FROM ai_designs WHERE user_id = $1 AND is_saved = true',
      [req.user.id]
    );

    res.json({
      success: true,
      designs: result.rows.map(d => ({
        id: d.id,
        prompt: d.prompt,
        imageUrl: d.image_url,
        description: d.description,
        fabrics: d.fabrics,
        colorPalette: d.color_palette,
        createdAt: d.created_at,
      })),
      total: Number(countResult.rows[0].count),
      page: Number(page),
      limit: Number(limit),
    });
  } catch (err) {
    next(err);
  }
});

// ── DELETE /api/ai/designs/:id — Unsave/delete a design ──────────────────
router.delete('/designs/:id', async (req, res, next) => {
  try {
    const result = await pool.query(
      'UPDATE ai_designs SET is_saved = false WHERE id = $1 AND user_id = $2 RETURNING id',
      [req.params.id, req.user.id]
    );
    if (result.rows.length === 0) {
      return res.status(404).json({ success: false, message: 'Design not found' });
    }
    res.json({ success: true, message: 'Design removed from saved' });
  } catch (err) {
    next(err);
  }
});

// ── POST /api/ai/recommend-outfit ─────────────────────────────────────────
router.post(
  '/recommend-outfit',
  [
    body('occasion').trim().notEmpty().withMessage('Occasion required'),
    body('weather').trim().notEmpty().withMessage('Weather required'),
    body('stylePreference').trim().notEmpty().withMessage('Style preference required'),
  ],
  async (req, res, next) => {
    try {
      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        return res.status(422).json({ success: false, errors: errors.array() });
      }

      const { occasion, weather, stylePreference, language = 'en', save = false } = req.body;

      const result = await recommendOutfit({ occasion, weather, stylePreference, language });

      let savedId = null;
      if (save) {
        const dbResult = await pool.query(
          `INSERT INTO saved_outfits (user_id, occasion, weather, style_preference, outfit_data)
           VALUES ($1, $2, $3, $4, $5) RETURNING id`,
          [req.user.id, occasion, weather, stylePreference, JSON.stringify(result)]
        );
        savedId = dbResult.rows[0].id;
      }

      res.json({
        success: true,
        recommendation: result,
        savedId,
      });
    } catch (err) {
      next(err);
    }
  }
);

// ── GET /api/ai/outfits — List saved outfit recommendations ───────────────
router.get('/outfits', async (req, res, next) => {
  try {
    const result = await pool.query(
      `SELECT id, occasion, weather, style_preference, outfit_data, created_at
       FROM saved_outfits WHERE user_id = $1 ORDER BY created_at DESC LIMIT 20`,
      [req.user.id]
    );
    res.json({
      success: true,
      outfits: result.rows.map(o => ({
        id: o.id,
        occasion: o.occasion,
        weather: o.weather,
        stylePreference: o.style_preference,
        outfitData: o.outfit_data,
        createdAt: o.created_at,
      })),
    });
  } catch (err) {
    next(err);
  }
});

// ── POST /api/ai/chat ─────────────────────────────────────────────────────
router.post(
  '/chat',
  [
    body('message').trim().isLength({ min: 1, max: 2000 }).withMessage('Message required (max 2000 chars)'),
  ],
  async (req, res, next) => {
    try {
      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        return res.status(422).json({ success: false, errors: errors.array() });
      }

      const { message, sessionId, language = 'auto' } = req.body;

      let session = null;
      let history = [];

      if (sessionId) {
        const sessionResult = await pool.query(
          'SELECT id, messages, language FROM chat_sessions WHERE id = $1 AND user_id = $2',
          [sessionId, req.user.id]
        );
        if (sessionResult.rows.length > 0) {
          session = sessionResult.rows[0];
          history = session.messages;
        }
      }

      const { response, language: detectedLang } = await chatWithAssistant({ message, history, language });

      const newHistory = [
        ...history,
        { role: 'user', content: message, timestamp: new Date().toISOString() },
        { role: 'assistant', content: response, timestamp: new Date().toISOString() },
      ];

      let updatedSessionId = sessionId;
      if (session) {
        await pool.query(
          'UPDATE chat_sessions SET messages = $1, language = $2, updated_at = NOW() WHERE id = $3',
          [JSON.stringify(newHistory), detectedLang, session.id]
        );
      } else {
        // Create new session
        const newSession = await pool.query(
          `INSERT INTO chat_sessions (user_id, messages, language, title)
           VALUES ($1, $2, $3, $4) RETURNING id`,
          [req.user.id, JSON.stringify(newHistory), detectedLang, message.slice(0, 80)]
        );
        updatedSessionId = newSession.rows[0].id;
      }

      res.json({
        success: true,
        response,
        language: detectedLang,
        sessionId: updatedSessionId,
      });
    } catch (err) {
      next(err);
    }
  }
);

// ── GET /api/ai/chat/sessions — List chat sessions ────────────────────────
router.get('/chat/sessions', async (req, res, next) => {
  try {
    const result = await pool.query(
      `SELECT id, title, language, created_at, updated_at,
              jsonb_array_length(messages) AS message_count
       FROM chat_sessions WHERE user_id = $1 ORDER BY updated_at DESC LIMIT 20`,
      [req.user.id]
    );
    res.json({ success: true, sessions: result.rows });
  } catch (err) {
    next(err);
  }
});

// ── GET /api/ai/chat/sessions/:id — Get full session ─────────────────────
router.get('/chat/sessions/:id', async (req, res, next) => {
  try {
    const result = await pool.query(
      'SELECT id, messages, language, title, created_at FROM chat_sessions WHERE id = $1 AND user_id = $2',
      [req.params.id, req.user.id]
    );
    if (result.rows.length === 0) {
      return res.status(404).json({ success: false, message: 'Session not found' });
    }
    res.json({ success: true, session: result.rows[0] });
  } catch (err) {
    next(err);
  }
});

module.exports = router;
