process.env.NODE_ENV = 'test';
process.env.JWT_SECRET = process.env.JWT_SECRET || 'test-secret';
process.env.ML_WEBHOOK_API_KEY = process.env.ML_WEBHOOK_API_KEY || 'test-ml-key';

jest.setTimeout(20000);
