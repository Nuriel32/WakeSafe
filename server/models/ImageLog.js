const mongoose = require('mongoose');

const imageLogSchema = new mongoose.Schema({
  // Legacy field name "tripId" maps to DriverSession documents.
  tripId: { type: mongoose.Schema.Types.ObjectId, ref: 'DriverSession', required: true },
  userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  imageId: { type: String, unique: true },
  url: { type: String, required: true },
  timestamp: { type: Date, default: Date.now }
});

imageLogSchema.index({ userId: 1, tripId: 1, timestamp: -1 });
imageLogSchema.index({ tripId: 1, timestamp: -1 });

module.exports = mongoose.model('ImageLog', imageLogSchema);
