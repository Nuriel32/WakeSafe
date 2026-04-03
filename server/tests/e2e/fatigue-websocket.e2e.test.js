const http = require('http');
const { Server } = require('socket.io');
const { io: Client } = require('socket.io-client');

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
const googleMapService = require('../../services/googleMapService');
const fatigueAlertService = require('../../services/fatigueAlertService');

describe('Fatigue alert websocket E2E', () => {
  let io;
  let httpServer;
  let port;
  let client;

  beforeAll((done) => {
    httpServer = http.createServer();
    io = new Server(httpServer, { cors: { origin: '*' } });
    io.on('connection', (socket) => {
      const userId = socket.handshake.auth?.userId;
      socket.join(`user:${userId}`);
    });
    httpServer.listen(() => {
      port = httpServer.address().port;
      global.io = io;
      done();
    });
  });

  afterAll(async () => {
    delete global.io;
    if (client) client.close();
    await io.close();
    await new Promise((resolve) => httpServer.close(resolve));
  });

  it('delivers fatigue alert + safe stop recommendation to correct user room', async () => {
    const userId = 'u1';
    const sessionId = '507f1f77bcf86cd799439011';

    const addEvent = jest.fn();
    DriverSession.findOne.mockResolvedValue({
      _id: sessionId,
      userId,
      isActive: true,
      route: [{ latitude: 32.08, longitude: 34.78 }],
      addEvent,
    });
    googleMapService.findNearestSafeStop.mockResolvedValue({
      found: true,
      best: {
        placeName: 'Rest Area 1',
        address: 'Highway 1',
        latitude: 32.1,
        longitude: 34.79,
        placeId: 'p1',
        distanceMeters: 1400,
        durationSeconds: 180,
        googleMapsUrl: 'https://maps.example/p1',
      },
      suggestions: [{ placeId: 'p1' }, { placeId: 'p2' }, { placeId: 'p3' }],
    });

    client = new Client(`http://localhost:${port}`, {
      transports: ['websocket'],
      auth: { userId },
    });

    await new Promise((resolve) => client.on('connect', resolve));

    const fatiguePromise = new Promise((resolve) => client.once('driver_fatigue_alert', resolve));
    const safeStopPromise = new Promise((resolve) => client.once('fatigue_safe_stop', resolve));

    const processResult = await fatigueAlertService.processDetection({
      userId,
      sessionId,
      detectionTimestamp: new Date().toISOString(),
      fatigueLevel: 0.93,
      confidenceScore: 0.95,
      source: 'ml2',
      prediction: 'sleeping',
    });

    const [fatigueEvent, safeStopEvent] = await Promise.all([fatiguePromise, safeStopPromise]);

    expect(processResult.ok).toBe(true);
    expect(fatigueEvent.sessionId).toBe(sessionId);
    expect(fatigueEvent.severity).toBe('critical');
    expect(safeStopEvent.placeId).toBe('p1');
    expect(Array.isArray(safeStopEvent.recommendations)).toBe(true);
    expect(safeStopEvent.recommendations).toHaveLength(3);
    expect(addEvent).toHaveBeenCalled();
  });
});
