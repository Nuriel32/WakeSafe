const logger = require('../utils/logger');

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

class ExternalServiceError extends Error {
  constructor(message, details = {}) {
    super(message);
    this.name = 'ExternalServiceError';
    this.statusCode = details.statusCode || 502;
    this.service = details.service || 'external';
    this.code = details.code || 'EXTERNAL_SERVICE_ERROR';
    this.details = details.details || null;
  }
}

async function request(url, options = {}, retryOptions = {}) {
  const method = options.method || 'GET';
  const maxRetries = Number(retryOptions.maxRetries ?? 2);
  const baseDelayMs = Number(retryOptions.baseDelayMs ?? 300);
  const service = retryOptions.service || 'external';
  const shouldRetry = retryOptions.shouldRetry || ((status) => status >= 500 || status === 429);

  let lastError;
  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      const response = await fetch(url, options);
      if (!response.ok) {
        let body = '';
        if (typeof response.text === 'function') body = await response.text();
        else if (typeof response.json === 'function') body = JSON.stringify(await response.json());
        const retriable = shouldRetry(response.status);
        if (retriable && attempt < maxRetries) {
          const delay = baseDelayMs * Math.pow(2, attempt);
          logger.warn('external_request_retry', {
            service,
            url,
            method,
            attempt: attempt + 1,
            delay,
            statusCode: response.status,
          });
          await sleep(delay);
          continue;
        }
        throw new ExternalServiceError(`${service} request failed`, {
          service,
          statusCode: response.status,
          code: 'EXTERNAL_HTTP_ERROR',
          details: { url, method, body },
        });
      }

      const contentType =
        (response.headers && typeof response.headers.get === 'function'
          ? response.headers.get('content-type')
          : '') || '';
      if (contentType.includes('application/json') || typeof response.json === 'function') {
        return await response.json();
      }
      if (typeof response.text === 'function') return await response.text();
      return null;
    } catch (error) {
      lastError = error;
      if (attempt < maxRetries) {
        const delay = baseDelayMs * Math.pow(2, attempt);
        logger.warn('external_request_retry_network', {
          service,
          url,
          method,
          attempt: attempt + 1,
          delay,
          error: error.message,
        });
        await sleep(delay);
        continue;
      }
    }
  }

  if (lastError instanceof ExternalServiceError) throw lastError;
  throw new ExternalServiceError(`${service} request failed`, {
    service,
    code: 'EXTERNAL_NETWORK_ERROR',
    details: { url, method, message: lastError?.message },
  });
}

async function get(url, options = {}, retryOptions = {}) {
  return request(url, { ...options, method: 'GET' }, retryOptions);
}

async function post(url, body, options = {}, retryOptions = {}) {
  const headers = {
    'Content-Type': 'application/json',
    ...(options.headers || {}),
  };
  return request(
    url,
    {
      ...options,
      method: 'POST',
      headers,
      body: typeof body === 'string' ? body : JSON.stringify(body),
    },
    retryOptions
  );
}

module.exports = {
  request,
  get,
  post,
  ExternalServiceError,
};
