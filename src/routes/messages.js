const express = require('express');
const pool = require('../db/pool');
const { authenticate } = require('../middleware/auth');

const router = express.Router();

// ── GET /api/messages/conversations — List my conversations ─
router.get('/conversations', authenticate, async (req, res, next) => {
  try {
    const userId = req.user.id;
    const role = req.user.role;

    let query;
    if (role === 'customer') {
      query = `
        SELECT c.*,
          s.name as shop_name, s.phone as shop_phone, s.photos as shop_photos,
          u2.full_name as owner_name, u2.id as owner_id,
          (SELECT COUNT(*) FROM messages m WHERE m.conversation_id = c.id AND m.is_read = FALSE AND m.sender_role = 'owner') as unread_count
        FROM conversations c
        JOIN shops s ON c.shop_id = s.id
        JOIN users u2 ON s.owner_id = u2.id
        WHERE c.customer_id = $1
        ORDER BY c.last_message_at DESC
      `;
    } else if (role === 'owner') {
      query = `
        SELECT c.*,
          s.name as shop_name, s.phone as shop_phone,
          u.full_name as customer_name, u.phone as customer_phone, u.id as customer_id,
          (SELECT COUNT(*) FROM messages m WHERE m.conversation_id = c.id AND m.is_read = FALSE AND m.sender_role = 'customer') as unread_count
        FROM conversations c
        JOIN shops s ON c.shop_id = s.id
        JOIN users u ON c.customer_id = u.id
        WHERE s.owner_id = $1
        ORDER BY c.last_message_at DESC
      `;
    } else {
      return res.status(403).json({ success: false, message: 'Not allowed' });
    }

    const result = await pool.query(query, [userId]);

    res.json({ success: true, conversations: result.rows });
  } catch (err) {
    next(err);
  }
});

// ── GET /api/messages/unread-count — Total unread messages ──
router.get('/unread-count', authenticate, async (req, res, next) => {
  try {
    const userId = req.user.id;
    const role = req.user.role;

    let query;
    if (role === 'customer') {
      query = `
        SELECT COUNT(*) as count FROM messages m
        JOIN conversations c ON m.conversation_id = c.id
        WHERE c.customer_id = $1 AND m.is_read = FALSE AND m.sender_role = 'owner'
      `;
    } else if (role === 'owner') {
      query = `
        SELECT COUNT(*) as count FROM messages m
        JOIN conversations c ON m.conversation_id = c.id
        JOIN shops s ON c.shop_id = s.id
        WHERE s.owner_id = $1 AND m.is_read = FALSE AND m.sender_role = 'customer'
      `;
    } else {
      return res.json({ success: true, count: 0 });
    }

    const result = await pool.query(query, [userId]);
    res.json({ success: true, count: parseInt(result.rows[0].count) });
  } catch (err) {
    next(err);
  }
});

// ── POST /api/messages/start — Start or get conversation with shop ─
router.post('/start', authenticate, async (req, res, next) => {
  try {
    const { shop_id, order_id } = req.body;
    const customerId = req.user.id;

    if (!shop_id) {
      return res.status(400).json({ success: false, message: 'shop_id is required' });
    }

    // Verify shop exists
    const shop = await pool.query('SELECT id, name, owner_id FROM shops WHERE id = $1', [shop_id]);
    if (shop.rows.length === 0) {
      return res.status(404).json({ success: false, message: 'Shop not found' });
    }

    // Don't let owner chat with their own shop
    if (shop.rows[0].owner_id === customerId) {
      return res.status(400).json({ success: false, message: 'Cannot chat with your own shop' });
    }

    // Find or create conversation
    let conversation = await pool.query(
      'SELECT * FROM conversations WHERE customer_id = $1 AND shop_id = $2',
      [customerId, shop_id]
    );

    if (conversation.rows.length === 0) {
      conversation = await pool.query(
        `INSERT INTO conversations (customer_id, shop_id, order_id)
         VALUES ($1, $2, $3) RETURNING *`,
        [customerId, shop_id, order_id || null]
      );
    }

    res.json({ success: true, conversation: conversation.rows[0] });
  } catch (err) {
    next(err);
  }
});

