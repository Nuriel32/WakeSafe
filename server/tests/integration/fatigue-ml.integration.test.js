jest.mock('../../services/fatigueAlertService', () => ({
  processDetection: jest.fn(),
}));
jest.mock('express-mongo-sanitize', () => () => (_req, _res, next) => next());

const request = require('supertest');
const app = require('../../app');
const fatigueAlertService = require('../../services/fatigueAlertService');

describe('Fatigue ML ingestion integration', () => {
  beforeEach(() => {
    process.env.ML_WEBHOOK_API_KEY = 'test-ml-key';
  });

  it('rejects unauthorized ML payload source', async () => {
    const res = await request(app).post('/api/fatigue/ml-detection').send({
      userId: 'u1',
      sessionId: 's1',
      detectionTimestamp: new Date().toISOString(),
      fatigueLevel: 0.9,
      confidenceScore: 0.9,
      source: 'ml2',
    });

    expect(res.statusCode).toBe(401);
  });

  it('accepts valid ML payload and returns processed status', async () => {
    fatigueAlertService.processDetection.mockResolvedValue({
      ok: true,
      emitted: true,
      severity: 'critical',
    });

    const res = await request(app)
      .post('/api/fatigue/ml-detection')
      .set('x-ml-api-key', 'test-ml-key')
      .send({
        userId: 'u1',
        sessionId: 's1',
        detectionTimestamp: new Date().toISOString(),
        fatigueLevel: 0.95,
        confidenceScore: 0.92,
        source: 'ml2',
      });

    expect(res.statusCode).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.data.emitted).toBe(true);
    expect(fatigueAlertService.processDetection).toHaveBeenCalled();
  });
});
