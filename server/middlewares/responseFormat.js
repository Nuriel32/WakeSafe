module.exports = (req, res, next) => {
  res.success = (data = null, options = {}) => {
    const statusCode = options.statusCode || 200;
    const message = options.message || 'OK';
    const meta = options.meta || undefined;
    return res.status(statusCode).json({
      success: true,
      message,
      data,
      ...(meta ? { meta } : {}),
      requestId: req.requestId || null,
      timestamp: new Date().toISOString(),
    });
  };

  res.fail = (message = 'Request failed', options = {}) => {
    const statusCode = options.statusCode || 500;
    const details = options.details || undefined;
    const code = options.code || undefined;
    return res.status(statusCode).json({
      success: false,
      message,
      ...(code ? { code } : {}),
      ...(details ? { details } : {}),
      requestId: req.requestId || null,
      timestamp: new Date().toISOString(),
    });
  };

  next();
};
