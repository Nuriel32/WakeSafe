jest.mock('../../models/DriverSession', () => ({
  findOne: jest.fn(),
}));
jest.mock('../../models/FatigueLog', () => ({
  create: jest.fn(),
}));
jest.mock('../../models/PhotoSchema', () => ({
  findOne: jest.fn(() => ({
    sort: jest.fn().mockReturnThis(),
    select: jest.fn().mockReturnThis(),
    lean: jest.fn().mockResolvedValue(null),
  })),
}));
jest.mock('../../services/googleMapService', () => ({
  findNearestSafeStop: jest.fn(),
}));
jest.mock('../../services/cacheService', () => ({
  get: jest.fn(),
  set: jest.fn(),
}));
jest.mock('../../services/monitoringService', () => ({
  trackFailure: jest.fn(),
}));

const DriverSession = require('../../models/DriverSession');
const FatigueLog = require('../../models/FatigueLog');
const googleMapService = require('../../services/googleMapService');
const fatigueAlertService = require('../../services/fatigueAlertService');

describe('fatigueAlertService', () => {
  beforeEach(() => {
    global.io = {
      in: jest.fn(() => ({ fetchSockets: jest.fn().mockResolvedValue([{ id: 's1' }]) })),
      to: jest.fn(() => ({ emit: jest.fn() })),
    };
  });

  afterEach(() => {
    delete global.io;
  });

  it('validates and normalizes ML payload', () => {
    const normalized = fatigueAlertService.normalizeDetectionPayload({
      user_id: 'u1',
      session_id: 's1',
      fatigue_level: 0.8,
      confidence: 0.91,
    });
    const errors = fatigueAlertService.validatePayload(normalized);
    expect(errors).toEqual([]);
    expect(normalized.userId).toBe('u1');
    expect(normalized.sessionId).toBe('s1');
  });

  it('skips alert below thresholds', async () => {
    DriverSession.findOne.mockResolvedValue({ _id: 's1', userId: 'u1', route: [], addEvent: jest.fn() });
    const result = await fatigueAlertService.processDetection({
      userId: 'u1',
      sessionId: 's1',
      fatigueLevel: 0.2,
      confidenceScore: 0.2,
      source: 'ml2',
      detectionTimestamp: new Date().toISOString(),
    });
    expect(result.ok).toBe(true);
    expect(result.emitted).toBe(false);
    expect(result.skipped).toBe('below_threshold');
  });

  it('emits fatigue alert and safe-stop recommendation', async () => {
    const addEvent = jest.fn();
    DriverSession.findOne.mockResolvedValue({
      _id: 's1',
      userId: 'u1',
      route: [{ latitude: 32.08, longitude: 34.78 }],
      addEvent,
    });
    googleMapService.findNearestSafeStop.mockResolvedValue({
      found: true,
      best: {
        placeName: 'Gas One',
        address: 'Main road',
        latitude: 32.1,
        longitude: 34.79,
        placeId: 'p1',
        distanceMeters: 1200,
        durationSeconds: 160,
        googleMapsUrl: 'https://maps.example/p1',
      },
      suggestions: [{ placeId: 'p1' }, { placeId: 'p2' }, { placeId: 'p3' }],
    });

    const result = await fatigueAlertService.processDetection({
      userId: 'u1',
      sessionId: 's1',
      fatigueLevel: 0.95,
      confidenceScore: 0.93,
      source: 'ml2',
      prediction: 'sleeping',
      detectionTimestamp: new Date().toISOString(),
    });

    expect(result.ok).toBe(true);
    expect(result.emitted).toBe(true);
    expect(result.safeStop).toBeTruthy();
    expect(result.safeStop.recommendations).toHaveLength(3);
    expect(FatigueLog.create).toHaveBeenCalled();
    expect(addEvent).toHaveBeenCalled();
  });
});
