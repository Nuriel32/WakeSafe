const jwt = require('jsonwebtoken');
const User = require('../models/User');

const generateToken = (user) =>
  jwt.sign({ id: user._id }, process.env.JWT_SECRET, { expiresIn: '1h' });

/**
 * @route POST /api/auth/register
 * @desc Register new user
 * @access Public
 */
exports.register = async (req, res) => {
  const { email, password, name } = req.body;
  try {
    const user = await User.create({ email, password, name });
    res.status(201).json({ token: generateToken(user) });
  } catch (e) {
    res.status(400).json({ message: 'Email already in use' });
  }
};

/**
 * @route POST /api/auth/login
 * @desc Login user
 * @access Public
 */
exports.login = async (req, res) => {
  const { email, password } = req.body;
  try {
    const user = await User.findOne({ email });
    if (!user || !(await user.comparePassword(password))) {
      return res.status(401).json({ message: 'Invalid credentials' });
    }
    res.json({ token: generateToken(user) });
  } catch {
    res.status(500).json({ message: 'Server error' });
  }
};
