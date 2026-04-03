const { createLogger, format, transports } = require('winston');
const path = require('path');
const fs = require('fs');

// Ensure logs directory exists
const logDir = path.join(__dirname, '../logs');
if (!fs.existsSync(logDir)) {
    fs.mkdirSync(logDir);
}

function serializeError(error) {
    if (!error) return undefined;
    return {
        name: error.name,
        message: error.message,
        stack: error.stack,
    };
}

const sanitizeMeta = format((info) => {
    if (info.error instanceof Error) {
        info.error = serializeError(info.error);
    }
    if (info.err instanceof Error) {
        info.err = serializeError(info.err);
    }
    return info;
});

// Create the logger instance
const logger = createLogger({
    level: process.env.LOG_LEVEL || 'info',
    defaultMeta: {
        service: 'wakesafe-api',
        env: process.env.NODE_ENV || 'development',
    },
    format: format.combine(
        sanitizeMeta(),
        format.timestamp({ format: () => new Date().toISOString() }),
        format.errors({ stack: true }),
        format.splat(),
        format.json()
    ),
    transports: [
        new transports.Console({
            format: format.combine(
                sanitizeMeta(),
                format.timestamp({ format: () => new Date().toISOString() }),
                format.json()
            )
        }),
        new transports.File({ filename: path.join(logDir, 'app.log') })
    ],
    exitOnError: false
});

function child(context = {}) {
    return {
        info: (message, meta = {}) => logger.info(message, { ...context, ...meta }),
        warn: (message, meta = {}) => logger.warn(message, { ...context, ...meta }),
        error: (message, meta = {}) => logger.error(message, { ...context, ...meta }),
        debug: (message, meta = {}) => logger.debug(message, { ...context, ...meta }),
    };
}

logger.child = child;

module.exports = logger;
