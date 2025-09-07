const mongoose = require('mongoose');

const driverSessionSchema = new mongoose.Schema({
  userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  startTime: { type: Date, default: Date.now },
  endTime: { type: Date },
  isActive: { type: Boolean, default: true },
  totalImagesUploaded: { type: Number, default: 0 },
  photos: [{ type: mongoose.Schema.Types.ObjectId, ref: 'Photo' }]
}, { timestamps: true });

module.exports = mongoose.model('DriverSession', driverSessionSchema);
