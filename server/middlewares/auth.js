const jwt = require('jsonwebtoken');
const cache = require('../services/cacheService');
const HttpError = require('../utils/httpError');

/**
 * Middleware: Verifies JWT token and checks if token is blacklisted in Redis
 */
module.exports = async (req, res, next) => {
  const authHeader = req.header('Authorization') || '';
  if (!authHeader.startsWith('Bearer ')) {
    return next(new HttpError(401, 'Invalid authorization header', null, 'AUTH_HEADER_INVALID'));
  }
  if (!process.env.JWT_SECRET) {
    return next(new HttpError(503, 'Authentication is not configured', null, 'AUTH_NOT_CONFIGURED'));
  }
  const token = authHeader.split(' ')[1];
  if (!token) return next(new HttpError(401, 'No token provided', null, 'TOKEN_MISSING'));

  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET, { algorithms: ['HS256'] });

    // Check if token is blacklisted
    const isRevoked = await cache.isTokenRevoked(decoded.jti);
    if (isRevoked) return next(new HttpError(401, 'Token revoked', null, 'TOKEN_REVOKED'));

    req.user = decoded;
    if (req.logContext) {
      req.logContext.userId = decoded.id || null;
    }
    next();
  } catch {
    next(new HttpError(401, 'Invalid token', null, 'TOKEN_INVALID'));
  }
};