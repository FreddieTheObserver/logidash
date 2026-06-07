import { ConflictException, NotFoundException } from '@nestjs/common';
import { ZonesService } from './zones.service';

function makePrismaMock() {
  return {
    zone: {
      findUnique: jest.fn(),
      findFirst: jest.fn(),
      findMany: jest.fn(),
      count: jest.fn(),
      create: jest.fn(),
      update: jest.fn(),
      delete: jest.fn(),
    },
    driverProfile: { count: jest.fn() },
    delivery: { count: jest.fn() },
    $transaction: jest.fn((ops: unknown) =>
      Array.isArray(ops) ? Promise.all(ops as Promise<unknown>[]) : ops,
    ),
  };
}

const baseZone = {
  id: 'z1',
  name: 'Downtown',
  code: 'DT',
  centerLat: 1.5 as unknown,
  centerLng: 2.5 as unknown,
  bounds: null,
  createdAt: new Date(),
  updatedAt: new Date(),
};

describe('ZonesService', () => {
  let prisma: ReturnType<typeof makePrismaMock>;
  let service: ZonesService;

  beforeEach(() => {
    prisma = makePrismaMock();
    service = new ZonesService(prisma as never);
  });

  it('create rejects a duplicate code with 409', async () => {
    prisma.zone.findUnique.mockResolvedValue(baseZone);
    await expect(
      service.create({ name: 'Downtown', code: 'DT' }),
    ).rejects.toBeInstanceOf(ConflictException);
  });

  it('create maps Decimal lat/lng to numbers', async () => {
    prisma.zone.findUnique.mockResolvedValue(null);
    prisma.zone.create.mockResolvedValue(baseZone);
    const result = await service.create({ name: 'Downtown', code: 'DT' });
    expect(result.centerLat).toBe(1.5);
    expect(result.centerLng).toBe(2.5);
    expect(typeof result.centerLat).toBe('number');
  });

  it('getById throws 404 when missing', async () => {
    prisma.zone.findUnique.mockResolvedValue(null);
    await expect(service.getById('nope')).rejects.toBeInstanceOf(
      NotFoundException,
    );
  });

  it('list returns a paginated envelope', async () => {
    prisma.zone.findMany.mockResolvedValue([baseZone]);
    prisma.zone.count.mockResolvedValue(1);
    const result = await service.list({ page: 1, limit: 20 });
    expect(result.data).toHaveLength(1);
    expect(result.meta).toEqual({
      page: 1,
      limit: 20,
      total: 1,
      totalPages: 1,
    });
  });

  it('remove rejects when drivers or deliveries reference the zone (409)', async () => {
    prisma.zone.findUnique.mockResolvedValue(baseZone);
    prisma.driverProfile.count.mockResolvedValue(2);
    prisma.delivery.count.mockResolvedValue(0);
    await expect(service.remove('z1')).rejects.toBeInstanceOf(
      ConflictException,
    );
    expect(prisma.zone.delete).not.toHaveBeenCalled();
  });

  it('remove deletes an unreferenced zone', async () => {
    prisma.zone.findUnique.mockResolvedValue(baseZone);
    prisma.driverProfile.count.mockResolvedValue(0);
    prisma.delivery.count.mockResolvedValue(0);
    await service.remove('z1');
    expect(prisma.zone.delete).toHaveBeenCalledWith({ where: { id: 'z1' } });
  });
});
