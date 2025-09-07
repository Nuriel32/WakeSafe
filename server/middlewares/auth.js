const jwt = require('jsonwebtoken');
const cache = require('../services/cacheService');

/**
 * Middleware: Verifies JWT token and checks if token is blacklisted in Redis
 */
module.exports = async (req, res, next) => {
  const token = req.header('Authorization')?.split(' ')[1];
  if (!token) return res.status(401).json({ message: 'No token provided' });

  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET);

    // Check if token is blacklisted
    const isRevoked = await cache.isTokenBlacklisted(decoded.jti);
    if (isRevoked) return res.status(401).json({ message: 'Token revoked' });

    req.user = decoded;
    next();
  } catch {
    res.status(401).json({ message: 'Invalid token' });
  }
};