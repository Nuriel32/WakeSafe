const DriverSession = require('../models/DriverSession');
const googleMapService = require('../services/googleMapService');
const logger = require('../utils/logger');

function isValidCoord(value, min, max) {
    const n = Number(value);
    return Number.isFinite(n) && n >= min && n <= max;
}

/**
 * @route POST /api/location/navigate
 * @desc Return navigation links to nearby destinations using Google Maps
 * @access Private
 */
exports.getNavigationRecommendations = async (req, res) => {
    const { latitude, longitude, sessionId } = req.body;

    if (!latitude || !longitude || !sessionId) {
        logger.warn(`From locationController: Missing lat/lng/sessionId from user ${req.user.id}`);
        return res.status(400).json({ message: 'Missing latitude, longitude or sessionId' });
    }

    const session = await DriverSession.findOne({ _id: sessionId, userId: req.user.id });
    if (!session) {
        logger.warn(`From locationController: Unauthorized session access attempt by user ${req.user.id}`);
        return res.status(403).json({ message: 'Unauthorized session access' });
    }

    const keywords = ['gas station', 'rest area', 'parking', 'cafe'];

    try {
        const destinations = await googleMapService.findNavigationLinks(latitude, longitude, keywords);
        logger.info(`From locationController:Navigation recommendations sent for user ${req.user.id} at [${latitude}, ${longitude}]`);
        res.json({ destinations });
    } catch (err) {
        logger.error(`From locationController:  Failed to generate navigation links for user ${req.user.id}: ${err.message}`);
        res.status(500).json({ message: 'Failed to generate navigation links' });
    }
};

/**
 * @route POST /api/location/safe-stops
 * @desc Return a sorted list of nearby safe stop suggestions for the in-app
 *       navigation screen. Unlike /navigate this does not require a sessionId
 *       so it can be opened from any "I need to stop" surface (drowsy alert,
 *       manual user request, etc.).
 * @access Private
 */
exports.getSafeStops = async (req, res) => {
    const { latitude, longitude } = req.body || {};

    if (!isValidCoord(latitude, -90, 90) || !isValidCoord(longitude, -180, 180)) {
        return res.status(400).json({ message: 'Missing or invalid latitude/longitude' });
    }

    try {
        const result = await googleMapService.findNearestSafeStop({ latitude, longitude });
        if (!result?.found) {
            return res.json({ stops: [], reason: result?.reason || 'no_results' });
        }
        const stops = Array.isArray(result.suggestions) && result.suggestions.length > 0
            ? result.suggestions
            : [result.best];
        logger.info(`getSafeStops: returned ${stops.length} stops for user ${req.user.id}`);
        return res.json({ stops });
    } catch (err) {
        logger.error(`getSafeStops failed for user ${req.user.id}: ${err.message}`);
        return res.status(502).json({ message: 'Failed to load nearby safe stops' });
    }
};