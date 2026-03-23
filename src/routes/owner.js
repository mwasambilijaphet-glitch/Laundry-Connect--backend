const express = require('express');
const pool = require('../db/pool');
const { authenticate, authorize } = require('../middleware/auth');

const router = express.Router();

router.use(authenticate, authorize('owner'));

router.get('/shop', async (req, res, next) => {
  try {
    const result = await pool.query(
      `SELECT s.*, 
        (SELECT COUNT(*) FROM services WHERE shop_id = s.id AND is_active = TRUE) as service_count
       FROM shops s WHERE s.owner_id = $1`,
      [req.user.id]
    );
    if (result.rows.length === 0) {
      return res.json({ success: true, shop: null });
    }
    res.json({ success: true, shop: result.rows[0] });
  } catch (err) {
    next(err);
  }
});

router.get('/dashboard', async (req, res, next) => {
  try {
    const shopResult = await pool.query('SELECT id FROM shops WHERE owner_id = $1', [req.user.id]);
    if (shopResult.rows.length === 0) {
      return res.json({ success: true, dashboard: { has_shop: false } });
    }
    const shopId = shopResult.rows[0].id;
    const today = new Date().toISOString().split('T')[0];

    const [todayOrders, totalStats, recentOrders, statusCounts] = await Promise.all([
      pool.query(
        `SELECT COUNT(*) as count, COALESCE(SUM(total_amount), 0) as revenue
         FROM orders WHERE shop_id = $1 AND DATE(created_at) = $2 AND payment_status = 'paid'`,
        [shopId, today]
      ),
      pool.query(
        `SELECT COUNT(*) as total_orders, 
                COALESCE(SUM(total_amount), 0) as total_revenue,
                COALESCE(SUM(total_amount - platform_commission), 0) as total_earnings
         FROM orders WHERE shop_id = $1 AND payment_status = 'paid'`,
        [shopId]
      ),
      pool.query(
        `SELECT o.*, u.full_name as customer_name, u.phone as customer_phone
         FROM orders o
         LEFT JOIN users u ON o.customer_id = u.id
         WHERE o.shop_id = $1
         ORDER BY o.created_at DESC LIMIT 5`,
        [shopId]
      ),
      pool.query(
        `SELECT status, COUNT(*) as count FROM orders WHERE shop_id = $1 GROUP BY status`,
        [shopId]
      ),
    ]);

    for (const order of recentOrders.rows) {
      const items = await pool.query('SELECT * FROM order_items WHERE order_id = $1', [order.id]);
      order.items = items.rows;
    }

    res.json({
      success: true,
      dashboard: {
        has_shop: true,
        shop_id: shopId,
        today: {
          orders: parseInt(todayOrders.rows[0].count),
          revenue: parseInt(todayOrders.rows[0].revenue),
        },
        total: {
          orders: parseInt(totalStats.rows[0].total_orders),
          revenue: parseInt(totalStats.rows[0].total_revenue),
          earnings: parseInt(totalStats.rows[0].total_earnings),
        },
        recent_orders: recentOrders.rows,
        status_counts: statusCounts.rows,
      },
    });
  } catch (err) {
    next(err);
  }
});

router.get('/orders', async (req, res, next) => {
  try {
    const { status } = req.query;
    const shopResult = await pool.query('SELECT id FROM shops WHERE owner_id = $1', [req.user.id]);
    if (shopResult.rows.length === 0) {
      return res.json({ success: true, orders: [] });
    }
    const shopId = shopResult.rows[0].id;

    let query = `
      SELECT o.*, u.full_name as customer_name, u.phone as customer_phone, u.email as customer_email
      FROM orders o
      LEFT JOIN users u ON o.customer_id = u.id
      WHERE o.shop_id = $1
    `;
    const params = [shopId];

    if (status) {
      params.push(status);
      query += ` AND o.status = $${params.length}`;
    }
    query += ' ORDER BY o.created_at DESC';

    const result = await pool.query(query, params);

    for (const order of result.rows) {
      const items = await pool.query('SELECT * FROM order_items WHERE order_id = $1', [order.id]);
      order.items = items.rows;
    }

    res.json({ success: true, orders: result.rows });
  } catch (err) {
    next(err);
  }
});
// ── GET /api/owner/commission — View pending commission owed ──
router.get('/commission', async (req, res, next) => {
  try {
    const shopResult = await pool.query('SELECT id FROM shops WHERE owner_id = $1', [req.user.id]);
    if (shopResult.rows.length === 0) {
      return res.json({ success: true, commission: { total_owed: 0, orders: [] } });
    }
    const shopId = shopResult.rows[0].id;

    // Get all cash orders with pending commission
    const result = await pool.query(
      `SELECT o.id, o.order_number, o.total_amount, o.platform_commission, o.created_at,
              o.payment_status, o.status,
              t.id as commission_tx_id, t.status as commission_status
       FROM orders o
       LEFT JOIN transactions t ON t.order_id = o.id AND t.type = 'commission'
       WHERE o.shop_id = $1 AND o.payment_status = 'cash' AND t.status = 'pending'
       ORDER BY o.created_at DESC`,
      [shopId]
    );

    const totalOwed = result.rows.reduce((sum, r) => sum + parseInt(r.platform_commission), 0);

    res.json({
      success: true,
      commission: {
        total_owed: totalOwed,
        orders: result.rows,
      },
    });
  } catch (err) {
    next(err);
  }
});

