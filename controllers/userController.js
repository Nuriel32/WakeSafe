const User = require('../models/User');

async function getCurrentUser(req, res) {
  try {
    const user = await User.findById(req.user.id).select('-password');
    if (!user) return res.status(404).json({ message: 'User not found' });

    res.json(user);
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Server error' });
  }
}

async function updateUser(req, res) {
  try {
    const updates = req.body;
    if (updates.password) delete updates.password;

    const user = await User.findByIdAndUpdate(req.user.id, updates, { new: true }).select('-password');
    if (!user) return res.status(404).json({ message: 'User not found' });

    res.json(user);
  } catch (err) {
    console.error(err);
    res.status(400).json({ message: 'Invalid update' });
  }
}

async function deleteUser(req, res) {
  try {
    const user = await User.findByIdAndDelete(req.user.id);
    if (!user) return res.status(404).json({ message: 'User not found' });

    res.json({ message: 'User deleted successfully' });
  } catch (err) {
    console.error(err);
    res.status(400).json({ message: 'Invalid delete' });
  }
}

module.exports = {
  getCurrentUser,
  updateUser,
  deleteUser
};
