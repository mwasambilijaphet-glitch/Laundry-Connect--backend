/**
 * LAUNDRY CONNECT — Database Seed
 * 
 * Run: npm run db:seed
 * 
 * Seeds the database with sample shops, services, and an admin user.
 */
require('dotenv').config();
const bcrypt = require('bcryptjs');
const pool = require('./pool');

async function seed() {
  try {
    console.log('🌱 Seeding database...');

    // ── Admin user ──────────────────────────────────────
    const adminHash = await bcrypt.hash(process.env.ADMIN_PASSWORD || 'admin123456', 10);
    const adminResult = await pool.query(
      `INSERT INTO users (phone, email, password_hash, full_name, role, is_verified)
       VALUES ($1, $2, $3, $4, 'admin', TRUE)
       ON CONFLICT (email) DO NOTHING
       RETURNING id`,
      [process.env.ADMIN_PHONE || '0712345678', process.env.ADMIN_EMAIL || 'admin@laundryconnect.co.tz', adminHash, 'Japhet Admin']
    );
    console.log('  ✅ Admin user created');

    // ── Sample shop owners ──────────────────────────────
    const ownerHash = await bcrypt.hash('owner123456', 10);
    const owners = [
      { phone: '0754123456', email: 'salma@example.com', name: 'Salma Hassan' },
      { phone: '0713456789', email: 'david@example.com', name: 'David Mwanga' },
      { phone: '0765789012', email: 'fatma@example.com', name: 'Fatma Juma' },
      { phone: '0787234567', email: 'james@example.com', name: 'James Kimario' },
      { phone: '0712567890', email: 'rose@example.com', name: 'Rose Mtui' },
    ];

    const ownerIds = [];
    for (const owner of owners) {
      const res = await pool.query(
        `INSERT INTO users (phone, email, password_hash, full_name, role, is_verified)
         VALUES ($1, $2, $3, $4, 'owner', TRUE)
         ON CONFLICT (email) DO NOTHING
         RETURNING id`,
        [owner.phone, owner.email, ownerHash, owner.name]
      );
      if (res.rows[0]) ownerIds.push(res.rows[0].id);
    }
    console.log(`  ✅ ${ownerIds.length} shop owners created`);

    // ── Sample customer ─────────────────────────────────
    const custHash = await bcrypt.hash('customer123', 10);
    await pool.query(
      `INSERT INTO users (phone, email, password_hash, full_name, role, is_verified)
       VALUES ('0700111222', 'customer@example.com', $1, 'Test Customer', 'customer', TRUE)
       ON CONFLICT (email) DO NOTHING`,
      [custHash]
    );
    console.log('  ✅ Test customer created');

    // ── Shops ───────────────────────────────────────────
    const shops = [
      { owner_idx: 0, name: 'Mama Salma Laundry', desc: 'Trusted traditional wear care specialists in Kinondoni.', address: 'Kinondoni Road, Kinondoni', lat: -6.7720, lng: 39.2440, region: 'Kinondoni', phone: '0754123456' },
      { owner_idx: 1, name: 'Fresh & Clean Express', desc: 'Premium laundry service with same-day delivery.', address: 'Old Bagamoyo Rd, Mikocheni', lat: -6.7627, lng: 39.2534, region: 'Mikocheni', phone: '0713456789' },
      { owner_idx: 2, name: 'Karibu Laundry Hub', desc: 'Affordable laundry for the whole family.', address: 'Shekilango Rd, Sinza', lat: -6.7850, lng: 39.2350, region: 'Sinza', phone: '0765789012' },
      { owner_idx: 3, name: 'Sparkle Dry Cleaners', desc: 'Premium dry cleaning for suits and formal wear.', address: 'Haile Selassie Rd, Masaki', lat: -6.7470, lng: 39.2740, region: 'Masaki', phone: '0787234567' },
      { owner_idx: 4, name: 'Upendo Laundry Services', desc: 'Your reliable neighbourhood laundry in Mbezi Beach.', address: 'Mbezi Beach Rd, Mbezi', lat: -6.7210, lng: 39.2110, region: 'Mbezi Beach', phone: '0712567890' },
    ];

    const shopIds = [];
    for (const shop of shops) {
      const res = await pool.query(
        `INSERT INTO shops (owner_id, name, description, address, latitude, longitude, region, phone, is_approved, rating_avg, total_orders, total_reviews)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, TRUE, $9, $10, $11)
         RETURNING id`,
        [ownerIds[shop.owner_idx], shop.name, shop.desc, shop.address, shop.lat, shop.lng, shop.region, shop.phone,
         [4.7, 4.9, 4.4, 4.8, 4.5][shop.owner_idx],
         [342, 567, 203, 412, 178][shop.owner_idx],
         [89, 156, 45, 98, 34][shop.owner_idx]]
      );
      if (res.rows[0]) shopIds.push(res.rows[0].id);
    }
    console.log(`  ✅ ${shopIds.length} shops created`);

    // ── Services (pricing) ──────────────────────────────
    // Shop 1: Mama Salma — focus on traditional wear
    const svcData = [
      // shop_idx, clothing_type, service_type, price
      [0, 'shirt', 'wash_only', 1500], [0, 'shirt', 'wash_iron', 2500], [0, 'shirt', 'iron_only', 1000],
      [0, 'trousers', 'wash_only', 1500], [0, 'trousers', 'wash_iron', 2500],
      [0, 'dress', 'wash_only', 2000], [0, 'dress', 'wash_iron', 3500],
      [0, 'kitenge', 'wash_only', 1500], [0, 'kitenge', 'wash_iron', 2500], [0, 'kitenge', 'special', 4000],
      [0, 'bedsheet', 'wash_only', 3000], [0, 'bedsheet', 'wash_iron', 4000],
      [0, 'blanket', 'wash_only', 5000],
      // Shop 2: Fresh & Clean — premium
      [1, 'shirt', 'wash_only', 2000], [1, 'shirt', 'wash_iron', 3000], [1, 'shirt', 'dry_clean', 5000],
      [1, 'trousers', 'wash_iron', 3000], [1, 'suit', 'dry_clean', 15000], [1, 'suit', 'wash_iron', 8000],
      [1, 'dress', 'wash_iron', 4000], [1, 'dress', 'dry_clean', 7000],
      [1, 'shoes', 'wash_only', 3500], [1, 'shoes', 'dry_clean', 5500],
      // Shop 3: Karibu — budget
      [2, 'shirt', 'wash_only', 1000], [2, 'shirt', 'wash_iron', 2000],
      [2, 'trousers', 'wash_only', 1000], [2, 'trousers', 'wash_iron', 2000],
      [2, 'dress', 'wash_iron', 3000], [2, 'kitenge', 'wash_iron', 2000],
      [2, 'bedsheet', 'wash_only', 2500], [2, 'blanket', 'wash_only', 4000],
      // Shop 4: Sparkle — dry cleaning
      [3, 'suit', 'dry_clean', 15000], [3, 'suit', 'wash_iron', 8000],
      [3, 'shirt', 'dry_clean', 5000], [3, 'shirt', 'wash_iron', 3000],
      [3, 'dress', 'dry_clean', 7000], [3, 'dress', 'special', 10000],
      [3, 'curtain', 'dry_clean', 8000], [3, 'blanket', 'dry_clean', 10000],
      // Shop 5: Upendo — general
      [4, 'shirt', 'wash_iron', 2500], [4, 'trousers', 'wash_iron', 2500],
      [4, 'dress', 'wash_iron', 3500], [4, 'kitenge', 'wash_iron', 2500], [4, 'kitenge', 'special', 4000],
      [4, 'bedsheet', 'wash_iron', 4000], [4, 'blanket', 'wash_only', 5000], [4, 'shoes', 'wash_only', 3000],
    ];

    for (const [shopIdx, clothing, service, price] of svcData) {
      await pool.query(
        `INSERT INTO services (shop_id, clothing_type, service_type, price) VALUES ($1, $2, $3, $4)`,
        [shopIds[shopIdx], clothing, service, price]
      );
    }
    console.log(`  ✅ ${svcData.length} services/prices created`);

    // ── Delivery zones ──────────────────────────────────
    const zones = [
      [0, 'Kinondoni Area', 2000, 'Within 3km'], [0, 'Mikocheni / Sinza', 4000, '3-7km'], [0, 'Masaki / Kariakoo', 7000, '7-15km'],
      [1, 'Mikocheni Area', 2000, 'Within 3km'], [1, 'Kinondoni / Msasani', 4500, '3-7km'], [1, 'CBD / Kariakoo', 8000, '7-15km'],
      [2, 'Sinza Area', 2000, 'Within 3km'], [2, 'Kinondoni / Mwenge', 3500, '3-7km'],
      [3, 'Masaki / Oysterbay', 2500, 'Within 3km'], [3, 'Mikocheni / Msasani', 5000, '3-7km'], [3, 'CBD / Kinondoni', 8000, '7-15km'],
      [4, 'Mbezi Beach', 2000, 'Within 3km'], [4, 'Tegeta / Kawe', 4000, '3-7km'],
    ];

    for (const [shopIdx, zoneName, fee, desc] of zones) {
      await pool.query(
        `INSERT INTO delivery_zones (shop_id, zone_name, fee, description) VALUES ($1, $2, $3, $4)`,
        [shopIds[shopIdx], zoneName, fee, desc]
      );
    }
    console.log(`  ✅ ${zones.length} delivery zones created`);

    console.log('\n🎉 Seed complete! Your database is ready.\n');
    console.log('   Test credentials:');
    console.log('   Admin:    admin@laundryconnect.co.tz / admin123456');
    console.log('   Owner:    salma@example.com / owner123456');
    console.log('   Customer: customer@example.com / customer123\n');

  } catch (err) {
    console.error('❌ Seed failed:', err.message);
  } finally {
    await pool.end();
  }
}

seed();
