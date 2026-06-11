import { Prisma } from '../../../generated/prisma/client';
import {
  DeliveryStatus,
  DriverAvailability,
  PackageSize,
  Priority,
  VehicleStatus,
  VehicleType,
} from '../../../generated/prisma/enums';
import { toDeliveryContext, toDriverContext } from './context';

const decimal = (v: string | number): Prisma.Decimal => new Prisma.Decimal(v);

const zoneRow = {
  id: 'z1',
  name: 'Downtown',
  code: 'DOWNTOWN',
  centerLat: decimal('40.712776'),
  centerLng: decimal('-74.005974'),
  bounds: null,
  createdAt: new Date(),
  updatedAt: new Date(),
};

const driverRow = {
  id: 'drv1',
  userId: 'u1',
  availability: DriverAvailability.available,
  baseZoneId: 'z1',
  activeJobCount: 1,
  maxConcurrentJobs: 3,
  createdAt: new Date(),
  updatedAt: new Date(),
  baseZone: zoneRow,
  vehicle: {
    id: 'veh1',
    driverId: 'drv1',
    type: VehicleType.van,
    capacityWeight: decimal('500.00'),
    capacityVolume: decimal('12.00'),
    status: VehicleStatus.active,
    createdAt: new Date(),
    updatedAt: new Date(),
  },
};

const deliveryRow = {
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
  deadlineAt: new Date('2026-06-10T18:00:00Z'),
  status: DeliveryStatus.ready,
  cancellationReason: null,
  createdAt: new Date(),
  updatedAt: new Date(),
  zone: zoneRow,
};

describe('toDriverContext', () => {
  it('converts Decimals to numbers and carries the active load through', () => {
    const ctx = toDriverContext(driverRow, 42.5);
    expect(ctx).toEqual({
      driverId: 'drv1',
      availability: DriverAvailability.available,
      activeJobCount: 1,
      maxConcurrentJobs: 3,
      activeLoadKg: 42.5,
      baseZoneId: 'z1',
      baseZoneCode: 'DOWNTOWN',
      baseZoneCenter: { lat: 40.712776, lng: -74.005974 },
      vehicle: {
        id: 'veh1',
        type: VehicleType.van,
        status: VehicleStatus.active,
        capacityWeightKg: 500,
      },
    });
  });

  it('maps a missing vehicle and a center-less zone to null (not 0,0)', () => {
    const ctx = toDriverContext(
      {
        ...driverRow,
        vehicle: null,
        baseZone: { ...zoneRow, centerLat: null, centerLng: null },
      },
      0,
    );
    expect(ctx.vehicle).toBeNull();
    expect(ctx.baseZoneCenter).toBeNull();
  });
});

describe('toDeliveryContext', () => {
  it('converts pickup Decimals and packageWeight to numbers', () => {
    const ctx = toDeliveryContext(deliveryRow);
    expect(ctx.pickup).toEqual({ lat: 40.7126, lng: -74.0089 });
    expect(ctx.packageWeightKg).toBe(18.5);
    expect(ctx.zoneCode).toBe('DOWNTOWN');
    expect(ctx.status).toBe(DeliveryStatus.ready);
  });

  it('maps ungeocoded pickup coordinates to null', () => {
    const ctx = toDeliveryContext({
      ...deliveryRow,
      pickupLat: null,
      pickupLng: null,
    });
    expect(ctx.pickup).toBeNull();
  });
});