// ── GET /api/messages/:conversationId — Get messages ────────
router.get('/:conversationId', authenticate, async (req, res, next) => {
  try {
    const { conversationId } = req.params;
    const userId = req.user.id;
    const role = req.user.role;

    // Verify user belongs to this conversation
    const conv = await pool.query('SELECT * FROM conversations WHERE id = $1', [conversationId]);
    if (conv.rows.length === 0) {
      return res.status(404).json({ success: false, message: 'Conversation not found' });
    }

    const conversation = conv.rows[0];

    // Check access
    if (role === 'customer' && conversation.customer_id !== userId) {
      return res.status(403).json({ success: false, message: 'Access denied' });
    }
    if (role === 'owner') {
      const ownerShop = await pool.query('SELECT id FROM shops WHERE id = $1 AND owner_id = $2', [conversation.shop_id, userId]);
      if (ownerShop.rows.length === 0) {
        return res.status(403).json({ success: false, message: 'Access denied' });
      }
    }

    // Get messages
    const messages = await pool.query(
      `SELECT m.*, u.full_name as sender_name
       FROM messages m
       JOIN users u ON m.sender_id = u.id
       ORDER BY m.created_at ASC`,
    );

    // Actually filter by conversation
    const filteredMessages = await pool.query(
      `SELECT m.*, u.full_name as sender_name
       FROM messages m
       JOIN users u ON m.sender_id = u.id
       WHERE m.conversation_id = $1
       ORDER BY m.created_at ASC`,
      [conversationId]
    );

    // Mark messages as read
    const oppositeRole = role === 'customer' ? 'owner' : 'customer';
    await pool.query(
      `UPDATE messages SET is_read = TRUE
       WHERE conversation_id = $1 AND sender_role = $2 AND is_read = FALSE`,
      [conversationId, oppositeRole]
    );

    // Get conversation details
    const details = await pool.query(`
      SELECT c.*, s.name as shop_name, s.phone as shop_phone, s.photos as shop_photos,
        cu.full_name as customer_name, cu.phone as customer_phone,
        ou.full_name as owner_name
      FROM conversations c
      JOIN shops s ON c.shop_id = s.id
      JOIN users cu ON c.customer_id = cu.id
      JOIN users ou ON s.owner_id = ou.id
      WHERE c.id = $1
    `, [conversationId]);

    res.json({
      success: true,
      conversation: details.rows[0],
      messages: filteredMessages.rows,
    });
  } catch (err) {
    next(err);
  }
});

// ── POST /api/messages/:conversationId — Send a message ─────
router.post('/:conversationId', authenticate, async (req, res, next) => {
  try {
    const { conversationId } = req.params;
    const { content, message_type } = req.body;
    const userId = req.user.id;
    const role = req.user.role;

    if (!content || content.trim().length === 0) {
      return res.status(400).json({ success: false, message: 'Message content is required' });
    }

    if (content.length > 2000) {
      return res.status(400).json({ success: false, message: 'Message too long (max 2000 chars)' });
    }

    // Verify conversation exists and user has access
    const conv = await pool.query('SELECT * FROM conversations WHERE id = $1', [conversationId]);
    if (conv.rows.length === 0) {
      return res.status(404).json({ success: false, message: 'Conversation not found' });
    }

    const conversation = conv.rows[0];
    let senderRole;

    if (role === 'customer' && conversation.customer_id === userId) {
      senderRole = 'customer';
    } else if (role === 'owner') {
      const ownerShop = await pool.query('SELECT id FROM shops WHERE id = $1 AND owner_id = $2', [conversation.shop_id, userId]);
      if (ownerShop.rows.length > 0) {
        senderRole = 'owner';
      }
    }

    if (!senderRole) {
      return res.status(403).json({ success: false, message: 'Access denied' });
    }

    // Insert message
    const msg = await pool.query(
      `INSERT INTO messages (conversation_id, sender_id, sender_role, content, message_type)
       VALUES ($1, $2, $3, $4, $5) RETURNING *`,
      [conversationId, userId, senderRole, content.trim(), message_type || 'text']
    );

    // Update conversation last_message
    await pool.query(
      `UPDATE conversations SET last_message = $1, last_message_at = NOW() WHERE id = $2`,
      [content.trim().substring(0, 100), conversationId]
    );

    // Get sender name
    const sender = await pool.query('SELECT full_name FROM users WHERE id = $1', [userId]);

    res.status(201).json({
      success: true,
      message: {
        ...msg.rows[0],
        sender_name: sender.rows[0]?.full_name,
      },
    });
  } catch (err) {
    next(err);
  }
});

module.exports = router;
