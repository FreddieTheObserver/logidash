import {
  DeliveryStatus,
  DriverAvailability,
  PackageSize,
  Priority,
  VehicleStatus,
  VehicleType,
} from '../../../generated/prisma/enums';
import { checkEligibility } from './eligibility';
import type { DeliveryContext, DriverContext } from './types';

function makeDriver(overrides: Partial<DriverContext> = {}): DriverContext {
  return {
    driverId: 'drv1',
    availability: DriverAvailability.available,
    activeJobCount: 0,
    maxConcurrentJobs: 3,
    activeLoadKg: 0,
    baseZoneId: 'z1',
    baseZoneCode: 'DOWNTOWN',
    baseZoneCenter: { lat: 40.71, lng: -74.0 },
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
    pickup: { lat: 40.712, lng: -74.005 },
    packageSize: PackageSize.medium,
    packageWeightKg: 20,
    priority: Priority.normal,
    deadlineAt: new Date('2026-06-10T18:00:00Z'),
    status: DeliveryStatus.ready,
    ...overrides,
  };
}

describe('checkEligibility', () => {
  it('passes a fully-eligible driver with no reasons', () => {
    const result = checkEligibility(makeDriver(), makeDelivery());
    expect(result).toEqual({ eligible: true, reasons: [] });
  });

  it('rejects a non-available driver with the availability reason', () => {
    const result = checkEligibility(
      makeDriver({ availability: DriverAvailability.busy }),
      makeDelivery(),
    );
    expect(result.eligible).toBe(false);
    expect(result.reasons).toContain(
      'Availability is busy (must be available).',
    );
  });

  it('rejects a driver with no linked vehicle', () => {
    const result = checkEligibility(
      makeDriver({ vehicle: null }),
      makeDelivery(),
    );
    expect(result.reasons).toContain('No vehicle linked to this driver.');
  });

  it('rejects an inactive vehicle', () => {
    const driver = makeDriver();
    driver.vehicle = { ...driver.vehicle!, status: VehicleStatus.inactive };
    const result = checkEligibility(driver, makeDelivery());
    expect(result.reasons).toContain('Linked vehicle is inactive.');
  });

  it('rejects an incompatible vehicle type (bike vs medium)', () => {
    const driver = makeDriver();
    driver.vehicle = { ...driver.vehicle!, type: VehicleType.bike };
    const result = checkEligibility(driver, makeDelivery());
    expect(result.reasons).toContain('A bike cannot carry medium packages.');
  });

  it('rejects insufficient remaining capacity, reporting the free kg', () => {
    const result = checkEligibility(
      makeDriver({ activeLoadKg: 490 }), // 500 cap − 490 load = 10 free < 20 needed
      makeDelivery(),
    );
    expect(result.reasons).toContain(
      'Insufficient remaining capacity — needs 20 kg, has 10 kg free.',
    );
  });

  it('accepts remaining capacity exactly equal to the package weight', () => {
    const result = checkEligibility(
      makeDriver({ activeLoadKg: 480 }), // 20 free == 20 needed
      makeDelivery(),
    );
    expect(result.eligible).toBe(true);
  });

  it('rejects a driver at max concurrent jobs', () => {
    const result = checkEligibility(
      makeDriver({ activeJobCount: 3, maxConcurrentJobs: 3 }),
      makeDelivery(),
    );
    expect(result.reasons).toContain(
      'Workload at maximum — 3 of 3 active jobs.',
    );
  });

  it('accumulates multiple reasons (busy + at max)', () => {
    const result = checkEligibility(
      makeDriver({
        availability: DriverAvailability.offline,
        activeJobCount: 3,
      }),
      makeDelivery(),
    );
    expect(result.eligible).toBe(false);
    expect(result.reasons).toHaveLength(2);
  });
});
