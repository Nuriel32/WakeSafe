# 🔄 Presigned Upload & AI Processing Flow

## 📋 Complete Integration Overview

This document describes the complete flow for client photo uploads using presigned URLs, WebSocket notifications, and AI processing with automatic folder movement.

## 🎯 Flow Architecture

```
Mobile App → Backend API → Google Cloud Storage → AI Server → Backend → WebSocket → Mobile App
```

## 📱 1. Mobile App Photo Capture & Upload

### Step 1: Get Presigned URL
```typescript
// Mobile app requests presigned URL
POST /api/upload/presigned
{
  "fileName": "photo_000001_1703123456789.jpg",
  "sessionId": "session_123",
  "sequenceNumber": 1,
  "timestamp": 1703123456789,
  "location": { "lat": 32.0853, "lng": 34.7818 },
  "clientMeta": {
    "userAgent": "WakeSafe Mobile App",
    "captureType": "continuous",
    "sequenceNumber": 1
  }
}
```

### Step 2: Direct Upload to GCS
```typescript
// Mobile app uploads directly to GCS using presigned URL
PUT {presignedUrl}
Content-Type: image/jpeg
[Binary image data]
```

### Step 3: Confirm Upload
```typescript
// Mobile app confirms successful upload
POST /api/upload/confirm
{
  "photoId": "photo_123",
  "uploadSuccess": true
}
```

## 🖥️ 2. Backend Processing

### Presigned URL Generation
- **File**: `server/controllers/presignedUploadController.js`
- **Function**: `generatePresignedUrl()`
- **Process**:
  1. Validates file format and session
  2. Generates unique GCS path: `drivers/{userId}/sessions/{sessionId}/before-ai/{sequenceNumber}_{timestamp}_{random}.jpg`
  3. Creates presigned URL with 1-hour expiry
  4. Creates Photo document with `pending` status
  5. Updates session statistics

### Upload Confirmation
- **File**: `server/controllers/presignedUploadController.js`
- **Function**: `confirmUpload()`
- **Process**:
  1. Updates photo status to `uploaded`
  2. Generates signed URL for AI server
  3. Queues photo for AI processing
  4. Triggers WebSocket notification

## 🤖 3. AI Server Processing

### Photo Analysis Request
```python
# AI server receives photo for analysis
POST /analyze
{
  "photo_id": "photo_123",
  "gcs_url": "https://storage.googleapis.com/bucket/drivers/user123/sessions/session123/before-ai/000001_1703123456789_abc123.jpg"
}
```

### AI Processing Response
```python
{
  "photo_id": "photo_123",
  "prediction": "drowsy",
  "confidence": 0.85,
  "ear": 0.23,
  "head_pose": {"pitch": 15.2, "yaw": -5.1, "roll": 2.3},
  "processing_time": 1.2,
  "face_detected": true,
  "eyes_detected": true,
  "processed_at": "2023-12-21T10:30:45Z"
}
```

## 🔄 4. File Movement & WebSocket Notifications

### Automatic File Movement
- **File**: `server/services/aiProcessingService.js`
- **Function**: `updatePhotoWithResults()`
- **Process**:
  1. AI processing completes
  2. File moved from `before-ai/` to `after-ai/` folder
  3. Photo document updated with new GCS path
  4. AI results stored in database
  5. WebSocket notification sent to client

### WebSocket Events
```javascript
// Upload notifications
socket.emit('upload_started', { photoId, fileName });
socket.emit('upload_progress', { photoId, progress, fileName });
socket.emit('upload_completed', { photoId, fileName, gcsPath, aiProcessingQueued });
socket.emit('upload_failed', { photoId, fileName, error });

// AI processing notifications
socket.emit('ai_processing_complete', { photoId, results, processingTime });

// Fatigue detection alerts
socket.emit('fatigue_detection', {
  sessionId,
  fatigueLevel: 'drowsy',
  confidence: 0.85,
  photoId,
  aiResults: {...},
  alert: {
    type: 'fatigue_detection',
    severity: 'medium',
    message: 'Driver appears drowsy (85% confidence)',
    actionRequired: false
  }
});
```

## 📁 5. GCS Folder Structure

```
drivers/
├── {userId}/
│   ├── sessions/
│   │   ├── {sessionId}/
│   │   │   ├── before-ai/          # Photos awaiting AI processing
│   │   │   │   ├── 000001_1703123456789_abc123.jpg
│   │   │   │   ├── 000002_1703123457890_def456.jpg
│   │   │   │   └── ...
│   │   │   └── after-ai/           # Photos after AI processing
│   │   │       ├── 000001_1703123456789_abc123.jpg
│   │   │       ├── 000002_1703123457890_def456.jpg
│   │   │       └── ...
```

## 🔧 6. Configuration & Environment Variables

### Backend Environment Variables
```bash
GCS_BUCKET=wakesafe-photos
JWT_SECRET=your-jwt-secret
MONGODB_URL=mongodb://...
REDIS_URL=redis://...
AI_SERVER_URL=https://wakesafe-ai-xxx.run.app
AI_SERVER_TOKEN=your-ai-server-token
```

