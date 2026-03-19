const express = require('express');
const { body, validationResult } = require('express-validator');
const pool = require('../db/pool');
const { authenticate } = require('../middleware/auth');
const { initiatePayment, getPaymentStatus, verifyWebhookSignature } = require('../services/snippe');
const { sendSubscriptionConfirmation } = require('../services/email');

const router = express.Router();

const SUBSCRIPTION_AMOUNT = Number(process.env.SUBSCRIPTION_AMOUNT) || 5000;
const SUBSCRIPTION_DAYS = Number(process.env.SUBSCRIPTION_DURATION_DAYS) || 7;

// ── POST /api/payments/subscribe — Initiate subscription payment ──────────
router.post(
  '/subscribe',
  authenticate,
  [
    body('phone')
      .matches(/^(\+?255|0)[67]\d{8}$/)
      .withMessage('Enter a valid Tanzanian phone number (e.g. 0712345678)'),
  ],
  async (req, res, next) => {
    try {
      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        return res.status(422).json({ success: false, errors: errors.array() });
      }

      const { phone } = req.body;
      const user = req.user;

      // Check if user already has an active subscription
      const activeSub = await pool.query(
        `SELECT id, expiry_date FROM subscriptions
         WHERE user_id = $1 AND payment_status = 'active' AND expiry_date > NOW()
         LIMIT 1`,
        [user.id]
      );
      if (activeSub.rows.length > 0) {
        return res.status(400).json({
          success: false,
          message: 'You already have an active subscription.',
          expiryDate: activeSub.rows[0].expiry_date,
        });
      }

      // Create a pending subscription record
      const subResult = await pool.query(
        `INSERT INTO subscriptions (user_id, amount, currency, phone, payment_status)
         VALUES ($1, $2, 'TZS', $3, 'pending')
         RETURNING id`,
        [user.id, SUBSCRIPTION_AMOUNT, phone]
      );
      const subscriptionId = subResult.rows[0].id;

      // Initiate payment via Snippe
      const snippeData = await initiatePayment({
        orderId: subscriptionId,
        amount: SUBSCRIPTION_AMOUNT,
        phone,
        customerName: user.full_name,
        customerEmail: user.email,
        description: `Fashion.co.tz Weekly Subscription — ${user.full_name}`,
      });

      // Store Snippe reference
      await pool.query(
        `UPDATE subscriptions SET snippe_reference = $1, snippe_payload = $2 WHERE id = $3`,
        [snippeData.id, JSON.stringify(snippeData), subscriptionId]
      );

      res.json({
        success: true,
        message: 'Payment initiated. Check your phone for the M-Pesa prompt.',
        subscriptionId,
        snippeReference: snippeData.id,
        amount: SUBSCRIPTION_AMOUNT,
        currency: 'TZS',
      });
    } catch (err) {
      next(err);
    }
  }
);

// ── GET /api/payments/status/:subscriptionId — Poll payment status ────────
router.get('/status/:subscriptionId', authenticate, async (req, res, next) => {
  try {
    const { subscriptionId } = req.params;

    const subResult = await pool.query(
      `SELECT * FROM subscriptions WHERE id = $1 AND user_id = $2`,
      [subscriptionId, req.user.id]
    );
    if (subResult.rows.length === 0) {
      return res.status(404).json({ success: false, message: 'Subscription not found' });
    }

    const sub = subResult.rows[0];

    // If still pending, poll Snippe
    if (sub.payment_status === 'pending' && sub.snippe_reference) {
      try {
        const snippeStatus = await getPaymentStatus(sub.snippe_reference);

        if (snippeStatus.status === 'completed' || snippeStatus.status === 'successful') {
          const now = new Date();
          const expiry = new Date(now.getTime() + SUBSCRIPTION_DAYS * 24 * 60 * 60 * 1000);

          await pool.query(
            `UPDATE subscriptions
             SET payment_status = 'active', start_date = $1, expiry_date = $2, updated_at = NOW()
             WHERE id = $3`,
            [now, expiry, sub.id]
          );

          await sendSubscriptionConfirmation(req.user.email, req.user.full_name, expiry).catch(() => {});

          return res.json({
            success: true,
            status: 'active',
            startDate: now,
            expiryDate: expiry,
          });
        }

        if (snippeStatus.status === 'failed' || snippeStatus.status === 'cancelled') {
          await pool.query(
            `UPDATE subscriptions SET payment_status = 'failed', updated_at = NOW() WHERE id = $1`,
            [sub.id]
          );
          return res.json({ success: false, status: 'failed', message: 'Payment failed or was cancelled.' });
        }
      } catch {
        // If Snippe poll fails, return current DB state
      }
    }

    res.json({
      success: true,
      status: sub.payment_status,
      startDate: sub.start_date,
      expiryDate: sub.expiry_date,
    });
  } catch (err) {
    next(err);
  }
});

