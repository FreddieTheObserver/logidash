import { ConflictException, NotFoundException } from '@nestjs/common';
import { AuthUser } from '../../common/types/auth-user';
import { Prisma } from '../../generated/prisma/client';
import {
  AssignmentStatus,
  DeliveryStatus,
  DriverAvailability,
  PackageSize,
  Priority,
  Role,
  UserStatus,
  VehicleStatus,
  VehicleType,
} from '../../generated/prisma/enums';
import { AssignmentsService } from './assignments.service';

const decimal = (v: string | number): Prisma.Decimal => new Prisma.Decimal(v);

function makePrismaMock() {
  const prisma = {
    delivery: { findUnique: jest.fn(), updateMany: jest.fn() },
    driverProfile: { findUnique: jest.fn(), update: jest.fn() },
    assignment: { findMany: jest.fn(), count: jest.fn(), create: jest.fn() },
    $transaction: jest.fn(),
  };
  prisma.$transaction.mockImplementation((arg: unknown) =>
    Array.isArray(arg)
      ? Promise.all(arg as Promise<unknown>[])
      : (arg as (c: unknown) => unknown)(prisma),
  );
  return prisma;
}

const zone = {
  id: 'z1',
  name: 'Downtown',
  code: 'DOWNTOWN',
  centerLat: decimal('40.712776'),
  centerLng: decimal('-74.005974'),
  bounds: null,
  createdAt: new Date(),
  updatedAt: new Date(),
};

const readyDelivery = {
  id: 'del1',
  reference: 'DEL-1',
  pickupAddress: '1 A St',
  pickupLat: decimal('40.7126'),
  pickupLng: decimal('-74.0089'),
  dropoffAddress: '2 B St',
  dropoffLat: null,
  dropoffLng: null,
  zoneId: 'z1',
  packageSize: PackageSize.medium,
  packageWeight: decimal('18.50'),
  packageType: 'retail',
  priority: Priority.normal,
  deadlineAt: new Date(Date.now() + 6 * 3_600_000),
  status: DeliveryStatus.ready,
  cancellationReason: null,
  createdAt: new Date(),
  updatedAt: new Date(),
  zone,
};

const driverRow = {
  id: 'drvA',
  userId: 'uA',
  availability: DriverAvailability.available,
  baseZoneId: 'z1',
  activeJobCount: 0,
  maxConcurrentJobs: 3,
  createdAt: new Date(),
  updatedAt: new Date(),
  baseZone: zone,
  vehicle: {
    id: 'vehA',
    driverId: 'drvA',
    type: VehicleType.van,
    capacityWeight: decimal('500.00'),
    capacityVolume: decimal('12.00'),
    status: VehicleStatus.active,
    createdAt: new Date(),
    updatedAt: new Date(),
  },
};

const createdAssignment = {
  id: 'asg1',
  deliveryId: 'del1',
  driverId: 'drvA',
  vehicleId: 'vehA',
  status: AssignmentStatus.active,
  assignedByUserId: 'disp1',
  assignedAt: new Date(),
  unassignedAt: null,
  unassignReason: null,
  createdAt: new Date(),
  updatedAt: new Date(),
};

const dispatcher: AuthUser = {
  id: 'disp1',
  email: 'dispatcher@logidash.dev',
  role: Role.dispatcher,
  status: UserStatus.active,
};

