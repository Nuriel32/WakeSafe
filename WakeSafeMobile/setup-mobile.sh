#!/bin/bash

# WakeSafe Mobile App Setup Script
echo "🚀 Setting up WakeSafe Mobile App..."

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

# Check if Expo CLI is installed
if ! command -v expo &> /dev/null; then
    echo "📦 Installing Expo CLI..."
    npm install -g @expo/cli
    if [ $? -eq 0 ]; then
        echo "✅ Expo CLI installed successfully"
    else
        echo "❌ Failed to install Expo CLI"
        exit 1
    fi
else
    echo "✅ Expo CLI is already installed"
fi

# Install dependencies
echo "📦 Installing project dependencies..."
npm install

if [ $? -eq 0 ]; then
    echo "✅ Dependencies installed successfully"
else
    echo "❌ Failed to install dependencies"
    exit 1
fi

# Create necessary directories
echo "📁 Creating necessary directories..."
mkdir -p src/screens/auth
mkdir -p src/screens/main
mkdir -p src/hooks
mkdir -p src/types
mkdir -p src/config
mkdir -p src/services
mkdir -p src/utils

echo "✅ Directories created"

# Set permissions
echo "🔐 Setting permissions..."
chmod +x setup-mobile.sh

echo "✅ Permissions set"

# Display setup completion message
echo ""
echo "🎉 WakeSafe Mobile App setup completed!"
echo ""
echo "📋 Next steps:"
echo "1. Update the API endpoints in src/config/index.ts"
echo "2. Start the development server: npm start"
echo "3. Install Expo Go app on your mobile device"
echo "4. Scan the QR code to run the app"
echo ""
echo "📱 Available commands:"
echo "- npm start          # Start Expo development server"
echo "- npm run android    # Run on Android (requires Android Studio)"
echo "- npm run ios        # Run on iOS (requires Xcode on macOS)"
echo "- npm run web        # Run in web browser"
echo ""
echo "🌐 Make sure your WakeSafe server is running on:"
echo "   http://192.168.1.133:8080 (update IP in config if needed)"
echo ""
echo "📚 For more information, see the README.md file."
echo ""
echo "Happy coding! 🚗💨"
