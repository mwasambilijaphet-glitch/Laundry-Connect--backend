const express = require('express');
const crypto = require('crypto');
const pool = require('../db/pool');
const { authenticate, authorize } = require('../middleware/auth');

const router = express.Router();

const SNIPPE_API_BASE = 'https://api.snippe.sh/v1';

/**
 * Verify Snippe webhook signature using HMAC-SHA256
 */
function verifyWebhookSignature(payload, signature, secret) {
  if (!signature || !secret) return false;
  const expected = crypto
    .createHmac('sha256', secret)
    .update(JSON.stringify(payload))
    .digest('hex');
  return crypto.timingSafeEqual(
    Buffer.from(signature, 'utf8'),
    Buffer.from(expected, 'utf8')
  );
}

/**
 * Map frontend payment method IDs to Snippe method values
 */
function mapPaymentMethod(method) {
  const mapping = {
    mobile_money: 'mobile_money',
    mpesa: 'mobile_money',
    airtel: 'mobile_money',
    tigo: 'mobile_money',
    card: 'card',
    qr: 'qr',
  };
  return mapping[method] || method;
}

// ── POST /api/payments/initiate — Start payment via Snippe ─
router.post('/initiate', authenticate, authorize('customer'), async (req, res, next) => {
  try {
    const { order_id, method, phone } = req.body;

    if (!order_id || !method) {
      return res.status(400).json({ success: false, message: 'order_id and method are required' });
    }

    const validMethods = ['mobile_money', 'mpesa', 'airtel', 'tigo', 'card', 'qr'];
    if (!validMethods.includes(method)) {
      return res.status(400).json({ success: false, message: 'Invalid payment method' });
    }

    // Get order
    const orderResult = await pool.query(
      'SELECT * FROM orders WHERE id = $1 AND customer_id = $2 AND payment_status = $3',
      [order_id, req.user.id, 'pending']
    );
    if (orderResult.rows.length === 0) {
      return res.status(404).json({ success: false, message: 'Order not found or already paid' });
    }
    const order = orderResult.rows[0];

    // Get user details for Snippe
    const userResult = await pool.query('SELECT full_name, email FROM users WHERE id = $1', [req.user.id]);
    const user = userResult.rows[0];

    let snippeData;
    const snippeMethod = mapPaymentMethod(method);

    if (process.env.SNIPPE_API_KEY) {
      // ── Live Snippe API call ──────────────────────────
      const idempotencyKey = `order-${order.id}-${Date.now()}`;

      const snippeResponse = await fetch(`${SNIPPE_API_BASE}/payments`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${process.env.SNIPPE_API_KEY}`,
          'Content-Type': 'application/json',
          'Idempotency-Key': idempotencyKey,
        },
        body: JSON.stringify({
          amount: parseFloat(order.total_amount),
          currency: 'TZS',
          phone: phone || undefined,
          method: snippeMethod,
          customer: {
            name: user.full_name,
            email: user.email,
          },
          webhook_url: `${process.env.BACKEND_URL}/api/payments/webhook`,
          callback_url: `${process.env.FRONTEND_URL}/order/${order.order_number}`,
          metadata: {
            order_id: order.id,
            order_number: order.order_number,
          },
          description: `Laundry Connect Order #${order.order_number}`,
        }),
      });

      snippeData = await snippeResponse.json();

      if (!snippeResponse.ok) {
        console.error('Snippe API error:', snippeData);
        return res.status(502).json({
          success: false,
          message: snippeData.message || 'Payment gateway error. Please try again.',
        });
      }

      console.log('Snippe payment initiated:', snippeData.id, '| Amount:', order.total_amount, 'TZS');
    } else {
      // ── Sandbox/test mode (no API key) ────────────────
      console.log('SNIPPE_API_KEY not set — using test mode');
      snippeData = {
        id: `snp_test_${Date.now()}`,
        status: 'pending',
        message: snippeMethod === 'mobile_money'
          ? 'USSD push sent to customer phone'
          : 'Redirect URL generated',
      };
    }

    // Record transaction
    await pool.query(
      `INSERT INTO transactions (order_id, type, amount, status, snippe_reference)
       VALUES ($1, 'payment', $2, 'pending', $3)`,
      [order.id, order.total_amount, snippeData.id]
    );

    res.json({
      success: true,
      message: snippeData.message || 'Payment initiated',
      payment: {
        reference: snippeData.id,
        amount: order.total_amount,
        method: method,
        checkout_url: snippeData.checkout_url || null,
      },
    });
  } catch (err) {
    next(err);
  }
});

