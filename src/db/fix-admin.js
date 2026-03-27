require('dotenv').config();
const bcrypt = require('bcryptjs');
const pool = require('./pool');

async function fix() {
  const phone = '0768188065';

  // Set role to admin
  const result = await pool.query(
    'UPDATE users SET role = $1, is_verified = true WHERE phone = $2 OR phone = $3 RETURNING id, phone, email, role',
    ['admin', phone, '+255768188065']
  );

  if (result.rows.length === 0) {
    console.log('User not found with phone:', phone);
  } else {
    console.log('Admin role set successfully:');
    console.log(result.rows[0]);
  }

  await pool.end();
}

fix();