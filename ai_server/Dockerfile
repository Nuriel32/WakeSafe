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

# Upgrade pip first
RUN pip install --upgrade pip

# Copy requirements and install Python dependencies in stages
COPY requirements.txt .

# Install core dependencies first (lighter packages)
RUN pip install --no-cache-dir \
    fastapi==0.104.1 \
    uvicorn==0.24.0 \
    python-multipart==0.0.6 \
    requests==2.31.0 \
    python-dotenv==1.0.0 \
    pydantic==2.5.0 \
    pydantic-settings==2.1.0 \
    loguru==0.7.2 \
    aiofiles==23.2.1 \
    PyJWT==2.8.0 \
    httpx==0.25.2

# Install database dependencies
RUN pip install --no-cache-dir \
    pymongo==4.5.0 \
    motor==3.3.2 \
    redis==5.0.1

# Install image processing (lighter versions)
RUN pip install --no-cache-dir \
    Pillow==10.0.1 \
    imutils==0.5.4

# Install AI dependencies (heaviest packages last)
RUN pip install --no-cache-dir \
    numpy==1.24.3 \
    opencv-python==4.8.1.78

# Install dlib separately (can be problematic)
RUN pip install --no-cache-dir dlib==19.24.2 || \
    pip install --no-cache-dir dlib

# Install TensorFlow (optional, can be heavy)
RUN pip install --no-cache-dir tensorflow==2.13.0 || \
    echo "TensorFlow installation failed, continuing without it"

# Copy application code
COPY . .

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
