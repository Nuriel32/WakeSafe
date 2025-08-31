const mongoose = require('mongoose');

const photoSchema = new mongoose.Schema({
    sessionId: { type: mongoose.Schema.Types.ObjectId, ref: 'DriverSession', required: true },
    userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },

    gcsPath: { type: String, required: true },
    uploadedAt: { type: Date, default: Date.now },

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
        lat: Number,
        lng: Number,
        accuracy: Number,
        timestamp: Date
    },
    clientMeta: {
        os: String,
        appVersion: String,
        model: String,
        deviceId: String
    },

    // File Information
    fileSize: { type: Number },
    contentType: { type: String },
    originalName: { type: String }
}, { 
    timestamps: true,
    indexes: [
        { userId: 1, sessionId: 1 },
        { aiProcessingStatus: 1 },
        { prediction: 1 },
        { uploadedAt: -1 }
    ]
});

// Virtual for full GCS URL
photoSchema.virtual('gcsUrl').get(function() {
    return `https://storage.googleapis.com/${process.env.GCS_BUCKET}/${this.gcsPath}`;
});

// Method to update AI results
photoSchema.methods.updateAIResults = function(results) {
    this.prediction = results.prediction || this.prediction;
    this.aiProcessingStatus = 'completed';
    this.aiResults = {
        confidence: results.confidence,
        ear: results.ear,
        headPose: results.headPose,
        processingTime: results.processingTime,
        processedAt: new Date()
    };
    return this.save();
};

module.exports = mongoose.model('Photo', photoSchema);
