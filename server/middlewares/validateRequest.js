const HttpError = require('../utils/httpError');

function validateValue(value, rule) {
  if (rule.required && (value === undefined || value === null || value === '')) {
    return `${rule.label || 'field'} is required`;
  }
  if (value === undefined || value === null || value === '') return null;

  if (rule.type === 'string' && typeof value !== 'string') {
    return `${rule.label || 'field'} must be a string`;
  }
  if (rule.type === 'number' && typeof value !== 'number') {
    return `${rule.label || 'field'} must be a number`;
  }
  if (rule.type === 'boolean' && typeof value !== 'boolean') {
    return `${rule.label || 'field'} must be a boolean`;
  }
  if (rule.regex && typeof value === 'string' && !rule.regex.test(value)) {
    return rule.message || `${rule.label || 'field'} format is invalid`;
  }
  if (rule.min !== undefined && typeof value === 'number' && value < rule.min) {
    return `${rule.label || 'field'} must be >= ${rule.min}`;
  }
  if (rule.max !== undefined && typeof value === 'number' && value > rule.max) {
    return `${rule.label || 'field'} must be <= ${rule.max}`;
  }
  if (rule.enum && !rule.enum.includes(value)) {
    return `${rule.label || 'field'} must be one of: ${rule.enum.join(', ')}`;
  }
  return null;
}

module.exports = function validateRequest(schema = {}) {
  return (req, _res, next) => {
    const errors = [];
    const targets = ['body', 'query', 'params'];

    targets.forEach((target) => {
      if (!schema[target]) return;
      Object.entries(schema[target]).forEach(([key, rule]) => {
        const value = req[target]?.[key];
        const error = validateValue(value, { label: `${target}.${key}`, ...rule });
        if (error) errors.push(error);
      });
    });

    if (errors.length > 0) {
      return next(new HttpError(400, 'Validation failed', errors, 'VALIDATION_ERROR'));
    }
    return next();
  };
};
