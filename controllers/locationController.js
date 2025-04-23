const DriverSession = require('../models/DriverSession');
const googleMapService = require('../services/googleMapService');

/**
 * @route POST /api/location/navigate
 * @desc Return navigation links to nearby destinations using Google Maps
 * @access Private
 */
exports.getNavigationRecommendations = async (req, res) => {
    const { latitude, longitude, sessionId } = req.body;

    if (!latitude || !longitude || !sessionId) {
        return res.status(400).json({ message: 'Missing latitude, longitude or sessionId' });
    }

    const session = await DriverSession.findOne({ _id: sessionId, userId: req.user.id });
    if (!session) {
        return res.status(403).json({ message: 'Unauthorized session access' });
    }

    const keywords = ['gas station', 'rest area', 'parking', 'cafe'];

    try {
        const destinations = await googleMapService.findNavigationLinks(latitude, longitude, keywords);
        res.json({ destinations });
    } catch (err) {
        console.error(err);
        res.status(500).json({ message: 'Failed to generate navigation links' });
    }
};
