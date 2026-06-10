import type { GeoPoint } from '../../maps/maps-provider.interface';
import { SCORING_CONSTANTS } from './weights';

const EARTH_RADIUS_KM = 6371;

/** Great-circle distance in km. */
export function haversineKm(a: GeoPoint, b: GeoPoint): number {
  const toRad = (deg: number): number => (deg * Math.PI) / 180;
  const dLat = toRad(b.lat - a.lat);
  const dLng = toRad(b.lng - a.lng);
  const sinLat = Math.sin(dLat / 2);
  const sinLng = Math.sin(dLng / 2);
  const h =
    sinLat * sinLat +
    Math.cos(toRad(a.lat)) * Math.cos(toRad(b.lat)) * sinLng * sinLng;
  return 2 * EARTH_RADIUS_KM * Math.asin(Math.sqrt(h));
}

/**
 * Degraded travel estimate for when ORS is unavailable (spec §7): straight
 * line × road factor at a fixed speed. Mirrors the MockMapsProvider's model
 * on purpose — both are documented approximations, not shared code.
 */
export function estimateRouteFallback(
  a: GeoPoint,
  b: GeoPoint,
): { distanceKm: number; durationSeconds: number } {
  const distanceKm = haversineKm(a, b) * SCORING_CONSTANTS.roadFactor;
  return {
    distanceKm,
    durationSeconds: Math.round(
      (distanceKm / SCORING_CONSTANTS.fallbackSpeedKmh) * 3600,
    ),
  };
}
