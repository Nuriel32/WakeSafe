const DriverSession = require('../models/DriverSession');

exports.createSession = async (req, res) => {
  const session = await DriverSession.create({ userId: req.user.id });
  res.status(201).json({ sessionId: session._id });
};
