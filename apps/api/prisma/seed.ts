import 'dotenv/config';

import * as argon2 from 'argon2';
import { PrismaPg } from '@prisma/adapter-pg';
import {
  AssignmentStatus,
  DeliveryStatus,
  DriverAvailability,
  PackageSize,
  Prisma,
  PrismaClient,
  Priority,
  Role,
  VehicleType,
} from '../src/generated/prisma/client';

const DEMO_PASSWORD = 'Demo123!';

function decimal(value: string | number): Prisma.Decimal {
  return new Prisma.Decimal(value);
}

function coord(value: number): Prisma.Decimal {
  return decimal(value.toFixed(6));
}

async function main(): Promise<void> {
  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) {
    throw new Error('DATABASE_URL is required to run the seed script.');
  }

  const prisma = new PrismaClient({
    adapter: new PrismaPg({ connectionString }),
  });

  const passwordHash = await argon2.hash(DEMO_PASSWORD);

  // Clear in FK-safe order so the seed is re-runnable.
  await prisma.recommendationCandidate.deleteMany();
  await prisma.recommendationRun.deleteMany();
  await prisma.assignment.deleteMany();
  await prisma.auditLog.deleteMany();
  await prisma.routeEstimate.deleteMany();
  await prisma.delivery.deleteMany();
  await prisma.vehicle.deleteMany();
  await prisma.driverProfile.deleteMany();
  await prisma.user.deleteMany();
  await prisma.zone.deleteMany();

  const zones = await Promise.all([
    prisma.zone.create({
      data: {
        name: 'Downtown',
        code: 'DOWNTOWN',
        centerLat: coord(40.712776),
        centerLng: coord(-74.005974),
      },
    }),
    prisma.zone.create({
      data: {
        name: 'Midtown',
        code: 'MIDTOWN',
        centerLat: coord(40.754932),
        centerLng: coord(-73.984016),
      },
    }),
    prisma.zone.create({
      data: {
        name: 'Brooklyn',
        code: 'BROOKLYN',
        centerLat: coord(40.678178),
        centerLng: coord(-73.944158),
      },
    }),
  ]);

  const [downtown, midtown, brooklyn] = zones;

  const users = await Promise.all([
    prisma.user.create({
      data: {
        email: 'admin@logidash.dev',
        name: 'Admin User',
        role: Role.admin,
        passwordHash,
      },
    }),
    prisma.user.create({
      data: {
        email: 'dispatcher@logidash.dev',
        name: 'Dispatch Lead',
        role: Role.dispatcher,
        passwordHash,
      },
    }),
    prisma.user.create({
      data: {
        email: 'viewer@logidash.dev',
        name: 'Ops Viewer',
        role: Role.viewer,
        passwordHash,
      },
    }),
    prisma.user.create({
      data: {
        email: 'driver.alex@logidash.dev',
        name: 'Alex Rivera',
        role: Role.driver,
        passwordHash,
      },
    }),
    prisma.user.create({
      data: {
        email: 'driver.sam@logidash.dev',
        name: 'Sam Chen',
        role: Role.driver,
        passwordHash,
      },
    }),
    prisma.user.create({
      data: {
        email: 'driver.jordan@logidash.dev',
        name: 'Jordan Lee',
        role: Role.driver,
        passwordHash,
      },
    }),
  ]);

  const dispatcher = users[1];
  const driverAlex = users[3];
  const driverSam = users[4];
  const driverJordan = users[5];

  const [alexProfile, samProfile, jordanProfile] = await Promise.all([
    prisma.driverProfile.create({
      data: {
        userId: driverAlex.id,
        baseZoneId: downtown.id,
        availability: DriverAvailability.available,
        activeJobCount: 0,
        maxConcurrentJobs: 3,
      },
    }),
    prisma.driverProfile.create({
      data: {
        userId: driverSam.id,
        baseZoneId: midtown.id,
        availability: DriverAvailability.available,
        activeJobCount: 0,
        maxConcurrentJobs: 2,
      },
    }),
    prisma.driverProfile.create({
      data: {
        userId: driverJordan.id,
        baseZoneId: brooklyn.id,
        availability: DriverAvailability.busy,
        activeJobCount: 1,
        maxConcurrentJobs: 3,
      },
    }),
  ]);

  const vehicles = await Promise.all([
    prisma.vehicle.create({
      data: {
        driverId: alexProfile.id,
        type: VehicleType.van,
        capacityWeight: decimal('500.00'),
        capacityVolume: decimal('12.00'),
      },
    }),
    prisma.vehicle.create({
      data: {
        driverId: samProfile.id,
        type: VehicleType.car,
        capacityWeight: decimal('150.00'),
        capacityVolume: decimal('4.00'),
      },
    }),
    prisma.vehicle.create({
      data: {
        driverId: jordanProfile.id,
        type: VehicleType.truck,
        capacityWeight: decimal('1200.00'),
        capacityVolume: decimal('28.00'),
      },
    }),
  ]);

  const jordanVehicle = vehicles[2];

  const now = new Date();
  const hoursFromNow = (hours: number): Date =>
    new Date(now.getTime() + hours * 60 * 60 * 1000);

  const readyDelivery = await prisma.delivery.create({
    data: {
      reference: 'DEL-1001',
      pickupAddress: '233 Broadway, New York, NY',
      pickupLat: coord(40.7126),
      pickupLng: coord(-74.0089),
      dropoffAddress: '30 Rockefeller Plaza, New York, NY',
      dropoffLat: coord(40.758),
      dropoffLng: coord(-73.9785),
      zoneId: downtown.id,
      packageSize: PackageSize.medium,
      packageWeight: decimal('18.50'),
      packageType: 'retail',
      priority: Priority.normal,
      deadlineAt: hoursFromNow(6),
      status: DeliveryStatus.ready,
    },
  });

  await prisma.delivery.create({
    data: {
      reference: 'DEL-1002',
      pickupAddress: '1 Penn Plaza, New York, NY',
      pickupLat: coord(40.7505),
      pickupLng: coord(-73.9934),
      dropoffAddress: 'Grand Central Terminal, New York, NY',
      dropoffLat: coord(40.7527),
      dropoffLng: coord(-73.9772),
      zoneId: midtown.id,
      packageSize: PackageSize.small,
      packageWeight: decimal('4.25'),
      packageType: 'documents',
      priority: Priority.urgent,
      deadlineAt: hoursFromNow(2),
      status: DeliveryStatus.ready,
    },
  });

  const assignedDelivery = await prisma.delivery.create({
    data: {
      reference: 'DEL-1003',
      pickupAddress: 'Brooklyn Bridge Park, Brooklyn, NY',
      pickupLat: coord(40.7024),
      pickupLng: coord(-73.9875),
      dropoffAddress: 'Barclays Center, Brooklyn, NY',
      dropoffLat: coord(40.6826),
      dropoffLng: coord(-73.9754),
      zoneId: brooklyn.id,
      packageSize: PackageSize.large,
      packageWeight: decimal('75.00'),
      packageType: 'equipment',
      priority: Priority.high,
      deadlineAt: hoursFromNow(4),
      status: DeliveryStatus.assigned,
    },
  });

  await prisma.assignment.create({
    data: {
      deliveryId: assignedDelivery.id,
      driverId: jordanProfile.id,
      vehicleId: jordanVehicle.id,
      assignedByUserId: dispatcher.id,
      status: AssignmentStatus.active,
    },
  });

  await prisma.delivery.create({
    data: {
      reference: 'DEL-1004',
      pickupAddress: '111 8th Ave, New York, NY',
      pickupLat: coord(40.741),
      pickupLng: coord(-74.0024),
      dropoffAddress: 'Chelsea Piers, New York, NY',
      dropoffLat: coord(40.7465),
      dropoffLng: coord(-74.0075),
      zoneId: downtown.id,
      packageSize: PackageSize.medium,
      packageWeight: decimal('22.00'),
      packageType: 'fragile',
      priority: Priority.normal,
      deadlineAt: hoursFromNow(8),
      status: DeliveryStatus.in_transit,
    },
  });

  await prisma.delivery.create({
    data: {
      reference: 'DEL-1005',
      pickupAddress: 'Metropolitan Museum of Art, New York, NY',
      pickupLat: coord(40.7794),
      pickupLng: coord(-73.9632),
      dropoffAddress: 'Central Park Zoo, New York, NY',
      dropoffLat: coord(40.7678),
      dropoffLng: coord(-73.9718),
      zoneId: midtown.id,
      packageSize: PackageSize.small,
      packageWeight: decimal('2.50'),
      packageType: 'supplies',
      priority: Priority.low,
      deadlineAt: hoursFromNow(-2),
      status: DeliveryStatus.delivered,
    },
  });

  await prisma.delivery.create({
    data: {
      reference: 'DEL-1006',
      pickupAddress: 'Draft pickup — address TBD',
      dropoffAddress: 'Draft dropoff — address TBD',
      zoneId: downtown.id,
      packageSize: PackageSize.medium,
      packageWeight: decimal('10.00'),
      packageType: 'general',
      priority: Priority.normal,
      deadlineAt: hoursFromNow(24),
      status: DeliveryStatus.draft,
    },
  });

  await prisma.auditLog.create({
    data: {
      actorUserId: dispatcher.id,
      action: 'delivery.status_changed',
      entityType: 'Delivery',
      entityId: readyDelivery.id,
      before: { status: DeliveryStatus.draft },
      after: { status: DeliveryStatus.ready },
      reason: 'Seed bootstrap',
    },
  });

  await prisma.$disconnect();

  console.log('Seed complete.');
  console.log('');
  console.log('Demo accounts (password for all):', DEMO_PASSWORD);
  console.log('  admin@logidash.dev       — admin');
  console.log('  dispatcher@logidash.dev  — dispatcher');
  console.log('  viewer@logidash.dev      — viewer');
  console.log('  driver.alex@logidash.dev — driver (available, Downtown van)');
  console.log('  driver.sam@logidash.dev  — driver (available, Midtown car)');
  console.log('  driver.jordan@logidash.dev — driver (busy, Brooklyn truck)');
  console.log('');
  console.log(
    'Deliveries: DEL-1001..1006 (ready, urgent-ready, assigned, in_transit, delivered, draft)',
  );
}

main().catch((error: unknown) => {
  console.error(error);
  process.exit(1);
});
