const mongoose = require('mongoose');

const sessionSchema = new mongoose.Schema({
  userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  startTime: { type: Date, default: Date.now },
  endTime: Date,
  stats: {
    blinksPerSecond: Number,
    earReadings: [{ value: Number, timestamp: Date }],
    headPoseData: [{ pitch: Number, yaw: Number, roll: Number, timestamp: Date }]
  }
});

module.exports = mongoose.model('DriverSession', sessionSchema);
