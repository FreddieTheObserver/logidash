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
import { Prisma } from '../../generated/prisma/client';
import { Role } from '../../generated/prisma/enums';
import { PrismaService } from '../../prisma/prisma.service';
import { CreateDriverDto } from './dto/create-driver.dto';
import { DriverDto } from './dto/driver.dto';
import { UpdateDriverDto } from './dto/update-driver.dto';

const driverInclude = {
  user: { select: { name: true } },
  vehicle: true,
} satisfies Prisma.DriverProfileInclude;

type DriverRow = Prisma.DriverProfileGetPayload<{
  include: typeof driverInclude;
}>;

function toDriverDto(d: DriverRow): DriverDto {
  return {
    id: d.id,
    userId: d.userId,
    name: d.user.name,
    availability: d.availability,
    baseZoneId: d.baseZoneId,
    activeJobCount: d.activeJobCount,
    maxConcurrentJobs: d.maxConcurrentJobs,
    vehicle: d.vehicle
      ? {
          id: d.vehicle.id,
          type: d.vehicle.type,
          status: d.vehicle.status,
          capacityWeight: Number(d.vehicle.capacityWeight),
          capacityVolume: Number(d.vehicle.capacityVolume),
        }
      : null,
    createdAt: d.createdAt,
    updatedAt: d.updatedAt,
  };
}

@Injectable()
export class DriversService {
  constructor(private readonly prisma: PrismaService) {}

  async create(dto: CreateDriverDto): Promise<DriverDto> {
    const user = await this.prisma.user.findUnique({
      where: { id: dto.userId },
    });
    if (!user) {
      throw new NotFoundException('User not found');
    }
    if (user.role !== Role.driver) {
      throw new ConflictException('User does not have the driver role');
    }
    const zone = await this.prisma.zone.findUnique({
      where: { id: dto.baseZoneId },
    });
    if (!zone) {
      throw new NotFoundException('Base zone not found');
    }
    const existing = await this.prisma.driverProfile.findUnique({
      where: { userId: dto.userId },
    });
    if (existing) {
      throw new ConflictException(
        'Driver profile already exists for this user',
      );
    }
    const driver = await this.prisma.driverProfile.create({
      data: {
        userId: dto.userId,
        baseZoneId: dto.baseZoneId,
        availability: dto.availability,
        maxConcurrentJobs: dto.maxConcurrentJobs,
      },
      include: driverInclude,
    });
    return toDriverDto(driver);
  }

  async list(query: PaginationQueryDto): Promise<Paginated<DriverDto>> {
    const { skip, take } = toSkipTake(query.page, query.limit);
    const [rows, total] = await this.prisma.$transaction([
      this.prisma.driverProfile.findMany({
        skip,
        take,
        orderBy: { createdAt: 'asc' },
        include: driverInclude,
      }),
      this.prisma.driverProfile.count(),
    ]);
    return paginate(rows.map(toDriverDto), total, query.page, query.limit);
  }

  async getById(id: string): Promise<DriverDto> {
    const driver = await this.prisma.driverProfile.findUnique({
      where: { id },
      include: driverInclude,
    });
    if (!driver) {
      throw new NotFoundException('Driver not found');
    }
    return toDriverDto(driver);
  }

  async update(id: string, dto: UpdateDriverDto): Promise<DriverDto> {
    await this.getById(id); // 404 if missing
    if (dto.baseZoneId) {
      const zone = await this.prisma.zone.findUnique({
        where: { id: dto.baseZoneId },
      });
      if (!zone) {
        throw new NotFoundException('Base zone not found');
      }
    }
    const driver = await this.prisma.driverProfile.update({
      where: { id },
      data: { ...dto },
      include: driverInclude,
    });
    return toDriverDto(driver);
  }

  async remove(id: string): Promise<void> {
    await this.getById(id); // 404 if missing
    const assignmentCount = await this.prisma.assignment.count({
      where: { driverId: id },
    });
    if (assignmentCount > 0) {
      throw new ConflictException(
        'Driver is referenced by assignments and cannot be deleted',
      );
    }
    await this.prisma.driverProfile.delete({ where: { id } });
  }

  // Link (or, with null, unlink) the driver's vehicle. Vehicle.driverId is
  // unique, so we clear any prior link for this driver first, then bind the
  // target — refusing a vehicle already owned by a different driver.
  async setVehicle(id: string, vehicleId: string | null): Promise<DriverDto> {
    await this.getById(id); // 404 if missing
    await this.prisma.$transaction(async (tx) => {
      await tx.vehicle.updateMany({
        where: { driverId: id },
        data: { driverId: null },
      });
      if (vehicleId !== null) {
        const vehicle = await tx.vehicle.findUnique({
          where: { id: vehicleId },
        });
        if (!vehicle) {
          throw new NotFoundException('Vehicle not found');
        }
        if (vehicle.driverId !== null && vehicle.driverId !== id) {
          throw new ConflictException(
            'Vehicle is already linked to another driver',
          );
        }
        await tx.vehicle.update({
          where: { id: vehicleId },
          data: { driverId: id },
        });
      }
    });
    return this.getById(id);
  }
}
