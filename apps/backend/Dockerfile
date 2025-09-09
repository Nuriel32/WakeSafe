# Multi-stage build for WakeSafe Backend API
FROM node:18-alpine AS base

# Install system dependencies
RUN apk add --no-cache redis tini python3 make g++ curl

# Set working directory
WORKDIR /app

# Copy package files from server directory
COPY server/package.json ./
COPY server/package-lock.json ./

# Install dependencies
RUN npm ci --omit=dev

# Copy server application code
COPY server/ ./

# Set environment variables
ENV NODE_ENV=production
ENV PORT=8080
ENV REDIS_HOST=127.0.0.1
ENV REDIS_PORT=6379

# Expose port
EXPOSE 8080

# Health check
HEALTHCHECK --interval=30s --timeout=3s --start-period=5s --retries=3 \
  CMD curl -f http://localhost:8080/healthz || exit 1

# Use tini as init system
ENTRYPOINT ["tini", "-g", "--"]

# Start redis, wait for it, then start the app
# NOTE: running as root here to avoid permission issues for redis-server.
CMD ["sh", "-lc", "\
  redis-server --port ${REDIS_PORT:-6379} --bind 127.0.0.1 --save '' --appendonly no & \
  for i in 1 2 3 4 5 6 7 8 9 10; do \
    redis-cli -h 127.0.0.1 -p ${REDIS_PORT:-6379} ping >/dev/null 2>&1 && break || sleep 0.5; \
  done; \
  node server.js \
"]