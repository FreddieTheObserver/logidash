import type { PrismaService } from '../../prisma/prisma.service';
import { MapsProviderError, type GeoPoint } from './maps-provider.interface';
import { MapsService } from './maps.service';

const origin: GeoPoint = { lat: 13.7563, lng: 100.5018 };
const dest: GeoPoint = { lat: 13.746, lng: 100.5347 };
const CACHE_KEY = '13.7563,100.5018->13.7460,100.5347';

function makePrismaMock() {
  return {
    routeEstimate: {
      findUnique: jest.fn(),
      upsert: jest.fn(),
    },
  };
}

function makeProviderMock() {
  return {
    name: 'stub',
    geocode: jest.fn(),
    route: jest.fn(),
  };
}

describe('MapsService', () => {
  let prisma: ReturnType<typeof makePrismaMock>;
  let provider: ReturnType<typeof makeProviderMock>;
  let service: MapsService;

  beforeEach(() => {
    prisma = makePrismaMock();
    provider = makeProviderMock();
    // The jest.fn() mock structurally satisfies MapsProvider — no cast needed.
    service = new MapsService(prisma as unknown as PrismaService, provider);
  });

  describe('geocode', () => {
    it('delegates to the provider', async () => {
      provider.geocode.mockResolvedValue(origin);
      await expect(service.geocode('123 Main Street')).resolves.toEqual(origin);
      expect(provider.geocode).toHaveBeenCalledWith('123 Main Street');
    });

    it('lets provider errors propagate to the caller', async () => {
      provider.geocode.mockRejectedValue(
        new MapsProviderError('timeout', 'timed out'),
      );
      await expect(service.geocode('123 Main Street')).rejects.toBeInstanceOf(
        MapsProviderError,
      );
    });
  });

  describe('getRouteEstimate', () => {
    it('returns the cached estimate without calling the provider', async () => {
      prisma.routeEstimate.findUnique.mockResolvedValue({
        cacheKey: CACHE_KEY,
        distanceMeters: 5000,
        durationSeconds: 600,
      });

      await expect(service.getRouteEstimate(origin, dest)).resolves.toEqual({
        distanceMeters: 5000,
        durationSeconds: 600,
      });
      expect(prisma.routeEstimate.findUnique).toHaveBeenCalledWith({
        where: { cacheKey: CACHE_KEY },
      });
      expect(provider.route).not.toHaveBeenCalled();
      expect(prisma.routeEstimate.upsert).not.toHaveBeenCalled();
    });

    it('on a miss, calls the provider and persists the estimate', async () => {
      prisma.routeEstimate.findUnique.mockResolvedValue(null);
      provider.route.mockResolvedValue({
        distanceMeters: 8123,
        durationSeconds: 1043,
      });

      await expect(service.getRouteEstimate(origin, dest)).resolves.toEqual({
        distanceMeters: 8123,
        durationSeconds: 1043,
      });
      expect(provider.route).toHaveBeenCalledWith(origin, dest);
      expect(prisma.routeEstimate.upsert).toHaveBeenCalledWith({
        where: { cacheKey: CACHE_KEY },
        create: {
          cacheKey: CACHE_KEY,
          originLat: 13.7563,
          originLng: 100.5018,
          destLat: 13.746,
          destLng: 100.5347,
          distanceMeters: 8123,
          durationSeconds: 1043,
          provider: 'stub',
        },
        update: {},
      });
    });

    it('collapses near-identical coordinates onto one cache key', async () => {
      prisma.routeEstimate.findUnique.mockResolvedValue({
        cacheKey: CACHE_KEY,
        distanceMeters: 5000,
        durationSeconds: 600,
      });

      // ~1 m of jitter — must still hit the same cache row.
      await service.getRouteEstimate(
        { lat: 13.756301, lng: 100.501799 },
        { lat: 13.746004, lng: 100.534702 },
      );
      expect(prisma.routeEstimate.findUnique).toHaveBeenCalledWith({
        where: { cacheKey: CACHE_KEY },
      });
    });

    it('returns null when the provider fails (graceful degradation)', async () => {
      prisma.routeEstimate.findUnique.mockResolvedValue(null);
      provider.route.mockRejectedValue(
        new MapsProviderError('timeout', 'timed out'),
      );

      await expect(service.getRouteEstimate(origin, dest)).resolves.toBeNull();
      expect(prisma.routeEstimate.upsert).not.toHaveBeenCalled();
    });

    it('rethrows unexpected (non-provider) errors', async () => {
      prisma.routeEstimate.findUnique.mockResolvedValue(null);
      provider.route.mockRejectedValue(new Error('programming bug'));

      await expect(service.getRouteEstimate(origin, dest)).rejects.toThrow(
        'programming bug',
      );
    });
  });
});
