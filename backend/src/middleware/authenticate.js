// src/middleware/authenticate.js
// Verify JWT and attach req.user — use on every protected route
'use strict';

const jwt = require('jsonwebtoken');

/**
 * Express middleware: extracts and verifies the Bearer JWT.
 * Sets req.user = { id, username, role, mfaVerified } on success.
 */
function authenticate(req, res, next) {
  const authHeader = req.headers['authorization'];
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return res.status(401).json({ message: 'No token provided' });
  }

  const token = authHeader.slice(7);
  try {
    const payload = jwt.verify(token, process.env.JWT_SECRET);

    // Reject tokens that are still pending 2FA verification
    if (payload.pending2fa) {
      return res.status(401).json({ message: '2FA verification required' });
    }

    req.user = payload;
    next();
  } catch (err) {
    const message = err.name === 'TokenExpiredError' ? 'Token expired' : 'Invalid token';
    return res.status(401).json({ message });
  }
}

module.exports = authenticate;