// ── POST /api/payments/webhook — Snippe webhook handler ───
router.post('/webhook', async (req, res, next) => {
  try {
    // Verify webhook signature
    const signature = req.headers['x-snippe-signature'];
    const webhookSecret = process.env.SNIPPE_WEBHOOK_SECRET;

    if (webhookSecret && signature) {
      if (!verifyWebhookSignature(req.body, signature, webhookSecret)) {
        console.error('Webhook signature verification failed');
        return res.status(401).json({ message: 'Invalid signature' });
      }
    }

    const { event, data } = req.body;

    if (!event || !data) {
      return res.status(400).json({ message: 'Invalid webhook payload' });
    }

    console.log('Snippe webhook received:', event, '| Ref:', data.id);

    if (event === 'payment.completed') {
      const { metadata, id: snippeRef } = data;

      if (!metadata?.order_id) {
        return res.status(400).json({ message: 'Missing order_id in metadata' });
      }

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

      console.log('Payment completed for order:', metadata.order_id);
    }

    if (event === 'payment.failed') {
      const { metadata, id: snippeRef } = data;
      if (metadata?.order_id) {
        await pool.query(
          `UPDATE orders SET payment_status = 'failed', updated_at = NOW() WHERE id = $1`,
          [metadata.order_id]
        );
        await pool.query(
          `UPDATE transactions SET status = 'failed' WHERE snippe_reference = $1`,
          [snippeRef]
        );
        console.log('Payment failed for order:', metadata.order_id);
      }
    }

    // Always respond 200 to Snippe
    res.status(200).json({ received: true });
  } catch (err) {
    console.error('Webhook error:', err.message);
    res.status(200).json({ received: true }); // Still respond 200 to prevent retries
  }
});

// ── GET /api/payments/status/:reference — Check payment status ─
router.get('/status/:reference', authenticate, async (req, res, next) => {
  try {
    const { reference } = req.params;

    // Check local DB first
    const txResult = await pool.query(
      'SELECT * FROM transactions WHERE snippe_reference = $1',
      [reference]
    );

    if (txResult.rows.length === 0) {
      return res.status(404).json({ success: false, message: 'Transaction not found' });
    }

    const tx = txResult.rows[0];

    // If still pending and Snippe key is set, check with Snippe
    if (tx.status === 'pending' && process.env.SNIPPE_API_KEY) {
      try {
        const snippeRes = await fetch(`${SNIPPE_API_BASE}/payments/${reference}`, {
          headers: { 'Authorization': `Bearer ${process.env.SNIPPE_API_KEY}` },
        });
        const snippeData = await snippeRes.json();

        if (snippeData.status === 'completed') {
          await pool.query(`UPDATE transactions SET status = 'completed' WHERE id = $1`, [tx.id]);
          await pool.query(
            `UPDATE orders SET payment_status = 'paid', status = 'confirmed', updated_at = NOW() WHERE id = $1`,
            [tx.order_id]
          );
          tx.status = 'completed';
        } else if (snippeData.status === 'failed') {
          await pool.query(`UPDATE transactions SET status = 'failed' WHERE id = $1`, [tx.id]);
          await pool.query(`UPDATE orders SET payment_status = 'failed', updated_at = NOW() WHERE id = $1`, [tx.order_id]);
          tx.status = 'failed';
        }
      } catch (err) {
        console.error('Snippe status check error:', err.message);
      }
    }

    res.json({
      success: true,
      transaction: {
        reference: tx.snippe_reference,
        status: tx.status,
        amount: tx.amount,
        created_at: tx.created_at,
      },
    });
  } catch (err) {
    next(err);
  }
});

module.exports = router;
