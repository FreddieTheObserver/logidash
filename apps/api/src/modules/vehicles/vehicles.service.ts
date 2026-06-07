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
import type { VehicleModel } from '../../generated/prisma/models/Vehicle';
import { PrismaService } from '../../prisma/prisma.service';
import { CreateVehicleDto } from './dto/create-vehicle.dto';
import { UpdateVehicleDto } from './dto/update-vehicle.dto';
import { VehicleDto } from './dto/vehicle.dto';

function toVehicleDto(vehicle: VehicleModel): VehicleDto {
  return {
    id: vehicle.id,
    type: vehicle.type,
    capacityWeight: Number(vehicle.capacityWeight),
    capacityVolume: Number(vehicle.capacityVolume),
    status: vehicle.status,
    driverId: vehicle.driverId,
    createdAt: vehicle.createdAt,
    updatedAt: vehicle.updatedAt,
  };
}

@Injectable()
export class VehiclesService {
  constructor(private readonly prisma: PrismaService) {}

  async create(dto: CreateVehicleDto): Promise<VehicleDto> {
    const vehicle = await this.prisma.vehicle.create({
      data: {
        type: dto.type,
        capacityWeight: dto.capacityWeight,
        capacityVolume: dto.capacityVolume,
        status: dto.status,
      },
    });
    return toVehicleDto(vehicle);
  }

  async list(query: PaginationQueryDto): Promise<Paginated<VehicleDto>> {
    const { skip, take } = toSkipTake(query.page, query.limit);
    const [rows, total] = await this.prisma.$transaction([
      this.prisma.vehicle.findMany({
        skip,
        take,
        orderBy: { createdAt: 'asc' },
      }),
      this.prisma.vehicle.count(),
    ]);
    return paginate(rows.map(toVehicleDto), total, query.page, query.limit);
  }

  async getById(id: string): Promise<VehicleDto> {
    const vehicle = await this.prisma.vehicle.findUnique({ where: { id } });
    if (!vehicle) {
      throw new NotFoundException('Vehicle not found');
    }
    return toVehicleDto(vehicle);
  }

  async update(id: string, dto: UpdateVehicleDto): Promise<VehicleDto> {
    await this.getById(id); // 404 if missing
    const vehicle = await this.prisma.vehicle.update({
      where: { id },
      data: { ...dto },
    });
    return toVehicleDto(vehicle);
  }

  async remove(id: string): Promise<void> {
    await this.getById(id); // 404 if missing
    const assignmentCount = await this.prisma.assignment.count({
      where: { vehicleId: id },
    });
    if (assignmentCount > 0) {
      throw new ConflictException(
        'Vehicle is referenced by assignments and cannot be deleted',
      );
    }
    await this.prisma.vehicle.delete({ where: { id } });
  }
}
