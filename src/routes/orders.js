const express = require('express');
const crypto = require('crypto');
const { Resend } = require('resend');
const pool = require('../db/pool');
const { authenticate, authorize } = require('../middleware/auth');
const { sendSMS } = require('../services/nextsms');
const { getTranslator } = require('../i18n');

const router = express.Router();

// ── Email via Resend (for order status notifications) ──────
const resendApiKey = process.env.RESEND_API_KEY;
const resend = resendApiKey ? new Resend(resendApiKey) : null;
const emailFrom = process.env.EMAIL_FROM || 'Laundry Connect <info@laundryconnect.app>';
const frontendUrl = (process.env.FRONTEND_URL || 'https://laundry-connect-frontend-s33t.vercel.app').replace(/\/+$/, '');

async function sendOrderStatusEmail(email, orderNumber, shopName, status) {
  if (!resend || !email) return;

  const statusInfo = {
    confirmed: { title: 'Order Confirmed ✅', message: 'Your order has been confirmed and the shop is preparing to collect your items.', color: '#16a34a', emoji: '✅' },
    picked_up: { title: 'Clothes Picked Up 🚗', message: 'Your clothes have been picked up and are on the way to the laundry shop.', color: '#d97706', emoji: '🚗' },
    washing: { title: 'Washing In Progress 🫧', message: 'Your clothes are being washed right now. Sit back and relax!', color: '#2563eb', emoji: '🫧' },
    ready: { title: 'Clothes Ready ✨', message: 'Your clothes are clean and ready! They will be delivered soon.', color: '#16a34a', emoji: '✨' },
    out_for_delivery: { title: 'Out for Delivery 🛵', message: 'Your clothes are on the way to you right now!', color: '#d97706', emoji: '🛵' },
    delivered: { title: 'Order Delivered 🎉', message: 'Your clothes have been delivered. Thank you for using Laundry Connect!', color: '#16a34a', emoji: '🎉' },
    cancelled: { title: 'Order Cancelled ❌', message: 'Your order has been cancelled. If this was unexpected, please contact the shop.', color: '#dc2626', emoji: '❌' },
  };

  const info = statusInfo[status];
  if (!info) return;

  const steps = [
    { id: 'placed', label: '📋 New', done: false },
    { id: 'confirmed', label: '✅ Confirmed', done: false },
    { id: 'picked_up', label: '🚗 Picked Up', done: false },
    { id: 'washing', label: '🫧 Washing', done: false },
    { id: 'ready', label: '✨ Ready', done: false },
    { id: 'out_for_delivery', label: '🛵 Delivering', done: false },
    { id: 'delivered', label: '🎉 Delivered', done: false },
  ];

  const statusOrder = steps.map(s => s.id);
  const currentIndex = statusOrder.indexOf(status);
  const stepsHtml = steps.map((step, i) => {
    const isPast = i <= currentIndex;
    const isCurrent = i === currentIndex;
    const bg = isCurrent ? info.color : isPast ? '#22c55e' : '#e2e8f0';
    const textColor = isPast ? '#ffffff' : '#94a3b8';
    return `<span style="display:inline-block;padding:6px 12px;margin:3px;border-radius:20px;font-size:12px;font-weight:600;background:${bg};color:${textColor};">${step.label}</span>`;
  }).join('');

  const trackUrl = `${frontendUrl}/order/${orderNumber}`;

  try {
    await resend.emails.send({
      from: emailFrom,
      to: email,
      subject: `${info.emoji} ${info.title} — Order ${orderNumber}`,
      html: `
        <div style="font-family:'Segoe UI',sans-serif;max-width:500px;margin:0 auto;padding:0;">
          <div style="background:linear-gradient(135deg,#0f172a,#1e293b);padding:24px;border-radius:16px 16px 0 0;text-align:center;">
            <h2 style="color:#22c55e;margin:0;font-size:20px;">Laundry<span style="color:#4ade80;">Connect</span></h2>
          </div>
          <div style="background:#ffffff;padding:24px;border:1px solid #e2e8f0;">
            <div style="text-align:center;margin-bottom:20px;">
              <span style="font-size:48px;">${info.emoji}</span>
              <h3 style="color:#1e293b;margin:8px 0 4px;">${info.title}</h3>
              <p style="color:#64748b;font-size:14px;margin:0;">${info.message}</p>
            </div>
            <div style="background:#f8fafc;border-radius:12px;padding:16px;margin:16px 0;">
              <p style="color:#64748b;font-size:12px;margin:0 0 4px;font-weight:600;">ORDER DETAILS</p>
              <p style="color:#1e293b;font-size:14px;margin:2px 0;"><strong>Order:</strong> ${orderNumber}</p>
              <p style="color:#1e293b;font-size:14px;margin:2px 0;"><strong>Shop:</strong> ${shopName}</p>
            </div>
            <div style="margin:20px 0;">
              <p style="color:#64748b;font-size:12px;margin:0 0 8px;font-weight:600;">ORDER PROGRESS</p>
              <div style="text-align:center;">${stepsHtml}</div>
            </div>
            <div style="text-align:center;margin-top:20px;">
              <a href="${trackUrl}" style="display:inline-block;background:#7c3aed;color:#ffffff;padding:12px 32px;border-radius:12px;font-weight:bold;font-size:14px;text-decoration:none;">Track Your Order</a>
            </div>
          </div>
          <div style="background:#f8fafc;padding:16px;border-radius:0 0 16px 16px;text-align:center;border:1px solid #e2e8f0;border-top:0;">
            <p style="color:#94a3b8;font-size:11px;margin:0;">Laundry Connect — Tanzania's #1 Laundry Marketplace</p>
          </div>
        </div>
      `,
    });
    console.log('Order status email sent to:', email, '| Status:', status);
  } catch (err) {
    console.error('Failed to send order status email:', err.message);
  }
}

