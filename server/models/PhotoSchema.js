const mongoose = require('mongoose');

const photoSchema = new mongoose.Schema({
    sessionId: { type: mongoose.Schema.Types.ObjectId, ref: 'DriverSession', required: true },
    userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },

    gcsPath: { type: String, required: true },
    uploadedAt: { type: Date, default: Date.now },

    // Continuous Capture Fields
    sequenceNumber: { type: Number, required: true },
    captureTimestamp: { type: Number, required: true },
    folderType: { 
        type: String, 
        enum: ['before-ai', 'after-ai'], 
        default: 'before-ai' 
    },

    // AI Processing Fields
    prediction: { 
        type: String, 
        enum: ['alert', 'drowsy', 'sleeping', 'unknown', 'pending'], 
        default: 'pending' 
    },
    aiProcessingStatus: { 
        type: String, 
        enum: ['pending', 'processing', 'completed', 'failed'], 
        default: 'pending' 
    },
    aiResults: {
        confidence: { type: Number, min: 0, max: 1 },
        ear: { type: Number }, // Eye Aspect Ratio
        headPose: {
            pitch: { type: Number },
            yaw: { type: Number },
            roll: { type: Number }
        },
        processingTime: { type: Number }, // in milliseconds
        processedAt: { type: Date }
    },

    // Location and Metadata
    location: {
        lat: { type: Number },
        lng: { type: Number },
        accuracy: { type: Number },
        altitude: { type: Number },
        speed: { type: Number },
        heading: { type: Number },
        timestamp: { type: Date }
    },
    clientMeta: {
        userAgent: { type: String },
        os: { type: String },
        appVersion: { type: String },
        model: { type: String },
        deviceId: { type: String },
        platform: { type: String },
        captureType: { type: String, default: 'continuous' },
        cameraSettings: {
            resolution: { type: String },
            quality: { type: Number },
            flash: { type: Boolean },
            focus: { type: String }
        }
    },

    // File Information
    fileSize: { type: Number },
    contentType: { type: String },
    originalName: { type: String },
    fileName: { type: String },
    
    // Upload Information
    uploadStatus: { 
        type: String, 
        enum: ['pending', 'uploading', 'uploaded', 'failed'], 
        default: 'pending' 
    },
    uploadMethod: { type: String, default: 'presigned' },
    uploadDuration: { type: Number }, // in milliseconds
    uploadRetries: { type: Number, default: 0 },
    
    // Processing Information
    processingQueuePosition: { type: Number },
    processingStartedAt: { type: Date },
    processingCompletedAt: { type: Date },
    
    // Quality and Validation
    imageQuality: {
        blurScore: { type: Number },
        brightness: { type: Number },
        contrast: { type: Number },
        isValid: { type: Boolean, default: true }
    },
    
    // WebSocket Events
    websocketEvents: [{
        eventType: { type: String },
        timestamp: { type: Date },
        data: { type: mongoose.Schema.Types.Mixed }
    }]
}, { 
    timestamps: true
});

// High-frequency query indexes
photoSchema.index({ userId: 1, sessionId: 1 });
photoSchema.index({ sessionId: 1, uploadedAt: -1 });
photoSchema.index({ sessionId: 1, prediction: 1, uploadedAt: -1 });
photoSchema.index({ aiProcessingStatus: 1 });
photoSchema.index({ aiProcessingStatus: 1, uploadedAt: 1 });
photoSchema.index({ prediction: 1 });
photoSchema.index({ uploadedAt: -1 });
photoSchema.index({ sequenceNumber: 1 });
photoSchema.index({ folderType: 1 });
photoSchema.index({ captureTimestamp: -1 });
photoSchema.index({ uploadStatus: 1 });
photoSchema.index({ uploadMethod: 1 });
photoSchema.index({ processingQueuePosition: 1 });
photoSchema.index({ 'location.lat': 1, 'location.lng': 1 });
photoSchema.index({ 'clientMeta.deviceId': 1 });
photoSchema.index({ 'clientMeta.captureType': 1 });
photoSchema.index({ 'imageQuality.isValid': 1 });
photoSchema.index({ createdAt: -1 });
photoSchema.index({ updatedAt: -1 });

// Critical paths: latest photo by session/user and ordered frame processing.
photoSchema.index({ sessionId: 1, userId: 1, captureTimestamp: -1, uploadedAt: -1 });
photoSchema.index({ sessionId: 1, sequenceNumber: 1 }, { unique: true });

// Virtual for full GCS URL
photoSchema.virtual('gcsUrl').get(function() {
    return `https://storage.googleapis.com/${process.env.GCS_BUCKET}/${this.gcsPath}`;
});

// Method to update AI results
photoSchema.methods.updateAIResults = function(results) {
    this.prediction = results.prediction || this.prediction;
    this.aiProcessingStatus = 'completed';
    this.processingCompletedAt = new Date();
    this.aiResults = {
        confidence: results.confidence,
        ear: results.ear,
        headPose: results.headPose,
        processingTime: results.processingTime,
        processedAt: new Date()
    };
    return this.save();
};

// Method to add WebSocket event
photoSchema.methods.addWebSocketEvent = function(eventType, data) {
    this.websocketEvents.push({
        eventType,
        timestamp: new Date(),
        data
    });
    return this.save();
};

// Method to update upload status
photoSchema.methods.updateUploadStatus = function(status, duration = null, retries = 0) {
    this.uploadStatus = status;
    if (duration !== null) this.uploadDuration = duration;
    if (retries > 0) this.uploadRetries = retries;
    return this.save();
};

// Method to update processing status
photoSchema.methods.updateProcessingStatus = function(status, queuePosition = null) {
    this.aiProcessingStatus = status;
    if (queuePosition !== null) this.processingQueuePosition = queuePosition;
    if (status === 'processing') this.processingStartedAt = new Date();
    if (status === 'completed') this.processingCompletedAt = new Date();
    return this.save();
};

// Static method to get processing statistics
photoSchema.statics.getProcessingStats = function() {
    return this.aggregate([
        {
            $group: {
                _id: null,
                totalPhotos: { $sum: 1 },
                pendingPhotos: { $sum: { $cond: [{ $eq: ['$aiProcessingStatus', 'pending'] }, 1, 0] } },
                processingPhotos: { $sum: { $cond: [{ $eq: ['$aiProcessingStatus', 'processing'] }, 1, 0] } },
                completedPhotos: { $sum: { $cond: [{ $eq: ['$aiProcessingStatus', 'completed'] }, 1, 0] } },
                failedPhotos: { $sum: { $cond: [{ $eq: ['$aiProcessingStatus', 'failed'] }, 1, 0] } },
                alertPhotos: { $sum: { $cond: [{ $eq: ['$prediction', 'alert'] }, 1, 0] } },
                drowsyPhotos: { $sum: { $cond: [{ $eq: ['$prediction', 'drowsy'] }, 1, 0] } },
                sleepingPhotos: { $sum: { $cond: [{ $eq: ['$prediction', 'sleeping'] }, 1, 0] } },
                avgProcessingTime: { $avg: '$aiResults.processingTime' },
                avgUploadDuration: { $avg: '$uploadDuration' }
            }
        }
    ]);
};

module.exports = mongoose.model('Photo', photoSchema);
