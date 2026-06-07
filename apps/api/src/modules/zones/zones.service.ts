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
import type { ZoneModel } from '../../generated/prisma/models/Zone';
import { PrismaService } from '../../prisma/prisma.service';
import { CreateZoneDto } from './dto/create-zone.dto';
import { UpdateZoneDto } from './dto/update-zone.dto';
import { ZoneDto } from './dto/zone.dto';

function toZoneDto(zone: ZoneModel): ZoneDto {
  return {
    id: zone.id,
    name: zone.name,
    code: zone.code,
    centerLat: zone.centerLat === null ? null : Number(zone.centerLat),
    centerLng: zone.centerLng === null ? null : Number(zone.centerLng),
    createdAt: zone.createdAt,
    updatedAt: zone.updatedAt,
  };
}

@Injectable()
export class ZonesService {
  constructor(private readonly prisma: PrismaService) {}
  async create(dto: CreateZoneDto): Promise<ZoneDto> {
    const existing = await this.prisma.zone.findUnique({
      where: { code: dto.code },
    });
    if (existing) {
      throw new ConflictException('Zone code already in use');
    }
    const zone = await this.prisma.zone.create({
      data: {
        name: dto.name,
        code: dto.code,
        centerLat: dto.centerLat,
        centerLng: dto.centerLng,
      },
    });
    return toZoneDto(zone);
  }

  async list(query: PaginationQueryDto): Promise<Paginated<ZoneDto>> {
    const { skip, take } = toSkipTake(query.page, query.limit);
    const [rows, total] = await this.prisma.$transaction([
      this.prisma.zone.findMany({ skip, take, orderBy: { code: 'asc' } }),
      this.prisma.zone.count(),
    ]);
    return paginate(rows.map(toZoneDto), total, query.page, query.limit);
  }

  async getById(id: string): Promise<ZoneDto> {
    const zone = await this.prisma.zone.findUnique({
      where: { id },
    });
    if (!zone) {
      throw new NotFoundException('Zone not found');
    }
    return toZoneDto(zone);
  }

  async update(id: string, dto: UpdateZoneDto): Promise<ZoneDto> {
    await this.getById(id); // 404 if missing
    if (dto.code) {
      const clash = await this.prisma.zone.findFirst({
        where: { code: dto.code, id: { not: id } },
      });
      if (clash) {
        throw new ConflictException('Zone code already in use');
      }
    }
    const zone = await this.prisma.zone.update({
      where: { id },
      data: { ...dto },
    });
    return toZoneDto(zone);
  }

  async remove(id: string): Promise<void> {
    await this.getById(id); // 404 if missing
    const [driverCount, deliveryCount] = await this.prisma.$transaction([
      this.prisma.driverProfile.count({ where: { baseZoneId: id } }),
      this.prisma.delivery.count({ where: { zoneId: id } }),
    ]);
    if (driverCount > 0 || deliveryCount > 0) {
      throw new ConflictException(
        'Zone is referenced by drivers or deliveries and cannot be deleted',
      );
    }
    await this.prisma.zone.delete({ where: { id } });
  }
}
