const DriverSession = require('../models/DriverSession');
const googleMapService = require('../services/googleMapService');
const logger = require('../utils/logger');

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