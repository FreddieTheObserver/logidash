import {
  MapsProviderError,
  type GeoPoint,
  type MapsProvider,
  type RouteResult,
} from '../maps-provider.interface';

export interface OrsMapsProviderOptions {
  apiKey: string;
  baseUrl: string;
  timeoutMs: number;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

function malformed(what: string): MapsProviderError {
  return new MapsProviderError('http', `Unexpected ORS ${what} response shape`);
}

/**
 * Pelias GeoJSON: `features[0].geometry.coordinates` is `[lng, lat]` —
 * note the GeoJSON axis order, flipped relative to our GeoPoint.
 */
function parseGeocodeResponse(body: unknown): GeoPoint | null {
  if (!isRecord(body) || !Array.isArray(body.features)) {
    throw malformed('geocode');
  }
  if (body.features.length === 0) {
    return null;
  }
  const feature: unknown = body.features[0];
  if (!isRecord(feature) || !isRecord(feature.geometry)) {
    throw malformed('geocode');
  }
  const coordinates = feature.geometry.coordinates;
  if (
    !Array.isArray(coordinates) ||
    coordinates.length < 2 ||
    typeof coordinates[0] !== 'number' ||
    typeof coordinates[1] !== 'number'
  ) {
    throw malformed('geocode');
  }
  return { lat: coordinates[1], lng: coordinates[0] };
}

function parseDirectionsResponse(body: unknown): RouteResult {
  if (!isRecord(body) || !Array.isArray(body.routes)) {
    throw malformed('directions');
  }
  const route: unknown = body.routes[0];
  if (!isRecord(route) || !isRecord(route.summary)) {
    throw malformed('directions');
  }
  const { distance, duration } = route.summary;
  if (typeof distance !== 'number' || typeof duration !== 'number') {
    throw malformed('directions');
  }
  return {
    distanceMeters: Math.round(distance),
    durationSeconds: Math.round(duration),
  };
}

/**
 * Real OpenRouteService adapter: Pelias geocoding + driving-car directions via
 * native fetch with a per-request timeout. All failures are mapped to
 * MapsProviderError so callers (MapsService) can degrade gracefully without
 * vendor-specific handling. Error messages never include the API key, the
 * request URL, or the response body.
 */
export class OrsMapsProvider implements MapsProvider {
  readonly name = 'ors';

  constructor(private readonly options: OrsMapsProviderOptions) {}

  async geocode(address: string): Promise<GeoPoint | null> {
    const url = new URL('/geocode/search', this.options.baseUrl);
    url.searchParams.set('text', address);
    url.searchParams.set('size', '1');
    const body = await this.request(url, { method: 'GET' });
    return parseGeocodeResponse(body);
  }

  async route(origin: GeoPoint, dest: GeoPoint): Promise<RouteResult> {
    const url = new URL('/v2/directions/driving-car', this.options.baseUrl);
    const body = await this.request(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        // ORS expects GeoJSON axis order: [lng, lat].
        coordinates: [
          [origin.lng, origin.lat],
          [dest.lng, dest.lat],
        ],
      }),
    });
    return parseDirectionsResponse(body);
  }

  private async request(url: URL, init: RequestInit): Promise<unknown> {
    let response: Response;
    try {
      response = await fetch(url, {
        ...init,
        headers: {
          ...init.headers,
          Authorization: this.options.apiKey,
          Accept: 'application/json',
        },
        signal: AbortSignal.timeout(this.options.timeoutMs),
      });
    } catch (error) {
      if (
        error instanceof Error &&
        (error.name === 'TimeoutError' || error.name === 'AbortError')
      ) {
        throw new MapsProviderError(
          'timeout',
          `ORS request timed out after ${this.options.timeoutMs}ms`,
        );
      }
      throw new MapsProviderError('network', 'ORS request failed to connect');
    }
    if (!response.ok) {
      throw new MapsProviderError(
        'http',
        `ORS responded with HTTP ${response.status}`,
      );
    }
    try {
      return (await response.json()) as unknown;
    } catch {
      throw new MapsProviderError('http', 'ORS returned a non-JSON body');
    }
  }
}