function generateOrderNumber() {
  const year = new Date().getFullYear();
  const rand = crypto.randomInt(100000, 999999);
  return `LC-${year}-${rand}`;
}

// ── POST /api/orders — Place a new order ──────────────────
router.post('/', authenticate, authorize('customer', 'admin'), async (req, res, next) => {
  const client = await pool.connect();

  try {
    const { shop_id, items, delivery_address, delivery_zone_id, delivery_area, special_instructions, pickup_time_slot, delivery_time_slot } = req.body;

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

    // Get delivery fee — from zone or manual area-based lookup
    let deliveryFee = 0;
    if (delivery_zone_id) {
      const zone = await client.query('SELECT fee FROM delivery_zones WHERE id = $1 AND shop_id = $2', [delivery_zone_id, shop_id]);
      if (zone.rows[0]) deliveryFee = zone.rows[0].fee;
    } else if (delivery_area) {
      // Try to match area to a delivery zone by name
      const zone = await client.query(
        'SELECT fee FROM delivery_zones WHERE shop_id = $1 AND LOWER(zone_name) LIKE $2 LIMIT 1',
        [shop_id, `%${delivery_area.toLowerCase()}%`]
      );
      if (zone.rows[0]) {
        deliveryFee = zone.rows[0].fee;
      } else {
        // Default delivery fee if area doesn't match any zone
        const defaultZone = await client.query(
          'SELECT fee FROM delivery_zones WHERE shop_id = $1 ORDER BY fee DESC LIMIT 1',
          [shop_id]
        );
        deliveryFee = defaultZone.rows[0]?.fee || 3000;
      }
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
          `INSERT INTO orders (order_number, customer_id, shop_id, subtotal, delivery_fee, platform_commission, total_amount, delivery_address, special_instructions, pickup_time_slot, delivery_time_slot)
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
           RETURNING *`,
          [orderNumber, req.user.id, shop_id, subtotal, deliveryFee, platformCommission, totalAmount, delivery_address, special_instructions || null, pickup_time_slot || null, delivery_time_slot || null]
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

    // Send SMS notifications (fire and forget)
    try {
      // Notify customer — order placed
      const customer = await pool.query('SELECT phone FROM users WHERE id = $1', [req.user.id]);
      if (customer.rows[0]?.phone) {
        const shopInfo = await pool.query('SELECT name FROM shops WHERE id = $1', [shop_id]);
        const t = getTranslator('sw');
        sendSMS(customer.rows[0].phone, t('smsOrderPlaced', order.order_number, shopInfo.rows[0]?.name || 'Shop'));
      }

      // Notify shop owner — new order
      const owner = await pool.query(
        'SELECT u.phone FROM users u JOIN shops s ON s.owner_id = u.id WHERE s.id = $1',
        [shop_id]
      );
      if (owner.rows[0]?.phone) {
        const itemCount = orderItems.reduce((sum, i) => sum + i.quantity, 0);
        const t = getTranslator('sw');
        sendSMS(owner.rows[0].phone, t('smsNewOrder', order.order_number, itemCount, totalAmount.toLocaleString()));
      }
    } catch (smsErr) {
      console.error('SMS notification error (non-fatal):', smsErr.message);
    }

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

    const order = result.rows[0];

    // Create in-app notification for customer
    try {
      const shop = await pool.query('SELECT name FROM shops WHERE id = $1', [order.shop_id]);
      const shopName = shop.rows[0]?.name || 'Shop';
      const statusLabels = {
        confirmed: 'Order Confirmed',
        picked_up: 'Clothes Picked Up',
        washing: 'Washing In Progress',
        ready: 'Ready for Delivery',
        out_for_delivery: 'Out for Delivery',
        delivered: 'Order Delivered',
        cancelled: 'Order Cancelled',
      };
      await pool.query(
        `INSERT INTO notifications (user_id, type, title, message, data) VALUES ($1, $2, $3, $4, $5)`,
        [
          order.customer_id,
          'order_status',
          statusLabels[status] || 'Order Update',
          `Your order ${order.order_number} at ${shopName} has been updated to: ${statusLabels[status] || status}`,
          JSON.stringify({ order_id: order.id, order_number: order.order_number, status }),
        ]
      );
    } catch (notifErr) {
      console.error('Failed to create notification:', notifErr);
    }

    // Send SMS + Email notifications to customer (fire and forget)
    try {
      const customer = await pool.query('SELECT phone, email FROM users WHERE id = $1', [order.customer_id]);
      const shop = await pool.query('SELECT name, phone FROM shops WHERE id = $1', [order.shop_id]);
      const customerPhone = customer.rows[0]?.phone;
      const customerEmail = customer.rows[0]?.email;
      const shopName = shop.rows[0]?.name || 'Shop';
      const shopPhone = shop.rows[0]?.phone || '';

      // Send email notification (fire and forget)
      if (customerEmail) {
        sendOrderStatusEmail(customerEmail, order.order_number, shopName, status);
      }

      if (customerPhone) {
        const t = getTranslator('sw');
        const smsMap = {
          confirmed: t('smsOrderConfirmed', order.order_number, shopName),
          picked_up: t('smsOrderPickedUp', order.order_number),
          washing: t('smsOrderWashing', order.order_number),
          ready: t('smsOrderReady', order.order_number, shopPhone),
          delivered: t('smsOrderDelivered', order.order_number),
          cancelled: t('smsOrderCancelled', order.order_number),
        };

        if (smsMap[status]) {
          sendSMS(customerPhone, smsMap[status]);
        }
      }
    } catch (smsErr) {
      console.error('SMS notification error (non-fatal):', smsErr.message);
    }

    res.json({ success: true, order });
  } catch (err) {
    next(err);
  }
});

// ── POST /api/orders/:id/review — Submit a review for a delivered order ──
router.post('/:id/review', authenticate, authorize('customer', 'admin'), async (req, res, next) => {
  try {
    const { id } = req.params;
    const { rating, comment } = req.body;

    if (!rating || rating < 1 || rating > 5) {
      return res.status(400).json({ success: false, message: 'Rating must be between 1 and 5' });
    }

    // Verify this is the customer's order and it's delivered
    const orderResult = await pool.query(
      'SELECT * FROM orders WHERE id = $1 AND customer_id = $2',
      [id, req.user.id]
    );

    if (orderResult.rows.length === 0) {
      return res.status(404).json({ success: false, message: 'Order not found' });
    }

    const order = orderResult.rows[0];

    if (order.status !== 'delivered') {
      return res.status(400).json({ success: false, message: 'Can only review delivered orders' });
    }

    // Check if already reviewed
    const existing = await pool.query(
      'SELECT id FROM reviews WHERE order_id = $1 AND customer_id = $2',
      [id, req.user.id]
    );

    if (existing.rows.length > 0) {
      return res.status(400).json({ success: false, message: 'You have already reviewed this order' });
    }

    // Create review
    const review = await pool.query(
      `INSERT INTO reviews (order_id, customer_id, shop_id, rating, comment)
       VALUES ($1, $2, $3, $4, $5) RETURNING *`,
      [id, req.user.id, order.shop_id, rating, comment || null]
    );

    // Update shop rating
    const ratingResult = await pool.query(
      'SELECT AVG(rating)::numeric(2,1) as avg_rating, COUNT(*) as count FROM reviews WHERE shop_id = $1',
      [order.shop_id]
    );

    await pool.query(
      'UPDATE shops SET rating_avg = $1, total_reviews = $2 WHERE id = $3',
      [ratingResult.rows[0].avg_rating, ratingResult.rows[0].count, order.shop_id]
    );

    res.status(201).json({ success: true, review: review.rows[0] });
  } catch (err) {
    next(err);
  }
});

module.exports = router;
