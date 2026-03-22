const express = require('express');
const crypto = require('crypto');
const pool = require('../db/pool');
const { authenticate, authorize } = require('../middleware/auth');

const router = express.Router();

function generateOrderNumber() {
  const year = new Date().getFullYear();
  const rand = crypto.randomInt(100000, 999999);
  return `LC-${year}-${rand}`;
}

// ── POST /api/orders — Place a new order ──────────────────
router.post('/', authenticate, authorize('customer'), async (req, res, next) => {
  const client = await pool.connect();

  try {
    const { shop_id, items, delivery_address, delivery_zone_id, special_instructions } = req.body;

    if (!shop_id || !items || items.length === 0 || !delivery_address) {
      return res.status(400).json({ success: false, message: 'Missing required fields' });
    }

    if (items.length > 50) {
      return res.status(400).json({ success: false, message: 'Too many items in order (max 50)' });
    }

    if (delivery_address.length > 500) {
      return res.status(400).json({ success: false, message: 'Delivery address too long' });
    }

    await client.query('BEGIN');

    // Calculate totals
    let subtotal = 0;
    const orderItems = [];

    for (const item of items) {
      if (!item.service_id || !item.quantity || item.quantity < 1 || item.quantity > 100) {
        await client.query('ROLLBACK');
        return res.status(400).json({ success: false, message: 'Invalid item: service_id and quantity (1-100) required' });
      }

      const svcResult = await client.query(
        'SELECT * FROM services WHERE id = $1 AND shop_id = $2 AND is_active = TRUE',
        [item.service_id, shop_id]
      );
      if (svcResult.rows.length === 0) {
        await client.query('ROLLBACK');
        return res.status(400).json({ success: false, message: `Service ${item.service_id} not found` });
      }
      const svc = svcResult.rows[0];
      const totalPrice = svc.price * item.quantity;
      subtotal += totalPrice;

      orderItems.push({
        service_id: svc.id,
        clothing_type: svc.clothing_type,
        service_type: svc.service_type,
        quantity: item.quantity,
        unit_price: svc.price,
        total_price: totalPrice,
      });
    }

    // Get delivery fee
    let deliveryFee = 0;
    if (delivery_zone_id) {
      const zone = await client.query('SELECT fee FROM delivery_zones WHERE id = $1 AND shop_id = $2', [delivery_zone_id, shop_id]);
      if (zone.rows[0]) deliveryFee = zone.rows[0].fee;
    }

    const commissionRate = parseFloat(process.env.PLATFORM_COMMISSION_RATE || '0.005');
    const platformCommission = Math.round(subtotal * commissionRate);
    const totalAmount = subtotal + deliveryFee;

    // Create order with unique order number (retry on collision)
    let order;
    let attempts = 0;
    while (attempts < 3) {
      try {
        const orderNumber = generateOrderNumber();
        const orderResult = await client.query(
          `INSERT INTO orders (order_number, customer_id, shop_id, subtotal, delivery_fee, platform_commission, total_amount, delivery_address, special_instructions)
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
           RETURNING *`,
          [orderNumber, req.user.id, shop_id, subtotal, deliveryFee, platformCommission, totalAmount, delivery_address, special_instructions || null]
        );
        order = orderResult.rows[0];
        break;
      } catch (e) {
        if (e.code === '23505' && e.constraint && attempts < 2) {
          attempts++;
          continue; // Retry with new order number
        }
        throw e;
      }
    }

    // Create order items
    for (const item of orderItems) {
      await client.query(
        `INSERT INTO order_items (order_id, service_id, clothing_type, service_type, quantity, unit_price, total_price)
         VALUES ($1, $2, $3, $4, $5, $6, $7)`,
        [order.id, item.service_id, item.clothing_type, item.service_type, item.quantity, item.unit_price, item.total_price]
      );
    }

    // Update shop order count
    await client.query('UPDATE shops SET total_orders = total_orders + 1 WHERE id = $1', [shop_id]);

    await client.query('COMMIT');

    res.status(201).json({
      success: true,
      message: 'Order placed! Proceed to payment.',
      order: {
        ...order,
        items: orderItems,
      },
    });
  } catch (err) {
    await client.query('ROLLBACK');
    next(err);
  } finally {
    client.release();
  }
});

// ── GET /api/orders — List my orders (customer) ───────────
router.get('/', authenticate, async (req, res, next) => {
  try {
    const { status } = req.query;
    let query = `
      SELECT o.*, s.name as shop_name, s.address as shop_address, s.phone as shop_phone
      FROM orders o
      JOIN shops s ON o.shop_id = s.id
      WHERE o.customer_id = $1
    `;
    const params = [req.user.id];

    if (status) {
      params.push(status);
      query += ` AND o.status = $${params.length}`;
    }

    query += ' ORDER BY o.created_at DESC';

    const result = await pool.query(query, params);

    // Fetch items for each order
    for (const order of result.rows) {
      const items = await pool.query('SELECT * FROM order_items WHERE order_id = $1', [order.id]);
      order.items = items.rows;
    }

    res.json({ success: true, orders: result.rows });
  } catch (err) {
    next(err);
  }
});

// ── GET /api/orders/:orderNumber — Single order detail ────
router.get('/:orderNumber', authenticate, async (req, res, next) => {
  try {
    const { orderNumber } = req.params;

    const result = await pool.query(
      `SELECT o.*, s.name as shop_name, s.address as shop_address, s.phone as shop_phone
       FROM orders o JOIN shops s ON o.shop_id = s.id
       WHERE o.order_number = $1 AND (o.customer_id = $2 OR EXISTS (SELECT 1 FROM shops WHERE id = o.shop_id AND owner_id = $2))`,
      [orderNumber, req.user.id]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ success: false, message: 'Order not found' });
    }

    const order = result.rows[0];
    const items = await pool.query('SELECT * FROM order_items WHERE order_id = $1', [order.id]);
    order.items = items.rows;

    res.json({ success: true, order });
  } catch (err) {
    next(err);
  }
});

// ── PATCH /api/orders/:id/status — Update status (owner) ──
router.patch('/:id/status', authenticate, authorize('owner', 'admin'), async (req, res, next) => {
  try {
    const { id } = req.params;
    const { status } = req.body;

    const validStatuses = ['confirmed', 'picked_up', 'washing', 'ready', 'out_for_delivery', 'delivered', 'cancelled'];
    if (!validStatuses.includes(status)) {
      return res.status(400).json({ success: false, message: 'Invalid status' });
    }

    // Verify ownership (unless admin)
    if (req.user.role === 'owner') {
      const check = await pool.query(
        `SELECT o.id FROM orders o JOIN shops s ON o.shop_id = s.id WHERE o.id = $1 AND s.owner_id = $2`,
        [id, req.user.id]
      );
      if (check.rows.length === 0) {
        return res.status(403).json({ success: false, message: 'Not your order' });
      }
    }

    const result = await pool.query(
      'UPDATE orders SET status = $1, updated_at = NOW() WHERE id = $2 RETURNING *',
      [status, id]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ success: false, message: 'Order not found' });
    }

    res.json({ success: true, order: result.rows[0] });
  } catch (err) {
    next(err);
  }
});

module.exports = router;
