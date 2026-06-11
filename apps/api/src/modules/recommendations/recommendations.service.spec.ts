import {
  ConflictException,
  ForbiddenException,
  NotFoundException,
} from '@nestjs/common';
import { AuthUser } from '../../common/types/auth-user';
import { Prisma } from '../../generated/prisma/client';
import {
  DeliveryStatus,
  DriverAvailability,
  PackageSize,
  Priority,
  Role,
  UserStatus,
  VehicleStatus,
  VehicleType,
} from '../../generated/prisma/enums';
import { DEFAULT_WEIGHTS } from './engine/weights';
import { RecommendationsService } from './recommendations.service';

const decimal = (v: string | number): Prisma.Decimal => new Prisma.Decimal(v);

function makePrismaMock() {
  const prisma = {
    delivery: { findUnique: jest.fn() },
    driverProfile: { findMany: jest.fn() },
    assignment: { findMany: jest.fn() },
    recommendationRun: { findFirst: jest.fn(), create: jest.fn() },
    $transaction: jest.fn(),
  };
  prisma.$transaction.mockImplementation((arg: unknown) =>
    Array.isArray(arg)
      ? Promise.all(arg as Promise<unknown>[])
      : (arg as (c: unknown) => unknown)(prisma),
  );
  return prisma;
}

function makeMapsMock() {
  return {
    geocode: jest.fn(),
    getRouteEstimate: jest
      .fn()
      .mockResolvedValue({ distanceMeters: 3000, durationSeconds: 600 }),
  };
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
  priority: Priority.high,
  deadlineAt: new Date(Date.now() + 6 * 3_600_000),
  status: DeliveryStatus.ready,
  cancellationReason: null,
  createdAt: new Date(),
  updatedAt: new Date(),
  zone,
};

