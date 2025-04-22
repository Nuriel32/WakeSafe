const mongoose = require('mongoose');

const fatigueLogSchema = new mongoose.Schema({
  userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  sessionId: { type: mongoose.Schema.Types.ObjectId, ref: 'DriverSession' },
  imageId: String,
  imageUrl: String,
  ear: Number,
  headPose: {
    pitch: Number,
    yaw: Number,
    roll: Number
  },
  fatigued: Boolean,
  timestamp: { type: Date, default: Date.now }
});

module.exports = mongoose.model('FatigueLog', fatigueLogSchema);
