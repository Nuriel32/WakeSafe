const DriverSession = require('../models/DriverSession');

module.exports = async (req, res, next) => {
    const { sessionId } = req.body;
    try {
        const session = await DriverSession.findOne({ _id: sessionId, userId: req.user.id, isActive: true });
        if (!session) return res.status(404).json({ error: 'Invalid or inactive session' });
        req.session = session;
        next();
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: 'Session check failed' });
    }
};
