/**
 * LAUNDRY CONNECT — Add Referral System
 *
 * Run: node src/db/add-referrals.js
 *
 * Adds referral_code, referral_balance to users table
 * Creates referrals tracking table
 * Safe to run multiple times (uses IF NOT EXISTS)
 */
require('dotenv').config();
const pool = require('./pool');

const migration = `
-- Add referral columns to users (safe, won't error if already exists)
DO $$ BEGIN
  ALTER TABLE users ADD COLUMN referral_code VARCHAR(10) UNIQUE;
  EXCEPTION WHEN duplicate_column THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE users ADD COLUMN referral_balance INTEGER DEFAULT 0;
  EXCEPTION WHEN duplicate_column THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE users ADD COLUMN referred_by INTEGER REFERENCES users(id);
  EXCEPTION WHEN duplicate_column THEN NULL;
END $$;

-- Generate referral codes for existing users who don't have one
UPDATE users SET referral_code = UPPER(SUBSTRING(MD5(id::text || phone || created_at::text) FROM 1 FOR 6))
WHERE referral_code IS NULL;

-- Referrals tracking table
CREATE TABLE IF NOT EXISTS referrals (
  id              SERIAL PRIMARY KEY,
  referrer_id     INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  referred_id     INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  reward_amount   INTEGER NOT NULL DEFAULT 1000,
  referrer_earned BOOLEAN DEFAULT FALSE,
  referred_earned BOOLEAN DEFAULT FALSE,
  created_at      TIMESTAMP DEFAULT NOW(),
  UNIQUE(referred_id)
);

-- Index for fast lookups
CREATE INDEX IF NOT EXISTS idx_referrals_referrer ON referrals(referrer_id);
CREATE INDEX IF NOT EXISTS idx_users_referral_code ON users(referral_code);
`;

async function run() {
  try {
    console.log('Running referral system migration...');
    await pool.query(migration);
    console.log('Referral system migration complete!');

    // Show stats
    const users = await pool.query('SELECT COUNT(*) as count FROM users WHERE referral_code IS NOT NULL');
    console.log(`Users with referral codes: ${users.rows[0].count}`);

    process.exit(0);
  } catch (err) {
    console.error('Migration failed:', err.message);
    process.exit(1);
  }
}

run();
