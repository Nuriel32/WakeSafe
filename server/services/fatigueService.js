const FatigueLog = require('../models/FatigueLog');
const DriverSession = require('../models/DriverSession');
const { uploadSessionPhoto } = require('./gcpStorageService');
const cache = require('./cacheService');
const logger = require('../utils/logger');

exports.processFatigue = async ({ userId, sessionId, image, ear, headPose }) => {
    const cacheKey = `fatigue:${userId}:${sessionId}`;
    const cachedResult = await cache.get(cacheKey);
    if (cachedResult) return cachedResult;

    const filename = `fatigue-${Date.now()}.jpg`;
    const base64 = image.includes(',') ? image.split(',')[1] : image;
    const buffer = Buffer.from(base64, 'base64');
    const upload = await uploadSessionPhoto(
        {
            originalname: filename,
            mimetype: 'image/jpeg',
            size: buffer.length,
            buffer
        },
        userId,
        sessionId,
        { sequenceNumber: 0, captureTimestamp: Date.now() },
        'before-ai'
    );
    const imageUrl = upload.gcsPath;

    const fatigued = ear < 0.2 || Math.abs(headPose.pitch) > 15;
    logger.info(`[fatigueService] fatigue evaluated=${fatigued} userId=${userId} sessionId=${sessionId}`);
    const log = await FatigueLog.create({
        userId,
        sessionId,
        imageId: filename,
        imageUrl,
        ear,
        headPose,
        fatigued
    });

    const session = await DriverSession.findById(sessionId);
    if (session) {
        await session.addEvent('fatigue_detected', { ear, headPose, fatigued, imageId: filename }, 'ai');
    }

    await cache.set(cacheKey, log.toObject(), 1800);
    return log;
};
