jest.mock('../../services/cacheService', () => ({
  get: jest.fn(),
  set: jest.fn(),
}));

let cache;
let googleMapService;

describe('googleMapService.findNearestSafeStop', () => {
  beforeEach(() => {
    process.env.GOOGLE_MAPS_API_KEY = 'maps-test-key';
    process.env.GOOGLE_MAPS_ROUTES_API_KEY = 'routes-test-key';
    jest.resetModules();
    cache = require('../../services/cacheService');
    googleMapService = require('../../services/googleMapService');
    cache.get.mockResolvedValue(null);
    cache.set.mockResolvedValue(true);
  });

  it('ranks candidates by driving time and returns top 3 suggestions', async () => {
    const placesPayload = {
      places: [
        {
          id: 'p1',
          displayName: { text: 'Rest Stop A' },
          formattedAddress: 'Addr 1',
          location: { latitude: 32.1, longitude: 34.8 },
          types: ['rest_stop'],
          businessStatus: 'OPERATIONAL',
          currentOpeningHours: { openNow: true },
        },
        {
          id: 'p2',
          displayName: { text: 'Gas Station B' },
          formattedAddress: 'Addr 2',
          location: { latitude: 32.11, longitude: 34.81 },
          types: ['gas_station'],
          businessStatus: 'OPERATIONAL',
          currentOpeningHours: { openNow: true },
        },
      ],
    };

    global.fetch = jest
      .fn()
      // Nearby search for each type (4 calls)
      .mockResolvedValueOnce({ ok: true, json: async () => placesPayload })
      .mockResolvedValueOnce({ ok: true, json: async () => ({ places: [] }) })
      .mockResolvedValueOnce({ ok: true, json: async () => ({ places: [] }) })
      .mockResolvedValueOnce({ ok: true, json: async () => ({ places: [] }) })
      // Route p1 => slower
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({ routes: [{ duration: '540s', distanceMeters: 4200 }] }),
      })
      // Route p2 => faster
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({ routes: [{ duration: '360s', distanceMeters: 5000 }] }),
      });

    const result = await googleMapService.findNearestSafeStop({ latitude: 32.08, longitude: 34.78 });

    expect(result.found).toBe(true);
    expect(result.best.placeId).toBe('p2');
    expect(result.best.durationSeconds).toBe(360);
    expect(result.suggestions).toHaveLength(2);
    expect(cache.set).toHaveBeenCalled();
  });

  it('filters out closed and unsafe places', async () => {
    const placesPayload = {
      places: [
        {
          id: 'unsafe-1',
          displayName: { text: 'Night Club Place' },
          formattedAddress: 'Dark street',
          location: { latitude: 32.1, longitude: 34.8 },
          types: ['night_club'],
          businessStatus: 'OPERATIONAL',
          currentOpeningHours: { openNow: true },
        },
        {
          id: 'closed-1',
          displayName: { text: 'Gas Closed' },
          formattedAddress: 'Closed avenue',
          location: { latitude: 32.1, longitude: 34.8 },
          types: ['gas_station'],
          businessStatus: 'OPERATIONAL',
          currentOpeningHours: { openNow: false },
        },
      ],
    };

    global.fetch = jest
      .fn()
      .mockResolvedValueOnce({ ok: true, json: async () => placesPayload })
      .mockResolvedValueOnce({ ok: true, json: async () => ({ places: [] }) })
      .mockResolvedValueOnce({ ok: true, json: async () => ({ places: [] }) })
      .mockResolvedValueOnce({ ok: true, json: async () => ({ places: [] }) });

    const result = await googleMapService.findNearestSafeStop({ latitude: 32.08, longitude: 34.78 });
    expect(result.found).toBe(false);
    expect(result.reason).toBe('no_safe_open_candidates');
  });
});
