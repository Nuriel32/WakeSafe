const mongoose = require('mongoose');

const photoSchema = new mongoose.Schema({
    sessionId: { type: mongoose.Schema.Types.ObjectId, ref: 'DriverSession', required: true },
    userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },

    gcsPath: { type: String, required: true },
    uploadedAt: { type: Date, default: Date.now },

    prediction: { type: String, enum: ['alert', 'drowsy', 'unknown'], default: 'unknown' },
    location: {
        lat: Number,
        lng: Number
    },
    clientMeta: {
        os: String,
        appVersion: String,
        model: String
    }
}, { timestamps: true });

module.exports = mongoose.model('Photo', photoSchema);
