const express = require('express');
const crypto = require('crypto');
const pool = require('../db/pool');
const { authenticate, authorize } = require('../middleware/auth');

const router = express.Router();

const SNIPPE_API_BASE = process.env.SNIPPE_API_URL || 'https://api.snippe.sh/v1';
const BACKEND_URL = (process.env.BACKEND_URL || 'https://laundry-connect-backend.onrender.com').replace(/\/+$/, '');
const FRONTEND_URL = (process.env.FRONTEND_URL || 'https://laundry-connect-frontend-s33t.vercel.app').replace(/\/+$/, '');

/**
 * Format Tanzanian phone to international format for Snippe
 * "0768188065" -> "+255768188065"
 */
function formatPhone(phone) {
  if (!phone || typeof phone !== 'string') return phone;
  let cleaned = phone.replace(/[\s\-()]/g, '');
  if (cleaned.startsWith('0') && cleaned.length === 10) {
    return '+255' + cleaned.substring(1);
  }
  if (cleaned.startsWith('255') && !cleaned.startsWith('+')) {
    return '+' + cleaned;
  }
  if (!cleaned.startsWith('+')) {
    return '+' + cleaned;
  }
  return cleaned;
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
  const sigBuf = Buffer.from(signature, 'utf8');
  const expBuf = Buffer.from(expected, 'utf8');
  if (sigBuf.length !== expBuf.length) return false;
  return crypto.timingSafeEqual(sigBuf, expBuf);
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
router.post('/initiate', authenticate, authorize('customer', 'admin'), async (req, res, next) => {
  try {
    const { order_id, method, phone } = req.body;

    if (!order_id || !method) {
      return res.status(400).json({ success: false, message: 'order_id and method are required' });
    }

    const validMethods = ['mobile_money', 'mpesa', 'airtel', 'tigo', 'card', 'qr'];
    if (!validMethods.includes(method)) {
      return res.status(400).json({ success: false, message: 'Invalid payment method' });
    }

    // Validate phone for mobile money methods
    if (['mpesa', 'airtel', 'tigo', 'mobile_money'].includes(method)) {
      if (!phone || typeof phone !== 'string') {
        return res.status(400).json({ success: false, message: 'Phone number is required for mobile money payments' });
      }
      const cleanedPhone = phone.replace(/[\s\-()]/g, '');
      if (!/^(\+?255|0)\d{9}$/.test(cleanedPhone)) {
        return res.status(400).json({ success: false, message: 'Invalid Tanzanian phone number' });
      }
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
    const formattedPhone = formatPhone(phone);

    console.log('Payment initiate:', { order_id, method, snippeMethod, phone, formattedPhone, amount: order.total_amount });

    if (process.env.SNIPPE_API_KEY) {
      // ── Live Snippe API call ──────────────────────────
      const idempotencyKey = `order-${order.id}-${Date.now()}`;
      const webhookUrl = `${BACKEND_URL}/api/payments/webhook`;
      const callbackUrl = `${FRONTEND_URL}/order/${order.order_number}`;

      console.log('Snippe request:', { webhookUrl, callbackUrl, snippeMethod, formattedPhone });

      // Split full name into firstname/lastname for Snippe
      const nameParts = (user.full_name || '').trim().split(/\s+/);
      const firstname = nameParts[0] || 'Customer';
      const lastname = nameParts.slice(1).join(' ') || 'User';

      // Map frontend method to Snippe payment_type
      const paymentType = ['mpesa', 'airtel', 'tigo', 'mobile_money'].includes(method) ? 'mobile' : method === 'qr' ? 'qr' : 'card';

      const snippeBody = {
        payment_type: paymentType,
        details: {
          amount: Math.round(parseFloat(order.total_amount)),
          currency: 'TZS',
        },
        phone_number: formattedPhone || undefined,
        customer: {
          firstname,
          lastname,
          email: user.email,
        },
        webhook_url: webhookUrl,
        callback_url: callbackUrl,
        metadata: {
          order_id: order.id,
          order_number: order.order_number,
        },
        idempotency_key: idempotencyKey,
      };

      console.log('Snippe request body:', JSON.stringify(snippeBody));

      const snippeResponse = await fetch(`${SNIPPE_API_BASE}/payments`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${process.env.SNIPPE_API_KEY}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(snippeBody),
      });

      const snippeRawText = await snippeResponse.text();
      console.log('Snippe response status:', snippeResponse.status, '| Body:', snippeRawText);

      try {
        snippeData = JSON.parse(snippeRawText);
      } catch {
        console.error('Snippe returned non-JSON:', snippeRawText);
        return res.status(502).json({
          success: false,
          message: 'Payment gateway returned invalid response. Please try again.',
        });
      }

      if (!snippeResponse.ok) {
        console.error('Snippe API error:', snippeResponse.status, snippeData);
        return res.status(502).json({
          success: false,
          message: snippeData.message || snippeData.error || 'Payment gateway error. Please try again.',
        });
      }

      console.log('Snippe payment initiated:', snippeData.id, '| Amount:', order.total_amount, 'TZS');
    } else {
      // ── Test mode (no API key) — auto-complete payment after 3s ──
      console.log('SNIPPE_API_KEY not set — using test mode (auto-complete)');
      const testRef = `snp_test_${Date.now()}`;
      snippeData = {
        id: testRef,
        status: 'pending',
        message: snippeMethod === 'mobile_money'
          ? 'Test mode: USSD push simulated'
          : 'Test mode: payment simulated',
      };

      // Auto-complete the payment after 3 seconds (simulates Snippe webhook)
      setTimeout(async () => {
        try {
          await pool.query(
            `UPDATE orders SET payment_status = 'paid', payment_reference = $1, status = 'confirmed', updated_at = NOW()
             WHERE id = $2`,
            [testRef, order.id]
          );
          await pool.query(
            `UPDATE transactions SET status = 'completed' WHERE snippe_reference = $1`,
            [testRef]
          );
          console.log('Test payment auto-completed for order:', order.id);
        } catch (err) {
          console.error('Test payment auto-complete error:', err.message);
        }
      }, 3000);
    }

    // Record transaction — Snippe returns 'reference' or 'id'
    const snippeRef = snippeData.reference || snippeData.id;
    await pool.query(
      `INSERT INTO transactions (order_id, type, amount, status, snippe_reference)
       VALUES ($1, 'payment', $2, 'pending', $3)`,
      [order.id, order.total_amount, snippeRef]
    );

    res.json({
      success: true,
      message: snippeData.message || 'Payment initiated — check your phone for USSD prompt',
      payment: {
        reference: snippeRef,
        amount: order.total_amount,
        method: method,
        checkout_url: snippeData.payment_url || snippeData.checkout_url || null,
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
    const webhookSecret = process.env.SNIPPE_WEBHOOK_SECRET;

    if (webhookSecret && signature) {
      if (!verifyWebhookSignature(req.body, signature, webhookSecret)) {
        console.error('Webhook rejected: invalid signature');
        return res.status(401).json({ message: 'Invalid signature' });
      }
      console.log('Webhook signature verified');
    } else {
      console.warn('Webhook received without signature verification');
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

      await pool.query(
        `UPDATE orders SET payment_status = 'paid', payment_reference = $1, status = 'confirmed', updated_at = NOW()
         WHERE id = $2`,
        [snippeRef, metadata.order_id]
      );

      await pool.query(
        `UPDATE transactions SET status = 'completed' WHERE snippe_reference = $1`,
        [snippeRef]
      );

      const order = await pool.query('SELECT * FROM orders WHERE id = $1', [metadata.order_id]);
      if (order.rows[0]) {
        await pool.query(
          `INSERT INTO transactions (order_id, type, amount, status)
           VALUES ($1, 'commission', $2, 'completed')
           ON CONFLICT DO NOTHING`,
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

    res.status(200).json({ received: true });
  } catch (err) {
    console.error('Webhook error:', err.message);
    res.status(200).json({ received: true });
  }
});

// ── GET /api/payments/status/:reference — Check payment status ─
router.get('/status/:reference', authenticate, async (req, res, next) => {
  try {
    const { reference } = req.params;

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
