const express = require('express');
const pool = require('../db/pool');
const { authenticate, authorize } = require('../middleware/auth');

const router = express.Router();

// ── GET /api/shops — List all approved shops ──────────────
router.get('/', async (req, res, next) => {
  try {
    const { search, sort, city } = req.query;
    
    let query = `
      SELECT s.*, u.full_name as owner_name,
             (SELECT MIN(price) FROM services WHERE shop_id = s.id AND is_active = TRUE) as min_price
      FROM shops s
      JOIN users u ON s.owner_id = u.id
      WHERE s.is_approved = TRUE AND s.is_active = TRUE
    `;
    const params = [];

    if (search) {
      params.push(`%${search}%`);
      query += ` AND (s.name ILIKE $${params.length} OR s.region ILIKE $${params.length} OR s.address ILIKE $${params.length})`;
    }

    if (city) {
      params.push(city);
      query += ` AND s.city = $${params.length}`;
    }

    // Sort
    if (sort === 'price') query += ' ORDER BY min_price ASC NULLS LAST';
    else if (sort === 'orders') query += ' ORDER BY s.total_orders DESC';
    else query += ' ORDER BY s.rating_avg DESC'; // default: top rated

    const result = await pool.query(query, params);

    res.json({ success: true, shops: result.rows });
  } catch (err) {
    next(err);
  }
});

// ── GET /api/shops/:id — Shop detail ──────────────────────
router.get('/:id', async (req, res, next) => {
  try {
    const { id } = req.params;

    // Shop info
    const shopResult = await pool.query(
      `SELECT s.*, u.full_name as owner_name
       FROM shops s JOIN users u ON s.owner_id = u.id
       WHERE s.id = $1`,
      [id]
    );
    if (shopResult.rows.length === 0) {
      return res.status(404).json({ success: false, message: 'Shop not found' });
    }
    const shop = shopResult.rows[0];

    // Services
    const servicesResult = await pool.query(
      'SELECT * FROM services WHERE shop_id = $1 AND is_active = TRUE ORDER BY clothing_type, price',
      [id]
    );

    // Delivery zones
    const zonesResult = await pool.query(
      'SELECT * FROM delivery_zones WHERE shop_id = $1 ORDER BY fee',
      [id]
    );

    // Reviews (latest 10)
    const reviewsResult = await pool.query(
      `SELECT r.*, u.full_name as customer_name
       FROM reviews r JOIN users u ON r.customer_id = u.id
       WHERE r.shop_id = $1
       ORDER BY r.created_at DESC LIMIT 10`,
      [id]
    );

    res.json({
      success: true,
      shop: {
        ...shop,
        services: servicesResult.rows,
        delivery_zones: zonesResult.rows,
        reviews: reviewsResult.rows,
      },
    });
  } catch (err) {
    next(err);
  }
});

// ── POST /api/shops — Create shop (owner only) ───────────
router.post('/', authenticate, authorize('owner'), async (req, res, next) => {
  try {
    const { name, description, address, latitude, longitude, region, phone, operating_hours } = req.body;

    if (!name || !address) {
      return res.status(400).json({ success: false, message: 'Name and address are required' });
    }

    // Check if owner already has a shop
    const existing = await pool.query('SELECT id FROM shops WHERE owner_id = $1', [req.user.id]);
    if (existing.rows.length > 0) {
      return res.status(409).json({ success: false, message: 'You already have a shop registered' });
    }

    const result = await pool.query(
      `INSERT INTO shops (owner_id, name, description, address, latitude, longitude, region, phone, operating_hours)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
       RETURNING *`,
      [req.user.id, name, description, address, latitude, longitude, region, phone, JSON.stringify(operating_hours || {})]
    );

    res.status(201).json({
      success: true,
      message: 'Shop created! Waiting for admin approval.',
      shop: result.rows[0],
    });
  } catch (err) {
    next(err);
  }
});

// ── PUT /api/shops/:id/services — Manage services (owner) ─
router.put('/:id/services', authenticate, authorize('owner'), async (req, res, next) => {
  try {
    const { id } = req.params;
    const { services } = req.body; // Array of { clothing_type, service_type, price }

    // Verify ownership
    const shop = await pool.query('SELECT id FROM shops WHERE id = $1 AND owner_id = $2', [id, req.user.id]);
    if (shop.rows.length === 0) {
      return res.status(403).json({ success: false, message: 'Not your shop' });
    }

    // Upsert services
    for (const svc of services) {
      await pool.query(
        `INSERT INTO services (shop_id, clothing_type, service_type, price)
         VALUES ($1, $2, $3, $4)
         ON CONFLICT (shop_id, clothing_type, service_type) 
         DO UPDATE SET price = $4, is_active = TRUE`,
        [id, svc.clothing_type, svc.service_type, svc.price]
      );
    }

    const updated = await pool.query('SELECT * FROM services WHERE shop_id = $1 AND is_active = TRUE', [id]);

    res.json({ success: true, services: updated.rows });
  } catch (err) {
    next(err);
  }
});

module.exports = router;
