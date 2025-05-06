const User = require('../models/Users');
const logger = require('../utils/logger');

async function getCurrentUser(req, res) {
  try {
    const user = await User.findById(req.user.id).select('-password');
    if (!user) {
      logger.warn(`User not found for ID: ${req.user.id}`);
      return res.status(404).json({ message: 'User not found' });
    }

    logger.info(`User profile fetched for ID: ${req.user.id}`);
    res.json(user);
  } catch (err) {
    logger.error(`Error fetching user ${req.user.id}: ${err.message}`);
    res.status(500).json({ message: 'Server error' });
  }
}

async function updateUser(req, res) {
  try {
    const updates = req.body;
    if (updates.password) delete updates.password;

    const user = await User.findByIdAndUpdate(req.user.id, updates, { new: true }).select('-password');
    if (!user) {
      logger.warn(`Update failed, user not found: ${req.user.id}`);
      return res.status(404).json({ message: 'User not found' });
    }

    logger.info(`User ${req.user.id} updated profile`);
    res.json(user);
  } catch (err) {
    logger.error(`Failed to update user ${req.user.id}: ${err.message}`);
    res.status(400).json({ message: 'Invalid update' });
  }
}

async function deleteUser(req, res) {
  try {
    const user = await User.findByIdAndDelete(req.user.id);
    if (!user) {
      logger.warn(`Delete failed, user not found: ${req.user.id}`);
      return res.status(404).json({ message: 'User not found' });
    }

    logger.info(`User ${req.user.id} deleted account`);
    res.json({ message: 'User deleted successfully' });
  } catch (err) {
    logger.error(`Failed to delete user ${req.user.id}: ${err.message}`);
    res.status(400).json({ message: 'Invalid delete' });
  }
}

module.exports = {
  getCurrentUser,
  updateUser,
  deleteUser
};
