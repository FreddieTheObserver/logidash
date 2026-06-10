import {
  ConflictException,
  ForbiddenException,
  NotFoundException,
} from '@nestjs/common';
import { AuthUser } from '../../common/types/auth-user';
import {
  DeliveryStatus,
  PackageSize,
  Priority,
  Role,
} from '../../generated/prisma/enums';
import { MapsProviderError } from '../maps/maps-provider.interface';
import { DeliveriesService } from './deliveries.service';

function makePrismaMock() {
  const prisma = {
    zone: { findUnique: jest.fn() },
    delivery: {
      findUnique: jest.fn(),
      findFirst: jest.fn(),
      findMany: jest.fn(),
      count: jest.fn(),
      create: jest.fn(),
      update: jest.fn(),
    },
    assignment: { findFirst: jest.fn(), update: jest.fn() },
    driverProfile: { update: jest.fn() },
    $transaction: jest.fn(),
  };
  // Supports both the array form ($transaction([...])) and the interactive
  // form ($transaction(async (tx) => ...)); the latter runs against the mock.
  // Assigned after construction so `prisma` keeps a concrete (non-`any`) type.
  prisma.$transaction.mockImplementation((arg: unknown) =>
    Array.isArray(arg)
      ? Promise.all(arg as Promise<unknown>[])
      : (arg as (c: unknown) => unknown)(prisma),
  );
  return prisma;
}

