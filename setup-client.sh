#!/bin/bash

# WakeSafe Client Setup Script
echo "🚀 Setting up WakeSafe Client..."

# Check if Node.js is installed
if ! command -v node &> /dev/null; then
    echo "❌ Node.js is not installed. Please install Node.js first."
    exit 1
fi

# Check if npm is installed
if ! command -v npm &> /dev/null; then
    echo "❌ npm is not installed. Please install npm first."
    exit 1
fi

echo "✅ Node.js and npm are installed"

# Install server dependencies
echo "📦 Installing server dependencies..."
cd "$(dirname "$0")"
npm install

if [ $? -eq 0 ]; then
    echo "✅ Server dependencies installed successfully"
else
    echo "❌ Failed to install server dependencies"
    exit 1
fi

# Check if client directory exists
if [ ! -d "client" ]; then
    echo "❌ Client directory not found. Please ensure the client files are in the 'client' directory."
    exit 1
fi

echo "✅ Client directory found"

# Create environment file if it doesn't exist
if [ ! -f ".env" ]; then
    echo "📝 Creating environment file..."
    cat > .env << EOF
# Database Configuration
MONGODB_URI=mongodb://localhost:27017/wakesafe
REDIS_URL=redis://localhost:6379

# JWT Configuration
JWT_SECRET=your-super-secret-jwt-key-change-this-in-production

# Server Configuration
PORT=8080
NODE_ENV=development

# Google Cloud Storage
GCS_BUCKET=your-gcs-bucket-name
GOOGLE_APPLICATION_CREDENTIALS=./config/gcp-key.json

# AI Server Configuration
AI_SERVER_URL=http://localhost:8000
AI_SERVER_TOKEN=your-ai-server-token

# CORS Configuration
ALLOWED_ORIGINS=http://localhost:3000,http://localhost:8000,http://127.0.0.1:3000
EOF
    echo "✅ Environment file created. Please update the values in .env file."
else
    echo "✅ Environment file already exists"
fi

# Check if MongoDB is running
echo "🔍 Checking MongoDB connection..."
if command -v mongosh &> /dev/null; then
    if mongosh --eval "db.runCommand('ping')" --quiet &> /dev/null; then
        echo "✅ MongoDB is running"
    else
        echo "⚠️  MongoDB is not running. Please start MongoDB before running the server."
    fi
else
    echo "⚠️  MongoDB client not found. Please ensure MongoDB is installed and running."
fi

# Check if Redis is running
echo "🔍 Checking Redis connection..."
if command -v redis-cli &> /dev/null; then
    if redis-cli ping &> /dev/null; then
        echo "✅ Redis is running"
    else
        echo "⚠️  Redis is not running. Please start Redis before running the server."
    fi
else
    echo "⚠️  Redis client not found. Please ensure Redis is installed and running."
fi

# Create necessary directories
echo "📁 Creating necessary directories..."
mkdir -p config
mkdir -p logs
mkdir -p uploads

echo "✅ Directories created"

# Set permissions
echo "🔐 Setting permissions..."
chmod +x server.js
chmod 755 client/
chmod 644 client/*.html
chmod 644 client/styles/*.css
chmod 644 client/js/*.js

echo "✅ Permissions set"

# Display setup completion message
echo ""
echo "🎉 WakeSafe Client setup completed!"
echo ""
echo "📋 Next steps:"
echo "1. Update the .env file with your configuration"
echo "2. Add your Google Cloud Storage credentials to config/gcp-key.json"
echo "3. Start MongoDB and Redis services"
echo "4. Run the server: npm start"
echo "5. Open client/index.html in your browser"
echo ""
echo "🌐 Server will be available at: http://localhost:8080"
echo "📱 Client will be available at: http://localhost:8080/client"
echo ""
echo "📚 For more information, see the README files in the project directories."
echo ""
echo "Happy coding! 🚗💨"
