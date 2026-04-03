const logger = require('../utils/logger');

const customSinks = [];

function registerSink(handler) {
  if (typeof handler === 'function') {
    customSinks.push(handler);
  }
}

async function forwardToWebhook(payload) {
  const webhook = process.env.MONITORING_WEBHOOK_URL;
  if (!webhook) return;
  try {
    await fetch(webhook, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
  } catch (error) {
    logger.warn('monitoring_webhook_failed', { error });
  }
}

async function emit(payload) {
  const event = {
    timestamp: new Date().toISOString(),
    service: 'wakesafe-api',
    env: process.env.NODE_ENV || 'development',
    ...payload,
  };

  logger.info('monitoring_event', event);
  await forwardToWebhook(event);

  for (const sink of customSinks) {
    try {
      await sink(event);
    } catch (error) {
      logger.warn('monitoring_sink_failed', { error });
    }
  }
}

async function trackFailure(category, details = {}) {
  return emit({
    level: 'error',
    type: 'failure',
    category,
    ...details,
  });
}

async function trackWarning(category, details = {}) {
  return emit({
    level: 'warn',
    type: 'warning',
    category,
    ...details,
  });
}

module.exports = {
  emit,
  registerSink,
  trackFailure,
  trackWarning,
};
