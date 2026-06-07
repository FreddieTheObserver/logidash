import { ConflictException, NotFoundException } from '@nestjs/common';
import { VehicleStatus, VehicleType } from '../../generated/prisma/enums';
import { VehiclesService } from './vehicles.service';

function makePrismaMock() {
  return {
    vehicle: {
      findUnique: jest.fn(),
      findMany: jest.fn(),
      count: jest.fn(),
      create: jest.fn(),
      update: jest.fn(),
      delete: jest.fn(),
    },
    assignment: { count: jest.fn() },
    $transaction: jest.fn((ops: unknown) =>
      Array.isArray(ops) ? Promise.all(ops as Promise<unknown>[]) : ops,
    ),
  };
}

const baseVehicle = {
  id: 'v1',
  driverId: null,
  type: VehicleType.van,
  capacityWeight: 1000 as unknown,
  capacityVolume: 8 as unknown,
  status: VehicleStatus.active,
  createdAt: new Date(),
  updatedAt: new Date(),
};

describe('VehiclesService', () => {
  let prisma: ReturnType<typeof makePrismaMock>;
  let service: VehiclesService;

  beforeEach(() => {
    prisma = makePrismaMock();
    service = new VehiclesService(prisma as never);
  });

  it('create maps Decimal capacities to numbers and defaults status active', async () => {
    prisma.vehicle.create.mockResolvedValue(baseVehicle);
    const result = await service.create({
      type: VehicleType.van,
      capacityWeight: 1000,
      capacityVolume: 8,
    });
    expect(result.capacityWeight).toBe(1000);
    expect(typeof result.capacityVolume).toBe('number');
    expect(result.status).toBe(VehicleStatus.active);
  });

  it('getById throws 404 when missing', async () => {
    prisma.vehicle.findUnique.mockResolvedValue(null);
    await expect(service.getById('nope')).rejects.toBeInstanceOf(
      NotFoundException,
    );
  });

  it('list returns a paginated envelope', async () => {
    prisma.vehicle.findMany.mockResolvedValue([baseVehicle]);
    prisma.vehicle.count.mockResolvedValue(1);
    const result = await service.list({ page: 1, limit: 20 });
    expect(result.data).toHaveLength(1);
    expect(result.meta.total).toBe(1);
    expect(result.meta.totalPages).toBe(1);
  });

  it('remove rejects a vehicle referenced by assignments (409)', async () => {
    prisma.vehicle.findUnique.mockResolvedValue(baseVehicle);
    prisma.assignment.count.mockResolvedValue(1);
    await expect(service.remove('v1')).rejects.toBeInstanceOf(
      ConflictException,
    );
    expect(prisma.vehicle.delete).not.toHaveBeenCalled();
  });

  it('remove deletes an unreferenced vehicle', async () => {
    prisma.vehicle.findUnique.mockResolvedValue(baseVehicle);
    prisma.assignment.count.mockResolvedValue(0);
    await service.remove('v1');
    expect(prisma.vehicle.delete).toHaveBeenCalledWith({ where: { id: 'v1' } });
  });
});
