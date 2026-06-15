import {
  ConflictException,
  ForbiddenException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { AuthUser } from '../../common/types/auth-user';
import {
  paginate,
  type Paginated,
  toSkipTake,
} from '../../common/pagination/paginate';
import { Prisma } from '../../generated/prisma/client';
import {
  AssignmentStatus,
  DeliveryStatus,
  Role,
} from '../../generated/prisma/enums';
import type { DeliveryModel } from '../../generated/prisma/models/Delivery';
import { PrismaService } from '../../prisma/prisma.service';
import { AuditService } from '../audit/audit.service';
import {
  MapsProviderError,
  type GeoPoint,
} from '../maps/maps-provider.interface';
import { MapsService } from '../maps/maps.service';
import {
  ASSIGNMENT_CLOSING,
  canTransition,
  isDriverTransition,
} from './delivery-status';
import { ChangeStatusDto } from './dto/change-status.dto';
import { CreateDeliveryDto } from './dto/create-delivery.dto';
import { DeliveryDto, DeliverySummaryDriverDto } from './dto/delivery.dto';
import { DeliveryQueryDto } from './dto/delivery-query.dto';
import { RouteEstimateDto } from './dto/route-estimate.dto';
import { UpdateDeliveryDto } from './dto/update-delivery.dto';

function toDeliveryDto(
  d: DeliveryModel,
  assignedDriver: DeliverySummaryDriverDto | null = null,
): DeliveryDto {
  return {
    id: d.id,
    reference: d.reference,
    pickupAddress: d.pickupAddress,
    pickupLat: d.pickupLat === null ? null : Number(d.pickupLat),
    pickupLng: d.pickupLng === null ? null : Number(d.pickupLng),
    dropoffAddress: d.dropoffAddress,
    dropoffLat: d.dropoffLat === null ? null : Number(d.dropoffLat),
    dropoffLng: d.dropoffLng === null ? null : Number(d.dropoffLng),
    zoneId: d.zoneId,
    packageSize: d.packageSize,
    packageWeight: Number(d.packageWeight),
    packageType: d.packageType,
    priority: d.priority,
    deadlineAt: d.deadlineAt,
    status: d.status,
    cancellationReason: d.cancellationReason,
    assignedDriver,
    createdAt: d.createdAt,
    updatedAt: d.updatedAt,
  };
}

const ACTIVE_DRIVER_INCLUDE = {
  assignments: {
    where: { status: AssignmentStatus.active },
    take: 1,
    include: { driver: { include: { user: true } } },
  },
} as const;

function activeDriverOf(d: {
  assignments?: { driver: { id: string; user: { name: string } } }[];
}): DeliverySummaryDriverDto | null {
  const active = d.assignments?.[0];
  return active
    ? { id: active.driver.id, name: active.driver.user.name }
    : null;
}

@Injectable()
export class DeliveriesService {
  private readonly logger = new Logger(DeliveriesService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly maps: MapsService,
  ) {}

  /**
   * Best-effort geocoding: a provider outage (or no match) must never block
   * delivery creation/updates, so failures degrade to `null` coordinates.
   */
  private async safeGeocode(address: string): Promise<GeoPoint | null> {
    try {
      return await this.maps.geocode(address);
    } catch (error) {
      if (error instanceof MapsProviderError) {
        this.logger.warn(
          `Geocoding unavailable (${error.kind}): ${error.message}`,
        );
        return null;
      }
      throw error;
    }
  }

  async create(dto: CreateDeliveryDto): Promise<DeliveryDto> {
    const existing = await this.prisma.delivery.findUnique({
      where: { reference: dto.reference },
    });
    if (existing) {
      throw new ConflictException('Delivery reference already in use');
    }
    const zone = await this.prisma.zone.findUnique({
      where: { id: dto.zoneId },
    });
    if (!zone) {
      throw new NotFoundException('Zone not found');
    }
    const [pickup, dropoff] = await Promise.all([
      this.safeGeocode(dto.pickupAddress),
      this.safeGeocode(dto.dropoffAddress),
    ]);
    const delivery = await this.prisma.delivery.create({
      data: {
        reference: dto.reference,
        pickupAddress: dto.pickupAddress,
        pickupLat: pickup?.lat ?? null,
        pickupLng: pickup?.lng ?? null,
        dropoffAddress: dto.dropoffAddress,
        dropoffLat: dropoff?.lat ?? null,
        dropoffLng: dropoff?.lng ?? null,
        zoneId: dto.zoneId,
        packageSize: dto.packageSize,
        packageWeight: dto.packageWeight,
        packageType: dto.packageType,
        priority: dto.priority,
        deadlineAt: new Date(dto.deadlineAt),
      },
    });
    return toDeliveryDto(delivery);
  }

  async list(query: DeliveryQueryDto): Promise<Paginated<DeliveryDto>> {
    const { skip, take } = toSkipTake(query.page, query.limit);
    const where: Prisma.DeliveryWhereInput = {
      ...(query.status ? { status: query.status } : {}),
      ...(query.priority ? { priority: query.priority } : {}),
      ...(query.zoneId ? { zoneId: query.zoneId } : {}),
      ...(query.deadlineBefore
        ? { deadlineAt: { lte: new Date(query.deadlineBefore) } }
        : {}),
    };
    const [rows, total] = await this.prisma.$transaction([
      this.prisma.delivery.findMany({
        where,
        skip,
        take,
        orderBy: { deadlineAt: 'asc' },
        include: ACTIVE_DRIVER_INCLUDE,
      }),
      this.prisma.delivery.count({ where }),
    ]);
    return paginate(
      rows.map((r) => toDeliveryDto(r, activeDriverOf(r))),
      total,
      query.page,
      query.limit,
    );
  }

  async getById(id: string): Promise<DeliveryDto> {
    const delivery = await this.prisma.delivery.findUnique({
      where: { id },
      include: ACTIVE_DRIVER_INCLUDE,
    });
    if (!delivery) {
      throw new NotFoundException('Delivery not found');
    }
    return toDeliveryDto(delivery, activeDriverOf(delivery));
  }

  async update(id: string, dto: UpdateDeliveryDto): Promise<DeliveryDto> {
    const current = await this.getById(id); // 404 if missing
    if (dto.reference) {
      const clash = await this.prisma.delivery.findFirst({
        where: { reference: dto.reference, id: { not: id } },
      });
      if (clash) {
        throw new ConflictException('Delivery reference already in use');
      }
    }
    if (dto.zoneId) {
      const zone = await this.prisma.zone.findUnique({
        where: { id: dto.zoneId },
      });
      if (!zone) {
        throw new NotFoundException('Zone not found');
      }
    }

    // Re-geocode only the address side(s) that actually changed. A failed
    // geocode resets that side's coords to null — stale coordinates pointing
    // at the old address are worse than none.
    // Unchecked input: the surrounding update writes zoneId as a scalar FK.
    const coords: Prisma.DeliveryUncheckedUpdateInput = {};
    if (dto.pickupAddress && dto.pickupAddress !== current.pickupAddress) {
      const pickup = await this.safeGeocode(dto.pickupAddress);
      coords.pickupLat = pickup?.lat ?? null;
      coords.pickupLng = pickup?.lng ?? null;
    }
    if (dto.dropoffAddress && dto.dropoffAddress !== current.dropoffAddress) {
      const dropoff = await this.safeGeocode(dto.dropoffAddress);
      coords.dropoffLat = dropoff?.lat ?? null;
      coords.dropoffLng = dropoff?.lng ?? null;
    }

    const { deadlineAt, ...rest } = dto;
    const delivery = await this.prisma.delivery.update({
      where: { id },
      data: {
        ...rest,
        ...coords,
        ...(deadlineAt ? { deadlineAt: new Date(deadlineAt) } : {}),
      },
    });
    return toDeliveryDto(delivery);
  }

  async getRouteEstimate(id: string): Promise<RouteEstimateDto> {
    const d = await this.prisma.delivery.findUnique({ where: { id } });
    if (!d) {
      throw new NotFoundException('Delivery not found');
    }
    if (
      d.pickupLat === null ||
      d.pickupLng === null ||
      d.dropoffLat === null ||
      d.dropoffLng === null
    ) {
      return { available: false, degraded: true };
    }
    const est = await this.maps.getRouteEstimateDetailed(
      { lat: Number(d.pickupLat), lng: Number(d.pickupLng) },
      { lat: Number(d.dropoffLat), lng: Number(d.dropoffLng) },
    );
    if (!est) {
      return { available: false, degraded: true };
    }
    return {
      available: true,
      degraded: false,
      distanceMeters: est.distanceMeters,
      durationSeconds: est.durationSeconds,
      provider: est.provider,
      cached: est.cached,
    };
  }

  async changeStatus(
    id: string,
    dto: ChangeStatusDto,
    user: AuthUser,
  ): Promise<DeliveryDto> {
    const delivery = await this.prisma.delivery.findUnique({ where: { id } });
    if (!delivery) {
      throw new NotFoundException('Delivery not found');
    }
    const from = delivery.status;
    const to = dto.status;

    if (!canTransition(from, to)) {
      throw new ConflictException(`Illegal transition: ${from} → ${to}`);
    }
    // Creating an assignment is the Phase 6 assignment flow's job.
    if (to === DeliveryStatus.assigned) {
      throw new ConflictException(
        'Assign a driver via the assignment endpoint, not the status endpoint',
      );
    }

    // The delivery's active assignment (if any) — needed for the driver rule
    // and for closing side effects.
    const activeAssignment = await this.prisma.assignment.findFirst({
      where: { deliveryId: id, status: AssignmentStatus.active },
      include: { driver: true },
    });

    if (user.role === Role.driver) {
      if (!isDriverTransition(from, to)) {
        throw new ForbiddenException(
          'Drivers may only advance their own assignment along the operational path',
        );
      }
      if (!activeAssignment || activeAssignment.driver.userId !== user.id) {
        throw new ForbiddenException('Not your assignment');
      }
    }

    const updated = await this.prisma.$transaction(async (tx) => {
      const next = await tx.delivery.update({
        where: { id },
        data: {
          status: to,
          ...(to === DeliveryStatus.cancelled
            ? { cancellationReason: dto.reason ?? null }
            : {}),
        },
      });

      if (activeAssignment && ASSIGNMENT_CLOSING.includes(to)) {
        await tx.assignment.update({
          where: { id: activeAssignment.id },
          data: {
            status:
              to === DeliveryStatus.delivered
                ? AssignmentStatus.completed
                : AssignmentStatus.cancelled,
            unassignedAt: new Date(),
            unassignReason: dto.reason ?? null,
          },
        });
        await tx.driverProfile.update({
          where: { id: activeAssignment.driverId },
          data: {
            activeJobCount: Math.max(
              0,
              activeAssignment.driver.activeJobCount - 1,
            ),
          },
        });
      }

      await this.audit.record(
        {
          actorUserId: user.id,
          action: 'delivery.status_changed',
          entityType: 'Delivery',
          entityId: id,
          before: { status: from },
          after: { status: to },
          reason: dto.reason,
        },
        tx,
      );

      return next;
    });

    return toDeliveryDto(updated);
  }
}
