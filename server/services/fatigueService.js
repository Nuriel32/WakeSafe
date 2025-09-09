const FatigueLog = require('../models/FatigueLog');
const DriverSession = require('../models/DriverSession');
const { uploadImage } = require('./gcpStorageService');
const cache = require('./cacheService');

exports.processFatigue = async ({ userId, sessionId, image, ear, headPose }) => {
    const cacheKey = `fatigue:${userId}:${sessionId}`;
    const cachedResult = await cache.getFromCache(cacheKey);
    if (cachedResult) return cachedResult;

    const filename = `fatigue-${Date.now()}.jpg`;
    const imageUrl = await uploadImage(image, filename);

    const fatigued = ear < 0.2 || Math.abs(headPose.pitch) > 15;
    console.log(fatigued);
    const log = await FatigueLog.create({
        userId,
        sessionId,
        imageId: filename,
        imageUrl,
        ear,
        headPose,
        fatigued
    });

    await DriverSession.findByIdAndUpdate(sessionId, {
        $push: {
            'stats.earReadings': { value: ear, timestamp: new Date() },
            'stats.headPoseData': { ...headPose, timestamp: new Date() }
        }
    });

    await cache.set(cacheKey, log, 1800);
    return log;
};
