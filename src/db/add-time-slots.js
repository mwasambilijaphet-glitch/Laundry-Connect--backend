/**
 * Migration: Add pickup_time_slot and delivery_time_slot columns to orders table
 * Run: node src/db/add-time-slots.js
 */
const pool = require('./pool');

async function migrate() {
  const client = await pool.connect();
  try {
    console.log('Adding time slot columns to orders table...');

    await client.query(`
      ALTER TABLE orders
      ADD COLUMN IF NOT EXISTS pickup_time_slot VARCHAR(50),
      ADD COLUMN IF NOT EXISTS delivery_time_slot VARCHAR(50)
    `);

    console.log('Migration complete! Added pickup_time_slot and delivery_time_slot columns.');
    process.exit(0);
  } catch (err) {
    console.error('Migration error:', err.message);
    process.exit(1);
  } finally {
    client.release();
  }
}

migrate();
