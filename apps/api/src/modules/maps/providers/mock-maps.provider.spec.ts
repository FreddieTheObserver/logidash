import type { GeoPoint } from '../maps-provider.interface';
import { haversineMeters, MockMapsProvider } from './mock-maps.provider';

describe('MockMapsProvider', () => {
  const provider = new MockMapsProvider();

  describe('geocode', () => {
    it('is deterministic: identical addresses yield identical coords', async () => {
      const first = await provider.geocode('123 Main Street');
      const second = await provider.geocode('123 Main Street');
      expect(first).toEqual(second);
    });

    it('normalizes case and surrounding whitespace', async () => {
      const a = await provider.geocode('123 Main Street');
      const b = await provider.geocode('  123 MAIN STREET  ');
      expect(a).toEqual(b);
    });

    it('yields different coords for different addresses', async () => {
      const a = await provider.geocode('123 Main Street');
      const b = await provider.geocode('456 Other Avenue');
      expect(a).not.toEqual(b);
    });

    it('stays within the demo bounding box around the city center', async () => {
      const addresses = [
        'Warehouse 7, Dock Road',
        'Central Plaza, Tower B',
        '99/1 Riverside Lane',
        'Unit 42, Industrial Park',
      ];
      for (const address of addresses) {
        const point = await provider.geocode(address);
        expect(point).not.toBeNull();
        expect(point!.lat).toBeGreaterThanOrEqual(13.7563 - 0.15);
        expect(point!.lat).toBeLessThanOrEqual(13.7563 + 0.15);
        expect(point!.lng).toBeGreaterThanOrEqual(100.5018 - 0.15);
        expect(point!.lng).toBeLessThanOrEqual(100.5018 + 0.15);
      }
    });
  });

  describe('route', () => {
    const origin: GeoPoint = { lat: 13.7563, lng: 100.5018 };

    it('returns zero distance and duration for identical points', async () => {
      const result = await provider.route(origin, { ...origin });
      expect(result).toEqual({ distanceMeters: 0, durationSeconds: 0 });
    });

    it('scales haversine distance by the road-winding factor', async () => {
      // 0.1° of latitude ≈ 11,120 m straight line.
      const dest: GeoPoint = { lat: origin.lat + 0.1, lng: origin.lng };
      const straight = haversineMeters(origin, dest);
      expect(straight).toBeGreaterThan(11_000);
      expect(straight).toBeLessThan(11_250);

      const result = await provider.route(origin, dest);
      expect(result.distanceMeters).toBe(Math.round(straight * 1.3));
      // 30 km/h average speed.
      expect(result.durationSeconds).toBe(
        Math.round(result.distanceMeters / (30 / 3.6)),
      );
    });

    it('is symmetric and deterministic', async () => {
      const dest: GeoPoint = { lat: 13.81, lng: 100.55 };
      const forward = await provider.route(origin, dest);
      const backward = await provider.route(dest, origin);
      const again = await provider.route(origin, dest);
      expect(forward).toEqual(backward);
      expect(forward).toEqual(again);
    });
  });
});
