import {
  ConflictException,
  ForbiddenException,
  Inject,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { AuthUser } from '../../common/types/auth-user';
import { Prisma } from '../../generated/prisma/client';
import { DeliveryStatus, Role } from '../../generated/prisma/enums';
import { PrismaService } from '../../prisma/prisma.service';
import { AuditService } from '../audit/audit.service';
import { MapsService } from '../maps/maps.service';
import { activeLoadsByDriver } from './engine/active-load';
import {
  toDeliveryContext,
  toDriverContext,
  type DeliveryRowForContext,
} from './engine/context';
import { checkEligibility } from './engine/eligibility';
import { rankCandidates, scoreCandidate } from './engine/score';
import type {
  DriverContext,
  FactorContribution,
  ScoringWeights,
} from './engine/types';
import { RECOMMENDATION_WEIGHTS, SCORING_CONSTANTS } from './engine/weights';
import { RecommendationQueryDto } from './dto/recommendation-query.dto';
import {
  RecommendationCandidateDto,
  RecommendationRunDto,
} from './dto/recommendation.dto';

/** Everything a run row needs for the DTO (candidates + driver summaries). */
const runInclude = {
  candidates: {
    include: {
      driver: {
        include: { user: { select: { name: true } }, vehicle: true },
      },
    },
    orderBy: [{ rank: { sort: 'asc', nulls: 'last' } }, { driverId: 'asc' }],
  },
} satisfies Prisma.RecommendationRunInclude;

type RunRow = Prisma.RecommendationRunGetPayload<{
  include: typeof runInclude;
}>;

/** Recorded per run so every score is reproducible from the snapshot. */
type RunInputSnapshot = {
  now: string;
  weights: ScoringWeights;
  constants: typeof SCORING_CONSTANTS;
  delivery: {
    id: string;
    status: string;
    zoneId: string;
    priority: string;
    packageSize: string;
    packageWeightKg: number;
    deadlineAt: string;
    pickup: { lat: number; lng: number } | null;
  };
  driverIds: string[];
};

type Evaluated =
  | {
      eligible: true;
      ctx: DriverContext;
      driverId: string;
      score: number;
      rank: number;
      explanation: FactorContribution[];
    }
  | { eligible: false; ctx: DriverContext; reasons: string[] };

@Injectable()
export class RecommendationsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly maps: MapsService,
    @Inject(RECOMMENDATION_WEIGHTS) private readonly weights: ScoringWeights,
  ) {}

  /**
   * Spec §7 + Phase 6 clarifications: return the latest persisted run; compute
   * lazily when none exists (admin/dispatcher + delivery ready); ?refresh=true
   * forces a new run (403 otherwise, 409 when not ready); 404 when no run
   * exists and none can be computed.
   */
  async getForDelivery(
    deliveryId: string,
    query: RecommendationQueryDto,
    user: AuthUser,
  ): Promise<RecommendationRunDto> {
    const delivery = await this.prisma.delivery.findUnique({
      where: { id: deliveryId },
      include: { zone: true },
    });
    if (!delivery) {
      throw new NotFoundException('Delivery not found');
    }

    const canCompute =
      user.role === Role.admin || user.role === Role.dispatcher;

    if (query.refresh) {
      if (!canCompute) {
        throw new ForbiddenException(
          'Only admin or dispatcher may run recommendations',
        );
      }
      if (delivery.status !== DeliveryStatus.ready) {
        throw new ConflictException(
          'Recommendations can only be computed for a ready delivery',
        );
      }
      return this.toRunDto(await this.compute(delivery, user));
    }

    const latest = await this.prisma.recommendationRun.findFirst({
      where: { deliveryId },
      orderBy: { createdAt: 'desc' },
      include: runInclude,
    });
    if (latest) {
      return this.toRunDto(latest);
    }

    if (canCompute && delivery.status === DeliveryStatus.ready) {
      return this.toRunDto(await this.compute(delivery, user));
    }
    throw new NotFoundException(
      'No recommendation run exists for this delivery',
    );
  }

  /** Evaluate every driver, persist the run + candidates + audit atomically. */
  private async compute(
    delivery: DeliveryRowForContext,
    user: AuthUser,
  ): Promise<RunRow> {
    const drivers = await this.prisma.driverProfile.findMany({
      include: {
        user: { select: { name: true } },
        vehicle: true,
        baseZone: true,
      },
      orderBy: { createdAt: 'asc' },
    });
    const loads = await activeLoadsByDriver(
      this.prisma,
      drivers.map((d) => d.id),
    );
    const deliveryCtx = toDeliveryContext(delivery);
    const now = new Date();

    // Eligibility first (no I/O); route lookups only for eligible drivers.
    const contexts = drivers.map((row) =>
      toDriverContext(row, loads.get(row.id) ?? 0),
    );
    const scored = await Promise.all(
      contexts.map(async (ctx): Promise<Evaluated> => {
        const eligibility = checkEligibility(ctx, deliveryCtx);
        if (!eligibility.eligible) {
          return { eligible: false, ctx, reasons: eligibility.reasons };
        }
        const route =
          ctx.baseZoneCenter && deliveryCtx.pickup
            ? await this.maps.getRouteEstimate(
                ctx.baseZoneCenter,
                deliveryCtx.pickup,
              )
            : null;
        const result = scoreCandidate(
          ctx,
          deliveryCtx,
          route,
          now,
          this.weights,
        );
        // rank assigned after all drivers are scored
        return { eligible: true, ctx, rank: 0, ...result };
      }),
    );

    const eligible = scored.filter(
      (e): e is Extract<Evaluated, { eligible: true }> => e.eligible,
    );
    const ineligible = scored.filter(
      (e): e is Extract<Evaluated, { eligible: false }> => !e.eligible,
    );
    const ranked = rankCandidates(eligible);

    const snapshot: RunInputSnapshot = {
      now: now.toISOString(),
      weights: this.weights,
      constants: SCORING_CONSTANTS,
      delivery: {
        id: deliveryCtx.id,
        status: deliveryCtx.status,
        zoneId: deliveryCtx.zoneId,
        priority: deliveryCtx.priority,
        packageSize: deliveryCtx.packageSize,
        packageWeightKg: deliveryCtx.packageWeightKg,
        deadlineAt: deliveryCtx.deadlineAt.toISOString(),
        pickup: deliveryCtx.pickup,
      },
      driverIds: contexts.map((c) => c.driverId),
    };

    return this.prisma.$transaction(async (tx) => {
      const run = await tx.recommendationRun.create({
        data: {
          deliveryId: delivery.id,
          requestedByUserId: user.id,
          inputSnapshot: snapshot,
          candidates: {
            create: [
              ...ranked.map((r) => ({
                driverId: r.driverId,
                eligible: true,
                score: r.score,
                rank: r.rank,
                explanation: r.explanation,
              })),
              ...ineligible.map((e) => ({
                driverId: e.ctx.driverId,
                eligible: false,
                score: 0,
                rank: null,
                explanation: [] as FactorContribution[],
                ineligibleReasons: e.reasons,
              })),
            ],
          },
        },
        include: runInclude,
      });
      await this.audit.record(
        {
          actorUserId: user.id,
          action: 'recommendation.run_created',
          entityType: 'Delivery',
          entityId: delivery.id,
          after: {
            runId: run.id,
            eligible: ranked.length,
            total: contexts.length,
          },
        },
        tx,
      );
      return run;
    });
  }

  private toRunDto(run: RunRow): RecommendationRunDto {
    const snapshot = run.inputSnapshot as unknown as Partial<RunInputSnapshot>;
    return {
      id: run.id,
      deliveryId: run.deliveryId,
      requestedByUserId: run.requestedByUserId,
      weights: snapshot.weights ?? this.weights,
      createdAt: run.createdAt,
      candidates: run.candidates.map(
        (c): RecommendationCandidateDto => ({
          id: c.id,
          driverId: c.driverId,
          driver: {
            id: c.driver.id,
            name: c.driver.user.name,
            availability: c.driver.availability,
            baseZoneId: c.driver.baseZoneId,
            activeJobCount: c.driver.activeJobCount,
            maxConcurrentJobs: c.driver.maxConcurrentJobs,
            vehicle: c.driver.vehicle
              ? {
                  id: c.driver.vehicle.id,
                  type: c.driver.vehicle.type,
                  status: c.driver.vehicle.status,
                  capacityWeight: Number(c.driver.vehicle.capacityWeight),
                }
              : null,
          },
          eligible: c.eligible,
          score: Number(c.score),
          rank: c.rank,
          explanation:
            c.explanation as unknown as RecommendationCandidateDto['explanation'],
          ineligibleReasons: c.ineligibleReasons as string[] | null,
        }),
      ),
    };
  }
}
