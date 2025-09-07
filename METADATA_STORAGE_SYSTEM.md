# 📊 WakeSafe Metadata Storage System

## 🎯 Overview

The WakeSafe system now includes comprehensive metadata storage across MongoDB and Redis to track every aspect of the application, from user behavior to system performance. This document outlines the complete metadata architecture.

## 🗄️ MongoDB Collections

### 1. **Photos Collection** (`PhotoSchema`)

**Purpose**: Store comprehensive metadata for every photo captured and processed.

#### **Core Fields**
```javascript
{
  // Basic Information
  sessionId: ObjectId,           // Reference to DriverSession
  userId: ObjectId,              // Reference to User
  gcsPath: String,               // Google Cloud Storage path
  fileName: String,              // Generated filename
  originalName: String,          // Original filename
  
  // Continuous Capture
  sequenceNumber: Number,        // Photo sequence in session
  captureTimestamp: Number,      // Unix timestamp of capture
  folderType: String,            // 'before-ai' or 'after-ai'
  
  // AI Processing
  prediction: String,            // 'alert', 'drowsy', 'sleeping', 'unknown', 'pending'
  aiProcessingStatus: String,    // 'pending', 'processing', 'completed', 'failed'
  aiResults: {
    confidence: Number,          // AI confidence score (0-1)
    ear: Number,                 // Eye Aspect Ratio
    headPose: {
      pitch: Number,
      yaw: Number,
      roll: Number
    },
    processingTime: Number,      // Processing time in ms
    processedAt: Date
  },
  
  // Location Data
  location: {
    lat: Number,
    lng: Number,
    accuracy: Number,
    altitude: Number,
    speed: Number,
    heading: Number,
    timestamp: Date
  },
  
  // Client Metadata
  clientMeta: {
    userAgent: String,
    os: String,
    appVersion: String,
    model: String,
    deviceId: String,
    platform: String,
    captureType: String,         // 'continuous'
    cameraSettings: {
      resolution: String,
      quality: Number,
      flash: Boolean,
      focus: String
    }
  },
  
  // Upload Information
  uploadStatus: String,          // 'pending', 'uploading', 'uploaded', 'failed'
  uploadMethod: String,          // 'presigned'
  uploadDuration: Number,        // Upload time in ms
  uploadRetries: Number,         // Number of retry attempts
  
  // Processing Information
  processingQueuePosition: Number,
  processingStartedAt: Date,
  processingCompletedAt: Date,
  
  // Quality Assessment
  imageQuality: {
    blurScore: Number,
    brightness: Number,
    contrast: Number,
    isValid: Boolean
  },
  
  // WebSocket Events
  websocketEvents: [{
    eventType: String,
    timestamp: Date,
    data: Mixed
  }]
}
```

#### **Indexes**
- `{ userId: 1, sessionId: 1 }`
- `{ aiProcessingStatus: 1 }`
- `{ prediction: 1 }`
- `{ uploadStatus: 1 }`
- `{ 'location.lat': 1, 'location.lng': 1 }`
- `{ 'clientMeta.deviceId': 1 }`
- `{ captureTimestamp: -1 }`

### 2. **Driver Sessions Collection** (`DriverSession`)

**Purpose**: Track comprehensive driving session metadata and statistics.

#### **Core Fields**
```javascript
{
  // Basic Information
  userId: ObjectId,              // Reference to User
  sessionId: String,             // Unique session identifier
  startTime: Date,
  endTime: Date,
  duration: Number,              // Session duration in ms
  isActive: Boolean,
  status: String,                // 'active', 'paused', 'ended', 'error'
  
  // Location Tracking
  startLocation: {
    lat: Number,
    lng: Number,
    accuracy: Number,
    address: String
  },
  endLocation: {
    lat: Number,
    lng: Number,
    accuracy: Number,
    address: String
  },
  route: [{
    lat: Number,
    lng: Number,
    timestamp: Date,
    speed: Number,
    heading: Number
  }],
  
  // Photo Statistics
  totalImagesUploaded: Number,
  totalImagesProcessed: Number,
  totalImagesFailed: Number,
  photos: [ObjectId],            // References to Photo documents
  
  // AI Processing Statistics
  aiProcessingStats: {
    totalProcessed: Number,
    alertCount: Number,
    drowsyCount: Number,
    sleepingCount: Number,
    unknownCount: Number,
    avgConfidence: Number,
    avgProcessingTime: Number
  },
  
  // Upload Statistics
  uploadStats: {
    totalUploads: Number,
    successfulUploads: Number,
    failedUploads: Number,
    avgUploadDuration: Number,
    totalUploadDuration: Number
  },
  
  // Device Information
  deviceInfo: {
    platform: String,
    os: String,
    appVersion: String,
    deviceId: String,
    model: String
  },
  
  // Session Configuration
  sessionConfig: {
    captureInterval: Number,     // Photo capture interval in ms
    uploadBatchSize: Number,
    aiProcessingEnabled: Boolean,
    locationTrackingEnabled: Boolean,
    websocketEnabled: Boolean
  },
  
  // Performance Metrics
  performanceMetrics: {
    avgPhotoSize: Number,
    totalDataUploaded: Number,   // in bytes
    networkLatency: Number,
    batteryUsage: Number
  },
  
  // Session Events
  events: [{
    eventType: String,
    timestamp: Date,
    data: Mixed,
    source: String               // 'mobile', 'server', 'ai', 'websocket'
  }],
  
  // Error Logging
  errorLog: [{
    errorType: String,
    message: String,
    timestamp: Date,
    stack: String
  }]
}
```

