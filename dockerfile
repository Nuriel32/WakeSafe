# Base
FROM node:18-alpine

# System deps: redis + tini + build tools for native modules
RUN apk add --no-cache redis tini python3 make g++

WORKDIR /app
ENV NODE_ENV=production

# Install deps (deterministic)
COPY package*.json ./
RUN npm ci --omit=dev

# App code
COPY . .

# Cloud Run defaults
ENV PORT=8080
ENV REDIS_HOST=127.0.0.1
ENV REDIS_PORT=6379
EXPOSE 8080

# tini handles PID 1 and signals
ENTRYPOINT ["tini","-g","--"]

# Start redis, wait for it, then start the app
# NOTE: running as root here to avoid permission issues for redis-server.
CMD ["sh","-lc", "\
  redis-server --port ${REDIS_PORT:-6379} --bind 127.0.0.1 --save '' --appendonly no & \
  for i in 1 2 3 4 5 6 7 8 9 10; do \
    redis-cli -h 127.0.0.1 -p ${REDIS_PORT:-6379} ping >/dev/null 2>&1 && break || sleep 0.5; \
  done; \
  node server.js \
"]
