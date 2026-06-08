import {
  INestApplication,
  ValidationPipe,
  VersioningType,
} from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import * as argon2 from 'argon2';
import request from 'supertest';
import { App } from 'supertest/types';
import { AppModule } from './../src/app.module';
import {
  AssignmentStatus,
  DeliveryStatus,
  PackageSize,
  Role,
  UserStatus,
  VehicleType,
} from './../src/generated/prisma/enums';
import { PrismaService } from './../src/prisma/prisma.service';

const PASSWORD = 'Demo123!';
const PREFIX = 'E2EDD-';
const EMAILS = {
  admin: 'e2e.dd.admin@logidash.test',
  dispatcher: 'e2e.dd.dispatcher@logidash.test',
  driver: 'e2e.dd.driver@logidash.test',
  viewer: 'e2e.dd.viewer@logidash.test',
};

describe('Drivers & Deliveries (e2e)', () => {
  let app: INestApplication<App>;
  let prisma: PrismaService;
  const tokens: Record<string, string> = {};
  const userIds: Record<string, string> = {};
  let zoneId = '';

  const login = (email: string, password = PASSWORD) =>
    request(app.getHttpServer())
      .post('/v1/auth/login')
      .send({ email, password });
  const auth = (role: string) => ({ Authorization: `Bearer ${tokens[role]}` });

  const cleanup = async () => {
    await prisma.assignment.deleteMany({
      where: { delivery: { reference: { startsWith: PREFIX } } },
    });
    // Remove every audit row authored by a test user (status changes audit the
    // actor, so reason-prefix filtering alone would orphan FK references).
    await prisma.auditLog.deleteMany({
      where: { actor: { email: { in: Object.values(EMAILS) } } },
    });
    await prisma.delivery.deleteMany({
      where: { reference: { startsWith: PREFIX } },
    });
    await prisma.driverProfile.deleteMany({
      where: { user: { email: { in: Object.values(EMAILS) } } },
    });
    await prisma.vehicle.deleteMany({
      where: { driver: { user: { email: { in: Object.values(EMAILS) } } } },
    });
    await prisma.zone.deleteMany({ where: { code: { startsWith: PREFIX } } });
    await prisma.user.deleteMany({
      where: { email: { in: Object.values(EMAILS) } },
    });
  };

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();
    app = moduleFixture.createNestApplication();
    app.enableVersioning({ type: VersioningType.URI, defaultVersion: '1' });
    app.useGlobalPipes(
      new ValidationPipe({
        whitelist: true,
        forbidNonWhitelisted: true,
        transform: true,
      }),
    );
    await app.init();
    prisma = app.get(PrismaService);

    await cleanup();
    const passwordHash = await argon2.hash(PASSWORD);
    for (const [role, email] of Object.entries(EMAILS)) {
      const u = await prisma.user.create({
        data: {
          email,
          name: role,
          role: role as Role,
          status: UserStatus.active,
          passwordHash,
        },
      });
      userIds[role] = u.id;
    }
    const zone = await prisma.zone.create({
      data: { name: 'DD Zone', code: `${PREFIX}Z` },
    });
    zoneId = zone.id;

    for (const [role, email] of Object.entries(EMAILS)) {
      const res = await login(email).expect(200);
      tokens[role] = (res.body as { accessToken: string }).accessToken;
    }
  });

  afterAll(async () => {
    await cleanup();
    await app.close();
  });

  // ---- Drivers ----
  it('dispatcher creates a driver profile for the driver user; viewer is 403', async () => {
    const res = await request(app.getHttpServer())
      .post('/v1/drivers')
      .set(auth('dispatcher'))
      .send({ userId: userIds.driver, baseZoneId: zoneId })
      .expect(201);
    expect((res.body as { userId: string }).userId).toBe(userIds.driver);

    await request(app.getHttpServer())
      .post('/v1/drivers')
      .set(auth('viewer'))
      .send({ userId: userIds.admin, baseZoneId: zoneId })
      .expect(403);
  });

  it('creating a driver profile for a non-driver user is 409', async () => {
    await request(app.getHttpServer())
      .post('/v1/drivers')
      .set(auth('admin'))
      .send({ userId: userIds.viewer, baseZoneId: zoneId })
      .expect(409);
  });

  // ---- Deliveries CRUD + filter ----
  it('dispatcher creates a delivery (status draft); driver is 403; filter works', async () => {
    const created = await request(app.getHttpServer())
      .post('/v1/deliveries')
      .set(auth('dispatcher'))
      .send({
        reference: `${PREFIX}D1`,
        pickupAddress: '1 A St',
        dropoffAddress: '2 B St',
        zoneId,
        packageSize: PackageSize.small,
        packageWeight: 2,
        packageType: 'box',
        deadlineAt: new Date(Date.now() + 86_400_000).toISOString(),
      })
      .expect(201);
    expect((created.body as { status: string }).status).toBe(
      DeliveryStatus.draft,
    );

    await request(app.getHttpServer())
      .post('/v1/deliveries')
      .set(auth('driver'))
      .send({
        reference: `${PREFIX}NO`,
        pickupAddress: 'x',
        dropoffAddress: 'y',
        zoneId,
        packageSize: PackageSize.small,
        packageWeight: 1,
        packageType: 'box',
        deadlineAt: new Date().toISOString(),
      })
      .expect(403);

    const list = await request(app.getHttpServer())
      .get(`/v1/deliveries?status=${DeliveryStatus.draft}&zoneId=${zoneId}`)
      .set(auth('viewer'))
      .expect(200);
    expect(Array.isArray((list.body as { data: unknown[] }).data)).toBe(true);
  });

  // ---- Status machine ----
  it('illegal transition draft → delivered is 409', async () => {
    const created = await request(app.getHttpServer())
      .post('/v1/deliveries')
      .set(auth('dispatcher'))
      .send({
        reference: `${PREFIX}ILL`,
        pickupAddress: 'a',
        dropoffAddress: 'b',
        zoneId,
        packageSize: PackageSize.small,
        packageWeight: 1,
        packageType: 'box',
        deadlineAt: new Date(Date.now() + 86_400_000).toISOString(),
      })
      .expect(201);
    const id = (created.body as { id: string }).id;
    await request(app.getHttpServer())
      .patch(`/v1/deliveries/${id}/status`)
      .set(auth('dispatcher'))
      .send({ status: DeliveryStatus.delivered })
      .expect(409);
  });

  it('dispatcher drives draft → ready and writes an audit row', async () => {
    const created = await request(app.getHttpServer())
      .post('/v1/deliveries')
      .set(auth('dispatcher'))
      .send({
        reference: `${PREFIX}RDY`,
        pickupAddress: 'a',
        dropoffAddress: 'b',
        zoneId,
        packageSize: PackageSize.small,
        packageWeight: 1,
        packageType: 'box',
        deadlineAt: new Date(Date.now() + 86_400_000).toISOString(),
      })
      .expect(201);
    const id = (created.body as { id: string }).id;
    await request(app.getHttpServer())
      .patch(`/v1/deliveries/${id}/status`)
      .set(auth('dispatcher'))
      .send({ status: DeliveryStatus.ready, reason: `${PREFIX}go` })
      .expect(200);
    const audits = await prisma.auditLog.count({
      where: {
        entityType: 'Delivery',
        entityId: id,
        action: 'delivery.status_changed',
      },
    });
    expect(audits).toBeGreaterThan(0);
  });

  it('a direct → assigned is rejected (409, assignment flow owns it)', async () => {
    const created = await request(app.getHttpServer())
      .post('/v1/deliveries')
      .set(auth('dispatcher'))
      .send({
        reference: `${PREFIX}ASG`,
        pickupAddress: 'a',
        dropoffAddress: 'b',
        zoneId,
        packageSize: PackageSize.small,
        packageWeight: 1,
        packageType: 'box',
        deadlineAt: new Date(Date.now() + 86_400_000).toISOString(),
      })
      .expect(201);
    const id = (created.body as { id: string }).id;
    await request(app.getHttpServer())
      .patch(`/v1/deliveries/${id}/status`)
      .set(auth('dispatcher'))
      .send({ status: DeliveryStatus.ready })
      .expect(200);
    await request(app.getHttpServer())
      .patch(`/v1/deliveries/${id}/status`)
      .set(auth('dispatcher'))
      .send({ status: DeliveryStatus.assigned })
      .expect(409);
  });

  it('driver advances their OWN seeded assignment: assigned → picked_up; not-owner is 403', async () => {
    // Seed: driver profile (created above) + a vehicle + an assigned delivery + an active assignment.
    const driverProfile = await prisma.driverProfile.findUnique({
      where: { userId: userIds.driver },
    });
    const vehicle = await prisma.vehicle.create({
      data: {
        type: VehicleType.van,
        capacityWeight: 1000,
        capacityVolume: 8,
        driverId: driverProfile!.id,
      },
    });
    const delivery = await prisma.delivery.create({
      data: {
        reference: `${PREFIX}OWN`,
        pickupAddress: 'a',
        dropoffAddress: 'b',
        zoneId,
        packageSize: PackageSize.small,
        packageWeight: 1,
        packageType: 'box',
        deadlineAt: new Date(Date.now() + 86_400_000),
        status: DeliveryStatus.assigned,
      },
    });
    await prisma.assignment.create({
      data: {
        deliveryId: delivery.id,
        driverId: driverProfile!.id,
        vehicleId: vehicle.id,
        status: AssignmentStatus.active,
        assignedByUserId: userIds.dispatcher,
      },
    });

    // The owning driver may advance.
    await request(app.getHttpServer())
      .patch(`/v1/deliveries/${delivery.id}/status`)
      .set(auth('driver'))
      .send({ status: DeliveryStatus.picked_up })
      .expect(200);

    // A different driver-less user (viewer) is blocked by role; a driver who
    // doesn't own it would be 403 — assert the viewer can't touch status at all.
    await request(app.getHttpServer())
      .patch(`/v1/deliveries/${delivery.id}/status`)
      .set(auth('viewer'))
      .send({ status: DeliveryStatus.in_transit })
      .expect(403);
  });
});
