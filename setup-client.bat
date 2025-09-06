@echo off
echo 🚀 Setting up WakeSafe Client...

REM Check if Node.js is installed
node --version >nul 2>&1
if %errorlevel% neq 0 (
    echo ❌ Node.js is not installed. Please install Node.js first.
    pause
    exit /b 1
)

REM Check if npm is installed
npm --version >nul 2>&1
if %errorlevel% neq 0 (
    echo ❌ npm is not installed. Please install npm first.
    pause
    exit /b 1
)

echo ✅ Node.js and npm are installed

REM Install server dependencies
echo 📦 Installing server dependencies...
npm install

if %errorlevel% equ 0 (
    echo ✅ Server dependencies installed successfully
) else (
    echo ❌ Failed to install server dependencies
    pause
    exit /b 1
)

REM Check if client directory exists
if not exist "client" (
    echo ❌ Client directory not found. Please ensure the client files are in the 'client' directory.
    pause
    exit /b 1
)

echo ✅ Client directory found

REM Create environment file if it doesn't exist
if not exist ".env" (
    echo 📝 Creating environment file...
    (
        echo # Database Configuration
        echo MONGODB_URI=mongodb://localhost:27017/wakesafe
        echo REDIS_URL=redis://localhost:6379
        echo.
        echo # JWT Configuration
        echo JWT_SECRET=your-super-secret-jwt-key-change-this-in-production
        echo.
        echo # Server Configuration
        echo PORT=8080
        echo NODE_ENV=development
        echo.
        echo # Google Cloud Storage
        echo GCS_BUCKET=your-gcs-bucket-name
        echo GOOGLE_APPLICATION_CREDENTIALS=./config/gcp-key.json
        echo.
        echo # AI Server Configuration
        echo AI_SERVER_URL=http://localhost:8000
        echo AI_SERVER_TOKEN=your-ai-server-token
        echo.
        echo # CORS Configuration
        echo ALLOWED_ORIGINS=http://localhost:3000,http://localhost:8000,http://127.0.0.1:3000
    ) > .env
    echo ✅ Environment file created. Please update the values in .env file.
) else (
    echo ✅ Environment file already exists
)

REM Create necessary directories
echo 📁 Creating necessary directories...
if not exist "config" mkdir config
if not exist "logs" mkdir logs
if not exist "uploads" mkdir uploads

echo ✅ Directories created

REM Display setup completion message
echo.
echo 🎉 WakeSafe Client setup completed!
echo.
echo 📋 Next steps:
echo 1. Update the .env file with your configuration
echo 2. Add your Google Cloud Storage credentials to config/gcp-key.json
echo 3. Start MongoDB and Redis services
echo 4. Run the server: npm start
echo 5. Open client/index.html in your browser
echo.
echo 🌐 Server will be available at: http://localhost:8080
echo 📱 Client will be available at: http://localhost:8080/client
echo.
echo 📚 For more information, see the README files in the project directories.
echo.
echo Happy coding! 🚗💨
pause
