# WakeSafe AI Integration Guide

## 🚗 **Photo Storage Structure for AI Analysis**

### **GCS Bucket Organization**
```
wakesafe-bucket/
├── drivers/
│   ├── {userId}/
│   │   ├── sessions/
│   │   │   ├── {sessionId}/
│   │   │   │   ├── photos/
│   │   │   │   │   ├── {timestamp}_{random}.jpg
│   │   │   │   │   ├── {timestamp}_{random}.png
│   │   │   │   │   └── ...
│   │   │   └── ...
│   └── ...
```

### **File Naming Convention**
- **Format**: `{timestamp}_{random}.{extension}`
- **Example**: `1703123456789_a1b2c3d4.jpg`
- **Benefits**: 
  - Chronological sorting
  - Unique identification
  - No conflicts between uploads

## 📡 **AI Server Integration Endpoints**

### **1. Fetch Unprocessed Photos**
```http
GET /api/photos/unprocessed?limit=50&status=pending
Authorization: Bearer <ai_server_token>
```

**Response:**
```json
{
  "photos": [
    {
      "_id": "photo_id",
      "gcsPath": "drivers/user123/sessions/session456/photos/1703123456789_a1b2c3d4.jpg",
      "gcsUrl": "https://storage.googleapis.com/wakesafe-bucket/drivers/user123/sessions/session456/photos/1703123456789_a1b2c3d4.jpg",
      "userId": {
        "firstName": "John",
        "lastName": "Doe",
        "email": "john@example.com"
      },
      "sessionId": {
        "startTime": "2023-12-20T10:00:00Z",
        "isActive": true
      },
      "location": {
        "lat": 32.0853,
        "lng": 34.7818,
        "accuracy": 10
      },
      "clientMeta": {
        "os": "iOS",
        "appVersion": "1.2.0",
        "model": "iPhone 14"
      },
      "uploadedAt": "2023-12-20T10:15:30Z",
      "aiProcessingStatus": "pending"
    }
  ],
  "count": 1,
  "status": "pending"
}
```

### **2. Update AI Analysis Results**
```http
PUT /api/photos/{photoId}/ai-results
Authorization: Bearer <ai_server_token>
Content-Type: application/json

{
  "prediction": "drowsy",
  "confidence": 0.85,
  "ear": 0.18,
  "headPose": {
    "pitch": 12.5,
    "yaw": -2.1,
    "roll": 1.8
  },
  "processingTime": 245,
  "aiResults": {
    "eyeClosure": 0.75,
    "blinkRate": 0.2,
    "yawnDetected": false
  }
}
```

**Response:**
```json
{
  "message": "AI results updated successfully",
  "photoId": "photo_id",
  "prediction": "drowsy",
  "confidence": 0.85
}
```

### **3. Get Session Photos**
```http
GET /api/photos/session/{sessionId}?limit=100&prediction=drowsy
Authorization: Bearer <ai_server_token>
```

## 🔧 **AI Processing Workflow**

### **Step 1: Fetch Unprocessed Photos**
```python
import requests

def fetch_unprocessed_photos(limit=50):
    response = requests.get(
        'https://wakesafe-api.com/api/photos/unprocessed',
        headers={'Authorization': f'Bearer {AI_TOKEN}'},
        params={'limit': limit, 'status': 'pending'}
    )
    return response.json()['photos']
```

### **Step 2: Process Each Photo**
```python
def process_photo(photo_data):
    # Download image from GCS
    image_url = photo_data['gcsUrl']
    image = download_image(image_url)
    
    # Run AI analysis
    results = ai_model.analyze(image)
    
    # Update results
    update_ai_results(photo_data['_id'], results)
```

### **Step 3: Update Results**
```python
def update_ai_results(photo_id, results):
    payload = {
        'prediction': results['prediction'],
        'confidence': results['confidence'],
        'ear': results['ear'],
        'headPose': results['head_pose'],
        'processingTime': results['processing_time'],
        'aiResults': results['additional_metrics']
    }
    
    requests.put(
        f'https://wakesafe-api.com/api/photos/{photo_id}/ai-results',
        headers={'Authorization': f'Bearer {AI_TOKEN}'},
        json=payload
    )
```

## 📊 **Prediction Categories**

| Status | Description | EAR Range | Head Pose |
|--------|-------------|-----------|-----------|
| `alert` | Driver is fully alert | > 0.25 | Normal |
| `drowsy` | Driver showing signs of fatigue | 0.15 - 0.25 | Slight tilt |
| `sleeping` | Driver appears to be sleeping | < 0.15 | Significant tilt |
| `unknown` | Unable to determine | N/A | N/A |

## 🔒 **Security & Authentication**

### **AI Server Token**
- Use dedicated JWT token for AI server
- Token should have limited permissions
- Rotate tokens regularly

### **Rate Limiting**
- Respect API rate limits
- Implement exponential backoff
- Handle 429 responses gracefully

## 📈 **Performance Optimization**

### **Batch Processing**
```python
def process_batch(photos, batch_size=10):
    for i in range(0, len(photos), batch_size):
        batch = photos[i:i + batch_size]
        # Process batch in parallel
        with ThreadPoolExecutor(max_workers=5) as executor:
            executor.map(process_photo, batch)
```

### **Caching**
- Cache processed results
- Implement retry logic for failed uploads
- Use connection pooling

## 🚨 **Error Handling**

### **Common Error Scenarios**
1. **Photo not found**: 404 - Photo may have been deleted
2. **Invalid prediction**: 400 - Check prediction enum values
3. **Rate limit exceeded**: 429 - Implement backoff
4. **Authentication failed**: 401 - Check token validity

### **Retry Logic**
```python
def update_with_retry(photo_id, results, max_retries=3):
    for attempt in range(max_retries):
        try:
            update_ai_results(photo_id, results)
            return True
        except requests.exceptions.RequestException as e:
            if attempt == max_retries - 1:
                raise e
            time.sleep(2 ** attempt)  # Exponential backoff
```

## 📝 **Monitoring & Logging**

### **Key Metrics to Track**
- Processing time per photo
- Success/failure rates
- Queue length (pending photos)
- API response times
- Error rates by type

### **Logging Format**
```json
{
  "timestamp": "2023-12-20T10:15:30Z",
  "level": "INFO",
  "photo_id": "photo_123",
  "prediction": "drowsy",
  "confidence": 0.85,
  "processing_time": 245,
  "session_id": "session_456",
  "user_id": "user_789"
}
```

## 🔄 **Continuous Processing Loop**

```python
def main_processing_loop():
    while True:
        try:
            # Fetch unprocessed photos
            photos = fetch_unprocessed_photos(limit=50)
            
            if not photos:
                time.sleep(30)  # Wait if no photos
                continue
            
            # Process photos
            for photo in photos:
                process_photo(photo)
                
        except Exception as e:
            logger.error(f"Processing loop error: {e}")
            time.sleep(60)  # Wait before retry
```

This integration guide ensures your AI server can efficiently process WakeSafe photos while maintaining data integrity and system performance! 🚗🤖
