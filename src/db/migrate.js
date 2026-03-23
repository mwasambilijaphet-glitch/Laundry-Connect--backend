/**
 * LAUNDRY CONNECT — Database Migration
 * 
 * Run: npm run db:migrate
 * 
 * This creates all tables from scratch. 
 * WARNING: Drops existing tables if they exist!
 */
require('dotenv').config();
const pool = require('./pool');

const migration = `
-- ============================================================
-- DROP existing tables (order matters due to foreign keys)
-- ============================================================
DROP TABLE IF EXISTS otp_codes CASCADE;
DROP TABLE IF EXISTS transactions CASCADE;
DROP TABLE IF EXISTS reviews CASCADE;
DROP TABLE IF EXISTS order_items CASCADE;
DROP TABLE IF EXISTS orders CASCADE;
DROP TABLE IF EXISTS delivery_zones CASCADE;
DROP TABLE IF EXISTS services CASCADE;
DROP TABLE IF EXISTS shops CASCADE;
DROP TABLE IF EXISTS users CASCADE;

-- ============================================================
-- USERS
-- ============================================================
CREATE TABLE users (
  id            SERIAL PRIMARY KEY,
  phone         VARCHAR(20) UNIQUE NOT NULL,
  email         VARCHAR(255) UNIQUE NOT NULL,
  password_hash VARCHAR(255) NOT NULL,
  full_name     VARCHAR(255) NOT NULL,
  role          VARCHAR(20) NOT NULL DEFAULT 'customer' CHECK (role IN ('customer', 'owner', 'admin')),
  avatar_url    TEXT,
  is_verified   BOOLEAN DEFAULT FALSE,
  created_at    TIMESTAMP DEFAULT NOW(),
  updated_at    TIMESTAMP DEFAULT NOW()
);

-- ============================================================
-- SHOPS
-- ============================================================
CREATE TABLE shops (
  id              SERIAL PRIMARY KEY,
  owner_id        INTEGER REFERENCES users(id) ON DELETE CASCADE,
  name            VARCHAR(255) NOT NULL,
  description     TEXT,
  address         VARCHAR(500) NOT NULL,
  latitude        DECIMAL(10, 7),
  longitude       DECIMAL(10, 7),
  city            VARCHAR(100) DEFAULT 'Dar es Salaam',
  region          VARCHAR(100),
  phone           VARCHAR(20),
  photos          TEXT[] DEFAULT '{}',
  operating_hours JSONB DEFAULT '{"open": "07:00", "close": "20:00", "days": "Mon-Sat"}',
  is_approved     BOOLEAN DEFAULT FALSE,
  is_active       BOOLEAN DEFAULT TRUE,
  rating_avg      DECIMAL(2, 1) DEFAULT 0,
  total_orders    INTEGER DEFAULT 0,
  total_reviews   INTEGER DEFAULT 0,
  created_at      TIMESTAMP DEFAULT NOW()
);

-- ============================================================
-- SERVICES (pricing per clothing type per service)
-- ============================================================
CREATE TABLE services (
  id              SERIAL PRIMARY KEY,
  shop_id         INTEGER REFERENCES shops(id) ON DELETE CASCADE,
  clothing_type   VARCHAR(50) NOT NULL,
  service_type    VARCHAR(50) NOT NULL,
  price           INTEGER NOT NULL,  -- in TZS
  estimated_hours INTEGER DEFAULT 24,
  is_active       BOOLEAN DEFAULT TRUE,
  UNIQUE(shop_id, clothing_type, service_type)
);

-- ============================================================
-- DELIVERY ZONES
-- ============================================================
CREATE TABLE delivery_zones (
  id          SERIAL PRIMARY KEY,
  shop_id     INTEGER REFERENCES shops(id) ON DELETE CASCADE,
  zone_name   VARCHAR(100) NOT NULL,
  fee         INTEGER NOT NULL,  -- in TZS
  description VARCHAR(255)
);

-- ============================================================
-- ORDERS
-- ============================================================
CREATE TABLE orders (
  id                  SERIAL PRIMARY KEY,
  order_number        VARCHAR(20) UNIQUE NOT NULL,
  customer_id         INTEGER REFERENCES users(id) ON DELETE SET NULL,
  shop_id             INTEGER REFERENCES shops(id) ON DELETE SET NULL,
  status              VARCHAR(30) DEFAULT 'placed' CHECK (status IN (
                        'placed', 'confirmed', 'picked_up', 'washing', 
                        'ready', 'out_for_delivery', 'delivered', 'cancelled'
                      )),
  subtotal            INTEGER NOT NULL DEFAULT 0,
  delivery_fee        INTEGER NOT NULL DEFAULT 0,
  platform_commission INTEGER NOT NULL DEFAULT 0,
  total_amount        INTEGER NOT NULL DEFAULT 0,
  delivery_address    VARCHAR(500),
  delivery_latitude   DECIMAL(10, 7),
  delivery_longitude  DECIMAL(10, 7),
  special_instructions TEXT,
  payment_status      VARCHAR(20) DEFAULT 'pending' CHECK (payment_status IN ('pending', 'paid', 'failed', 'refunded', 'cash')),
  payment_method      VARCHAR(20) DEFAULT NULL,
  payment_reference   VARCHAR(255),
  created_at          TIMESTAMP DEFAULT NOW(),
  updated_at          TIMESTAMP DEFAULT NOW()
);

-- ============================================================
-- ORDER ITEMS
-- ============================================================
CREATE TABLE order_items (
  id            SERIAL PRIMARY KEY,
  order_id      INTEGER REFERENCES orders(id) ON DELETE CASCADE,
  service_id    INTEGER REFERENCES services(id) ON DELETE SET NULL,
  clothing_type VARCHAR(50) NOT NULL,
  service_type  VARCHAR(50) NOT NULL,
  quantity      INTEGER NOT NULL DEFAULT 1,
  unit_price    INTEGER NOT NULL,
  total_price   INTEGER NOT NULL
);

-- ============================================================
-- REVIEWS
-- ============================================================
CREATE TABLE reviews (
  id          SERIAL PRIMARY KEY,
  order_id    INTEGER REFERENCES orders(id) ON DELETE CASCADE,
  customer_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
  shop_id     INTEGER REFERENCES shops(id) ON DELETE CASCADE,
  rating      INTEGER NOT NULL CHECK (rating BETWEEN 1 AND 5),
  comment     TEXT,
  created_at  TIMESTAMP DEFAULT NOW()
);

-- ============================================================
-- TRANSACTIONS
-- ============================================================
CREATE TABLE transactions (
  id               SERIAL PRIMARY KEY,
  order_id         INTEGER REFERENCES orders(id) ON DELETE SET NULL,
  type             VARCHAR(20) NOT NULL CHECK (type IN ('payment', 'payout', 'commission')),
  amount           INTEGER NOT NULL,
  status           VARCHAR(20) DEFAULT 'pending',
  snippe_reference VARCHAR(255),
  created_at       TIMESTAMP DEFAULT NOW()
);

-- ============================================================
-- OTP CODES
-- ============================================================
CREATE TABLE otp_codes (
  id         SERIAL PRIMARY KEY,
  email      VARCHAR(255) NOT NULL,
  otp_code   VARCHAR(6) NOT NULL,
  expires_at TIMESTAMP NOT NULL,
  is_used    BOOLEAN DEFAULT FALSE,
  created_at TIMESTAMP DEFAULT NOW()
);

-- ============================================================
-- INDEXES for performance
-- ============================================================
CREATE INDEX idx_shops_owner ON shops(owner_id);
CREATE INDEX idx_shops_city ON shops(city);
CREATE INDEX idx_shops_approved ON shops(is_approved, is_active);
CREATE INDEX idx_services_shop ON services(shop_id);
CREATE INDEX idx_orders_customer ON orders(customer_id);
CREATE INDEX idx_orders_shop ON orders(shop_id);
CREATE INDEX idx_orders_status ON orders(status);
CREATE INDEX idx_order_items_order ON order_items(order_id);
CREATE INDEX idx_reviews_shop ON reviews(shop_id);
CREATE INDEX idx_otp_email ON otp_codes(email, is_used);
`;

async function migrate() {
  try {
    console.log('🔄 Running migration...');
    await pool.query(migration);
    console.log('✅ Migration complete — all tables created');
  } catch (err) {
    console.error('❌ Migration failed:', err.message);
  } finally {
    await pool.end();
  }
}

migrate();
