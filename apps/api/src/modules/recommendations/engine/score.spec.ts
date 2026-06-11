import {
  DeliveryStatus,
  DriverAvailability,
  PackageSize,
  Priority,
  VehicleStatus,
  VehicleType,
} from '../../../generated/prisma/enums';
import { rankCandidates, scoreCandidate } from './score';
import type { DeliveryContext, DriverContext } from './types';
import { DEFAULT_WEIGHTS } from './weights';

function makeDriver(overrides: Partial<DriverContext> = {}): DriverContext {
  return {
    driverId: 'drv1',
    availability: DriverAvailability.available,
    activeJobCount: 0,
    maxConcurrentJobs: 3,
    activeLoadKg: 0,
    baseZoneId: 'z1',
    baseZoneCode: 'DOWNTOWN',
    baseZoneCenter: { lat: 40.712776, lng: -74.005974 },
    vehicle: {
      id: 'veh1',
      type: VehicleType.van,
      status: VehicleStatus.active,
      capacityWeightKg: 500,
    },
    ...overrides,
  };
}
function makeDelivery(
  overrides: Partial<DeliveryContext> = {},
): DeliveryContext {
  return {
    id: 'del1',
    zoneId: 'z1',
    zoneCode: 'DOWNTOWN',
    pickup: { lat: 40.7126, lng: -74.0089 },
    packageSize: PackageSize.medium,
    packageWeightKg: 20,
    priority: Priority.normal,
    deadlineAt: new Date('2026-06-10T18:00:00Z'),
    status: DeliveryStatus.ready,
    ...overrides,
  };
}
const NOW = new Date('2026-06-10T12:00:00Z');
const ROUTE = { distanceMeters: 3000, durationSeconds: 600 };

describe('scoreCandidate', () => {
  it('produces one contribution per factor, in declaration order', () => {
    const { explanation } = scoreCandidate(
      makeDriver(),
      makeDelivery(),
      ROUTE,
      NOW,
      DEFAULT_WEIGHTS,
    );
    expect(explanation.map((f) => f.factor)).toEqual([
      'zoneFit',
      'routeProximity',
      'remainingCapacity',
      'workloadBalance',
      'deadlineFit',
      'priorityFit',
    ]);
  });

  it('weighted = rawValue × weight × 100 (1 dp) and score = Σ weighted (2 dp)', () => {
    const { score, explanation } = scoreCandidate(
      makeDriver(),
      makeDelivery(),
      ROUTE,
      NOW,
      DEFAULT_WEIGHTS,
    );
    for (const f of explanation) {
      expect(f.weighted).toBeCloseTo(
        Math.round(f.rawValue * f.weight * 100 * 10) / 10,
        10,
      );
    }
    const sum = explanation.reduce((s, f) => s + f.weighted, 0);
    expect(score).toBeCloseTo(Math.round(sum * 100) / 100, 10);
    expect(score).toBeGreaterThan(0);
    expect(score).toBeLessThanOrEqual(100);
  });

  it('is deterministic: identical inputs → deep-equal output', () => {
    const a = scoreCandidate(
      makeDriver(),
      makeDelivery(),
      ROUTE,
      NOW,
      DEFAULT_WEIGHTS,
    );
    const b = scoreCandidate(
      makeDriver(),
      makeDelivery(),
      ROUTE,
      NOW,
      DEFAULT_WEIGHTS,
    );
    expect(a).toEqual(b);
  });

  it('marks degraded contributions when the route is null', () => {
    const { explanation } = scoreCandidate(
      makeDriver(),
      makeDelivery(),
      null,
      NOW,
      DEFAULT_WEIGHTS,
    );
    const route = explanation.find((f) => f.factor === 'routeProximity');
    expect(route?.degraded).toBe(true);
  });
});

describe('rankCandidates', () => {
  it('ranks by score desc and breaks ties by driverId asc', () => {
    const ranked = rankCandidates([
      { driverId: 'b', score: 80, explanation: [] },
      { driverId: 'a', score: 80, explanation: [] },
      { driverId: 'c', score: 91.5, explanation: [] },
    ]);
    expect(ranked.map((r) => [r.driverId, r.rank])).toEqual([
      ['c', 1],
      ['a', 2],
      ['b', 3],
    ]);
  });

  it('does not mutate its input', () => {
    const input = [
      { driverId: 'b', score: 1, explanation: [] },
      { driverId: 'a', score: 2, explanation: [] },
    ];
    rankCandidates(input);
    expect(input.map((c) => c.driverId)).toEqual(['b', 'a']);
  });
});
