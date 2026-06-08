import { ConflictException, NotFoundException } from '@nestjs/common';
import {
  DeliveryStatus,
  PackageSize,
  Priority,
} from '../../generated/prisma/enums';
import { DeliveriesService } from './deliveries.service';

function makePrismaMock() {
  return {
    zone: { findUnique: jest.fn() },
    delivery: {
      findUnique: jest.fn(),
      findFirst: jest.fn(),
      findMany: jest.fn(),
      count: jest.fn(),
      create: jest.fn(),
      update: jest.fn(),
    },
    $transaction: jest.fn((ops: unknown) =>
      Array.isArray(ops) ? Promise.all(ops as Promise<unknown>[]) : ops,
    ),
  };
}

const baseDelivery = {
  id: 'd1',
  reference: 'REF-1',
  pickupAddress: '1 A St',
  pickupLat: null,
  pickupLng: null,
  dropoffAddress: '2 B St',
  dropoffLat: null,
  dropoffLng: null,
  zoneId: 'z1',
  packageSize: PackageSize.small,
  packageWeight: 2 as unknown,
  packageType: 'box',
  priority: Priority.normal,
  deadlineAt: new Date(),
  status: DeliveryStatus.draft,
  cancellationReason: null,
  createdAt: new Date(),
  updatedAt: new Date(),
};

const validInput = {
  reference: 'REF-1',
  pickupAddress: '1 A St',
  dropoffAddress: '2 B St',
  zoneId: 'z1',
  packageSize: PackageSize.small,
  packageWeight: 2,
  packageType: 'box',
  deadlineAt: new Date(Date.now() + 86_400_000).toISOString(),
};

describe('DeliveriesService', () => {
  let prisma: ReturnType<typeof makePrismaMock>;
  let service: DeliveriesService;

  beforeEach(() => {
    prisma = makePrismaMock();
    // AuditService is unused by CRUD; pass a stub.
    service = new DeliveriesService(
      prisma as never,
      { record: jest.fn() } as never,
    );
  });

  it('create rejects a duplicate reference (409)', async () => {
    prisma.delivery.findUnique.mockResolvedValue(baseDelivery);
    await expect(service.create(validInput)).rejects.toBeInstanceOf(
      ConflictException,
    );
  });

  it('create rejects a missing zone (404)', async () => {
    prisma.delivery.findUnique.mockResolvedValue(null);
    prisma.zone.findUnique.mockResolvedValue(null);
    await expect(service.create(validInput)).rejects.toBeInstanceOf(
      NotFoundException,
    );
  });

  it('create maps Decimal weight to a number and defaults status draft', async () => {
    prisma.delivery.findUnique.mockResolvedValue(null);
    prisma.zone.findUnique.mockResolvedValue({ id: 'z1' });
    prisma.delivery.create.mockResolvedValue(baseDelivery);
    const result = await service.create(validInput);
    expect(result.packageWeight).toBe(2);
    expect(typeof result.packageWeight).toBe('number');
    expect(result.status).toBe(DeliveryStatus.draft);
  });

  it('getById throws 404 when missing', async () => {
    prisma.delivery.findUnique.mockResolvedValue(null);
    await expect(service.getById('nope')).rejects.toBeInstanceOf(
      NotFoundException,
    );
  });

  it('list applies the status filter and returns the envelope', async () => {
    prisma.delivery.findMany.mockResolvedValue([baseDelivery]);
    prisma.delivery.count.mockResolvedValue(1);
    const result = await service.list({
      page: 1,
      limit: 20,
      status: DeliveryStatus.draft,
    });
    expect(result.data).toHaveLength(1);
    expect(result.meta.total).toBe(1);
    const calls = prisma.delivery.findMany.mock.calls as Array<
      [{ where: { status?: string } }]
    >;
    expect(calls[0][0].where.status).toBe(DeliveryStatus.draft);
  });
});