// ── POST /api/owner/commission/settle — Pay commission via M-Pesa ──
router.post('/commission/settle', async (req, res, next) => {
  try {
    const { phone } = req.body;

    const shopResult = await pool.query('SELECT id, name FROM shops WHERE owner_id = $1', [req.user.id]);
    if (shopResult.rows.length === 0) {
      return res.status(404).json({ success: false, message: 'Shop not found' });
    }
    const shop = shopResult.rows[0];

    // Calculate total pending commission for cash orders
    const pendingResult = await pool.query(
      `SELECT t.id, t.amount, t.order_id
       FROM transactions t
       JOIN orders o ON t.order_id = o.id
       WHERE o.shop_id = $1 AND t.type = 'commission' AND t.status = 'pending' AND o.payment_status = 'cash'`,
      [shop.id]
    );

    if (pendingResult.rows.length === 0) {
      return res.json({ success: true, message: 'No pending commission to settle' });
    }

    const totalOwed = pendingResult.rows.reduce((sum, r) => sum + parseInt(r.amount), 0);
    const txIds = pendingResult.rows.map(r => r.id);

    if (process.env.SNIPPE_API_KEY) {
      // Initiate collection from shop owner via Snippe
      const userResult = await pool.query('SELECT full_name, email FROM users WHERE id = $1', [req.user.id]);
      const user = userResult.rows[0];

      const nameParts = (user.full_name || 'Owner').split(' ');
      const firstname = nameParts[0];
      const lastname = nameParts.slice(1).join(' ') || firstname;

      const snippeResponse = await fetch('https://api.snippe.sh/api/v1/payments', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${process.env.SNIPPE_API_KEY}`,
          'Content-Type': 'application/json',
          'Idempotency-Key': `commission-${shop.id}-${Date.now()}`,
        },
        body: JSON.stringify({
          payment_type: 'mobile',
          details: {
            amount: totalOwed,
            currency: 'TZS',
          },
          phone_number: phone || '',
          customer: { firstname, lastname, email: user.email },
          webhook_url: (process.env.WEBHOOK_URL || process.env.BACKEND_URL || '').startsWith('https')
            ? `${process.env.WEBHOOK_URL || process.env.BACKEND_URL}/api/payments/commission-webhook`
            : undefined,
          metadata: {
            type: 'commission_settlement',
            shop_id: String(shop.id),
            transaction_ids: txIds.map(String),
          },
        }),
      });

      const snippeJson = await snippeResponse.json();

      if (!snippeResponse.ok) {
        console.error('Snippe commission error:', snippeJson);
        return res.status(502).json({
          success: false,
          message: snippeJson.message || 'Payment gateway error. Please try again.',
        });
      }

      const paymentData = snippeJson.data || snippeJson;
      console.log('Commission settlement initiated:', paymentData.reference, '| Amount:', totalOwed, 'TZS');

      res.json({
        success: true,
        message: 'Commission payment initiated. Check your phone for the USSD prompt.',
        settlement: {
          reference: paymentData.reference || paymentData.id,
          amount: totalOwed,
          orders_count: pendingResult.rows.length,
        },
      });
    } else {
      // Test mode — mark as settled immediately
      await pool.query(
        `UPDATE transactions SET status = 'completed' WHERE id = ANY($1)`,
        [txIds]
      );

      console.log('Commission settled (test mode) for shop:', shop.name, '| Amount:', totalOwed, 'TZS');

      res.json({
        success: true,
        message: `Commission of ${totalOwed} TZS settled successfully (test mode).`,
        settlement: {
          reference: `commission_test_${Date.now()}`,
          amount: totalOwed,
          orders_count: pendingResult.rows.length,
        },
      });
    }
  } catch (err) {
    next(err);
  }
});

module.exports = router;