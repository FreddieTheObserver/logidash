/**
 * Maps adapter contract (architecture invariant 7): OpenRouteService — or any
 * future routing vendor — is reached only through this interface, so domain
 * modules stay network-agnostic and tests never touch a real provider.
 */

export interface GeoPoint {
  lat: number;
  lng: number;
}

export interface RouteResult {
  distanceMeters: number;
  durationSeconds: number;
}

export type MapsProviderErrorKind = 'timeout' | 'http' | 'network';

/**
 * Infrastructure failure raised by a provider (timeout, non-2xx, DNS, ...).
 * Distinct from a successful "no match" geocode, which resolves to `null`.
 */
export class MapsProviderError extends Error {
  constructor(
    readonly kind: MapsProviderErrorKind,
    message: string,
  ) {
    super(message);
    this.name = 'MapsProviderError';
  }
}

export interface MapsProvider {
  /** Provider identifier persisted on RouteEstimate rows (e.g. 'ors'). */
  readonly name: string;

  /**
   * Resolve a free-form address to coordinates. Resolves `null` when the
   * provider finds no match; throws MapsProviderError on infrastructure
   * failure.
   */
  geocode(address: string): Promise<GeoPoint | null>;

  /**
   * Driving distance/duration between two points. Throws MapsProviderError on
   * infrastructure failure.
   */
  route(origin: GeoPoint, dest: GeoPoint): Promise<RouteResult>;
}

/** Injection token for the env-selected MapsProvider implementation. */
export const MAPS_PROVIDER = Symbol('MAPS_PROVIDER');
