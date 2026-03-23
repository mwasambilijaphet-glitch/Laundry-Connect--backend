const express = require('express');
const crypto = require('crypto');
const pool = require('../db/pool');
const { authenticate, authorize } = require('../middleware/auth');

const router = express.Router();

const SNIPPE_API_BASE = 'https://api.snippe.sh/api/v1';

// Snippe requires HTTPS for webhooks — in dev, skip webhook or use a tunnel URL
function getWebhookUrl(path) {
  const base = process.env.WEBHOOK_URL || process.env.BACKEND_URL || 'http://localhost:5000';
  // Snippe rejects http:// webhook URLs, so omit in dev
  if (base.startsWith('http://')) return undefined;
  return `${base}${path}`;
}

/**
 * Verify Snippe webhook signature using HMAC-SHA256
 */
function verifyWebhookSignature(payload, signature, secret) {
  if (!signature || !secret) return false;
  const expected = crypto
    .createHmac('sha256', secret)
    .update(JSON.stringify(payload))
    .digest('hex');
  // SECURITY FIX: timingSafeEqual crashes if buffers differ in length
  const sigBuf = Buffer.from(signature, 'utf8');
  const expBuf = Buffer.from(expected, 'utf8');
  if (sigBuf.length !== expBuf.length) return false;
  return crypto.timingSafeEqual(sigBuf, expBuf);
}

/**
 * Map frontend payment method IDs to Snippe payment_type values
 * Snippe types: "mobile", "card", "dynamic-qr"
 */
function mapPaymentType(method) {
  const mapping = {
    mobile_money: 'mobile',
    mpesa: 'mobile',
    airtel: 'mobile',
    tigo: 'mobile',
    card: 'card',
    qr: 'dynamic-qr',
  };
  return mapping[method] || 'mobile';
}

