const mongoose = require('mongoose');

const driverSessionSchema = new mongoose.Schema({
  userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  sessionId: { type: String, unique: true, required: true },
  
  // Session Timing
  startTime: { type: Date, default: Date.now },
  endTime: { type: Date },
  duration: { type: Number }, // in milliseconds
  isActive: { type: Boolean, default: true },
  
  // Location Information
  startLocation: {
    lat: { type: Number },
    lng: { type: Number },
    accuracy: { type: Number },
    address: { type: String }
  },
  endLocation: {
    lat: { type: Number },
    lng: { type: Number },
    accuracy: { type: Number },
    address: { type: String }
  },
  route: [{
    lat: { type: Number },
    lng: { type: Number },
    timestamp: { type: Date },
    speed: { type: Number },
    heading: { type: Number }
  }],
  
  // Photo Statistics
  totalImagesUploaded: { type: Number, default: 0 },
  totalImagesProcessed: { type: Number, default: 0 },
  totalImagesFailed: { type: Number, default: 0 },
  photos: [{ type: mongoose.Schema.Types.ObjectId, ref: 'Photo' }],
  
  // AI Processing Statistics
  aiProcessingStats: {
    totalProcessed: { type: Number, default: 0 },
    alertCount: { type: Number, default: 0 },
    drowsyCount: { type: Number, default: 0 },
    sleepingCount: { type: Number, default: 0 },
    unknownCount: { type: Number, default: 0 },
    avgConfidence: { type: Number, default: 0 },
    avgProcessingTime: { type: Number, default: 0 }
  },
  
  // Upload Statistics
  uploadStats: {
    totalUploads: { type: Number, default: 0 },
    successfulUploads: { type: Number, default: 0 },
    failedUploads: { type: Number, default: 0 },
    avgUploadDuration: { type: Number, default: 0 },
    totalUploadDuration: { type: Number, default: 0 }
  },
  
  // Device and Client Information
  deviceInfo: {
    platform: { type: String },
    os: { type: String },
    appVersion: { type: String },
    deviceId: { type: String },
    model: { type: String }
  },
  
  // Session Configuration
  sessionConfig: {
    captureInterval: { type: Number, default: 1000 }, // milliseconds
    uploadBatchSize: { type: Number, default: 1 },
    aiProcessingEnabled: { type: Boolean, default: true },
    locationTrackingEnabled: { type: Boolean, default: true },
    websocketEnabled: { type: Boolean, default: true }
  },
  
  // Performance Metrics
  performanceMetrics: {
    avgPhotoSize: { type: Number, default: 0 },
    totalDataUploaded: { type: Number, default: 0 }, // in bytes
    networkLatency: { type: Number, default: 0 },
    batteryUsage: { type: Number, default: 0 }
  },
  
  // Session Events
  events: [{
    eventType: { type: String, required: true },
    timestamp: { type: Date, default: Date.now },
    data: { type: mongoose.Schema.Types.Mixed },
    source: { type: String } // 'mobile', 'server', 'ai', 'websocket'
  }],
  
  // Session Status
  status: { 
    type: String, 
    enum: ['active', 'paused', 'ended', 'error'], 
    default: 'active' 
  },
  errorLog: [{
    errorType: { type: String },
    message: { type: String },
    timestamp: { type: Date, default: Date.now },
    stack: { type: String }
  }]
}, { 
  timestamps: true,
  indexes: [
    { userId: 1, isActive: 1 },
    { sessionId: 1 },
    { startTime: -1 },
    { endTime: -1 },
    { status: 1 },
    { 'startLocation.lat': 1, 'startLocation.lng': 1 },
    { 'aiProcessingStats.alertCount': -1 },
    { 'aiProcessingStats.drowsyCount': -1 },
    { 'aiProcessingStats.sleepingCount': -1 }
  ]
});

// Methods for DriverSession
driverSessionSchema.methods.addEvent = function(eventType, data, source = 'server') {
  this.events.push({
    eventType,
    data,
    source,
    timestamp: new Date()
  });
  return this.save();
};

driverSessionSchema.methods.updateAIStats = function(prediction, confidence, processingTime) {
  this.aiProcessingStats.totalProcessed += 1;
  this.aiProcessingStats.avgConfidence = 
    (this.aiProcessingStats.avgConfidence * (this.aiProcessingStats.totalProcessed - 1) + confidence) / 
    this.aiProcessingStats.totalProcessed;
  this.aiProcessingStats.avgProcessingTime = 
    (this.aiProcessingStats.avgProcessingTime * (this.aiProcessingStats.totalProcessed - 1) + processingTime) / 
    this.aiProcessingStats.totalProcessed;
  
  switch (prediction) {
    case 'alert':
      this.aiProcessingStats.alertCount += 1;
      break;
    case 'drowsy':
      this.aiProcessingStats.drowsyCount += 1;
      break;
    case 'sleeping':
      this.aiProcessingStats.sleepingCount += 1;
      break;
    case 'unknown':
      this.aiProcessingStats.unknownCount += 1;
      break;
  }
  
  return this.save();
};

driverSessionSchema.methods.updateUploadStats = function(success, duration, fileSize) {
  this.uploadStats.totalUploads += 1;
  if (success) {
    this.uploadStats.successfulUploads += 1;
    this.uploadStats.totalUploadDuration += duration;
    this.uploadStats.avgUploadDuration = 
      this.uploadStats.totalUploadDuration / this.uploadStats.successfulUploads;
    this.performanceMetrics.totalDataUploaded += fileSize;
  } else {
    this.uploadStats.failedUploads += 1;
  }
  
  return this.save();
};

driverSessionSchema.methods.addLocationPoint = function(lat, lng, speed, heading) {
  this.route.push({
    lat,
    lng,
    speed,
    heading,
    timestamp: new Date()
  });
  return this.save();
};

driverSessionSchema.methods.endSession = function(endLocation) {
  this.isActive = false;
  this.endTime = new Date();
  this.duration = this.endTime - this.startTime;
  this.status = 'ended';
  if (endLocation) {
    this.endLocation = endLocation;
  }
  return this.save();
};

driverSessionSchema.methods.addError = function(errorType, message, stack) {
  this.errorLog.push({
    errorType,
    message,
    stack,
    timestamp: new Date()
  });
  this.status = 'error';
  return this.save();
};

// Static methods
driverSessionSchema.statics.getActiveSessions = function() {
  return this.find({ isActive: true }).populate('userId', 'firstName lastName email');
};

driverSessionSchema.statics.getSessionStats = function() {
  return this.aggregate([
    {
      $group: {
        _id: null,
        totalSessions: { $sum: 1 },
        activeSessions: { $sum: { $cond: ['$isActive', 1, 0] } },
        avgSessionDuration: { $avg: '$duration' },
        totalPhotosUploaded: { $sum: '$totalImagesUploaded' },
        totalPhotosProcessed: { $sum: '$totalImagesProcessed' },
        totalAlerts: { $sum: '$aiProcessingStats.alertCount' },
        totalDrowsy: { $sum: '$aiProcessingStats.drowsyCount' },
        totalSleeping: { $sum: '$aiProcessingStats.sleepingCount' }
      }
    }
  ]);
};

module.exports = mongoose.model('DriverSession', driverSessionSchema);
