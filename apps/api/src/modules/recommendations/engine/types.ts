import type { GeoPoint } from '../../maps/maps-provider.interface';
import {
  DeliveryStatus,
  DriverAvailability,
  PackageSize,
  Priority,
  VehicleStatus,
  VehicleType,
} from '../../../generated/prisma/enums';

/** six scoring factors */
export type FactorName =
  | 'zoneFit'
  | 'routeProximity'
  | 'remainingCapacity'
  | 'workloadBalance'
  | 'deadlineFit'
  | 'priorityFit';

/** Weights keyed by factor; they must sum up to 1 */
export type ScoringWeights = Record<FactorName, number>;

/** Normalized factor output. */
export type FactorResult = {
  value: number; // 0..1
  reason: string;
  degraded?: boolean;
};

export type FactorContribution = {
  factor: FactorName;
  weight: number;
  rawValue: number;
  weighted: number;
  reason: string;
  degraded?: boolean;
};

export type VehicleContext = {
  id: string;
  type: VehicleType;
  status: VehicleStatus;
  capacityWeightKg: number;
};

/** plain-number view of a driver row */
export type DriverContext = {
  driverId: string;
  availability: DriverAvailability;
  activeJobCount: number;
  maxConcurrentJobs: number;
  /** Σ packageWeight (kg) over the driver's active assignments. */
  activeLoadKg: number;
  baseZoneId: string;
  baseZoneCode: string;
  baseZoneCenter: GeoPoint | null;
  vehicle: VehicleContext | null;
};

export type DeliveryContext = {
  id: string;
  zoneId: string;
  zoneCode: string;
  pickup: GeoPoint | null;
  packageSize: PackageSize;
  packageWeightKg: number;
  priority: Priority;
  deadlineAt: Date;
  status: DeliveryStatus;
};
