const express = require('express');
const crypto = require('crypto');
const pool = require('../db/pool');
const { authenticate, authorize } = require('../middleware/auth');

function verifySignature(signature, rawBody, secret) {
  if (!signature || !secret) return false;
  const expected = crypto
    .createHmac('sha256', secret)
    .update(rawBody)
    .digest('hex');
  const sigBuffer = Buffer.from(signature);
  const expectedBuffer = Buffer.from(expected);
  if (sigBuffer.length !== expectedBuffer.length) return false;
  return crypto.timingSafeEqual(sigBuffer, expectedBuffer);
}

const router = express.Router();

// ── POST /api/payments/initiate — Start payment via Snippe ─
router.post('/initiate', authenticate, authorize('customer'), async (req, res, next) => {
  try {
    const { order_id, method, phone } = req.body;
    // method: 'mobile_money' | 'card' | 'qr'

    // Get order
    const orderResult = await pool.query(
      'SELECT * FROM orders WHERE id = $1 AND customer_id = $2 AND payment_status = $3',
      [order_id, req.user.id, 'pending']
    );
    if (orderResult.rows.length === 0) {
      return res.status(404).json({ success: false, message: 'Order not found or already paid' });
    }
    const order = orderResult.rows[0];

    // ── Call Snippe API ────────────────────────────────
    // IMPORTANT: Replace this with actual Snippe API call in production
    //
    // const snippeResponse = await fetch('https://api.snippe.sh/v1/payments', {
    //   method: 'POST',
    //   headers: {
    //     'Authorization': `Bearer ${process.env.SNIPPE_API_KEY}`,
    //     'Content-Type': 'application/json',
    //     'Idempotency-Key': `order-${order.id}-attempt-1`,
    //   },
    //   body: JSON.stringify({
    //     amount: order.total_amount,
    //     phone: phone,
    //     method: method,
    //     customer: { name: req.user.full_name, email: req.user.email },
    //     webhook_url: `${process.env.BACKEND_URL}/api/payments/webhook`,
    //     metadata: { order_id: order.id, order_number: order.order_number },
    //     description: `Laundry Connect Order #${order.order_number}`,
    //   }),
    // });
    // const snippeData = await snippeResponse.json();
    //
    // For now, simulate a successful payment initiation:
    const snippeData = {
      id: `snp_pay_${Date.now()}`,
      status: 'pending',
      message: method === 'mobile_money' 
        ? 'USSD push sent to customer phone' 
        : 'Redirect URL generated',
    };

    // Record transaction
    await pool.query(
      `INSERT INTO transactions (order_id, type, amount, status, snippe_reference)
       VALUES ($1, 'payment', $2, 'pending', $3)`,
      [order.id, order.total_amount, snippeData.id]
    );

    res.json({
      success: true,
      message: snippeData.message,
      payment: {
        reference: snippeData.id,
        amount: order.total_amount,
        method: method,
      },
    });
  } catch (err) {
    next(err);
  }
});

// ── POST /api/payments/webhook — Snippe webhook handler ───
router.post('/webhook', async (req, res, next) => {
  try {
    const signature = req.headers['x-snippe-signature'];
    if (!verifySignature(signature, req.body, process.env.SNIPPE_WEBHOOK_SECRET)) {
      return res.status(401).json({ message: 'Invalid signature' });
    }

    const payload = JSON.parse(req.body);
    const { event, data } = payload;

    console.log(`📨 Snippe webhook: ${event}`, data);

    if (event === 'payment.completed') {
      const { metadata, id: snippeRef } = data;

      // Update order payment status
      await pool.query(
        `UPDATE orders SET payment_status = 'paid', payment_reference = $1, status = 'confirmed', updated_at = NOW()
         WHERE id = $2`,
        [snippeRef, metadata.order_id]
      );

      // Update transaction
      await pool.query(
        `UPDATE transactions SET status = 'completed' WHERE snippe_reference = $1`,
        [snippeRef]
      );

      // Create commission transaction
      const order = await pool.query('SELECT * FROM orders WHERE id = $1', [metadata.order_id]);
      if (order.rows[0]) {
        await pool.query(
          `INSERT INTO transactions (order_id, type, amount, status)
           VALUES ($1, 'commission', $2, 'completed')`,
          [metadata.order_id, order.rows[0].platform_commission]
        );
      }

      console.log(`✅ Payment confirmed for order ${metadata.order_id}`);
    }

    if (event === 'payment.failed') {
      const { metadata, id: snippeRef } = data;
      await pool.query(
        `UPDATE orders SET payment_status = 'failed', updated_at = NOW() WHERE id = $1`,
        [metadata.order_id]
      );
      await pool.query(
        `UPDATE transactions SET status = 'failed' WHERE snippe_reference = $1`,
        [snippeRef]
      );
      console.log(`❌ Payment failed for order ${metadata.order_id}`);
    }

    // Always respond 200 to Snippe
    res.status(200).json({ received: true });
  } catch (err) {
    console.error('Webhook error:', err.message);
    res.status(200).json({ received: true }); // Still respond 200 to prevent retries
  }
});

module.exports = router;