// ── POST /api/payments/initiate — Start payment via Snippe ─
router.post('/initiate', authenticate, authorize('customer'), async (req, res, next) => {
  try {
    const { order_id, method, phone } = req.body;

    if (!order_id || !method) {
      return res.status(400).json({ success: false, message: 'order_id and method are required' });
    }

    const validMethods = ['mobile_money', 'mpesa', 'airtel', 'tigo', 'card', 'qr', 'cash'];
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

    // ── Cash payment — skip gateway, mark as cash ─────────
    if (method === 'cash') {
      await pool.query(
        `UPDATE orders SET payment_status = 'cash', payment_method = 'cash', status = 'confirmed', updated_at = NOW()
         WHERE id = $1`,
        [order.id]
      );

      // Record transaction with pending commission
      await pool.query(
        `INSERT INTO transactions (order_id, type, amount, status, snippe_reference)
         VALUES ($1, 'payment', $2, 'cash', $3)`,
        [order.id, order.total_amount, `cash_${order.id}_${Date.now()}`]
      );

      // Record pending commission the owner owes
      await pool.query(
        `INSERT INTO transactions (order_id, type, amount, status)
         VALUES ($1, 'commission', $2, 'pending')`,
        [order.id, order.platform_commission]
      );

      console.log('Cash payment recorded for order:', order.order_number, '| Commission owed:', order.platform_commission, 'TZS');

      return res.json({
        success: true,
        message: 'Order confirmed. Customer will pay cash on delivery.',
        payment: {
          reference: `cash_${order.id}`,
          amount: order.total_amount,
          method: 'cash',
          commission_owed: order.platform_commission,
        },
      });
    }

    // Get user details for Snippe
    const userResult = await pool.query('SELECT full_name, email, phone AS user_phone FROM users WHERE id = $1', [req.user.id]);
    const user = userResult.rows[0];

    // Split full_name into firstname/lastname for Snippe
    const nameParts = (user.full_name || 'Customer').split(' ');
    const firstname = nameParts[0];
    const lastname = nameParts.slice(1).join(' ') || firstname;

    // Format phone for Snippe (0712345678 format)
    const paymentPhone = phone || user.user_phone || '';

    let snippeData;
    const paymentType = mapPaymentType(method);

    if (process.env.SNIPPE_API_KEY) {
      // ── Live Snippe API call ──────────────────────────
      // Docs: https://docs.snippe.sh/docs/2026-01-25
      // SDK ref: https://github.com/Neurotech-HQ/snippe-python-sdk
      const idempotencyKey = `order-${order.id}-${Date.now()}`;

      const snippeBody = {
        payment_type: paymentType,
        details: {
          amount: Math.round(parseFloat(order.total_amount)),
          currency: 'TZS',
          callback_url: `${process.env.FRONTEND_URL}/order/${order.order_number}`,
        },
        phone_number: paymentPhone,
        customer: {
          firstname,
          lastname,
          email: user.email,
        },
        webhook_url: getWebhookUrl('/api/payments/webhook'),
        metadata: {
          order_id: String(order.id),
          order_number: order.order_number,
        },
      };

      console.log('Snippe request:', JSON.stringify(snippeBody, null, 2));

      const snippeResponse = await fetch(`${SNIPPE_API_BASE}/payments`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${process.env.SNIPPE_API_KEY}`,
          'Content-Type': 'application/json',
          'Idempotency-Key': idempotencyKey,
        },
        body: JSON.stringify(snippeBody),
      });

      snippeData = await snippeResponse.json();

      if (!snippeResponse.ok) {
        console.error('Snippe API error:', snippeResponse.status, snippeData);
        return res.status(502).json({
          success: false,
          message: snippeData.message || 'Payment gateway error. Please try again.',
        });
      }

      // Snippe returns { status: "success", data: { reference, status, payment_url, ... } }
      const paymentData = snippeData.data || snippeData;
      console.log('Snippe payment initiated:', paymentData.reference, '| Amount:', order.total_amount, 'TZS');

      // Normalize for our DB
      snippeData = {
        id: paymentData.reference || paymentData.id,
        status: paymentData.status,
        message: paymentType === 'mobile' ? 'USSD push sent to your phone' : 'Payment initiated',
        checkout_url: paymentData.payment_url || null,
        qr_code: paymentData.payment_qr_code || null,
      };
    } else {
      // ── Sandbox/test mode (no API key) ────────────────
      console.log('SNIPPE_API_KEY not set — using test mode');
      snippeData = {
        id: `snp_test_${Date.now()}`,
        status: 'pending',
        message: paymentType === 'mobile'
          ? 'USSD push sent to customer phone'
          : 'Redirect URL generated',
        checkout_url: null,
        qr_code: null,
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
        qr_code: snippeData.qr_code || null,
      },
    });
  } catch (err) {
    next(err);
  }
});

// ── POST /api/payments/webhook — Snippe webhook handler ───
router.post('/webhook', async (req, res, next) => {
  try {
    // Verify webhook signature (SECURITY: reject if secret is set but signature missing/invalid)
    const signature = req.headers['x-snippe-signature'];
    const webhookSecret = process.env.SNIPPE_WEBHOOK_SECRET;

    if (webhookSecret) {
      if (!signature) {
        console.error('Webhook rejected: missing signature header');
        return res.status(401).json({ message: 'Missing signature' });
      }
      if (!verifyWebhookSignature(req.body, signature, webhookSecret)) {
        console.error('Webhook rejected: invalid signature');
        return res.status(401).json({ message: 'Invalid signature' });
      }
    }

    const { event, data } = req.body;

    if (!event || !data) {
      return res.status(400).json({ message: 'Invalid webhook payload' });
    }

    console.log('Snippe webhook received:', event, '| Ref:', data.reference || data.id);

    if (event === 'payment.completed') {
      const snippeRef = data.reference || data.id;
      const { metadata } = data;

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
      const snippeRef = data.reference || data.id;
      const { metadata } = data;
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

// ── POST /api/payments/commission-webhook — Commission settlement webhook ─
router.post('/commission-webhook', async (req, res) => {
  try {
    const signature = req.headers['x-snippe-signature'];
    const webhookSecret = process.env.SNIPPE_WEBHOOK_SECRET;

    if (webhookSecret) {
      if (!signature || !verifyWebhookSignature(req.body, signature, webhookSecret)) {
        return res.status(401).json({ message: 'Invalid signature' });
      }
    }

    const { event, data } = req.body;

    if (event === 'payment.completed' && data.metadata?.type === 'commission_settlement') {
      const txIds = data.metadata.transaction_ids;
      if (txIds && txIds.length > 0) {
        await pool.query(
          `UPDATE transactions SET status = 'completed' WHERE id = ANY($1)`,
          [txIds]
        );
        console.log('Commission settled for shop:', data.metadata.shop_id, '| Txs:', txIds.length);
      }
    }

    res.status(200).json({ received: true });
  } catch (err) {
    console.error('Commission webhook error:', err.message);
    res.status(200).json({ received: true });
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
        const snippeJson = await snippeRes.json();
        const snippeData = snippeJson.data || snippeJson;

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