// Geocoding is best-effort: default to "no match" so CRUD tests that don't
// care about coordinates keep them null.
function makeMapsMock() {
  return {
    geocode: jest.fn().mockResolvedValue(null),
    getRouteEstimate: jest.fn(),
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
  let maps: ReturnType<typeof makeMapsMock>;
  let service: DeliveriesService;

  beforeEach(() => {
    prisma = makePrismaMock();
    maps = makeMapsMock();
    // AuditService is unused by CRUD; pass a stub.
    service = new DeliveriesService(
      prisma as never,
      { record: jest.fn() } as never,
      maps as never,
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

  it('create geocodes pickup and dropoff and stores the coordinates', async () => {
    prisma.delivery.findUnique.mockResolvedValue(null);
    prisma.zone.findUnique.mockResolvedValue({ id: 'z1' });
    prisma.delivery.create.mockResolvedValue(baseDelivery);
    maps.geocode
      .mockResolvedValueOnce({ lat: 13.75, lng: 100.5 })
      .mockResolvedValueOnce({ lat: 13.8, lng: 100.55 });

    await service.create(validInput);

    expect(maps.geocode).toHaveBeenCalledWith('1 A St');
    expect(maps.geocode).toHaveBeenCalledWith('2 B St');
    const calls = prisma.delivery.create.mock.calls as Array<
      [{ data: Record<string, unknown> }]
    >;
    expect(calls[0][0].data).toMatchObject({
      pickupLat: 13.75,
      pickupLng: 100.5,
      dropoffLat: 13.8,
      dropoffLng: 100.55,
    });
  });

  it('create survives a geocode outage: failed side stays null, create succeeds', async () => {
    prisma.delivery.findUnique.mockResolvedValue(null);
    prisma.zone.findUnique.mockResolvedValue({ id: 'z1' });
    prisma.delivery.create.mockResolvedValue(baseDelivery);
    maps.geocode
      .mockRejectedValueOnce(new MapsProviderError('timeout', 'timed out'))
      .mockResolvedValueOnce({ lat: 13.8, lng: 100.55 });

    await service.create(validInput);

    const calls = prisma.delivery.create.mock.calls as Array<
      [{ data: Record<string, unknown> }]
    >;
    expect(calls[0][0].data).toMatchObject({
      pickupLat: null,
      pickupLng: null,
      dropoffLat: 13.8,
      dropoffLng: 100.55,
    });
  });

  it('update re-geocodes only the changed address side', async () => {
    prisma.delivery.findUnique.mockResolvedValue(baseDelivery);
    prisma.delivery.update.mockResolvedValue(baseDelivery);
    maps.geocode.mockResolvedValue({ lat: 13.9, lng: 100.6 });

    await service.update('d1', { pickupAddress: '9 New Road' });

    expect(maps.geocode).toHaveBeenCalledTimes(1);
    expect(maps.geocode).toHaveBeenCalledWith('9 New Road');
    const calls = prisma.delivery.update.mock.calls as Array<
      [{ data: Record<string, unknown> }]
    >;
    expect(calls[0][0].data).toMatchObject({
      pickupLat: 13.9,
      pickupLng: 100.6,
    });
    expect(calls[0][0].data).not.toHaveProperty('dropoffLat');
  });

  it('update does not re-geocode an unchanged address', async () => {
    prisma.delivery.findUnique.mockResolvedValue(baseDelivery);
    prisma.delivery.update.mockResolvedValue(baseDelivery);

    await service.update('d1', { pickupAddress: '1 A St' });

    expect(maps.geocode).not.toHaveBeenCalled();
  });

  it('update resets coords to null when re-geocoding the new address fails', async () => {
    prisma.delivery.findUnique.mockResolvedValue({
      ...baseDelivery,
      pickupLat: 13.7 as unknown,
      pickupLng: 100.5 as unknown,
    });
    prisma.delivery.update.mockResolvedValue(baseDelivery);
    maps.geocode.mockRejectedValue(new MapsProviderError('http', 'HTTP 500'));

    await service.update('d1', { pickupAddress: '9 New Road' });

    const calls = prisma.delivery.update.mock.calls as Array<
      [{ data: Record<string, unknown> }]
    >;
    expect(calls[0][0].data).toMatchObject({
      pickupLat: null,
      pickupLng: null,
    });
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

const dispatcher: AuthUser = {
  id: 'u-disp',
  email: 'd@x',
  name: 'D',
  role: Role.dispatcher,
};
const driver: AuthUser = {
  id: 'u-driver',
  email: 'dr@x',
  name: 'Dr',
  role: Role.driver,
};

describe('DeliveriesService.changeStatus', () => {
  let prisma: ReturnType<typeof makePrismaMock>;
  let audit: { record: jest.Mock };
  let service: DeliveriesService;

  beforeEach(() => {
    prisma = makePrismaMock();
    audit = { record: jest.fn() };
    service = new DeliveriesService(
      prisma as never,
      audit as never,
      makeMapsMock() as never,
    );
  });

  it('rejects an illegal transition with 409', async () => {
    prisma.delivery.findUnique.mockResolvedValue({
      ...baseDelivery,
      status: DeliveryStatus.draft,
    });
    await expect(
      service.changeStatus(
        'd1',
        { status: DeliveryStatus.delivered },
        dispatcher,
      ),
    ).rejects.toBeInstanceOf(ConflictException);
  });

  it('rejects a direct → assigned with 409 (use the assignment flow)', async () => {
    prisma.delivery.findUnique.mockResolvedValue({
      ...baseDelivery,
      status: DeliveryStatus.ready,
    });
    await expect(
      service.changeStatus(
        'd1',
        { status: DeliveryStatus.assigned },
        dispatcher,
      ),
    ).rejects.toBeInstanceOf(ConflictException);
  });

  it('dispatcher advances draft → ready and audits', async () => {
    prisma.delivery.findUnique.mockResolvedValue({
      ...baseDelivery,
      status: DeliveryStatus.draft,
    });
    prisma.delivery.update.mockResolvedValue({
      ...baseDelivery,
      status: DeliveryStatus.ready,
    });
    const result = await service.changeStatus(
      'd1',
      { status: DeliveryStatus.ready },
      dispatcher,
    );
    expect(result.status).toBe(DeliveryStatus.ready);
    expect(audit.record).toHaveBeenCalled();
  });

  it('driver may not drive a non-operational transition (403)', async () => {
    prisma.delivery.findUnique.mockResolvedValue({
      ...baseDelivery,
      status: DeliveryStatus.assigned,
    });
    await expect(
      service.changeStatus('d1', { status: DeliveryStatus.cancelled }, driver),
    ).rejects.toBeInstanceOf(ForbiddenException);
  });

  it('driver may not advance an assignment they do not own (403)', async () => {
    prisma.delivery.findUnique.mockResolvedValue({
      ...baseDelivery,
      status: DeliveryStatus.assigned,
    });
    prisma.assignment.findFirst.mockResolvedValue({
      id: 'a1',
      driverId: 'dp-other',
      status: 'active',
      driver: { id: 'dp-other', userId: 'u-someone-else', activeJobCount: 1 },
    });
    await expect(
      service.changeStatus('d1', { status: DeliveryStatus.picked_up }, driver),
    ).rejects.toBeInstanceOf(ForbiddenException);
  });

  it('driver delivers their own assignment: closes it + decrements workload', async () => {
    prisma.delivery.findUnique.mockResolvedValue({
      ...baseDelivery,
      status: DeliveryStatus.in_transit,
    });
    prisma.assignment.findFirst.mockResolvedValue({
      id: 'a1',
      driverId: 'dp1',
      status: 'active',
      driver: { id: 'dp1', userId: 'u-driver', activeJobCount: 1 },
    });
    prisma.delivery.update.mockResolvedValue({
      ...baseDelivery,
      status: DeliveryStatus.delivered,
    });
    await service.changeStatus(
      'd1',
      { status: DeliveryStatus.delivered },
      driver,
    );
    expect(prisma.assignment.update).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: 'a1' } }),
    );
    expect(prisma.driverProfile.update).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: 'dp1' } }),
    );
    expect(audit.record).toHaveBeenCalled();
  });
});
