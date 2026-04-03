const mongoose = require('mongoose');

const fatigueLogSchema = new mongoose.Schema({
  userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  sessionId: { type: mongoose.Schema.Types.ObjectId, ref: 'DriverSession', required: true },
  imageId: String,
  imageUrl: String,
  ear: Number,
  headPose: {
    pitch: Number,
    yaw: Number,
    roll: Number
  },
  fatigued: { type: Boolean, default: false },
  fatigueLevel: { type: Number, min: 0, max: 1 },
  confidenceScore: { type: Number, min: 0, max: 1 },
  severity: { type: String, enum: ['info', 'warning', 'critical'] },
  source: { type: String, default: 'ml' },
  metrics: { type: mongoose.Schema.Types.Mixed },
  timestamp: { type: Date, default: Date.now }
});

fatigueLogSchema.index({ userId: 1, timestamp: -1 });
fatigueLogSchema.index({ sessionId: 1, timestamp: -1 });
fatigueLogSchema.index({ userId: 1, sessionId: 1, timestamp: -1 });
fatigueLogSchema.index({ sessionId: 1, severity: 1, timestamp: -1 });

module.exports = mongoose.model('FatigueLog', fatigueLogSchema);
