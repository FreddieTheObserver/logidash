import { Inject, Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { buildCacheKey, roundCoord } from './cache-key';
import {
  MAPS_PROVIDER,
  MapsProviderError,
  type GeoPoint,
  type MapsProvider,
  type RouteResult,
} from './maps-provider.interface';

/**
 * Facade in front of the env-selected MapsProvider. The rest of the system
 * talks only to this service (architecture invariant 7): it adds read-through
 * RouteEstimate caching and absorbs provider outages for route estimates.
 */
@Injectable()
export class MapsService {
  private readonly logger = new Logger(MapsService.name);

  constructor(
    private readonly prisma: PrismaService,
    @Inject(MAPS_PROVIDER) private readonly provider: MapsProvider,
  ) {}

  /**
   * Resolve an address to coordinates. `null` means "no match". Provider
   * failures propagate as MapsProviderError — callers decide how to degrade
   * (e.g. deliveries leave lat/lng null and carry on).
   */
  geocode(address: string): Promise<GeoPoint | null> {
    return this.provider.geocode(address);
  }

  /**
   * Driving distance/duration with a read-through RouteEstimate cache keyed by
   * rounded coordinates. Returns `null` when the provider is unavailable and
   * nothing is cached — callers (the Phase 6 engine) fall back to zone-based
   * proximity instead of failing.
   */
  async getRouteEstimate(
    origin: GeoPoint,
    dest: GeoPoint,
  ): Promise<RouteResult | null> {
    const cacheKey = buildCacheKey(origin, dest);

    const cached = await this.prisma.routeEstimate.findUnique({
      where: { cacheKey },
    });
    if (cached) {
      return {
        distanceMeters: cached.distanceMeters,
        durationSeconds: cached.durationSeconds,
      };
    }

    let route: RouteResult;
    try {
      route = await this.provider.route(origin, dest);
    } catch (error) {
      if (error instanceof MapsProviderError) {
        this.logger.warn(
          `Route estimate unavailable (${error.kind}): ${error.message}`,
        );
        return null;
      }
      throw error;
    }

    // Upsert (not create) so two concurrent misses on the same key don't race
    // into a unique-constraint violation.
    await this.prisma.routeEstimate.upsert({
      where: { cacheKey },
      create: {
        cacheKey,
        originLat: roundCoord(origin.lat),
        originLng: roundCoord(origin.lng),
        destLat: roundCoord(dest.lat),
        destLng: roundCoord(dest.lng),
        distanceMeters: route.distanceMeters,
        durationSeconds: route.durationSeconds,
        provider: this.provider.name,
      },
      update: {},
    });

    return route;
  }
}
