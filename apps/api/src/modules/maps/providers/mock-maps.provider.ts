import { Injectable } from '@nestjs/common';
import type {
  GeoPoint,
  MapsProvider,
  RouteResult,
} from '../maps-provider.interface';

/**
 * Demo coordinates cluster around a fixed city center (Bangkok) so mock
 * geocodes land in one plausible operating area instead of scattering across
 * the globe.
 */
const CITY_CENTER: GeoPoint = { lat: 13.7563, lng: 100.5018 };
/** Max offset from the city center, in degrees (~16 km of latitude). */
const SPREAD_DEGREES = 0.15;
/** Straight-line → road distance correction. */
const ROAD_WINDING_FACTOR = 1.3;
/** Assumed average urban driving speed: 30 km/h. */
const AVG_SPEED_MPS = 30 / 3.6;
const EARTH_RADIUS_METERS = 6_371_000;

/** FNV-1a 32-bit — a stable, dependency-free string hash. */
function fnv1a(input: string): number {
  let hash = 0x811c9dc5;
  for (let i = 0; i < input.length; i++) {
    hash ^= input.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193) >>> 0;
  }
  return hash >>> 0;
}

/** Map a 32-bit hash onto [-1, 1). */
function toUnitRange(hash: number): number {
  return (hash / 0x1_0000_0000) * 2 - 1;
}

/** Match the precision of the Decimal(9,6) lat/lng columns. */
function round6(value: number): number {
  return Math.round(value * 1_000_000) / 1_000_000;
}

function toRadians(degrees: number): number {
  return (degrees * Math.PI) / 180;
}

/** Great-circle distance between two points, in meters. */
export function haversineMeters(a: GeoPoint, b: GeoPoint): number {
  const dLat = toRadians(b.lat - a.lat);
  const dLng = toRadians(b.lng - a.lng);
  const sinLat = Math.sin(dLat / 2);
  const sinLng = Math.sin(dLng / 2);
  const h =
    sinLat * sinLat +
    Math.cos(toRadians(a.lat)) * Math.cos(toRadians(b.lat)) * sinLng * sinLng;
  return 2 * EARTH_RADIUS_METERS * Math.asin(Math.sqrt(h));
}

/**
 * Deterministic, zero-network MapsProvider for tests and key-less local dev.
 * Identical inputs always produce identical outputs (architecture invariant 3
 * extends to everything the recommendation engine consumes).
 */
@Injectable()
export class MockMapsProvider implements MapsProvider {
  readonly name = 'mock';

  geocode(address: string): Promise<GeoPoint | null> {
    const normalized = address.trim().toLowerCase();
    // Independent hashes per axis so lat and lng don't correlate.
    const lat =
      CITY_CENTER.lat +
      toUnitRange(fnv1a(`lat:${normalized}`)) * SPREAD_DEGREES;
    const lng =
      CITY_CENTER.lng +
      toUnitRange(fnv1a(`lng:${normalized}`)) * SPREAD_DEGREES;
    return Promise.resolve({ lat: round6(lat), lng: round6(lng) });
  }

  route(origin: GeoPoint, dest: GeoPoint): Promise<RouteResult> {
    const distanceMeters = Math.round(
      haversineMeters(origin, dest) * ROAD_WINDING_FACTOR,
    );
    const durationSeconds = Math.round(distanceMeters / AVG_SPEED_MPS);
    return Promise.resolve({ distanceMeters, durationSeconds });
  }
}
