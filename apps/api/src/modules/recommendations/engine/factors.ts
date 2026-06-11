import { Priority } from '../../../generated/prisma/enums';
import type { RouteResult } from '../../maps/maps-provider.interface';
import { estimateRouteFallback, haversineKm } from './geo';
import type { DeliveryContext, DriverContext, FactorResult } from './types';
import { SCORING_CONSTANTS } from './weights';

const clamp01 = (n: number): number => Math.min(1, Math.max(0, n));
const round2 = (n: number): number => Math.round(n * 100) / 100;

/** Same zone → 1.0; otherwise normalized by zone-center→pickup distance. */
export function zoneFit(
  driver: DriverContext,
  delivery: DeliveryContext,
): FactorResult {
  if (driver.baseZoneId === delivery.zoneId) {
    return {
      value: 1,
      reason: `Based in ${delivery.zoneCode} — same zone as the delivery.`,
    };
  }
  if (driver.baseZoneCenter && delivery.pickup) {
    const km = haversineKm(driver.baseZoneCenter, delivery.pickup);
    const value = round2(
      SCORING_CONSTANTS.crossZoneCap *
        clamp01(1 - km / SCORING_CONSTANTS.zoneDistanceLimitKm),
    );
    return {
      value,
      reason: `Based in ${driver.baseZoneCode} — ${km.toFixed(1)} km from the pickup.`,
    };
  }
  return {
    value: round2(
      SCORING_CONSTANTS.neutralValue * SCORING_CONSTANTS.crossZoneCap,
    ),
    reason: `Based in ${driver.baseZoneCode} — different zone, distance unknown.`,
  };
}

/** ORS driving distance normalized against the 15 km limit; degrades to the
 * straight-line estimate, then to neutral, when data is missing (spec §7). */
export function routeProximity(
  driver: DriverContext,
  delivery: DeliveryContext,
  route: RouteResult | null,
): FactorResult {
  if (route) {
    const km = route.distanceMeters / 1000;
    const minutes = Math.round(route.durationSeconds / 60);
    return {
      value: round2(clamp01(1 - km / SCORING_CONSTANTS.routeDistanceLimitKm)),
      reason: `${km.toFixed(1)} km / ~${minutes} min from base zone to pickup.`,
    };
  }
  if (driver.baseZoneCenter && delivery.pickup) {
    const est = estimateRouteFallback(driver.baseZoneCenter, delivery.pickup);
    return {
      value: round2(
        clamp01(1 - est.distanceKm / SCORING_CONSTANTS.routeDistanceLimitKm),
      ),
      reason: `~${est.distanceKm.toFixed(1)} km from base zone to pickup — estimated, route data unavailable.`,
      degraded: true,
    };
  }
  return {
    value: SCORING_CONSTANTS.neutralValue,
    reason: 'Route data unavailable — neutral score.',
    degraded: true,
  };
}

/** Headroom after taking this package, as a share of total capacity. */
export function remainingCapacity(
  driver: DriverContext,
  delivery: DeliveryContext,
): FactorResult {
  if (!driver.vehicle) {
    return { value: 0, reason: 'No vehicle linked to this driver.' };
  }
  const freeKg = driver.vehicle.capacityWeightKg - driver.activeLoadKg;
  const value = round2(
    clamp01(
      (freeKg - delivery.packageWeightKg) / driver.vehicle.capacityWeightKg,
    ),
  );
  return {
    value,
    reason: `${driver.vehicle.type} with ${freeKg.toFixed(0)} kg free for a ${delivery.packageWeightKg} kg package.`,
  };
}

/** Fewer active jobs scores higher (fairness). */
export function workloadBalance(driver: DriverContext): FactorResult {
  const value =
    driver.maxConcurrentJobs > 0
      ? round2(clamp01(1 - driver.activeJobCount / driver.maxConcurrentJobs))
      : 0;
  return {
    value,
    reason: `${driver.activeJobCount} of ${driver.maxConcurrentJobs} active jobs.`,
  };
}

/** Travel time as a share of the remaining deadline window. */
export function deadlineFit(
  driver: DriverContext,
  delivery: DeliveryContext,
  route: RouteResult | null,
  now: Date,
): FactorResult {
  const windowMinutes =
    (delivery.deadlineAt.getTime() - now.getTime()) / 60_000;
  if (windowMinutes <= 0) {
    return { value: 0, reason: 'Deadline has already passed.' };
  }

  let travelSeconds: number | null = null;
  let degraded = false;
  if (route) {
    travelSeconds = route.durationSeconds;
  } else if (driver.baseZoneCenter && delivery.pickup) {
    travelSeconds = estimateRouteFallback(
      driver.baseZoneCenter,
      delivery.pickup,
    ).durationSeconds;
    degraded = true;
  }
  if (travelSeconds === null) {
    return {
      value: SCORING_CONSTANTS.neutralValue,
      reason: 'Travel time unknown — neutral score.',
      degraded: true,
    };
  }

  const travelMinutes = travelSeconds / 60;
  const value = round2(clamp01(1 - travelMinutes / windowMinutes));
  const base =
    value === 0
      ? `~${Math.round(travelMinutes)} min to pickup exceeds the ${Math.round(windowMinutes)} min window.`
      : `~${Math.round(travelMinutes)} min to pickup against a ${Math.round(windowMinutes)} min window.`;
  return degraded
    ? { value, reason: `${base} (estimated)`, degraded: true }
    : { value, reason: base };
}

/** Urgent work prefers drivers with free slots; low priority is indifferent. */
export function priorityFit(
  driver: DriverContext,
  delivery: DeliveryContext,
): FactorResult {
  const pressure = SCORING_CONSTANTS.priorityPressure[delivery.priority];
  const load =
    driver.maxConcurrentJobs > 0
      ? driver.activeJobCount / driver.maxConcurrentJobs
      : 1;
  const value = round2(clamp01(1 - pressure * load));
  if (delivery.priority === Priority.low) {
    return { value, reason: 'Low priority — any available driver fits.' };
  }
  const freeSlots = Math.max(
    0,
    driver.maxConcurrentJobs - driver.activeJobCount,
  );
  const label =
    delivery.priority.charAt(0).toUpperCase() + delivery.priority.slice(1);
  return {
    value,
    reason: `${label} priority — driver has ${freeSlots} of ${driver.maxConcurrentJobs} job slots free.`,
  };
}
