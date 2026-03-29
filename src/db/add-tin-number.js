const pool = require('./pool');

async function migrate() {
  try {
    await pool.query(`
      ALTER TABLE shops ADD COLUMN IF NOT EXISTS tin_number VARCHAR(50);
    `);
    console.log('✅ Added tin_number column to shops');
    process.exit(0);
  } catch (err) {
    console.error('Migration error:', err.message);
    process.exit(1);
  }
}

migrate();
