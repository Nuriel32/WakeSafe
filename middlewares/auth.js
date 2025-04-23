const jwt = require('jsonwebtoken');
const cache = require('../services/cacheService');
const redis = require('../config/redis');
module.exports = async (req, res, next) => {
  const token = req.header('Authorization')?.split(' ')[1];
  if (!token) return res.status(401).json({ message: 'No token provided' });

  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    const cachedToken = await cache.getFromCache(`token:${decoded.id}`);
    if (cachedToken !== token) return res.status(401).json({ message: 'Token mismatch' });

    req.user = decoded;
    next();
  } catch {
    res.status(401).json({ message: 'Invalid token' });
  }
};



module.exports = async (req, res, next) => {
  const token = req.header('Authorization')?.split(' ')[1];
  if (!token) return res.status(401).json({ message: 'No token provided' });

  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET);

    // בדיקה אם טוקן חסום
    const isRevoked = await redis.get(`blacklist:${decoded.jti}`);
    if (isRevoked) return res.status(401).json({ message: 'Token revoked' });

    req.user = decoded;
    next();
  } catch {
    res.status(401).json({ message: 'Invalid token' });
  }
};
