import {
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import {
  paginate,
  type Paginated,
  toSkipTake,
} from '../../common/pagination/paginate';
import { Prisma } from '../../generated/prisma/client';
import type { DeliveryModel } from '../../generated/prisma/models/Delivery';
import { PrismaService } from '../../prisma/prisma.service';
import { AuditService } from '../audit/audit.service';
import { CreateDeliveryDto } from './dto/create-delivery.dto';
import { DeliveryDto } from './dto/delivery.dto';
import { DeliveryQueryDto } from './dto/delivery-query.dto';
import { UpdateDeliveryDto } from './dto/update-delivery.dto';

function toDeliveryDto(d: DeliveryModel): DeliveryDto {
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
    createdAt: d.createdAt,
    updatedAt: d.updatedAt,
  };
}

@Injectable()
export class DeliveriesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

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
    const delivery = await this.prisma.delivery.create({
      data: {
        reference: dto.reference,
        pickupAddress: dto.pickupAddress,
        dropoffAddress: dto.dropoffAddress,
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
      }),
      this.prisma.delivery.count({ where }),
    ]);
    return paginate(rows.map(toDeliveryDto), total, query.page, query.limit);
  }

  async getById(id: string): Promise<DeliveryDto> {
    const delivery = await this.prisma.delivery.findUnique({ where: { id } });
    if (!delivery) {
      throw new NotFoundException('Delivery not found');
    }
    return toDeliveryDto(delivery);
  }

  async update(id: string, dto: UpdateDeliveryDto): Promise<DeliveryDto> {
    await this.getById(id); // 404 if missing
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
    const { deadlineAt, ...rest } = dto;
    const delivery = await this.prisma.delivery.update({
      where: { id },
      data: {
        ...rest,
        ...(deadlineAt ? { deadlineAt: new Date(deadlineAt) } : {}),
      },
    });
    return toDeliveryDto(delivery);
  }
}
