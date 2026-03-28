const express = require('express');
const pool = require('../db/pool');
const { authenticate } = require('../middleware/auth');

const router = express.Router();

const REWARD_AMOUNT = 1000; // TZS 1,000 for both referrer and referred

/**
 * Generate a unique 6-character referral code
 */
function generateReferralCode() {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; // no I, O, 0, 1 to avoid confusion
  let code = '';
  for (let i = 0; i < 6; i++) {
    code += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return code;
}

// ── GET /api/referrals — Get my referral info ────────────
router.get('/', authenticate, async (req, res, next) => {
  try {
    // Get user's referral code and balance
    const userResult = await pool.query(
      'SELECT referral_code, referral_balance FROM users WHERE id = $1',
      [req.user.id]
    );

    if (userResult.rows.length === 0) {
      return res.status(404).json({ success: false, message: req.t('userNotFound') });
    }

    let { referral_code, referral_balance } = userResult.rows[0];

    // Generate code if user doesn't have one
    if (!referral_code) {
      let attempts = 0;
      while (attempts < 5) {
        referral_code = generateReferralCode();
        try {
          await pool.query('UPDATE users SET referral_code = $1 WHERE id = $2', [referral_code, req.user.id]);
          break;
        } catch (err) {
          if (err.code === '23505') { // unique violation
            attempts++;
            continue;
          }
          throw err;
        }
      }
    }

    // Get referral stats
    const statsResult = await pool.query(
      `SELECT
        COUNT(*) as total_referrals,
        COUNT(CASE WHEN referrer_earned = TRUE THEN 1 END) as earned_referrals,
        COALESCE(SUM(CASE WHEN referrer_earned = TRUE THEN reward_amount ELSE 0 END), 0) as total_earned
      FROM referrals WHERE referrer_id = $1`,
      [req.user.id]
    );

    // Get recent referrals
    const recentResult = await pool.query(
      `SELECT r.*, u.full_name as referred_name, u.created_at as joined_at
       FROM referrals r
       JOIN users u ON r.referred_id = u.id
       WHERE r.referrer_id = $1
       ORDER BY r.created_at DESC LIMIT 10`,
      [req.user.id]
    );

    const stats = statsResult.rows[0];

    res.json({
      success: true,
      referral_code,
      referral_balance: referral_balance || 0,
      reward_amount: REWARD_AMOUNT,
      stats: {
        total_referrals: parseInt(stats.total_referrals),
        earned_referrals: parseInt(stats.earned_referrals),
        total_earned: parseInt(stats.total_earned),
      },
      recent_referrals: recentResult.rows,
    });
  } catch (err) {
    next(err);
  }
});

// ── POST /api/referrals/apply — Apply a referral code ────
router.post('/apply', authenticate, async (req, res, next) => {
  try {
    const code = (req.body.code || '').trim().toUpperCase();

    if (!code || code.length < 4) {
      return res.status(400).json({ success: false, message: req.t('invalidReferralCode') });
    }

    // Check if user already has a referrer
    const userCheck = await pool.query(
      'SELECT referred_by FROM users WHERE id = $1',
      [req.user.id]
    );
    if (userCheck.rows[0]?.referred_by) {
      return res.status(400).json({ success: false, message: req.t('alreadyReferred') });
    }

    // Find referrer by code
    const referrerResult = await pool.query(
      'SELECT id, full_name FROM users WHERE referral_code = $1',
      [code]
    );
    if (referrerResult.rows.length === 0) {
      return res.status(404).json({ success: false, message: req.t('referralCodeNotFound') });
    }

    const referrer = referrerResult.rows[0];

    // Can't refer yourself
    if (referrer.id === req.user.id) {
      return res.status(400).json({ success: false, message: req.t('cannotReferSelf') });
    }

    // Create referral record and update both users
    const client = await pool.connect();
    try {
      await client.query('BEGIN');

      // Record the referral
      await client.query(
        `INSERT INTO referrals (referrer_id, referred_id, reward_amount, referrer_earned, referred_earned)
         VALUES ($1, $2, $3, TRUE, TRUE)`,
        [referrer.id, req.user.id, REWARD_AMOUNT]
      );

      // Credit both users
      await client.query(
        'UPDATE users SET referral_balance = referral_balance + $1 WHERE id = $2',
        [REWARD_AMOUNT, referrer.id]
      );
      await client.query(
        'UPDATE users SET referral_balance = referral_balance + $1, referred_by = $2 WHERE id = $3',
        [REWARD_AMOUNT, referrer.id, req.user.id]
      );

      await client.query('COMMIT');

      res.json({
        success: true,
        message: req.t('referralApplied', REWARD_AMOUNT),
        reward_amount: REWARD_AMOUNT,
        referrer_name: referrer.full_name,
      });
    } catch (err) {
      await client.query('ROLLBACK');
      if (err.code === '23505') { // unique violation on referred_id
        return res.status(400).json({ success: false, message: req.t('alreadyReferred') });
      }
      throw err;
    } finally {
      client.release();
    }
  } catch (err) {
    next(err);
  }
});

module.exports = router;
