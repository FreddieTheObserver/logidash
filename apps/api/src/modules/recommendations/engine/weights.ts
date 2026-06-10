import {
  PackageSize,
  Priority,
  VehicleType,
} from '../../../generated/prisma/enums';
import type { ScoringWeights } from './types';

/** DI token so the service receives weights as config (swappable in tests). */
export const RECOMMENDATION_WEIGHTS = Symbol('RECOMMENDATION_WEIGHTS');

export const DEFAULT_WEIGHTS: ScoringWeights = {
  zoneFit: 0.3,
  routeProximity: 0.25,
  remainingCapacity: 0.15,
  workloadBalance: 0.15,
  deadlineFit: 0.1,
  priorityFit: 0.05,
};

/**
 *  Normilization constants. Kept beside the
 *  weights so a run's inputSnapshot records the full scoring configuration.
 */
export const SCORING_CONSTANTS = {
  /** Cross-zone zoneFit is capped below same-zone (which is always 1.0). */
  crossZoneCap: 0.8,
  /** km of zone-center->pickup distance at which zoneFit reaches 0. */
  zoneDistanceLimitKm: 15,
  /** km of driving distance at which routeProximity reaches 0. */
  routeDistanceLimitKm: 15,
  /** Straight-line → road-distance factor for degraded estimates. */
  roadFactor: 1.3,
  /** Assumed speed (km/h) for degraded duration estimates. */
  fallbackSpeedKmh: 30,
  /** Neutral value when a factor's inputs are entirely unavailable. */
  neutralValue: 0.5,
  /** priorityFit pressure per priority (multiplies the driver's load ratio). */
  priorityPressure: {
    [Priority.low]: 0,
    [Priority.normal]: 0.25,
    [Priority.high]: 0.5,
    [Priority.urgent]: 1,
  } as Record<Priority, number>,
};

/** Locked size-tier matrix: which package sizes each vehicle type may carry. */
export const COMPATIBLE_PACKAGE_SIZES: Record<
  VehicleType,
  readonly PackageSize[]
> = {
  [VehicleType.bike]: [PackageSize.small],
  [VehicleType.car]: [PackageSize.small, PackageSize.medium],
  [VehicleType.van]: [PackageSize.small, PackageSize.medium, PackageSize.large],
  [VehicleType.truck]: [
    PackageSize.small,
    PackageSize.medium,
    PackageSize.large,
  ],
};
