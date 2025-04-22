const User = require('../models/User');

/**
 * @route GET /api/users
 * @desc Get all users
 * @access Private
 */
exports.getAllUsers = async (req, res) => {
  const users = await User.find().select('-password');
  res.json(users);
};

/**
 * @route GET /api/users/:id
 * @desc Get user by ID
 * @access Private
 */
exports.getUserById = async (req, res) => {
  try {
    const user = await User.findById(req.params.id).select('-password');
    if (!user) return res.status(404).json({ message: 'User not found' });
    res.json(user);
  } catch {
    res.status(400).json({ message: 'Invalid ID' });
  }
};

/**
 * @route PUT /api/users/:id
 * @desc Update user by ID
 * @access Private
 */
exports.updateUser = async (req, res) => {
  try {
    const updates = req.body;
    if (updates.password) delete updates.password; // avoid accidental updates
    const user = await User.findByIdAndUpdate(req.params.id, updates, { new: true }).select('-password');
    if (!user) return res.status(404).json({ message: 'User not found' });
    res.json(user);
  } catch {
    res.status(400).json({ message: 'Invalid request' });
  }
};

/**
 * @route DELETE /api/users/:id
 * @desc Delete user by ID
 * @access Private
 */
exports.deleteUser = async (req, res) => {
  try {
    const user = await User.findByIdAndDelete(req.params.id);
    if (!user) return res.status(404).json({ message: 'User not found' });
    res.json({ message: 'User deleted' });
  } catch {
    res.status(400).json({ message: 'Invalid ID' });
  }
};
