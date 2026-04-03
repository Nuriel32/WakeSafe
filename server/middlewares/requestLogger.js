const logger = require('../utils/logger');
const { randomUUID } = require('crypto');
const monitoring = require('../services/monitoringService');

function requestLogger(req, res, next) {
    const requestId = req.header('x-request-id') || randomUUID();
    req.requestId = requestId;
    res.setHeader('x-request-id', requestId);

    const startedAt = Date.now();
    const context = {
        requestId,
        userId: req.user?.id || null,
        tripId: req.body?.tripId || req.body?.sessionId || req.params?.sessionId || null,
        method: req.method,
        path: req.originalUrl,
        ip: req.ip,
    };

    req.logContext = context;
    req.log = logger.child(context);
    req.log.info('request_started');

    res.on('finish', () => {
        if (res.statusCode >= 500) {
            monitoring.trackFailure('api_failure', {
                requestId,
                userId: req.user?.id || null,
                tripId: req.body?.tripId || req.body?.sessionId || req.params?.sessionId || null,
                method: req.method,
                path: req.originalUrl,
                statusCode: res.statusCode,
                durationMs: Date.now() - startedAt,
            }).catch(() => {});
        } else if (res.statusCode >= 400) {
            monitoring.trackWarning('api_client_error', {
                requestId,
                userId: req.user?.id || null,
                tripId: req.body?.tripId || req.body?.sessionId || req.params?.sessionId || null,
                method: req.method,
                path: req.originalUrl,
                statusCode: res.statusCode,
                durationMs: Date.now() - startedAt,
            }).catch(() => {});
        }
        logger.info('request_completed', {
            ...context,
            statusCode: res.statusCode,
            durationMs: Date.now() - startedAt,
        });
    });
    next();
}

module.exports = requestLogger;
