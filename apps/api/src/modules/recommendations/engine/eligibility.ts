import {
  DriverAvailability,
  VehicleStatus,
} from '../../../generated/prisma/enums';
import type { DeliveryContext, DriverContext } from './types';
import { COMPATIBLE_PACKAGE_SIZES } from './weights';

export type EligibilityResult = { eligible: boolean; reasons: string[] };

export function checkEligibility(
  driver: DriverContext,
  delivery: DeliveryContext,
): EligibilityResult {
  const reasons: string[] = [];

  if (driver.availability !== DriverAvailability.available) {
    reasons.push(`Availability is ${driver.availability} (must be available).`);
  }

  if (!driver.vehicle) {
    reasons.push('No vehicle linked to this driver.');
  } else {
    if (driver.vehicle.status !== VehicleStatus.active) {
      reasons.push('Linked vehicle is inactive.');
    }
    if (
      !COMPATIBLE_PACKAGE_SIZES[driver.vehicle.type].includes(
        delivery.packageSize,
      )
    ) {
      reasons.push(
        `A ${driver.vehicle.type} cannot carry ${delivery.packageSize} packages.`,
      );
    }
    const remainingKg = driver.vehicle.capacityWeightKg - driver.activeLoadKg;
    if (remainingKg < delivery.packageWeightKg) {
      reasons.push(
        `Insufficient remaining capacity — needs ${delivery.packageWeightKg} kg, has ${Math.max(0, remainingKg)} kg free.`,
      );
    }
  }

  if (driver.activeJobCount >= driver.maxConcurrentJobs) {
    reasons.push(
      `Workload at maximum — ${driver.activeJobCount} of ${driver.maxConcurrentJobs} active jobs.`,
    );
  }

  return { eligible: reasons.length === 0, reasons };
}
