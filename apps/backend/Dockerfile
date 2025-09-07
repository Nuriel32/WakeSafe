# Multi-stage build for WakeSafe Backend API
FROM node:18-alpine AS base

# Install system dependencies
RUN apk add --no-cache redis tini python3 make g++

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

# Expose port
EXPOSE 8080

# Health check
HEALTHCHECK --interval=30s --timeout=3s --start-period=5s --retries=3 \
  CMD curl -f http://localhost:8080/healthz || exit 1

# Use tini as init system
ENTRYPOINT ["tini", "--"]

# Start the application
CMD ["node", "server.js"]