import { ConflictException, NotFoundException } from '@nestjs/common';
import { DriverAvailability, Role } from '../../generated/prisma/enums';
import { DriversService } from './drivers.service';

function makePrismaMock() {
  return {
    user: { findUnique: jest.fn() },
    zone: { findUnique: jest.fn() },
    driverProfile: {
      findUnique: jest.fn(),
      findMany: jest.fn(),
      count: jest.fn(),
      create: jest.fn(),
      update: jest.fn(),
      delete: jest.fn(),
    },
    vehicle: {
      findUnique: jest.fn(),
      update: jest.fn(),
      updateMany: jest.fn(),
    },
    assignment: { count: jest.fn() },
    $transaction: jest.fn((arg: unknown) =>
      Array.isArray(arg)
        ? Promise.all(arg as Promise<unknown>[])
        : (arg as (c: unknown) => unknown)(makeTxFromMock()),
    ),
  };
}
// the interactive-tx branch is overridden per-test where needed
function makeTxFromMock() {
  return {};
}

const baseDriver = {
  id: 'dp1',
  userId: 'u-driver',
  availability: DriverAvailability.offline,
  baseZoneId: 'z1',
  activeJobCount: 0,
  maxConcurrentJobs: 3,
  createdAt: new Date(),
  updatedAt: new Date(),
};

describe('DriversService', () => {
  let prisma: ReturnType<typeof makePrismaMock>;
  let service: DriversService;

  beforeEach(() => {
    prisma = makePrismaMock();
    service = new DriversService(prisma as never);
  });

  it('create rejects when the user is not found (404)', async () => {
    prisma.user.findUnique.mockResolvedValue(null);
    await expect(
      service.create({ userId: 'nope', baseZoneId: 'z1' }),
    ).rejects.toBeInstanceOf(NotFoundException);
  });

  it('create rejects when the user is not a driver (409)', async () => {
    prisma.user.findUnique.mockResolvedValue({ id: 'u1', role: Role.viewer });
    await expect(
      service.create({ userId: 'u1', baseZoneId: 'z1' }),
    ).rejects.toBeInstanceOf(ConflictException);
  });

  it('create rejects a duplicate profile for the user (409)', async () => {
    prisma.user.findUnique.mockResolvedValue({
      id: 'u-driver',
      role: Role.driver,
    });
    prisma.zone.findUnique.mockResolvedValue({ id: 'z1' });
    prisma.driverProfile.findUnique.mockResolvedValue(baseDriver);
    await expect(
      service.create({ userId: 'u-driver', baseZoneId: 'z1' }),
    ).rejects.toBeInstanceOf(ConflictException);
  });

  it('create succeeds for a valid driver user + zone', async () => {
    prisma.user.findUnique.mockResolvedValue({
      id: 'u-driver',
      role: Role.driver,
    });
    prisma.zone.findUnique.mockResolvedValue({ id: 'z1' });
    prisma.driverProfile.findUnique.mockResolvedValue(null);
    prisma.driverProfile.create.mockResolvedValue(baseDriver);
    const result = await service.create({
      userId: 'u-driver',
      baseZoneId: 'z1',
    });
    expect(result.userId).toBe('u-driver');
    expect(result.availability).toBe(DriverAvailability.offline);
  });

  it('getById throws 404 when missing', async () => {
    prisma.driverProfile.findUnique.mockResolvedValue(null);
    await expect(service.getById('nope')).rejects.toBeInstanceOf(
      NotFoundException,
    );
  });

  it('remove rejects a driver referenced by assignments (409)', async () => {
    prisma.driverProfile.findUnique.mockResolvedValue(baseDriver);
    prisma.assignment.count.mockResolvedValue(2);
    await expect(service.remove('dp1')).rejects.toBeInstanceOf(
      ConflictException,
    );
    expect(prisma.driverProfile.delete).not.toHaveBeenCalled();
  });
});
