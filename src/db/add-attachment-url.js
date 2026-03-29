const pool = require('./pool');

async function addAttachmentUrl() {
  try {
    await pool.query(`
      ALTER TABLE messages ADD COLUMN IF NOT EXISTS attachment_url TEXT;
    `);
    console.log('Added attachment_url column to messages table');
    process.exit(0);
  } catch (err) {
    console.error('Migration failed:', err);
    process.exit(1);
  }
}

addAttachmentUrl();
