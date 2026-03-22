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
module.exports = router;