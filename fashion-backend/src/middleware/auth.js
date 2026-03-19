const jwt = require('jsonwebtoken');
const pool = require('../db/pool');

/**
 * Verify JWT and attach user to req.user
 */
async function authenticate(req, res, next) {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return res.status(401).json({ success: false, message: 'Authentication required' });
  }

  const token = authHeader.split(' ')[1];

  let decoded;
  try {
    decoded = jwt.verify(token, process.env.JWT_SECRET);
  } catch (err) {
    if (err.name === 'TokenExpiredError') {
      return res.status(401).json({ success: false, message: 'Session expired. Please log in again.' });
    }
    return res.status(401).json({ success: false, message: 'Invalid token' });
  }

  const result = await pool.query(
    'SELECT id, email, full_name, role, is_verified, preferred_language, avatar_url FROM users WHERE id = $1',
    [decoded.id]
  );
  if (result.rows.length === 0) {
    return res.status(401).json({ success: false, message: 'User no longer exists' });
  }

  const user = result.rows[0];
  if (!user.is_verified) {
    return res.status(403).json({ success: false, message: 'Email not verified. Please verify your email first.', code: 'UNVERIFIED' });
  }

  req.user = user;
  next();
}

/**
 * Require one of the given roles
 */
function authorize(...roles) {
  return (req, res, next) => {
    if (!req.user) {
      return res.status(401).json({ success: false, message: 'Authentication required' });
    }
    if (!roles.includes(req.user.role)) {
      return res.status(403).json({ success: false, message: 'You do not have permission to perform this action' });
    }
    next();
  };
}

module.exports = { authenticate, authorize };
