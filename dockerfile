# שלב 1: בסיס
FROM node:18

# הגדרת תיקיית העבודה
WORKDIR /usr/src/app

# העתקת קבצי התצורה והקוד
COPY package*.json ./
RUN npm install

COPY . .

# יצירת משתנים לסביבת עבודה
ENV PORT=5000

# פתיחת הפורט
EXPOSE 5000

# הרצת האפליקציה
CMD ["node", "server.js"]
