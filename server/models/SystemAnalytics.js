const mongoose = require('mongoose');

const systemAnalyticsSchema = new mongoose.Schema({
  // Date and Time
  date: { type: Date, required: true, index: true },
  hour: { type: Number, min: 0, max: 23 },
  
  // System Performance Metrics
  performance: {
    avgResponseTime: { type: Number, default: 0 }, // milliseconds
    totalRequests: { type: Number, default: 0 },
    successfulRequests: { type: Number, default: 0 },
    failedRequests: { type: Number, default: 0 },
    errorRate: { type: Number, default: 0 }, // percentage
    cpuUsage: { type: Number, default: 0 }, // percentage
    memoryUsage: { type: Number, default: 0 }, // percentage
    diskUsage: { type: Number, default: 0 }, // percentage
    networkLatency: { type: Number, default: 0 } // milliseconds
  },
  
  // User Activity Metrics
  userActivity: {
    activeUsers: { type: Number, default: 0 },
    newUsers: { type: Number, default: 0 },
    totalSessions: { type: Number, default: 0 },
    activeSessions: { type: Number, default: 0 },
    avgSessionDuration: { type: Number, default: 0 }, // milliseconds
    peakConcurrentUsers: { type: Number, default: 0 }
  },
  
  // Photo Processing Metrics
  photoProcessing: {
    totalPhotosUploaded: { type: Number, default: 0 },
    totalPhotosProcessed: { type: Number, default: 0 },
    totalPhotosFailed: { type: Number, default: 0 },
    avgUploadTime: { type: Number, default: 0 }, // milliseconds
    avgProcessingTime: { type: Number, default: 0 }, // milliseconds
    queueSize: { type: Number, default: 0 },
    processingThroughput: { type: Number, default: 0 } // photos per minute
  },
  
  // AI Processing Metrics
  aiProcessing: {
    totalAnalyses: { type: Number, default: 0 },
    alertDetections: { type: Number, default: 0 },
    drowsyDetections: { type: Number, default: 0 },
    sleepingDetections: { type: Number, default: 0 },
    unknownDetections: { type: Number, default: 0 },
    avgConfidence: { type: Number, default: 0 },
    avgProcessingTime: { type: Number, default: 0 }, // milliseconds
    modelAccuracy: { type: Number, default: 0 } // percentage
  },
  
  // Storage Metrics
  storage: {
    totalDataUploaded: { type: Number, default: 0 }, // bytes
    totalDataStored: { type: Number, default: 0 }, // bytes
    gcsOperations: { type: Number, default: 0 },
    gcsErrors: { type: Number, default: 0 },
    avgFileSize: { type: Number, default: 0 }, // bytes
    storageCost: { type: Number, default: 0 } // in cents
  },
  
  // Network Metrics
  network: {
    totalBandwidth: { type: Number, default: 0 }, // bytes
    uploadBandwidth: { type: Number, default: 0 }, // bytes
    downloadBandwidth: { type: Number, default: 0 }, // bytes
    avgLatency: { type: Number, default: 0 }, // milliseconds
    packetLoss: { type: Number, default: 0 }, // percentage
    connectionErrors: { type: Number, default: 0 }
  },
  
  // WebSocket Metrics
  websocket: {
    totalConnections: { type: Number, default: 0 },
    activeConnections: { type: Number, default: 0 },
    messagesSent: { type: Number, default: 0 },
    messagesReceived: { type: Number, default: 0 },
    connectionErrors: { type: Number, default: 0 },
    avgConnectionDuration: { type: Number, default: 0 } // milliseconds
  },
  
  // Error Tracking
  errors: {
    totalErrors: { type: Number, default: 0 },
    criticalErrors: { type: Number, default: 0 },
    warningErrors: { type: Number, default: 0 },
    infoErrors: { type: Number, default: 0 },
    errorTypes: [{
      type: { type: String },
      count: { type: Number },
      message: { type: String }
    }]
  },
  
  // Geographic Distribution
  geographic: {
    countries: [{
      country: { type: String },
      userCount: { type: Number },
      sessionCount: { type: Number }
    }],
    regions: [{
      region: { type: String },
      userCount: { type: Number },
      sessionCount: { type: Number }
    }]
  },
  
  // Device Analytics
  devices: {
    platforms: [{
      platform: { type: String },
      count: { type: Number },
      percentage: { type: Number }
    }],
    osVersions: [{
      os: { type: String },
      version: { type: String },
      count: { type: Number }
    }],
    appVersions: [{
      version: { type: String },
      count: { type: Number },
      percentage: { type: Number }
    }]
  },
  
  // Business Metrics
  business: {
    revenue: { type: Number, default: 0 }, // in cents
    subscriptions: { type: Number, default: 0 },
    churnRate: { type: Number, default: 0 }, // percentage
    customerSatisfaction: { type: Number, default: 0 }, // 1-10 scale
    supportTickets: { type: Number, default: 0 },
    featureUsage: [{
      feature: { type: String },
      usageCount: { type: Number },
      uniqueUsers: { type: Number }
    }]
  }
}, {
  timestamps: true,
  indexes: [
    { date: 1, hour: 1 },
    { 'performance.avgResponseTime': -1 },
    { 'userActivity.activeUsers': -1 },
    { 'photoProcessing.totalPhotosUploaded': -1 },
    { 'aiProcessing.totalAnalyses': -1 },
    { 'errors.totalErrors': -1 },
    { createdAt: -1 }
  ]
});

