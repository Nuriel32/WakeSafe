# Multi-stage build for WakeSafe AI Server
FROM python:3.9-slim AS base

# Install system dependencies
RUN apt-get update && apt-get install -y \
    build-essential \
    cmake \
    libopencv-dev \
    libdlib-dev \
    libblas-dev \
    liblapack-dev \
    libatlas3-base \
    gfortran \
    wget \
    curl \
    && rm -rf /var/lib/apt/lists/*

# Set working directory
WORKDIR /app

# Copy requirements and install Python dependencies
COPY ai_server/requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

# Copy application code
COPY ai_server/ .

# Create necessary directories
RUN mkdir -p models logs config

# Download AI models
RUN wget -O models/haarcascade_frontalface_default.xml \
    https://raw.githubusercontent.com/opencv/opencv/master/data/haarcascades/haarcascade_frontalface_default.xml

RUN wget -O models/haarcascade_eye.xml \
    https://raw.githubusercontent.com/opencv/opencv/master/data/haarcascades/haarcascade_eye.xml

RUN wget -O shape_predictor_68_face_landmarks.dat.bz2 \
    http://dlib.net/files/shape_predictor_68_face_landmarks.dat.bz2 \
    && bunzip2 shape_predictor_68_face_landmarks.dat.bz2 \
    && mv shape_predictor_68_face_landmarks.dat models/

# Create a placeholder MobileNet model (you'll need to replace this with your actual model)
RUN echo "Placeholder for MobileNet model" > models/fatigue_detection_model.tflite

# Set environment variables
ENV PYTHONPATH=/app
ENV HOST=0.0.0.0
ENV PORT=8081

# Expose port
EXPOSE 8081

# Health check
HEALTHCHECK --interval=30s --timeout=30s --start-period=5s --retries=3 \
    CMD curl -f http://localhost:8081/health || exit 1

# Run the application
CMD ["python", "start.py"]
