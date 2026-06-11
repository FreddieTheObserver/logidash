import {
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { PaginationQueryDto } from '../../common/dto/pagination-query.dto';
import {
  paginate,
  type Paginated,
  toSkipTake,
} from '../../common/pagination/paginate';
import { AuthUser } from '../../common/types/auth-user';
import { AssignmentStatus, DeliveryStatus } from '../../generated/prisma/enums';
import type { AssignmentModel } from '../../generated/prisma/models/Assignment';
import { PrismaService } from '../../prisma/prisma.service';
import { AuditService } from '../audit/audit.service';
import { activeLoadsByDriver } from '../recommendations/engine/active-load';
import {
  toDeliveryContext,
  toDriverContext,
} from '../recommendations/engine/context';
import { checkEligibility } from '../recommendations/engine/eligibility';
import { AssignmentDto } from './dto/assignment.dto';
import { CreateAssignmentDto } from './dto/create-assignment.dto';

function toAssignmentDto(a: AssignmentModel): AssignmentDto {
  return {
    id: a.id,
    deliveryId: a.deliveryId,
    driverId: a.driverId,
    vehicleId: a.vehicleId,
    status: a.status,
    assignedByUserId: a.assignedByUserId,
    assignedAt: a.assignedAt,
    unassignedAt: a.unassignedAt,
    unassignReason: a.unassignReason,
    createdAt: a.createdAt,
    updatedAt: a.updatedAt,
  };
}

@Injectable()
export class AssignmentsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  async create(
    deliveryId: string,
    dto: CreateAssignmentDto,
    user: AuthUser,
  ): Promise<AssignmentDto> {
    const delivery = await this.prisma.delivery.findUnique({
      where: { id: deliveryId },
      include: { zone: true },
    });
    if (!delivery) {
      throw new NotFoundException('Delivery not found');
    }
    if (delivery.status !== DeliveryStatus.ready) {
      throw new ConflictException(
        `Only ready deliveries can be assigned (status is ${delivery.status})`,
      );
    }

    const driver = await this.prisma.driverProfile.findUnique({
      where: { id: dto.driverId },
      include: { vehicle: true, baseZone: true },
    });
    if (!driver) {
      throw new NotFoundException('Driver not found');
    }

    const loads = await activeLoadsByDriver(this.prisma, [driver.id]);
    const eligibility = checkEligibility(
      toDriverContext(driver, loads.get(driver.id) ?? 0),
      toDeliveryContext(delivery),
    );
    if (!eligibility.eligible) {
      throw new ConflictException(
        `Driver is not eligible for this delivery: ${eligibility.reasons.join(' ')}`,
      );
    }
    // checkEligibility guarantees a linked vehicle; re-narrow for the compiler.
    const vehicle = driver.vehicle;
    if (!vehicle) {
      throw new ConflictException('Driver has no linked vehicle');
    }

    const assignment = await this.prisma.$transaction(async (tx) => {
      const flipped = await tx.delivery.updateMany({
        where: { id: deliveryId, status: DeliveryStatus.ready },
        data: { status: DeliveryStatus.assigned },
      });
      if (flipped.count === 0) {
        throw new ConflictException('Delivery is no longer ready to assign');
      }

      const created = await tx.assignment.create({
        data: {
          deliveryId,
          driverId: driver.id,
          vehicleId: vehicle.id,
          assignedByUserId: user.id,
          status: AssignmentStatus.active,
        },
      });

      await tx.driverProfile.update({
        where: { id: driver.id },
        data: { activeJobCount: { increment: 1 } },
      });

      await this.audit.record(
        {
          actorUserId: user.id,
          action: 'assignment.created',
          entityType: 'Assignment',
          entityId: created.id,
          after: {
            deliveryId,
            driverId: driver.id,
            vehicleId: vehicle.id,
          },
          reason: dto.reason,
        },
        tx,
      );
      await this.audit.record(
        {
          actorUserId: user.id,
          action: 'delivery.status_changed',
          entityType: 'Delivery',
          entityId: deliveryId,
          before: { status: DeliveryStatus.ready },
          after: { status: DeliveryStatus.assigned },
          reason: dto.reason,
        },
        tx,
      );

      return created;
    });

    return toAssignmentDto(assignment);
  }

  async listByDelivery(
    deliveryId: string,
    query: PaginationQueryDto,
  ): Promise<Paginated<AssignmentDto>> {
    const delivery = await this.prisma.delivery.findUnique({
      where: { id: deliveryId },
    });
    if (!delivery) {
      throw new NotFoundException('Delivery not found');
    }
    return this.list({ deliveryId }, query);
  }

  async listByDriver(
    driverId: string,
    query: PaginationQueryDto,
  ): Promise<Paginated<AssignmentDto>> {
    const driver = await this.prisma.driverProfile.findUnique({
      where: { id: driverId },
    });
    if (!driver) {
      throw new NotFoundException('Driver not found');
    }
    return this.list({ driverId }, query);
  }

  private async list(
    where: { deliveryId: string } | { driverId: string },
    query: PaginationQueryDto,
  ): Promise<Paginated<AssignmentDto>> {
    const { skip, take } = toSkipTake(query.page, query.limit);
    const [rows, total] = await this.prisma.$transaction([
      this.prisma.assignment.findMany({
        where,
        skip,
        take,
        orderBy: { assignedAt: 'desc' },
      }),
      this.prisma.assignment.count({ where }),
    ]);
    return paginate(rows.map(toAssignmentDto), total, query.page, query.limit);
  }
}
