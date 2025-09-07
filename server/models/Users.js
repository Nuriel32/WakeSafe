const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');

const userSchema = new mongoose.Schema({
  // Basic Information
  firstName: { type: String, required: true },
  lastName: { type: String, required: true },
  email: { type: String, unique: true, required: true },
  password: { type: String, required: true },
  phone: { type: String, required: true },
  carNumber: { type: String, required: true },
  
  // Account Information
  joinDate: { type: Date, default: Date.now },
  lastLogin: { type: Date },
  isActive: { type: Boolean, default: true },
  isVerified: { type: Boolean, default: false },
  verificationToken: { type: String },
  resetPasswordToken: { type: String },
  resetPasswordExpires: { type: Date },
  
  // Profile Information
  profile: {
    avatar: { type: String },
    dateOfBirth: { type: Date },
    gender: { type: String, enum: ['male', 'female', 'other'] },
    address: {
      street: { type: String },
      city: { type: String },
      state: { type: String },
      zipCode: { type: String },
      country: { type: String }
    },
    emergencyContact: {
      name: { type: String },
      phone: { type: String },
      relationship: { type: String }
    }
  },
  
  // Vehicle Information
  vehicle: {
    make: { type: String },
    model: { type: String },
    year: { type: Number },
    color: { type: String },
    licensePlate: { type: String },
    vin: { type: String }
  },
  
  // Usage Statistics
  usageStats: {
    totalSessions: { type: Number, default: 0 },
    totalDrivingTime: { type: Number, default: 0 }, // in milliseconds
    totalPhotosUploaded: { type: Number, default: 0 },
    totalPhotosProcessed: { type: Number, default: 0 },
    totalAlerts: { type: Number, default: 0 },
    totalDrowsyDetections: { type: Number, default: 0 },
    totalSleepingDetections: { type: Number, default: 0 },
    avgSessionDuration: { type: Number, default: 0 },
    lastSessionDate: { type: Date }
  },
  
  // Preferences and Settings
  preferences: {
    notifications: {
      email: { type: Boolean, default: true },
      push: { type: Boolean, default: true },
      sms: { type: Boolean, default: false },
      fatigueAlerts: { type: Boolean, default: true },
      weeklyReports: { type: Boolean, default: true }
    },
    privacy: {
      shareLocation: { type: Boolean, default: true },
      shareStats: { type: Boolean, default: false },
      dataRetention: { type: Number, default: 365 } // days
    },
    app: {
      theme: { type: String, default: 'light' },
      language: { type: String, default: 'en' },
      captureInterval: { type: Number, default: 1000 },
      autoUpload: { type: Boolean, default: true }
    }
  },
  
  // Device Information
  devices: [{
    deviceId: { type: String, required: true },
    platform: { type: String, required: true },
    os: { type: String },
    appVersion: { type: String },
    model: { type: String },
    lastSeen: { type: Date, default: Date.now },
    isActive: { type: Boolean, default: true }
  }],
  
  // Subscription and Billing
  subscription: {
    plan: { type: String, default: 'free' },
    status: { type: String, default: 'active' },
    startDate: { type: Date },
    endDate: { type: Date },
    autoRenew: { type: Boolean, default: false }
  },
  
  // Security and Access
  security: {
    twoFactorEnabled: { type: Boolean, default: false },
    twoFactorSecret: { type: String },
    loginAttempts: { type: Number, default: 0 },
    lockUntil: { type: Date },
    lastPasswordChange: { type: Date, default: Date.now }
  },
  
  // Activity Log
  activityLog: [{
    action: { type: String, required: true },
    timestamp: { type: Date, default: Date.now },
    ipAddress: { type: String },
    userAgent: { type: String },
    deviceId: { type: String },
    metadata: { type: mongoose.Schema.Types.Mixed }
  }]
}, { 
  timestamps: true,
  indexes: [
    { email: 1 },
    { phone: 1 },
    { carNumber: 1 },
    { isActive: 1 },
    { lastLogin: -1 },
    { 'usageStats.totalSessions': -1 },
    { 'usageStats.totalAlerts': -1 },
    { 'devices.deviceId': 1 },
    { 'subscription.plan': 1 },
    { 'subscription.status': 1 }
  ]
});

