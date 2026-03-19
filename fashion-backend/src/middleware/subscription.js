const pool = require('../db/pool');

/**
 * Block access to premium features if user has no active subscription
 */
async function requireSubscription(req, res, next) {
  if (!req.user) {
    return res.status(401).json({ success: false, message: 'Authentication required' });
  }

  const result = await pool.query(
    `SELECT id, payment_status, expiry_date
     FROM subscriptions
     WHERE user_id = $1
       AND payment_status = 'active'
       AND expiry_date > NOW()
     ORDER BY expiry_date DESC
     LIMIT 1`,
    [req.user.id]
  );

  if (result.rows.length === 0) {
    return res.status(402).json({
      success: false,
      code: 'SUBSCRIPTION_REQUIRED',
      message: 'An active subscription is required to access this feature.',
    });
  }

  req.subscription = result.rows[0];
  next();
}

/**
 * Attach subscription info to req without blocking (for dashboard / status)
 */
async function attachSubscription(req, res, next) {
  if (!req.user) return next();

  const result = await pool.query(
    `SELECT id, payment_status, start_date, expiry_date
     FROM subscriptions
     WHERE user_id = $1
     ORDER BY created_at DESC
     LIMIT 1`,
    [req.user.id]
  );

  req.subscription = result.rows[0] || null;
  next();
}

module.exports = { requireSubscription, attachSubscription };
