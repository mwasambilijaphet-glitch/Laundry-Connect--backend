const express = require('express');
const pool = require('../db/pool');
const { authenticate, authorize } = require('../middleware/auth');

const router = express.Router();

// All admin routes require admin role
router.use(authenticate, authorize('admin'));

// ── GET /api/admin/dashboard — Platform analytics ─────────
router.get('/dashboard', async (req, res, next) => {
  try {
    const [users, shops, orders, revenue, pendingCommission] = await Promise.all([
      pool.query('SELECT COUNT(*) as total, role FROM users GROUP BY role'),
      pool.query('SELECT COUNT(*) as total, is_approved FROM shops GROUP BY is_approved'),
      pool.query('SELECT COUNT(*) as total, status FROM orders GROUP BY status'),
      pool.query(`SELECT
        COALESCE(SUM(total_amount), 0) as total_revenue,
        COALESCE(SUM(platform_commission), 0) as total_commission,
        COUNT(*) as total_orders
        FROM orders WHERE payment_status = 'paid'`),
      pool.query(`SELECT COALESCE(SUM(amount), 0) as total_pending
        FROM transactions WHERE type = 'commission' AND status = 'pending'`),
    ]);

    res.json({
      success: true,
      dashboard: {
        users: users.rows,
        shops: shops.rows,
        orders: orders.rows,
        revenue: {
          ...revenue.rows[0],
          pending_commission: pendingCommission.rows[0].total_pending,
        },
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

// ── GET /api/admin/balances — Shop owner commission balances ──
router.get('/balances', async (req, res, next) => {
  try {
    // Get pending commission per shop (cash payments where commission not yet collected)
    const result = await pool.query(`
      SELECT
        s.id as shop_id,
        s.name as shop_name,
        u.full_name as owner_name,
        u.phone as owner_phone,
        u.email as owner_email,
        COALESCE(SUM(CASE WHEN t.status = 'pending' THEN t.amount ELSE 0 END), 0) as owed_amount,
        COALESCE(SUM(CASE WHEN t.status = 'completed' THEN t.amount ELSE 0 END), 0) as collected_amount,
        COUNT(CASE WHEN t.status = 'pending' THEN 1 END) as pending_orders
      FROM shops s
      JOIN users u ON s.owner_id = u.id
      LEFT JOIN orders o ON o.shop_id = s.id AND o.payment_status = 'paid'
      LEFT JOIN transactions t ON t.order_id = o.id AND t.type = 'commission'
      GROUP BY s.id, s.name, u.full_name, u.phone, u.email
      HAVING COALESCE(SUM(CASE WHEN t.status = 'pending' THEN t.amount ELSE 0 END), 0) > 0
      ORDER BY owed_amount DESC
    `);

    const totalOwed = result.rows.reduce((sum, r) => sum + parseInt(r.owed_amount), 0);

    res.json({
      success: true,
      total_owed: totalOwed,
      balances: result.rows,
    });
  } catch (err) {
    next(err);
  }
});

// ── POST /api/admin/balances/:shopId/settle — Mark commission as collected ──
router.post('/balances/:shopId/settle', async (req, res, next) => {
  try {
    const { shopId } = req.params;

    // Mark all pending commissions for this shop as completed
    const result = await pool.query(`
      UPDATE transactions SET status = 'completed'
      WHERE type = 'commission' AND status = 'pending'
      AND order_id IN (SELECT id FROM orders WHERE shop_id = $1 AND payment_status = 'paid')
      RETURNING id
    `, [shopId]);

    res.json({
      success: true,
      message: `Settled ${result.rowCount} commission(s) for shop ${shopId}`,
      settled_count: result.rowCount,
    });
  } catch (err) {
    next(err);
  }
});

// ── POST /api/admin/balances/:shopId/invoice — Send M-Pesa commission invoice ──
router.post('/balances/:shopId/invoice', async (req, res, next) => {
  try {
    const { shopId } = req.params;

    // Get shop owner phone and owed amount
    const result = await pool.query(`
      SELECT
        s.name as shop_name,
        u.phone as owner_phone,
        u.full_name as owner_name,
        COALESCE(SUM(t.amount), 0) as owed_amount,
        COUNT(t.id) as pending_count
      FROM shops s
      JOIN users u ON s.owner_id = u.id
      LEFT JOIN orders o ON o.shop_id = s.id AND o.payment_status = 'paid'
      LEFT JOIN transactions t ON t.order_id = o.id AND t.type = 'commission' AND t.status = 'pending'
      WHERE s.id = $1
      GROUP BY s.id, s.name, u.phone, u.full_name
    `, [shopId]);

    if (result.rows.length === 0) {
      return res.status(404).json({ success: false, message: 'Shop not found' });
    }

    const shop = result.rows[0];
    const owedAmount = parseInt(shop.owed_amount);

    if (owedAmount <= 0) {
      return res.status(400).json({ success: false, message: 'No pending commission to collect' });
    }

    // Format phone for M-Pesa
    let phone = shop.owner_phone;
    if (phone.startsWith('0')) phone = '+255' + phone.substring(1);
    else if (phone.startsWith('255') && !phone.startsWith('+')) phone = '+' + phone;

    // Try Snippe payment collection (if API key is set)
    if (process.env.SNIPPE_API_KEY) {
      const SNIPPE_API_BASE = process.env.SNIPPE_API_URL || 'https://api.snippe.sh/v1';
      const BACKEND_URL = (process.env.BACKEND_URL || 'https://laundry-connect-backend.onrender.com').replace(/\/+$/, '');

      const collectionBody = {
        payment_type: 'mobile',
        details: {
          amount: owedAmount,
          currency: 'TZS',
        },
        phone_number: phone,
        customer: {
          firstname: shop.owner_name.split(' ')[0],
          lastname: shop.owner_name.split(' ').slice(1).join(' ') || 'Owner',
          email: `shop${shopId}@laundryconnect.co.tz`,
        },
        webhook_url: `${BACKEND_URL}/api/payments/commission-webhook`,
        metadata: {
          type: 'commission_collection',
          shop_id: shopId,
          pending_count: shop.pending_count,
        },
        idempotency_key: `comm_${shopId}_${Date.now()}`,
      };

      try {
        const snippeRes = await fetch(`${SNIPPE_API_BASE}/payments`, {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${process.env.SNIPPE_API_KEY}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify(collectionBody),
        });

        const snippeData = await snippeRes.json();

        if (snippeRes.ok) {
          console.log('M-Pesa commission invoice sent:', { shopId, amount: owedAmount, ref: snippeData.id });
          return res.json({
            success: true,
            message: `M-Pesa invoice of ${owedAmount.toLocaleString()} TZS sent to ${shop.owner_name} (${shop.owner_phone})`,
            method: 'mpesa',
            reference: snippeData.id || snippeData.reference,
            amount: owedAmount,
          });
        }

        console.error('Snippe commission collection failed:', snippeData);
      } catch (snippeErr) {
        console.error('Snippe commission request error:', snippeErr.message);
      }
    }

    // Send SMS invoice via NextSMS
    const { sendSMS } = require('../services/nextsms');
    const smsMessage = `Laundry Connect: Tafadhali lipa kamisheni ya TZS ${owedAmount.toLocaleString()} kwa oda ${shop.pending_count} za fedha taslimu. Lipa kupitia M-Pesa: 0768188065 (Laundry Connect). Asante!`;

    try {
      await sendSMS(phone, smsMessage);
      console.log('Commission SMS sent to:', shop.owner_phone);
    } catch (smsErr) {
      console.error('SMS invoice error:', smsErr.message);
    }

    res.json({
      success: true,
      message: `SMS invoice sent to ${shop.owner_name} (${shop.owner_phone}) for TZS ${owedAmount.toLocaleString()}`,
      method: 'sms',
      amount: owedAmount,
    });
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
