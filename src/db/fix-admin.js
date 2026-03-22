require('dotenv').config();
const bcrypt = require('bcryptjs');
const pool = require('./pool');

async function fix() {
  const hash = await bcrypt.hash('Mwasambiltheson23$', 10);
  await pool.query('UPDATE users SET password_hash = $1 WHERE role = $2', [hash, 'admin']);
  console.log('Admin password updated!');
  await pool.end();
}

fix();