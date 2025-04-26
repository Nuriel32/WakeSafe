const jwt = require('jsonwebtoken');
const { v4: uuidv4 } = require('uuid');
const bcrypt = require('bcrypt');
const redis = require('../config/redis');
const User = require('../models/User');
const DriverSession = require('../models/DriverSession');

const generateToken = (user, jti) =>
    jwt.sign({ id: user._id, jti }, process.env.JWT_SECRET, { expiresIn: '1h' });

async function register(req, res) {
  const { firstName, lastName, email, password, phone, carNumber } = req.body;

  if (!firstName || !lastName || !email || !password || !phone || !carNumber) {
    return res.status(400).json({ message: 'Missing required fields' });
  }

  if (!/\S+@\S+\.\S+/.test(email)) {
    return res.status(400).json({ message: 'Invalid email format' });
  }

  if (!/^05\d{8}$/.test(phone)) {
    return res.status(400).json({ message: 'Invalid phone number format' });
  }

  if (!/^\d{7,8}$/.test(carNumber)) {
    return res.status(400).json({ message: 'Invalid car number format' });
  }

  try {
    const hashedPassword = await bcrypt.hash(password, 10);

    const user = await User.create({
      firstName,
      lastName,
      email,
      password: hashedPassword,
      phone,
      carNumber
    });

    await DriverSession.create({ userId: user._id });

    const jti = uuidv4();
    const token = generateToken(user, jti);

    await redis.set(`token:${user._id}`, token, 'EX', 3600);
    await redis.set(`jti:${user._id}`, jti, 'EX', 3600);

    res.status(201).json({ token });
  } catch (error) {
    console.error(error);
    res.status(400).json({ message: 'Registration failed, email might already exist' });
  }
}

async function login(req, res) {
  const { email, password } = req.body;

  try {
    const user = await User.findOne({ email });
    if (!user || !(await user.comparePassword(password)))
      return res.status(401).json({ message: 'Invalid credentials' });

    const jti = uuidv4();
    const token = generateToken(user, jti);

    await redis.set(`token:${user._id}`, token, 'EX', 3600);
    await redis.set(`jti:${user._id}`, jti, 'EX', 3600);

    res.json({ token });
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: 'Login failed' });
  }
}

async function logout(req, res) {
  const jti = req.user.jti;
  if (!jti) return res.status(400).json({ message: "Missing token ID" });

  await redis.set(`blacklist:${jti}`, '1', 'EX', 3600);
  await redis.del(`token:${req.user.id}`);
  await redis.del(`jti:${req.user.id}`);

  res.json({ message: 'Logout successful' });
}

module.exports = {
  register,
  login,
  logout
};
