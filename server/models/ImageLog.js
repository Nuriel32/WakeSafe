const mongoose = require('mongoose');

const imageLogSchema = new mongoose.Schema({
  tripId: { type: mongoose.Schema.Types.ObjectId, ref: 'Trip' },
  userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  imageId: { type: String, unique: true },
  url: { type: String, required: true },
  timestamp: { type: Date, default: Date.now }
});

module.exports = mongoose.model('ImageLog', imageLogSchema);
