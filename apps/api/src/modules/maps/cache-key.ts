import type { GeoPoint } from './maps-provider.interface';

/**
 * Cache-key precision: 4 decimal places ≈ 11 m. Coordinates closer than that
 * collapse onto one RouteEstimate row, so re-scoring a delivery never re-hits
 * the routing provider for a near-identical origin/destination pair.
 */
const PRECISION = 4;

export function roundCoord(value: number): number {
  const factor = 10 ** PRECISION;
  return Math.round(value * factor) / factor;
}

/** e.g. "13.7563,100.5018->13.7460,100.5347" */
export function buildCacheKey(origin: GeoPoint, dest: GeoPoint): string {
  const f = (value: number) => roundCoord(value).toFixed(PRECISION);
  return `${f(origin.lat)},${f(origin.lng)}->${f(dest.lat)},${f(dest.lng)}`;
}
