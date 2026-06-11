import type { DeliveryModel } from '../../../generated/prisma/models/Delivery';
import type { DriverProfileModel } from '../../../generated/prisma/models/DriverProfile';
import type { VehicleModel } from '../../../generated/prisma/models/Vehicle';
import type { ZoneModel } from '../../../generated/prisma/models/Zone';
import type { DeliveryContext, DriverContext } from './types';

/** Row shapes the builders need (Prisma include results are supersets). */
export type DriverRowForContext = DriverProfileModel & {
  vehicle: VehicleModel | null;
  baseZone: ZoneModel;
};
export type DeliveryRowForContext = DeliveryModel & { zone: ZoneModel };

export function toDriverContext(
  row: DriverRowForContext,
  activeLoadKg: number,
): DriverContext {
  return {
    driverId: row.id,
    availability: row.availability,
    activeJobCount: row.activeJobCount,
    maxConcurrentJobs: row.maxConcurrentJobs,
    activeLoadKg,
    baseZoneId: row.baseZoneId,
    baseZoneCode: row.baseZone.code,
    baseZoneCenter:
      row.baseZone.centerLat !== null && row.baseZone.centerLng !== null
        ? {
            lat: Number(row.baseZone.centerLat),
            lng: Number(row.baseZone.centerLng),
          }
        : null,
    vehicle: row.vehicle
      ? {
          id: row.vehicle.id,
          type: row.vehicle.type,
          status: row.vehicle.status,
          capacityWeightKg: Number(row.vehicle.capacityWeight),
        }
      : null,
  };
}

export function toDeliveryContext(row: DeliveryRowForContext): DeliveryContext {
  return {
    id: row.id,
    zoneId: row.zoneId,
    zoneCode: row.zone.code,
    pickup:
      row.pickupLat !== null && row.pickupLng !== null
        ? { lat: Number(row.pickupLat), lng: Number(row.pickupLng) }
        : null,
    packageSize: row.packageSize,
    packageWeightKg: Number(row.packageWeight),
    priority: row.priority,
    deadlineAt: row.deadlineAt,
    status: row.status,
  };
}