### 3. **Users Collection** (`User`)

**Purpose**: Store comprehensive user profile and usage metadata.

#### **Core Fields**
```javascript
{
  // Basic Information
  firstName: String,
  lastName: String,
  email: String,
  phone: String,
  carNumber: String,
  
  // Account Information
  joinDate: Date,
  lastLogin: Date,
  isActive: Boolean,
  isVerified: Boolean,
  verificationToken: String,
  resetPasswordToken: String,
  resetPasswordExpires: Date,
  
  // Profile Information
  profile: {
    avatar: String,
    dateOfBirth: Date,
    gender: String,              // 'male', 'female', 'other'
    address: {
      street: String,
      city: String,
      state: String,
      zipCode: String,
      country: String
    },
    emergencyContact: {
      name: String,
      phone: String,
      relationship: String
    }
  },
  
  // Vehicle Information
  vehicle: {
    make: String,
    model: String,
    year: Number,
    color: String,
    licensePlate: String,
    vin: String
  },
  
  // Usage Statistics
  usageStats: {
    totalSessions: Number,
    totalDrivingTime: Number,    // in milliseconds
    totalPhotosUploaded: Number,
    totalPhotosProcessed: Number,
    totalAlerts: Number,
    totalDrowsyDetections: Number,
    totalSleepingDetections: Number,
    avgSessionDuration: Number,
    lastSessionDate: Date
  },
  
  // Preferences and Settings
  preferences: {
    notifications: {
      email: Boolean,
      push: Boolean,
      sms: Boolean,
      fatigueAlerts: Boolean,
      weeklyReports: Boolean
    },
    privacy: {
      shareLocation: Boolean,
      shareStats: Boolean,
      dataRetention: Number      // days
    },
    app: {
      theme: String,             // 'light', 'dark'
      language: String,
      captureInterval: Number,
      autoUpload: Boolean
    }
  },
  
  // Device Information
  devices: [{
    deviceId: String,
    platform: String,
    os: String,
    appVersion: String,
    model: String,
    lastSeen: Date,
    isActive: Boolean
  }],
  
  // Subscription and Billing
  subscription: {
    plan: String,                // 'free', 'premium', 'enterprise'
    status: String,              // 'active', 'cancelled', 'expired'
    startDate: Date,
    endDate: Date,
    autoRenew: Boolean
  },
  
  // Security and Access
  security: {
    twoFactorEnabled: Boolean,
    twoFactorSecret: String,
    loginAttempts: Number,
    lockUntil: Date,
    lastPasswordChange: Date
  },
  
  // Activity Log
  activityLog: [{
    action: String,
    timestamp: Date,
    ipAddress: String,
    userAgent: String,
    deviceId: String,
    metadata: Mixed
  }]
}
```

### 4. **System Analytics Collection** (`SystemAnalytics`)

**Purpose**: Store system-wide performance and usage analytics.

