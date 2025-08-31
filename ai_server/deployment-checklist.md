# 🚀 WakeSafe AI Server Deployment Checklist

## ✅ **Pre-Deployment Checks**

### **1. Dependencies Fixed**
- [x] Removed invalid `asyncio==3.4.3` from requirements.txt
- [x] Added missing `motor==3.3.2` for async MongoDB
- [x] Added missing `pydantic-settings==2.1.0`
- [x] Created missing `database.py` and `redis_client.py`

### **2. AI Models Required**
- [ ] Download `haarcascade_frontalface_default.xml`
- [ ] Download `haarcascade_eye.xml`
- [ ] Download `shape_predictor_68_face_landmarks.dat`
- [ ] Add your trained `fatigue_detection_model.tflite`

### **3. Environment Configuration**
- [ ] Copy `env.example` to `.env`
- [ ] Set `WAKESAFE_API_TOKEN`
- [ ] Set `AI_SERVER_SECRET_KEY`
- [ ] Configure `MONGODB_URL`
- [ ] Configure `REDIS_URL`
- [ ] Add GCP credentials to `config/gcp-key.json`

### **4. System Dependencies**
- [ ] Install Python 3.9+
- [ ] Install system packages: `build-essential`, `cmake`, `libopencv-dev`, `libdlib-dev`
- [ ] Install Redis server
- [ ] Install MongoDB

## 🐳 **Docker Deployment**

### **1. Build Issues Fixed**
- [x] Created proper Dockerfile with system dependencies
- [x] Added model downloads in Dockerfile
- [x] Added health checks
- [x] Set proper environment variables

### **2. Docker Commands**
```bash
# Build the image
docker build -t wakesafe-ai-server .

# Run with environment variables
docker run -p 8000:8000 \
  -e MONGODB_URL=mongodb://host.docker.internal:27017 \
  -e REDIS_URL=redis://host.docker.internal:6379 \
  -e WAKESAFE_API_TOKEN=your_token \
  -e AI_SERVER_SECRET_KEY=your_secret \
  wakesafe-ai-server
```

## 🔧 **Manual Deployment**

### **1. Setup Script**
```bash
# Run setup script
cd ai_server
./setup.sh

# Or manually:
mkdir -p models logs config
pip install -r requirements.txt
# Download models manually
# Configure .env file
```

### **2. Start Services**
```bash
# Start Redis
redis-server

# Start MongoDB
mongod

# Start AI Server
python start.py
```

## 🚨 **Common Issues & Solutions**

### **1. Import Errors**
- **Issue**: `ModuleNotFoundError: No module named 'motor'`
- **Solution**: `pip install motor==3.3.2`

### **2. Model Loading Errors**
- **Issue**: `FileNotFoundError: models/haarcascade_frontalface_default.xml`
- **Solution**: Run `./setup.sh` or download models manually

### **3. Database Connection Errors**
- **Issue**: `Connection refused` for MongoDB/Redis
- **Solution**: Ensure services are running and URLs are correct

### **4. Permission Errors**
- **Issue**: Cannot create directories or write logs
- **Solution**: Check file permissions and run with appropriate user

### **5. Memory Issues**
- **Issue**: Out of memory during model loading
- **Solution**: Increase Docker memory limits or use smaller models

## 📊 **Health Check Endpoints**

### **1. AI Server Health**
```bash
curl http://localhost:8000/health
```

### **2. Metrics**
```bash
curl -H "Authorization: Bearer your_token" http://localhost:8000/metrics
```

### **3. Test Analysis**
```bash
curl -X POST http://localhost:8000/analyze \
  -H "Authorization: Bearer your_token" \
  -H "Content-Type: application/json" \
  -d '{"photo_id":"test","gcs_url":"https://example.com/photo.jpg"}'
```

## 🔍 **Debugging**

### **1. Check Logs**
```bash
# View application logs
tail -f logs/ai_server.log

# View Docker logs
docker logs wakesafe-ai-server
```

### **2. Verify Dependencies**
```bash
# Check Python packages
pip list | grep -E "(motor|pydantic|fastapi|opencv|dlib)"

# Check system packages
dpkg -l | grep -E "(opencv|dlib|cmake)"
```

### **3. Test Individual Components**
```bash
# Test MongoDB connection
python -c "import motor; print('MongoDB driver OK')"

# Test Redis connection
python -c "import redis; print('Redis driver OK')"

# Test OpenCV
python -c "import cv2; print('OpenCV OK')"

# Test Dlib
python -c "import dlib; print('Dlib OK')"
```

## ✅ **Success Indicators**

- [ ] Health check returns `{"status": "healthy"}`
- [ ] All services show `true` in health response
- [ ] Models load without errors
- [ ] Can process test images
- [ ] Metrics endpoint returns data
- [ ] No error messages in logs

## 🆘 **Emergency Contacts**

If deployment fails:
1. Check logs for specific error messages
2. Verify all dependencies are installed
3. Ensure environment variables are set correctly
4. Test individual components
5. Use Docker for consistent environment
