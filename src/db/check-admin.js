require('dotenv').config();
const bcrypt = require('bcryptjs');
const pool = require('./pool');

async function check() {
  const result = await pool.query('SELECT id, phone, email, password_hash, role, is_verified FROM users WHERE role = $1', ['admin']);
  if (result.rows.length === 0) {
    console.log('No admin user found!');
  } else {
    const admin = result.rows[0];
    console.log('Admin found:');
    console.log('  ID:', admin.id);
    console.log('  Phone:', admin.phone);
    console.log('  Email:', admin.email);
    console.log('  Verified:', admin.is_verified);
    
    const match = await bcrypt.compare('Mwasambiltheson23$', admin.password_hash);
    console.log('  Password matches:', match);
  }
  await pool.end();
}

check();