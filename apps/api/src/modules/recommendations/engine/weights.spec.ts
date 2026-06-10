import {
  PackageSize,
  Priority,
  VehicleType,
} from '../../../generated/prisma/enums';
import {
  COMPATIBLE_PACKAGE_SIZES,
  DEFAULT_WEIGHTS,
  SCORING_CONSTANTS,
} from './weights';

describe('scoring configuration', () => {
  it('weights sum to exactly 1', () => {
    const sum = Object.values(DEFAULT_WEIGHTS).reduce((a, b) => a + b, 0);
    expect(sum).toBeCloseTo(1, 10);
  });

  it('matches the spec §7 weight table', () => {
    expect(DEFAULT_WEIGHTS).toEqual({
      zoneFit: 0.3,
      routeProximity: 0.25,
      remainingCapacity: 0.15,
      workloadBalance: 0.15,
      deadlineFit: 0.1,
      priorityFit: 0.05,
    });
  });

  it('compatibility matrix covers every vehicle type with ≥1 size', () => {
    for (const type of Object.values(VehicleType)) {
      expect(COMPATIBLE_PACKAGE_SIZES[type].length).toBeGreaterThan(0);
    }
  });

  it('encodes the locked size tiers', () => {
    expect(COMPATIBLE_PACKAGE_SIZES[VehicleType.bike]).toEqual([
      PackageSize.small,
    ]);
    expect(COMPATIBLE_PACKAGE_SIZES[VehicleType.car]).toEqual([
      PackageSize.small,
      PackageSize.medium,
    ]);
    expect(COMPATIBLE_PACKAGE_SIZES[VehicleType.van]).toContain(
      PackageSize.large,
    );
    expect(COMPATIBLE_PACKAGE_SIZES[VehicleType.truck]).toContain(
      PackageSize.large,
    );
  });

  it('defines priority pressure for every priority', () => {
    for (const p of Object.values(Priority)) {
      expect(SCORING_CONSTANTS.priorityPressure[p]).toBeGreaterThanOrEqual(0);
      expect(SCORING_CONSTANTS.priorityPressure[p]).toBeLessThanOrEqual(1);
    }
  });
});
