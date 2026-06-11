import {
  DeliveryStatus,
  DriverAvailability,
  PackageSize,
  Priority,
  VehicleStatus,
  VehicleType,
} from '../../../generated/prisma/enums';
import {
  deadlineFit,
  priorityFit,
  remainingCapacity,
  routeProximity,
  workloadBalance,
  zoneFit,
} from './factors';
import { haversineKm } from './geo';
import type { DeliveryContext, DriverContext } from './types';

// ── factories (same shapes as eligibility.spec.ts) ──────────────────────────
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
const NOW = new Date('2026-06-10T12:00:00Z'); // 6h window to the deadline

describe('zoneFit', () => {
  it('scores 1.0 for the same zone', () => {
    const r = zoneFit(makeDriver(), makeDelivery());
    expect(r.value).toBe(1);
    expect(r.reason).toContain('same zone');
  });

  it('scores a cross-zone driver by zone-center→pickup distance, capped at 0.8', () => {
    const driver = makeDriver({
      baseZoneId: 'z2',
      baseZoneCode: 'MIDTOWN',
      baseZoneCenter: { lat: 40.754932, lng: -73.984016 },
    });
    const delivery = makeDelivery();
    const km = haversineKm(driver.baseZoneCenter!, delivery.pickup!);
    const r = zoneFit(driver, delivery);
    const expected = Math.round(0.8 * Math.max(0, 1 - km / 15) * 100) / 100;
    expect(r.value).toBe(expected);
    expect(r.value).toBeLessThan(0.8);
    expect(r.reason).toContain('MIDTOWN');
  });

  it('falls back to a neutral cross-zone value when coordinates are missing', () => {
    const r = zoneFit(
      makeDriver({
        baseZoneId: 'z2',
        baseZoneCode: 'MIDTOWN',
        baseZoneCenter: null,
      }),
      makeDelivery(),
    );
    expect(r.value).toBe(0.4); // neutral 0.5 × crossZoneCap 0.8
    expect(r.reason).toContain('distance unknown');
  });
});

describe('routeProximity', () => {
  it('normalizes ORS distance against the 15 km limit', () => {
    const r = routeProximity(makeDriver(), makeDelivery(), {
      distanceMeters: 3000,
      durationSeconds: 600,
    });
    expect(r.value).toBe(0.8); // 1 − 3/15
    expect(r.degraded).toBeUndefined();
    expect(r.reason).toContain('3.0 km');
  });

  it('clamps to 0 beyond the limit', () => {
    const r = routeProximity(makeDriver(), makeDelivery(), {
      distanceMeters: 40000,
      durationSeconds: 3600,
    });
    expect(r.value).toBe(0);
  });

  it('degrades to the straight-line estimate when the route is null', () => {
    const r = routeProximity(makeDriver(), makeDelivery(), null);
    expect(r.degraded).toBe(true);
    expect(r.value).toBeGreaterThan(0.9); // base center ≈ pickup in the fixture
    expect(r.reason).toContain('estimated');
  });

  it('is neutral when no coordinates exist at all', () => {
    const r = routeProximity(
      makeDriver({ baseZoneCenter: null }),
      makeDelivery({ pickup: null }),
      null,
    );
    expect(r).toEqual({
      value: 0.5,
      reason: 'Route data unavailable — neutral score.',
      degraded: true,
    });
  });
});

describe('remainingCapacity', () => {
  it('scores post-assignment headroom as a share of total capacity', () => {
    // (500 free − 20 pkg) / 500 = 0.96
    const r = remainingCapacity(makeDriver(), makeDelivery());
    expect(r.value).toBe(0.96);
    expect(r.reason).toContain('500 kg free');
  });

  it('accounts for the active load', () => {
    // free = 500 − 400 = 100; (100 − 20) / 500 = 0.16
    const r = remainingCapacity(
      makeDriver({ activeLoadKg: 400 }),
      makeDelivery(),
    );
    expect(r.value).toBe(0.16);
  });

  it('is 0 with no vehicle', () => {
    expect(
      remainingCapacity(makeDriver({ vehicle: null }), makeDelivery()).value,
    ).toBe(0);
  });
});

describe('workloadBalance', () => {
  it('is 1 with no active jobs', () => {
    expect(workloadBalance(makeDriver()).value).toBe(1);
  });

  it('decreases linearly with load', () => {
    const r = workloadBalance(
      makeDriver({ activeJobCount: 2, maxConcurrentJobs: 3 }),
    );
    expect(r.value).toBe(0.33);
    expect(r.reason).toBe('2 of 3 active jobs.');
  });
});

describe('deadlineFit', () => {
  it('scores 0 when the deadline has passed', () => {
    const r = deadlineFit(
      makeDriver(),
      makeDelivery({ deadlineAt: new Date('2026-06-10T11:00:00Z') }),
      { distanceMeters: 3000, durationSeconds: 600 },
      NOW,
    );
    expect(r.value).toBe(0);
    expect(r.reason).toBe('Deadline has already passed.');
  });

  it('scores the travel-time share of the window with ORS duration', () => {
    // 60 min travel vs 360 min window → 1 − 1/6 ≈ 0.83
    const r = deadlineFit(
      makeDriver(),
      makeDelivery(),
      { distanceMeters: 30000, durationSeconds: 3600 },
      NOW,
    );
    expect(r.value).toBe(0.83);
    expect(r.degraded).toBeUndefined();
  });

  it('degrades to the estimated duration when the route is null', () => {
    const r = deadlineFit(makeDriver(), makeDelivery(), null, NOW);
    expect(r.degraded).toBe(true);
    expect(r.reason).toContain('(estimated)');
  });

  it('is neutral when no coordinates exist', () => {
    const r = deadlineFit(
      makeDriver({ baseZoneCenter: null }),
      makeDelivery({ pickup: null }),
      null,
      NOW,
    );
    expect(r).toEqual({
      value: 0.5,
      reason: 'Travel time unknown — neutral score.',
      degraded: true,
    });
  });
});

describe('priorityFit', () => {
  it('is 1.0 for low priority regardless of load', () => {
    const r = priorityFit(
      makeDriver({ activeJobCount: 3 }),
      makeDelivery({ priority: Priority.low }),
    );
    expect(r.value).toBe(1);
    expect(r.reason).toBe('Low priority — any available driver fits.');
  });

  it('penalizes loaded drivers in proportion to priority pressure', () => {
    const driver = makeDriver({ activeJobCount: 2, maxConcurrentJobs: 3 });
    expect(
      priorityFit(driver, makeDelivery({ priority: Priority.urgent })).value,
    ).toBe(0.33); // 1 − 1.0×(2/3)
    expect(
      priorityFit(driver, makeDelivery({ priority: Priority.high })).value,
    ).toBe(0.67); // 1 − 0.5×(2/3)
    expect(
      priorityFit(driver, makeDelivery({ priority: Priority.normal })).value,
    ).toBe(0.83); // 1 − 0.25×(2/3)
  });

  it('names the free slots in the reason', () => {
    const r = priorityFit(
      makeDriver({ activeJobCount: 1, maxConcurrentJobs: 3 }),
      makeDelivery({ priority: Priority.urgent }),
    );
    expect(r.reason).toBe(
      'Urgent priority — driver has 2 of 3 job slots free.',
    );
  });
});
