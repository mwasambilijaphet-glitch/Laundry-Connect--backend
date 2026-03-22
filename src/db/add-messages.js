/**
 * LAUNDRY CONNECT — Add Messaging Tables
 *
 * Run: node src/db/add-messages.js
 *
 * Non-destructive: only adds new tables if they don't exist.
 */
require('dotenv').config();
const pool = require('./pool');

const migration = `
-- ============================================================
-- CONVERSATIONS (between customer and shop owner)
-- ============================================================
CREATE TABLE IF NOT EXISTS conversations (
  id          SERIAL PRIMARY KEY,
  customer_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
  shop_id     INTEGER REFERENCES shops(id) ON DELETE CASCADE,
  order_id    INTEGER REFERENCES orders(id) ON DELETE SET NULL,
  last_message TEXT,
  last_message_at TIMESTAMP DEFAULT NOW(),
  created_at  TIMESTAMP DEFAULT NOW(),
  UNIQUE(customer_id, shop_id)
);

-- ============================================================
-- MESSAGES
-- ============================================================
CREATE TABLE IF NOT EXISTS messages (
  id              SERIAL PRIMARY KEY,
  conversation_id INTEGER REFERENCES conversations(id) ON DELETE CASCADE,
  sender_id       INTEGER REFERENCES users(id) ON DELETE SET NULL,
  sender_role     VARCHAR(20) NOT NULL CHECK (sender_role IN ('customer', 'owner')),
  content         TEXT NOT NULL,
  message_type    VARCHAR(20) DEFAULT 'text' CHECK (message_type IN ('text', 'image', 'system')),
  is_read         BOOLEAN DEFAULT FALSE,
  created_at      TIMESTAMP DEFAULT NOW()
);

-- ============================================================
-- INDEXES
-- ============================================================
CREATE INDEX IF NOT EXISTS idx_conversations_customer ON conversations(customer_id);
CREATE INDEX IF NOT EXISTS idx_conversations_shop ON conversations(shop_id);
CREATE INDEX IF NOT EXISTS idx_conversations_last ON conversations(last_message_at DESC);
CREATE INDEX IF NOT EXISTS idx_messages_conversation ON messages(conversation_id, created_at);
CREATE INDEX IF NOT EXISTS idx_messages_unread ON messages(conversation_id, is_read) WHERE is_read = FALSE;
`;

async function run() {
  try {
    console.log('Adding messaging tables...');
    await pool.query(migration);
    console.log('Messaging tables created successfully');
  } catch (err) {
    console.error('Migration failed:', err.message);
  } finally {
    await pool.end();
  }
}

run();