#### **Core Fields**
```javascript
{
  // Time Information
  date: Date,
  hour: Number,                  // 0-23
  
  // System Performance
  performance: {
    avgResponseTime: Number,     // milliseconds
    totalRequests: Number,
    successfulRequests: Number,
    failedRequests: Number,
    errorRate: Number,           // percentage
    cpuUsage: Number,            // percentage
    memoryUsage: Number,         // percentage
    diskUsage: Number,           // percentage
    networkLatency: Number       // milliseconds
  },
  
  // User Activity
  userActivity: {
    activeUsers: Number,
    newUsers: Number,
    totalSessions: Number,
    activeSessions: Number,
    avgSessionDuration: Number,
    peakConcurrentUsers: Number
  },
  
  // Photo Processing
  photoProcessing: {
    totalPhotosUploaded: Number,
    totalPhotosProcessed: Number,
    totalPhotosFailed: Number,
    avgUploadTime: Number,
    avgProcessingTime: Number,
    queueSize: Number,
    processingThroughput: Number // photos per minute
  },
  
  // AI Processing
  aiProcessing: {
    totalAnalyses: Number,
    alertDetections: Number,
    drowsyDetections: Number,
    sleepingDetections: Number,
    unknownDetections: Number,
    avgConfidence: Number,
    avgProcessingTime: Number,
    modelAccuracy: Number        // percentage
  },
  
  // Storage Metrics
  storage: {
    totalDataUploaded: Number,   // bytes
    totalDataStored: Number,     // bytes
    gcsOperations: Number,
    gcsErrors: Number,
    avgFileSize: Number,
    storageCost: Number          // in cents
  },
  
  // Network Metrics
  network: {
    totalBandwidth: Number,      // bytes
    uploadBandwidth: Number,     // bytes
    downloadBandwidth: Number,   // bytes
    avgLatency: Number,
    packetLoss: Number,          // percentage
    connectionErrors: Number
  },
  
  // WebSocket Metrics
  websocket: {
    totalConnections: Number,
    activeConnections: Number,
    messagesSent: Number,
    messagesReceived: Number,
    connectionErrors: Number,
    avgConnectionDuration: Number
  },
  
  // Error Tracking
  errors: {
    totalErrors: Number,
    criticalErrors: Number,
    warningErrors: Number,
    infoErrors: Number,
    errorTypes: [{
      type: String,
      count: Number,
      message: String
    }]
  },
  
  // Geographic Distribution
  geographic: {
    countries: [{
      country: String,
      userCount: Number,
      sessionCount: Number
    }],
    regions: [{
      region: String,
      userCount: Number,
      sessionCount: Number
    }]
  },
  
  // Device Analytics
  devices: {
    platforms: [{
      platform: String,
      count: Number,
      percentage: Number
    }],
    osVersions: [{
      os: String,
      version: String,
      count: Number
    }],
    appVersions: [{
      version: String,
      count: Number,
      percentage: Number
    }]
  },
  
  // Business Metrics
  business: {
    revenue: Number,             // in cents
    subscriptions: Number,
    churnRate: Number,           // percentage
    customerSatisfaction: Number, // 1-10 scale
    supportTickets: Number,
    featureUsage: [{
      feature: String,
      usageCount: Number,
      uniqueUsers: Number
    }]
  }
}
```

## 🔴 Redis Cache Structure

### **Key Patterns**

#### **1. Photo Metadata**
```
photo:{photoId} = {
  sessionId: String,
  userId: String,
  gcsPath: String,
  uploadStatus: String,
  aiProcessingStatus: String,
  prediction: String,
  location: Object,
  clientMeta: Object,
  cachedAt: String
}
TTL: 1 hour
```

#### **2. Session Metadata**
```
session_meta:{sessionId} = {
  userId: String,
  startTime: Date,
  isActive: Boolean,
  totalPhotos: Number,
  aiStats: Object,
  uploadStats: Object,
  deviceInfo: Object,
  cachedAt: String
}
TTL: 30 minutes
```

#### **3. User Metadata**
```
user:{userId} = {
  firstName: String,
  lastName: String,
  email: String,
  usageStats: Object,
  preferences: Object,
  devices: Array,
  subscription: Object,
  cachedAt: String
}
TTL: 1 hour
```

#### **4. AI Processing Queue**
```
queue:{queueId} = {
  photoId: String,
  gcsUrl: String,
  priority: Number,
  status: String,
  retryCount: Number,
  createdAt: String,
  cachedAt: String
}
TTL: 1 hour
```

#### **5. System Analytics**
```
analytics:{date} = {
  performance: Object,
  userActivity: Object,
  photoProcessing: Object,
  aiProcessing: Object,
  errors: Object,
  cachedAt: String
}
TTL: 24 hours
```

#### **6. Upload Progress**
```
upload:{uploadId} = {
  photoId: String,
  progress: Number,
  status: String,
  startTime: Date,
  estimatedCompletion: Date,
  updatedAt: String
}
TTL: 1 hour
```

#### **7. WebSocket Connections**
```
websocket:{socketId} = {
  userId: String,
  sessionId: String,
  deviceInfo: Object,
  lastActivity: Date,
  connectedAt: String
}
TTL: 30 minutes
```

