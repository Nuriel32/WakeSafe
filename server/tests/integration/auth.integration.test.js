jest.mock('../../models/Users', () => ({
  create: jest.fn(),
  findOne: jest.fn(),
}));
jest.mock('express-mongo-sanitize', () => () => (_req, _res, next) => next());
jest.mock('../../models/DriverSession', () => ({
  create: jest.fn(),
}));
jest.mock('../../services/cacheService', () => ({
  set: jest.fn(),
  del: jest.fn(),
  revokeToken: jest.fn(),
}));

const request = require('supertest');
const app = require('../../app');
const User = require('../../models/Users');
const DriverSession = require('../../models/DriverSession');

describe('Auth API integration', () => {
  beforeEach(() => {
    process.env.JWT_SECRET = 'test-secret';
  });

  it('POST /api/auth/register returns token', async () => {
    User.create.mockResolvedValue({
      _id: '507f1f77bcf86cd799439011',
      firstName: 'Test',
      lastName: 'User',
      email: 'test@example.com',
      phone: '0512345678',
      carNumber: '1234567',
    });
    DriverSession.create.mockResolvedValue({});

    const res = await request(app).post('/api/auth/register').send({
      firstName: 'Test',
      lastName: 'User',
      email: 'test@example.com',
      password: 'Pass123456',
      phone: '0512345678',
      carNumber: '1234567',
    });

    expect(res.statusCode).toBe(201);
    expect(res.body.success).toBe(true);
    expect(res.body.data.token).toBeDefined();
  });

  it('POST /api/auth/login returns token for valid credentials', async () => {
    User.findOne.mockResolvedValue({
      _id: '507f1f77bcf86cd799439011',
      firstName: 'Test',
      lastName: 'User',
      email: 'test@example.com',
      phone: '0512345678',
      carNumber: '1234567',
      comparePassword: jest.fn().mockResolvedValue(true),
    });

    const res = await request(app).post('/api/auth/login').send({
      email: 'test@example.com',
      password: 'Pass123456',
    });

    expect(res.statusCode).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.data.token).toBeDefined();
  });
});
