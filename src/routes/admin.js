const express = require('express');
const pool = require('../db/pool');
const { authenticate, authorize } = require('../middleware/auth');

const router = express.Router();

// All admin routes require admin role
router.use(authenticate, authorize('admin'));

// ── GET /api/admin/dashboard — Platform analytics ─────────
router.get('/dashboard', async (req, res, next) => {
  try {
    const [users, shops, orders, revenue] = await Promise.all([
      pool.query('SELECT COUNT(*) as total, role FROM users GROUP BY role'),
      pool.query('SELECT COUNT(*) as total, is_approved FROM shops GROUP BY is_approved'),
      pool.query('SELECT COUNT(*) as total, status FROM orders GROUP BY status'),
      pool.query(`SELECT 
        COALESCE(SUM(total_amount), 0) as total_revenue,
        COALESCE(SUM(platform_commission), 0) as total_commission,
        COUNT(*) as total_orders
        FROM orders WHERE payment_status = 'paid'`),
    ]);

    res.json({
      success: true,
      dashboard: {
        users: users.rows,
        shops: shops.rows,
        orders: orders.rows,
        revenue: revenue.rows[0],
      },
    });
  } catch (err) {
    next(err);
  }
});

// ── GET /api/admin/shops/pending — Shops awaiting approval ─
router.get('/shops/pending', async (req, res, next) => {
  try {
    const result = await pool.query(
      `SELECT s.*, u.full_name as owner_name, u.phone as owner_phone, u.email as owner_email
       FROM shops s JOIN users u ON s.owner_id = u.id
       WHERE s.is_approved = FALSE
       ORDER BY s.created_at DESC`
    );
    res.json({ success: true, shops: result.rows });
  } catch (err) {
    next(err);
  }
});

// ── PATCH /api/admin/shops/:id/approve — Approve/reject ───
router.patch('/shops/:id/approve', async (req, res, next) => {
  try {
    const { id } = req.params;
    const { approved } = req.body;

    const result = await pool.query(
      'UPDATE shops SET is_approved = $1 WHERE id = $2 RETURNING *',
      [approved, id]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ success: false, message: 'Shop not found' });
    }

    res.json({
      success: true,
      message: approved ? 'Shop approved!' : 'Shop rejected',
      shop: result.rows[0],
    });
  } catch (err) {
    next(err);
  }
});

// ── GET /api/admin/users — All users ──────────────────────
router.get('/users', async (req, res, next) => {
  try {
    const { role } = req.query;
    let query = 'SELECT id, full_name, phone, email, role, is_verified, created_at FROM users';
    const params = [];

    if (role) {
      params.push(role);
      query += ' WHERE role = $1';
    }
    query += ' ORDER BY created_at DESC';

    const result = await pool.query(query, params);
    res.json({ success: true, users: result.rows });
  } catch (err) {
    next(err);
  }
});

// ── GET /api/admin/orders — All platform orders ───────────
router.get('/orders', async (req, res, next) => {
  try {
    const result = await pool.query(
      `SELECT o.*, 
              u.full_name as customer_name, u.phone as customer_phone,
              s.name as shop_name
       FROM orders o
       LEFT JOIN users u ON o.customer_id = u.id
       LEFT JOIN shops s ON o.shop_id = s.id
       ORDER BY o.created_at DESC
       LIMIT 100`
    );
    res.json({ success: true, orders: result.rows });
  } catch (err) {
    next(err);
  }
});

// ── GET /api/admin/transactions — All transactions ────────
router.get('/transactions', async (req, res, next) => {
  try {
    const result = await pool.query(
      `SELECT t.*, o.order_number, o.customer_id, o.shop_id
       FROM transactions t
       LEFT JOIN orders o ON t.order_id = o.id
       ORDER BY t.created_at DESC
       LIMIT 100`
    );
    res.json({ success: true, transactions: result.rows });
  } catch (err) {
    next(err);
  }
});

// ── PATCH /api/admin/settings — Update platform settings ──
router.patch('/settings', async (req, res, next) => {
  res.json({
    success: true,
    message: 'Settings update endpoint — connect to a settings table in production',
    current: {
      commission_rate: process.env.PLATFORM_COMMISSION_RATE,
    },
  });
});

module.exports = router;
