# בסיס קל
FROM node:18-alpine

# התקנות מערכת: redis + tini (לטיפול בסיגנלים ותהליכי ילד)
RUN apk add --no-cache redis tini

# תיקיית עבודה
WORKDIR /app

# מצב פרודקשן
ENV NODE_ENV=production

# התקנת תלויות לפי lockfile (מהיר ודטרמיניסטי)
COPY package*.json ./
RUN npm ci --omit=dev

# קוד האפליקציה
COPY . .

# ברירת מחדל (Cloud Run מזריק PORT בכל מקרה; זה רק דיפולט)
ENV PORT=8080

# Redis לוקאלי (ניתן לשנות בפריסה)
ENV REDIS_HOST=127.0.0.1
ENV REDIS_PORT=6379

# חשיפה דקלרטיבית
EXPOSE 8080

# להריץ כמשתמש לא-רוט
RUN chown -R node:node /app
USER node

# tini כ-ENTRYPOINT כדי שהסיגנלים יועברו כראוי לכל התהליכים
ENTRYPOINT ["tini","-g","--"]

CMD ["sh","-lc", "\
  redis-server --port ${REDIS_PORT:-6379} --bind 127.0.0.1 --save '' --appendonly no & \
  for i in 1 2 3 4 5; do \
    redis-cli -h 127.0.0.1 -p ${REDIS_PORT:-6379} ping >/dev/null 2>&1 && break || sleep 0.5; \
  done; \
  node server.js \
"]
