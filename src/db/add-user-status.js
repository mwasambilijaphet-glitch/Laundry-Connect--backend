/**
 * LAUNDRY CONNECT — Add User Status (block/suspend)
 *
 * Run: node src/db/add-user-status.js
 *
 * Adds status column to users table: 'active', 'suspended', 'blocked'
 * Safe to run multiple times (uses IF NOT EXISTS)
 */
require('dotenv').config();
const pool = require('./pool');

const migration = `
-- Add status column to users (safe, won't error if already exists)
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'users' AND column_name = 'status') THEN
    ALTER TABLE users ADD COLUMN status VARCHAR(20) DEFAULT 'active' CHECK (status IN ('active', 'suspended', 'blocked'));
  END IF;
END $$;
`;

async function run() {
  try {
    console.log('Adding user status column...');
    await pool.query(migration);
    console.log('✅ User status column added successfully');

    const result = await pool.query("SELECT column_name, data_type, column_default FROM information_schema.columns WHERE table_name = 'users' AND column_name = 'status'");
    console.log('Column:', result.rows[0]);

    process.exit(0);
  } catch (err) {
    console.error('❌ Migration failed:', err.message);
    process.exit(1);
  }
}

run();