// Methods for SystemAnalytics
systemAnalyticsSchema.methods.updatePerformanceMetrics = function(metrics) {
  Object.assign(this.performance, metrics);
  return this.save();
};

systemAnalyticsSchema.methods.updateUserActivity = function(activity) {
  Object.assign(this.userActivity, activity);
  return this.save();
};

systemAnalyticsSchema.methods.updatePhotoProcessing = function(processing) {
  Object.assign(this.photoProcessing, processing);
  return this.save();
};

systemAnalyticsSchema.methods.updateAIProcessing = function(ai) {
  Object.assign(this.aiProcessing, ai);
  return this.save();
};

systemAnalyticsSchema.methods.addError = function(errorType, message) {
  this.errors.totalErrors += 1;
  const existingError = this.errors.errorTypes.find(e => e.type === errorType);
  if (existingError) {
    existingError.count += 1;
  } else {
    this.errors.errorTypes.push({
      type: errorType,
      count: 1,
      message
    });
  }
  return this.save();
};

// Static methods
systemAnalyticsSchema.statics.getDailyStats = function(date) {
  return this.findOne({ 
    date: { 
      $gte: new Date(date.setHours(0, 0, 0, 0)),
      $lt: new Date(date.setHours(23, 59, 59, 999))
    }
  });
};

systemAnalyticsSchema.statics.getHourlyStats = function(date, hour) {
  return this.findOne({ date, hour });
};

systemAnalyticsSchema.statics.getSystemOverview = function(days = 7) {
  const startDate = new Date();
  startDate.setDate(startDate.getDate() - days);
  
  return this.aggregate([
    { $match: { date: { $gte: startDate } } },
    {
      $group: {
        _id: null,
        avgResponseTime: { $avg: '$performance.avgResponseTime' },
        totalRequests: { $sum: '$performance.totalRequests' },
        totalUsers: { $sum: '$userActivity.activeUsers' },
        totalSessions: { $sum: '$userActivity.totalSessions' },
        totalPhotos: { $sum: '$photoProcessing.totalPhotosUploaded' },
        totalAI: { $sum: '$aiProcessing.totalAnalyses' },
        totalErrors: { $sum: '$errors.totalErrors' },
        avgCpuUsage: { $avg: '$performance.cpuUsage' },
        avgMemoryUsage: { $avg: '$performance.memoryUsage' }
      }
    }
  ]);
};

systemAnalyticsSchema.statics.getTrends = function(days = 30) {
  const startDate = new Date();
  startDate.setDate(startDate.getDate() - days);
  
  return this.find({ date: { $gte: startDate } })
    .sort({ date: 1 })
    .select('date performance userActivity photoProcessing aiProcessing errors');
};

module.exports = mongoose.model('SystemAnalytics', systemAnalyticsSchema);