### AI Server Environment Variables
```bash
WAKESAFE_API_URL=https://wakesafe-api-xxx.run.app
WAKESAFE_API_TOKEN=your-backend-token
AI_SERVER_SECRET_KEY=your-ai-secret
```

## 📊 7. Database Schema Updates

### Photo Schema
```javascript
{
  _id: ObjectId,
  sessionId: String,
  userId: String,
  gcsPath: String,           // Updated after AI processing
  name: String,
  sequenceNumber: Number,
  captureTimestamp: Number,
  folderType: String,        // 'before-ai' or 'after-ai'
  location: Object,
  clientMeta: Object,
  prediction: String,        // 'pending', 'alert', 'drowsy', 'sleeping', 'unknown'
  aiProcessingStatus: String, // 'pending', 'processing', 'completed', 'failed'
  uploadStatus: String,      // 'pending', 'uploaded', 'failed'
  aiResults: {
    confidence: Number,
    ear: Number,
    headPose: Object,
    processingTime: Number,
    processedAt: Date
  },
  uploadedAt: Date,
  createdAt: Date
}
```

## 🚀 8. API Endpoints

### New Presigned Upload Endpoints
```bash
# Generate presigned URL
POST /api/upload/presigned
Authorization: Bearer {token}
Content-Type: application/json

# Confirm upload success
POST /api/upload/confirm
Authorization: Bearer {token}
Content-Type: application/json

# Get upload status
GET /api/upload/status/:photoId
Authorization: Bearer {token}
```

### Existing Endpoints (Enhanced)
```bash
# Get photo statistics (for AI server monitoring)
GET /api/photos/stats
Authorization: Bearer {token}

# Get unprocessed photos (for AI server)
GET /api/photos/unprocessed
Authorization: Bearer {token}

# Update AI results
PUT /api/photos/:photoId/ai-results
Authorization: Bearer {token}
```

## 🔍 9. Error Handling & Monitoring

### Upload Error Scenarios
1. **Presigned URL Generation Failed**
   - Invalid file format
   - Session not found
   - GCS permissions issue

2. **Direct Upload to GCS Failed**
   - Network timeout
   - Invalid presigned URL
   - File size exceeded

3. **Upload Confirmation Failed**
   - Photo not found
   - AI server unavailable
   - Database update failed

### Monitoring & Logging
- All upload events logged with timestamps
- WebSocket connection status tracked
- AI processing queue monitored
- File movement operations logged
- Error rates and performance metrics

## 🧪 10. Testing the Complete Flow

### Test Sequence
1. **Start Mobile App Session**
   ```bash
   # Mobile app starts continuous capture
   # WebSocket connects successfully
   ```

2. **Capture & Upload Photo**
   ```bash
   # Photo captured every second
   # Presigned URL generated
   # Direct upload to GCS
   # Upload confirmed
   ```

3. **AI Processing**
   ```bash
   # AI server receives photo
   # Analysis completed
   # File moved to after-ai folder
   # WebSocket notification sent
   ```

4. **Fatigue Detection**
   ```bash
   # If drowsy/sleeping detected
   # Alert sent via WebSocket
   # Mobile app displays warning
   ```

### Verification Points
- ✅ Presigned URLs generated correctly
- ✅ Direct uploads to GCS successful
- ✅ Files moved from before-ai to after-ai
- ✅ WebSocket notifications received
- ✅ AI processing results stored
- ✅ Fatigue alerts triggered appropriately

## 🎯 11. Performance Optimizations

### Upload Performance
- **Parallel Processing**: Multiple photos uploaded simultaneously
- **Chunked Uploads**: Large files uploaded in chunks
- **Retry Logic**: Automatic retry on network failures
- **Progress Tracking**: Real-time upload progress

### AI Processing Performance
- **Queue Management**: Efficient photo processing queue
- **Batch Processing**: Multiple photos processed together
- **Caching**: AI model caching for faster processing
- **Load Balancing**: Multiple AI server instances

### WebSocket Performance
- **Connection Pooling**: Efficient WebSocket connections
- **Event Batching**: Multiple events batched together
- **Reconnection Logic**: Automatic reconnection on failures
- **Message Compression**: Compressed WebSocket messages

## 🔐 12. Security Considerations

### Presigned URL Security
- **Time-Limited**: URLs expire after 1 hour
- **User-Specific**: URLs tied to authenticated user
- **Session-Validated**: URLs require active session
- **Path-Restricted**: URLs limited to specific GCS paths

### Data Privacy
- **Encrypted Storage**: All photos encrypted in GCS
- **Access Control**: Strict IAM permissions
- **Audit Logging**: All access logged
- **Data Retention**: Configurable retention policies

This complete flow ensures efficient, secure, and real-time photo processing with automatic AI analysis and fatigue detection alerts! 🚀