userSchema.pre('save', async function (next) {
  if (!this.isModified('password')) return next();
  this.password = await bcrypt.hash(this.password, 10);
  next();
});

userSchema.methods.comparePassword = function (pw) {
  return bcrypt.compare(pw, this.password);
};

// Methods for User
userSchema.methods.addActivity = function(action, ipAddress, userAgent, deviceId, metadata = {}) {
  this.activityLog.push({
    action,
    ipAddress,
    userAgent,
    deviceId,
    metadata,
    timestamp: new Date()
  });
  return this.save();
};

userSchema.methods.updateLastLogin = function() {
  this.lastLogin = new Date();
  return this.save();
};

userSchema.methods.addDevice = function(deviceInfo) {
  const existingDevice = this.devices.find(d => d.deviceId === deviceInfo.deviceId);
  if (existingDevice) {
    existingDevice.lastSeen = new Date();
    existingDevice.isActive = true;
    Object.assign(existingDevice, deviceInfo);
  } else {
    this.devices.push({
      ...deviceInfo,
      lastSeen: new Date(),
      isActive: true
    });
  }
  return this.save();
};

userSchema.methods.updateUsageStats = function(sessionData) {
  this.usageStats.totalSessions += 1;
  this.usageStats.totalDrivingTime += sessionData.duration || 0;
  this.usageStats.totalPhotosUploaded += sessionData.photosUploaded || 0;
  this.usageStats.totalPhotosProcessed += sessionData.photosProcessed || 0;
  this.usageStats.totalAlerts += sessionData.alerts || 0;
  this.usageStats.totalDrowsyDetections += sessionData.drowsyDetections || 0;
  this.usageStats.totalSleepingDetections += sessionData.sleepingDetections || 0;
  this.usageStats.avgSessionDuration = 
    (this.usageStats.avgSessionDuration * (this.usageStats.totalSessions - 1) + (sessionData.duration || 0)) / 
    this.usageStats.totalSessions;
  this.usageStats.lastSessionDate = new Date();
  return this.save();
};

userSchema.methods.incrementLoginAttempts = function() {
  this.security.loginAttempts += 1;
  if (this.security.loginAttempts >= 5) {
    this.security.lockUntil = new Date(Date.now() + 2 * 60 * 60 * 1000); // 2 hours
  }
  return this.save();
};

userSchema.methods.resetLoginAttempts = function() {
  this.security.loginAttempts = 0;
  this.security.lockUntil = undefined;
  return this.save();
};

userSchema.methods.isLocked = function() {
  return !!(this.security.lockUntil && this.security.lockUntil > Date.now());
};

// Static methods
userSchema.statics.getUserStats = function() {
  return this.aggregate([
    {
      $group: {
        _id: null,
        totalUsers: { $sum: 1 },
        activeUsers: { $sum: { $cond: ['$isActive', 1, 0] } },
        verifiedUsers: { $sum: { $cond: ['$isVerified', 1, 0] } },
        totalSessions: { $sum: '$usageStats.totalSessions' },
        totalPhotosUploaded: { $sum: '$usageStats.totalPhotosUploaded' },
        totalAlerts: { $sum: '$usageStats.totalAlerts' },
        avgSessionDuration: { $avg: '$usageStats.avgSessionDuration' }
      }
    }
  ]);
};

userSchema.statics.getTopUsers = function(limit = 10) {
  return this.find({ isActive: true })
    .sort({ 'usageStats.totalSessions': -1 })
    .limit(limit)
    .select('firstName lastName email usageStats');
};

module.exports = mongoose.model('User', userSchema);