describe('AssignmentsService.create', () => {
  let prisma: ReturnType<typeof makePrismaMock>;
  let audit: { record: jest.Mock };
  let service: AssignmentsService;

  beforeEach(() => {
    prisma = makePrismaMock();
    audit = { record: jest.fn() };
    service = new AssignmentsService(prisma as never, audit as never);
    prisma.delivery.findUnique.mockResolvedValue(readyDelivery);
    prisma.driverProfile.findUnique.mockResolvedValue(driverRow);
    prisma.assignment.findMany.mockResolvedValue([]); // no active load
    prisma.delivery.updateMany.mockResolvedValue({ count: 1 });
    prisma.assignment.create.mockResolvedValue(createdAssignment);
  });

  it('404s for an unknown delivery', async () => {
    prisma.delivery.findUnique.mockResolvedValue(null);
    await expect(
      service.create('nope', { driverId: 'drvA' }, dispatcher),
    ).rejects.toBeInstanceOf(NotFoundException);
  });

  it('409s when the delivery is not ready', async () => {
    prisma.delivery.findUnique.mockResolvedValue({
      ...readyDelivery,
      status: DeliveryStatus.assigned,
    });
    await expect(
      service.create('del1', { driverId: 'drvA' }, dispatcher),
    ).rejects.toBeInstanceOf(ConflictException);
  });

  it('404s for an unknown driver', async () => {
    prisma.driverProfile.findUnique.mockResolvedValue(null);
    await expect(
      service.create('del1', { driverId: 'nope' }, dispatcher),
    ).rejects.toBeInstanceOf(NotFoundException);
  });

  it('409s an ineligible driver with the reasons in the message', async () => {
    prisma.driverProfile.findUnique.mockResolvedValue({
      ...driverRow,
      availability: DriverAvailability.busy,
    });
    await expect(
      service.create('del1', { driverId: 'drvA' }, dispatcher),
    ).rejects.toThrow(/not eligible.*Availability is busy/);
  });

  it('creates the assignment, flips status, bumps workload, audits twice — in one tx', async () => {
    const dto = await service.create(
      'del1',
      { driverId: 'drvA', reason: 'top pick' },
      dispatcher,
    );

    expect(prisma.$transaction).toHaveBeenCalledTimes(1);
    // status-guarded flip
    expect(prisma.delivery.updateMany).toHaveBeenCalledWith({
      where: { id: 'del1', status: DeliveryStatus.ready },
      data: { status: DeliveryStatus.assigned },
    });
    // assignment row binds the driver's linked vehicle
    const createCalls = prisma.assignment.create.mock.calls as Array<
      [{ data: Record<string, unknown> }]
    >;
    expect(createCalls[0][0].data).toMatchObject({
      deliveryId: 'del1',
      driverId: 'drvA',
      vehicleId: 'vehA',
      assignedByUserId: 'disp1',
      status: AssignmentStatus.active,
    });
    // workload increment
    expect(prisma.driverProfile.update).toHaveBeenCalledWith({
      where: { id: 'drvA' },
      data: { activeJobCount: { increment: 1 } },
    });
    // two audit rows, both inside the tx (the mock tx IS the prisma mock)
    expect(audit.record).toHaveBeenCalledTimes(2);
    const actions = (audit.record.mock.calls as Array<[{ action: string }]>)
      .map((c) => c[0].action)
      .sort();
    expect(actions).toEqual(['assignment.created', 'delivery.status_changed']);

    expect(dto.id).toBe('asg1');
    expect(dto.vehicleId).toBe('vehA');
  });

  it('409s when the guarded status flip loses a race (count 0)', async () => {
    prisma.delivery.updateMany.mockResolvedValue({ count: 0 });
    await expect(
      service.create('del1', { driverId: 'drvA' }, dispatcher),
    ).rejects.toBeInstanceOf(ConflictException);
  });
});

describe('AssignmentsService lists', () => {
  let prisma: ReturnType<typeof makePrismaMock>;
  let service: AssignmentsService;

  beforeEach(() => {
    prisma = makePrismaMock();
    service = new AssignmentsService(
      prisma as never,
      {
        record: jest.fn(),
      } as never,
    );
  });

  it('listByDelivery 404s for an unknown delivery', async () => {
    prisma.delivery.findUnique.mockResolvedValue(null);
    await expect(
      service.listByDelivery('nope', { page: 1, limit: 20 }),
    ).rejects.toBeInstanceOf(NotFoundException);
  });

  it('listByDelivery returns a paginated envelope, newest first', async () => {
    prisma.delivery.findUnique.mockResolvedValue(readyDelivery);
    prisma.assignment.findMany.mockResolvedValue([createdAssignment]);
    prisma.assignment.count.mockResolvedValue(1);
    const result = await service.listByDelivery('del1', { page: 1, limit: 20 });
    expect(result.meta).toEqual({
      page: 1,
      limit: 20,
      total: 1,
      totalPages: 1,
    });
    expect(result.data[0].id).toBe('asg1');
    const findCalls = prisma.assignment.findMany.mock.calls as Array<
      [{ orderBy: Record<string, string> }]
    >;
    expect(findCalls[0][0].orderBy).toEqual({ assignedAt: 'desc' });
  });

  it('listByDriver 404s for an unknown driver', async () => {
    prisma.driverProfile.findUnique.mockResolvedValue(null);
    await expect(
      service.listByDriver('nope', { page: 1, limit: 20 }),
    ).rejects.toBeInstanceOf(NotFoundException);
  });
});