// ── GET /api/payments/my-subscription — Current user's active subscription ─
router.get('/my-subscription', authenticate, async (req, res, next) => {
  try {
    const result = await pool.query(
      `SELECT id, payment_status, amount, currency, start_date, expiry_date, created_at
       FROM subscriptions
       WHERE user_id = $1
       ORDER BY created_at DESC
       LIMIT 1`,
      [req.user.id]
    );

    const subscription = result.rows[0] || null;
    const isActive = subscription?.payment_status === 'active' && new Date(subscription.expiry_date) > new Date();

    res.json({
      success: true,
      subscription,
      isActive,
    });
  } catch (err) {
    next(err);
  }
});

// ── POST /api/payments/webhook — Snippe webhook handler ──────────────────
// Uses express.raw() middleware (set in server.js for this route)
router.post('/webhook', async (req, res) => {
  try {
    const signature = req.headers['x-snippe-signature'];

    if (!verifyWebhookSignature(req.body, signature)) {
      console.warn('Webhook: Invalid signature rejected');
      return res.status(401).json({ message: 'Invalid signature' });
    }

    const payload = JSON.parse(req.body);
    const { event, data } = payload;

    console.log(`Snippe webhook: ${event}`, data?.id);

    if (event === 'payment.completed' || event === 'payment.successful') {
      const { metadata, id: snippeRef } = data;
      const subscriptionId = metadata?.subscription_id;

      if (!subscriptionId) {
        console.warn('Webhook: No subscription_id in metadata');
        return res.status(200).json({ received: true });
      }

      const now = new Date();
      const expiry = new Date(now.getTime() + SUBSCRIPTION_DAYS * 24 * 60 * 60 * 1000);

      await pool.query(
        `UPDATE subscriptions
         SET payment_status = 'active',
             payment_reference = $1,
             start_date = $2,
             expiry_date = $3,
             updated_at = NOW()
         WHERE id = $4`,
        [snippeRef, now, expiry, subscriptionId]
      );

      // Send confirmation email
      const userResult = await pool.query(
        `SELECT u.email, u.full_name FROM users u
         JOIN subscriptions s ON s.user_id = u.id
         WHERE s.id = $1`,
        [subscriptionId]
      );
      if (userResult.rows[0]) {
        const { email, full_name } = userResult.rows[0];
        await sendSubscriptionConfirmation(email, full_name, expiry).catch(() => {});
      }

      console.log(`Subscription activated: ${subscriptionId} expires ${expiry.toISOString()}`);
    }

    if (event === 'payment.failed' || event === 'payment.cancelled') {
      const { metadata } = data;
      if (metadata?.subscription_id) {
        await pool.query(
          `UPDATE subscriptions SET payment_status = 'failed', updated_at = NOW() WHERE id = $1`,
          [metadata.subscription_id]
        );
        console.log(`Subscription payment failed: ${metadata.subscription_id}`);
      }
    }

    res.status(200).json({ received: true });
  } catch (err) {
    console.error('Webhook error:', err.message);
    res.status(200).json({ received: true }); // Always 200 to prevent retries
  }
});

module.exports = router;
