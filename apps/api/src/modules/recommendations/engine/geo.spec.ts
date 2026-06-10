import { estimateRouteFallback, haversineKm } from './geo';

// Reference points ~5.2 km apart (NYC City Hall ↔ Times Square).
const A = { lat: 40.712776, lng: -74.005974 };
const B = { lat: 40.758, lng: -73.9855 };

describe('haversineKm', () => {
  it('is 0 for identical points', () => {
    expect(haversineKm(A, A)).toBe(0);
  });

  it('matches a known distance within tolerance', () => {
    const km = haversineKm(A, B);
    expect(km).toBeGreaterThan(4.5);
    expect(km).toBeLessThan(5.8);
  });

  it('is symmetric', () => {
    expect(haversineKm(A, B)).toBeCloseTo(haversineKm(B, A), 9);
  });
});

describe('estimateRouteFallback', () => {
  it('applies the road factor and fixed speed', () => {
    const est = estimateRouteFallback(A, B);
    const straight = haversineKm(A, B);
    expect(est.distanceKm).toBeCloseTo(straight * 1.3, 6);
    // duration = distance / 30 km/h, in seconds
    expect(est.durationSeconds).toBe(Math.round((est.distanceKm / 30) * 3600));
  });
});
