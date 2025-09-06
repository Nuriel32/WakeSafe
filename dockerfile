# שלב 1: בסיס קל ומהיר
FROM node:18-alpine

# תיקיית עבודה בתוך הקונטיינר
WORKDIR /app

# מצב Production (משפיע על תלותים/לוגים)
ENV NODE_ENV=production

COPY package*.json ./
RUN npm ci --omit=dev

# העתקת שאר הקוד
COPY . .

# ברירת מחדל תואמת Cloud Run (אפשר גם לדלג—Cloud Run מזריק PORT)
ENV PORT=8080

# לחשיפה דקלרטיבית בלבד (Cloud Run לא מסתמך על EXPOSE אבל זה סטנדרטי)
EXPOSE 8080

# אבטחה: להריץ כמשתמש לא-רוט (ודא שלתיקיות יש הרשאות מתאימות)
USER node

# נקודת כניסה — ודא שהאפליקציה מאזינה ל-0.0.0.0:PORT בקוד
CMD ["node", "server.js"]
