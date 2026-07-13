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
  DeliveryStatus,
  DriverAvailability,
  PackageSize,
  Role,
  UserStatus,
  VehicleStatus,
  VehicleType,
} from './../src/generated/prisma/enums';
import { PrismaService } from './../src/prisma/prisma.service';

const PASSWORD = 'Demo123!';
const PREFIX = 'E2EDA-';
const EMAILS = {
  admin: 'e2e.da.admin@logidash.test',
  dispatcher: 'e2e.da.dispatcher@logidash.test',
  driver: 'e2e.da.driver@logidash.test',
  viewer: 'e2e.da.viewer@logidash.test',
};

interface DeliveryStats {
  draft: number;
  ready: number;
  active: number;
  atRisk: number;
  breached: number;
  open: number;
}
interface DriverStats {
  available: number;
  busy: number;
  offline: number;
  total: number;
}
interface Stats {
  deliveries: DeliveryStats;
  drivers: DriverStats;
}
interface AuditEntry {
  id: string;
  action: string;
  entityType: string;
  entityId: string;
  actorName: string;
  actorRole: string;
  createdAt: string;
}

describe('Dashboard stats & global audit (e2e)', () => {
  let app: INestApplication<App>;
  let prisma: PrismaService;
  const tokens: Record<string, string> = {};
  const userIds: Record<string, string> = {};
  let zoneId = '';
  let driverProfileId = '';
  let baseline: Stats;
  let readyDeliveryId = '';

  const login = (email: string, password = PASSWORD) =>
    request(app.getHttpServer())
      .post('/v1/auth/login')
      .send({ email, password });
  const auth = (role: string) => ({ Authorization: `Bearer ${tokens[role]}` });

  const cleanup = async () => {
    await prisma.assignment.deleteMany({
      where: { delivery: { reference: { startsWith: PREFIX } } },
    });
    // Audit rows reference the test users as actors — delete them first.
    await prisma.auditLog.deleteMany({
      where: { actor: { email: { in: Object.values(EMAILS) } } },
    });
    await prisma.delivery.deleteMany({
      where: { reference: { startsWith: PREFIX } },
    });
    await prisma.vehicle.deleteMany({
      where: { driver: { user: { email: { in: Object.values(EMAILS) } } } },
    });
    await prisma.driverProfile.deleteMany({
      where: { user: { email: { in: Object.values(EMAILS) } } },
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
          name: `DA ${role}`,
          role: role as Role,
          status: UserStatus.active,
          passwordHash,
        },
      });
      userIds[role] = u.id;
    }
    const zone = await prisma.zone.create({
      data: { name: 'DA Zone', code: `${PREFIX}Z` },
    });
    zoneId = zone.id;

    for (const [role, email] of Object.entries(EMAILS)) {
      const res = await login(email).expect(200);
      tokens[role] = (res.body as { accessToken: string }).accessToken;
    }

    // Baseline BEFORE seeding driver + deliveries: the stats endpoint counts
    // globally, so every assertion below is a delta against this snapshot.
    const base = await request(app.getHttpServer())
      .get('/v1/dashboard/stats')
      .set(auth('viewer'))
      .expect(200);
    baseline = base.body as Stats;

    const driver = await prisma.driverProfile.create({
      data: {
        userId: userIds.driver,
        baseZoneId: zoneId,
        availability: DriverAvailability.available,
      },
    });
    driverProfileId = driver.id;
    await prisma.vehicle.create({
      data: {
        driverId: driverProfileId,
        type: VehicleType.van,
        capacityWeight: 100,
        capacityVolume: 5,
        status: VehicleStatus.active,
      },
    });

    const mkDelivery = (
      ref: string,
      status: DeliveryStatus,
      deadlineOffsetMs: number,
    ) =>
      prisma.delivery.create({
        data: {
          reference: `${PREFIX}${ref}`,
          pickupAddress: '1 A St',
          dropoffAddress: '2 B St',
          zoneId,
          packageSize: PackageSize.small,
          packageWeight: 2,
          packageType: 'box',
          status,
          deadlineAt: new Date(Date.now() + deadlineOffsetMs),
        },
      });
    const onTrack = await mkDelivery('R1', DeliveryStatus.ready, 2 * 3_600_000);
    readyDeliveryId = onTrack.id;
    await mkDelivery('R2', DeliveryStatus.ready, 30 * 60_000); // at-risk
    await mkDelivery('D1', DeliveryStatus.draft, -3_600_000); // breached
  });

  afterAll(async () => {
    await cleanup();
    await app.close();
  });

  // ---- Dashboard stats ----
  it('rejects unauthenticated stats requests', async () => {
    await request(app.getHttpServer()).get('/v1/dashboard/stats').expect(401);
  });

  it('counts seeded deliveries and drivers in the stats buckets', async () => {
    const res = await request(app.getHttpServer())
      .get('/v1/dashboard/stats')
      .set(auth('viewer'))
      .expect(200);
    const s = res.body as Stats;
    expect(s.deliveries.ready - baseline.deliveries.ready).toBe(2);
    expect(s.deliveries.draft - baseline.deliveries.draft).toBe(1);
    expect(s.deliveries.open - baseline.deliveries.open).toBe(3);
    expect(s.deliveries.atRisk - baseline.deliveries.atRisk).toBe(1);
    expect(s.deliveries.breached - baseline.deliveries.breached).toBe(1);
    expect(s.drivers.available - baseline.drivers.available).toBe(1);
    expect(s.drivers.total - baseline.drivers.total).toBe(1);
  });

  // ---- Global audit feed ----
  it('serves the global audit feed newest-first with entityId + actor', async () => {
    const created = await request(app.getHttpServer())
      .post('/v1/deliveries')
      .set(auth('dispatcher'))
      .send({
        reference: `${PREFIX}A1`,
        pickupAddress: '3 C St',
        dropoffAddress: '4 D St',
        zoneId,
        packageSize: PackageSize.small,
        packageWeight: 1,
        packageType: 'box',
        deadlineAt: new Date(Date.now() + 86_400_000).toISOString(),
      })
      .expect(201);
    const deliveryId = (created.body as { id: string }).id;

    const res = await request(app.getHttpServer())
      .get('/v1/audit?page=1&limit=10')
      .set(auth('viewer'))
      .expect(200);
    const body = res.body as {
      data: AuditEntry[];
      meta: { page: number; total: number };
    };
    expect(body.meta.page).toBe(1);
    const mine = body.data.find(
      (e) => e.action === 'delivery.created' && e.entityId === deliveryId,
    );
    expect(mine).toBeDefined();
    expect(mine!.entityType).toBe('Delivery');
    expect(mine!.actorName).toBe('DA dispatcher');
    expect(mine!.actorRole).toBe('dispatcher');

    // Newest-first: our just-written row must not be preceded by older rows.
    const idx = body.data.indexOf(mine!);
    for (let i = 0; i < idx; i += 1) {
      expect(new Date(body.data[i].createdAt).getTime()).toBeGreaterThanOrEqual(
        new Date(mine!.createdAt).getTime(),
      );
    }

    // The delivery-scoped timeline carries entityId too.
    const scoped = await request(app.getHttpServer())
      .get(`/v1/deliveries/${deliveryId}/audit`)
      .set(auth('viewer'))
      .expect(200);
    const scopedRows = (scoped.body as { data: AuditEntry[] }).data;
    expect(scopedRows[0].entityId).toBe(deliveryId);
  });

  // ---- Enriched DTOs ----
  it('exposes name + vehicle summary on drivers', async () => {
    const res = await request(app.getHttpServer())
      .get('/v1/drivers?limit=100')
      .set(auth('viewer'))
      .expect(200);
    const rows = (
      res.body as {
        data: Array<{
          userId: string;
          name: string;
          vehicle: {
            type: string;
            status: string;
            capacityWeight: number;
            capacityVolume: number;
          } | null;
        }>;
      }
    ).data;
    const mine = rows.find((d) => d.userId === userIds.driver);
    expect(mine).toBeDefined();
    expect(mine!.name).toBe('DA driver');
    expect(mine!.vehicle).toMatchObject({
      type: 'van',
      status: 'active',
      capacityWeight: 100,
      capacityVolume: 5,
    });
  });

  it('exposes the delivery summary on created assignments and history', async () => {
    const assigned = await request(app.getHttpServer())
      .post(`/v1/deliveries/${readyDeliveryId}/assignments`)
      .set(auth('dispatcher'))
      .send({ driverId: driverProfileId })
      .expect(201);
    expect(
      (assigned.body as { delivery: Record<string, unknown> }).delivery,
    ).toEqual({
      id: readyDeliveryId,
      reference: `${PREFIX}R1`,
      status: DeliveryStatus.assigned,
    });

    const history = await request(app.getHttpServer())
      .get(`/v1/drivers/${driverProfileId}/assignments`)
      .set(auth('viewer'))
      .expect(200);
    const rows = (
      history.body as {
        data: Array<{ delivery: { id: string; reference: string } }>;
      }
    ).data;
    expect(rows[0].delivery).toMatchObject({
      id: readyDeliveryId,
      reference: `${PREFIX}R1`,
    });
  });
});
