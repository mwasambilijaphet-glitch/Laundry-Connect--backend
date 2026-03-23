/**
 * Migration: Add cash payment support
 *
 * - Adds 'cash' to payment_status CHECK constraint
 * - Adds payment_method column to orders
 *
 * Run once: node src/db/add-cash-payment.js
 */
require('dotenv').config();
const pool = require('./pool');

async function migrate() {
  try {
    console.log('Running cash payment migration...');

    // Drop and recreate the payment_status CHECK constraint to include 'cash'
    await pool.query(`
      ALTER TABLE orders DROP CONSTRAINT IF EXISTS orders_payment_status_check;
      ALTER TABLE orders ADD CONSTRAINT orders_payment_status_check
        CHECK (payment_status IN ('pending', 'paid', 'failed', 'refunded', 'cash'));
    `);

    // Add payment_method column if it doesn't exist
    await pool.query(`
      ALTER TABLE orders ADD COLUMN IF NOT EXISTS payment_method VARCHAR(20) DEFAULT NULL;
    `);

    console.log('Cash payment migration complete');
  } catch (err) {
    console.error('Migration failed:', err.message);
  } finally {
    await pool.end();
  }
}

migrate();
