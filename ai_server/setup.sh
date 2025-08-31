#!/bin/bash

# WakeSafe AI Server Setup Script
echo "🚀 Setting up WakeSafe AI Server..."

# Create necessary directories
mkdir -p models logs config

# Copy environment file
if [ ! -f .env ]; then
    cp env.example .env
    echo "📝 Created .env file from template"
    echo "⚠️  Please edit .env file with your configuration"
fi

# Download AI models
echo "📥 Downloading AI models..."

# HaarCascade models
if [ ! -f models/haarcascade_frontalface_default.xml ]; then
    wget -O models/haarcascade_frontalface_default.xml \
        https://raw.githubusercontent.com/opencv/opencv/master/data/haarcascades/haarcascade_frontalface_default.xml
    echo "✅ Downloaded HaarCascade face model"
fi

if [ ! -f models/haarcascade_eye.xml ]; then
    wget -O models/haarcascade_eye.xml \
        https://raw.githubusercontent.com/opencv/opencv/master/data/haarcascades/haarcascade_eye.xml
    echo "✅ Downloaded HaarCascade eye model"
fi

# Dlib shape predictor
if [ ! -f models/shape_predictor_68_face_landmarks.dat ]; then
    wget -O shape_predictor_68_face_landmarks.dat.bz2 \
        http://dlib.net/files/shape_predictor_68_face_landmarks.dat.bz2
    bunzip2 shape_predictor_68_face_landmarks.dat.bz2
    mv shape_predictor_68_face_landmarks.dat models/
    echo "✅ Downloaded Dlib shape predictor"
fi

# Create placeholder MobileNet model
if [ ! -f models/fatigue_detection_model.tflite ]; then
    echo "⚠️  Creating placeholder MobileNet model"
    echo "Placeholder for MobileNet model" > models/fatigue_detection_model.tflite
    echo "⚠️  Please replace with your actual trained model"
fi

# Install Python dependencies
echo "📦 Installing Python dependencies..."
pip install -r requirements.txt

echo "✅ Setup completed!"
echo ""
echo "📋 Next steps:"
echo "1. Edit .env file with your configuration"
echo "2. Add your GCP credentials to config/gcp-key.json"
echo "3. Replace models/fatigue_detection_model.tflite with your trained model"
echo "4. Start the server: python start.py"