#### **8. Real-time Metrics**
```
metrics:{metricType} = {
  value: Number,
  unit: String,
  timestamp: String,
  metadata: Object
}
TTL: 5 minutes
```

#### **9. Counters**
```
counter:{counterName} = Number
TTL: 1 hour
```

#### **10. Lists**
```
list:{listName} = [item1, item2, item3, ...]
TTL: 1 hour
```

## 🔄 Data Flow and Integration

### **1. Photo Upload Flow**
```
Mobile App → Presigned URL → GCS Upload → Backend Confirmation
     ↓
MongoDB: Photo document created
Redis: Photo metadata cached
     ↓
AI Processing Queue → AI Server → Results Update
     ↓
MongoDB: Photo updated with AI results
Redis: Session metadata updated
     ↓
WebSocket: Real-time notifications
```

### **2. Session Management Flow**
```
Session Start → MongoDB: DriverSession created
     ↓
Redis: Session metadata cached
     ↓
Continuous Updates: Location, photos, events
     ↓
MongoDB: Session statistics updated
Redis: Real-time metrics updated
     ↓
Session End → Final statistics and cleanup
```

### **3. User Activity Tracking**
```
User Action → Activity Log Entry
     ↓
MongoDB: User document updated
Redis: User metadata cached
     ↓
System Analytics: Aggregated metrics
     ↓
Real-time Dashboard: Live updates
```

## 📊 Analytics and Reporting

### **1. Real-time Metrics**
- Active users and sessions
- Photo upload/processing rates
- AI detection statistics
- System performance metrics
- Error rates and types

### **2. Historical Analytics**
- Daily/hourly usage patterns
- User behavior trends
- Performance over time
- Geographic distribution
- Device/platform statistics

### **3. Business Intelligence**
- User engagement metrics
- Feature usage statistics
- Revenue and subscription data
- Customer satisfaction scores
- Churn analysis

## 🔧 Implementation Examples

### **1. Storing Photo Metadata**
```javascript
// In presignedUploadController.js
const photo = await Photo.create({
  sessionId,
  userId,
  gcsPath: uploadInfo.gcsPath,
  sequenceNumber: uploadInfo.metadata.sequenceNumber,
  captureTimestamp: uploadInfo.metadata.captureTimestamp,
  location: uploadInfo.metadata.location,
  clientMeta: uploadInfo.metadata.clientMeta,
  // ... other fields
});

// Cache in Redis
await cacheService.storePhotoMetadata(photo._id, {
  sessionId: photo.sessionId,
  userId: photo.userId,
  uploadStatus: photo.uploadStatus,
  aiProcessingStatus: photo.aiProcessingStatus
});
```

### **2. Updating Session Statistics**
```javascript
// In aiProcessingService.js
const session = await DriverSession.findById(photo.sessionId);
await session.updateAIStats(
  results.prediction,
  results.confidence,
  results.processingTime
);

// Update Redis cache
await cacheService.storeSessionMetadata(session.sessionId, {
  aiStats: session.aiProcessingStats,
  uploadStats: session.uploadStats,
  totalPhotos: session.totalImagesUploaded
});
```

### **3. Real-time Metrics**
```javascript
// In server.js
const metrics = {
  activeUsers: await User.countDocuments({ isActive: true }),
  activeSessions: await DriverSession.countDocuments({ isActive: true }),
  photosInQueue: await Photo.countDocuments({ aiProcessingStatus: 'pending' })
};

await cacheService.storeRealTimeMetrics('system', metrics);
```

## 🚀 Performance Optimizations

### **1. Indexing Strategy**
- Compound indexes for common queries
- Sparse indexes for optional fields
- TTL indexes for time-based data
- Text indexes for search functionality

### **2. Caching Strategy**
- Hot data cached in Redis
- TTL-based cache invalidation
- Write-through caching for critical data
- Cache warming for frequently accessed data

### **3. Data Archiving**
- Old analytics data moved to cold storage
- Photo metadata archived after processing
- Session data compressed after completion
- User activity logs rotated monthly

## 🔐 Data Privacy and Security

### **1. Data Encryption**
- Sensitive data encrypted at rest
- PII data hashed or tokenized
- Secure key management
- Regular key rotation

### **2. Access Control**
- Role-based access to metadata
- API rate limiting
- Audit logging for data access
- Data retention policies

### **3. Compliance**
- GDPR compliance for EU users
- Data anonymization options
- Right to deletion implementation
- Consent management

This comprehensive metadata storage system ensures that every aspect of the WakeSafe application is tracked, analyzed, and optimized for the best user experience and system performance! 🎯
