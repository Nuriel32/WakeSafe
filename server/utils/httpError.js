class HttpError extends Error {
  constructor(statusCode, message, details = null, code = null) {
    super(message || 'Request failed');
    this.name = 'HttpError';
    this.statusCode = statusCode || 500;
    this.details = details;
    this.code = code;
  }
}

module.exports = HttpError;