const eligibleDriver = {
  id: 'drvA',
  userId: 'uA',
  availability: DriverAvailability.available,
  baseZoneId: 'z1',
  activeJobCount: 0,
  maxConcurrentJobs: 3,
  createdAt: new Date(),
  updatedAt: new Date(),
  baseZone: zone,
  user: { name: 'Alex' },
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

const busyDriver = {
  ...eligibleDriver,
  id: 'drvB',
  userId: 'uB',
  user: { name: 'Bo' },
  availability: DriverAvailability.busy,
  vehicle: { ...eligibleDriver.vehicle, id: 'vehB', driverId: 'drvB' },
};

const dispatcher: AuthUser = {
  id: 'disp1',
  email: 'dispatcher@logidash.dev',
  role: Role.dispatcher,
  status: UserStatus.active,
};
const viewer: AuthUser = { ...dispatcher, id: 'view1', role: Role.viewer };

// Echo back a row shaped like the include the service requests.
function stubCreateEcho(prisma: ReturnType<typeof makePrismaMock>) {
  prisma.recommendationRun.create.mockImplementation(
    (args: {
      data: {
        deliveryId: string;
        requestedByUserId: string;
        inputSnapshot: unknown;
        candidates: { create: Record<string, unknown>[] };
      };
    }) =>
      Promise.resolve({
        id: 'run1',
        deliveryId: args.data.deliveryId,
        requestedByUserId: args.data.requestedByUserId,
        inputSnapshot: args.data.inputSnapshot,
        createdAt: new Date(),
        candidates: args.data.candidates.create.map((c, i) => ({
          id: `cand${i}`,
          runId: 'run1',
          ...c,
          driver: c.driverId === 'drvA' ? eligibleDriver : busyDriver,
        })),
      }),
  );
}

describe('RecommendationsService', () => {
  let prisma: ReturnType<typeof makePrismaMock>;
  let maps: ReturnType<typeof makeMapsMock>;
  let audit: { record: jest.Mock };
  let service: RecommendationsService;

  beforeEach(() => {
    prisma = makePrismaMock();
    maps = makeMapsMock();
    audit = { record: jest.fn() };
    service = new RecommendationsService(
      prisma as never,
      audit as never,
      maps as never,
      DEFAULT_WEIGHTS,
    );
    prisma.driverProfile.findMany.mockResolvedValue([
      eligibleDriver,
      busyDriver,
    ]);
    prisma.assignment.findMany.mockResolvedValue([]);
    stubCreateEcho(prisma);
  });

  it('404s for an unknown delivery', async () => {
    prisma.delivery.findUnique.mockResolvedValue(null);
    await expect(
      service.getForDelivery('nope', { refresh: false }, dispatcher),
    ).rejects.toBeInstanceOf(NotFoundException);
  });

  it('returns the latest run without computing when one exists', async () => {
    prisma.delivery.findUnique.mockResolvedValue(readyDelivery);
    prisma.recommendationRun.findFirst.mockResolvedValue({
      id: 'old1',
      deliveryId: 'del1',
      requestedByUserId: 'disp1',
      inputSnapshot: { weights: DEFAULT_WEIGHTS },
      createdAt: new Date(),
      candidates: [],
    });
    const dto = await service.getForDelivery(
      'del1',
      { refresh: false },
      viewer,
    );
    expect(dto.id).toBe('old1');
    expect(dto.weights).toEqual(DEFAULT_WEIGHTS);
    expect(prisma.recommendationRun.create).not.toHaveBeenCalled();
  });

  it('404s for a viewer when no run exists (read-only roles never compute)', async () => {
    prisma.delivery.findUnique.mockResolvedValue(readyDelivery);
    prisma.recommendationRun.findFirst.mockResolvedValue(null);
    await expect(
      service.getForDelivery('del1', { refresh: false }, viewer),
    ).rejects.toBeInstanceOf(NotFoundException);
  });

  it('403s a viewer asking for refresh', async () => {
    prisma.delivery.findUnique.mockResolvedValue(readyDelivery);
    await expect(
      service.getForDelivery('del1', { refresh: true }, viewer),
    ).rejects.toBeInstanceOf(ForbiddenException);
  });

  it('409s a refresh on a non-ready delivery', async () => {
    prisma.delivery.findUnique.mockResolvedValue({
      ...readyDelivery,
      status: DeliveryStatus.assigned,
    });
    await expect(
      service.getForDelivery('del1', { refresh: true }, dispatcher),
    ).rejects.toBeInstanceOf(ConflictException);
  });

  it('computes lazily for a dispatcher when no run exists: ranks eligible, keeps ineligible with reasons', async () => {
    prisma.delivery.findUnique.mockResolvedValue(readyDelivery);
    prisma.recommendationRun.findFirst.mockResolvedValue(null);

    const dto = await service.getForDelivery(
      'del1',
      { refresh: false },
      dispatcher,
    );

    expect(prisma.recommendationRun.create).toHaveBeenCalledTimes(1);
    const createArgs = prisma.recommendationRun.create.mock.calls as Array<
      [
        {
          data: {
            inputSnapshot: { weights: unknown };
            candidates: { create: Array<Record<string, unknown>> };
          };
        },
      ]
    >;
    const created = createArgs[0][0].data.candidates.create;

    const drvA = created.find((c) => c.driverId === 'drvA');
    const drvB = created.find((c) => c.driverId === 'drvB');
    expect(drvA).toMatchObject({ eligible: true, rank: 1 });
    expect(typeof drvA?.score).toBe('number');
    expect(drvB).toMatchObject({ eligible: false, rank: null, score: 0 });
    expect(drvB?.ineligibleReasons).toEqual([
      'Availability is busy (must be available).',
    ]);
    expect(createArgs[0][0].data.inputSnapshot.weights).toEqual(
      DEFAULT_WEIGHTS,
    );

    // audit row in the same transaction
    expect(audit.record).toHaveBeenCalledWith(
      expect.objectContaining({
        action: 'recommendation.run_created',
        entityType: 'Delivery',
        entityId: 'del1',
      }),
      prisma,
    );

    // DTO maps eligible first with driver summary attached
    expect(dto.candidates[0].driver.name).toBe('Alex');
    expect(dto.candidates[0].eligible).toBe(true);
  });

  it('flags degraded factors when the maps service returns null', async () => {
    maps.getRouteEstimate.mockResolvedValue(null);
    prisma.delivery.findUnique.mockResolvedValue(readyDelivery);
    prisma.recommendationRun.findFirst.mockResolvedValue(null);

    await service.getForDelivery('del1', { refresh: false }, dispatcher);

    const createArgs = prisma.recommendationRun.create.mock.calls as Array<
      [
        {
          data: {
            candidates: {
              create: Array<{
                driverId: string;
                explanation: Array<{ factor: string; degraded?: boolean }>;
              }>;
            };
          };
        },
      ]
    >;
    const drvA = createArgs[0][0].data.candidates.create.find(
      (c) => c.driverId === 'drvA',
    );
    const route = drvA?.explanation.find((f) => f.factor === 'routeProximity');
    expect(route?.degraded).toBe(true);
  });

  it('forces a fresh run on refresh even when an older run exists', async () => {
    prisma.delivery.findUnique.mockResolvedValue(readyDelivery);
    prisma.recommendationRun.findFirst.mockResolvedValue({ id: 'old1' });
    await service.getForDelivery('del1', { refresh: true }, dispatcher);
    expect(prisma.recommendationRun.create).toHaveBeenCalledTimes(1);
  });
});
