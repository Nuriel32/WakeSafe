# --- WakeSafe Backend API (single-stage, slim, reliable) ---
  FROM node:18-alpine

  # System deps (redis, tini for PID1, curl for healthcheck)
  RUN apk add --no-cache redis tini python3 make g++ curl
  
  # Workdir
  WORKDIR /app
  
  # Install prod deps first (better layer caching)
  COPY server/package.json server/package-lock.json ./
  RUN npm ci --omit=dev || npm install --omit=dev
  
  # Copy full server code into /app/server
  COPY server/ ./server/
  
  # Environment
  ENV NODE_ENV=production \
      PORT=8080 \
      HOST=0.0.0.0 \
      REDIS_HOST=127.0.0.1 \
      REDIS_PORT=6379 \
      MONGO_URI=mongodb+srv://WakeSafeUser:WakeSafeUser123@maincluster.lnewxbu.mongodb.net/?retryWrites=true&w=majority&appName=MainCluster \
      MONGODB_URI=mongodb+srv://WakeSafeUser:WakeSafeUser123@maincluster.lnewxbu.mongodb.net/?retryWrites=true&w=majority&appName=MainCluster \
      JWT_SECRET=e \
      REDIS_URL=redis://127.0.0.1:6379 \
      SOCKET_IO_ORIGIN=*
  
  # Expose HTTP
  EXPOSE 8080
  
  # Healthcheck (give the app a little time to boot)
  HEALTHCHECK --interval=30s --timeout=5s --start-period=20s --retries=3 \
    CMD curl -fsS http://localhost:8080/healthz || exit 1
  
  # Tini as init
  ENTRYPOINT ["tini", "-g", "--"]
  
  # Start Redis (no persistence), wait for it, then start the app
  CMD ["sh", "-lc", "\
    redis-server --port ${REDIS_PORT:-6379} --bind 127.0.0.1 --save '' --appendonly no & \
    for i in 1 2 3 4 5 6 7 8 9 10; do \
      redis-cli -h 127.0.0.1 -p ${REDIS_PORT:-6379} ping >/dev/null 2>&1 && break || sleep 0.5; \
    done; \
    node server/server.js \
  "]
  