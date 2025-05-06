const { createLogger, format, transports } = require('winston');
const path = require('path');
const fs = require('fs');

// Ensure logs directory exists
const logDir = path.join(__dirname, '../logs');
if (!fs.existsSync(logDir)) {
    fs.mkdirSync(logDir);
}

// Define custom log format
const logFormat = format.printf(({ timestamp, level, message, ...meta }) => {
    return `[${timestamp}] ${level.toUpperCase()} - ${message} ${Object.keys(meta).length ? JSON.stringify(meta) : ''}`;
});

// Create the logger instance
const logger = createLogger({
    level: 'info',
    format: format.combine(
        format.timestamp(),
        format.errors({ stack: true }),
        format.splat(),
        format.json(),
        logFormat
    ),
    transports: [
        new transports.Console({
            format: format.combine(format.colorize(), format.simple())
        }),
        new transports.File({ filename: path.join(logDir, 'app.log') })
    ],
    exitOnError: false
});

module.exports = logger;
