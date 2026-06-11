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
  Priority,
  Role,
  UserStatus,
  VehicleType,
} from './../src/generated/prisma/enums';
import { PrismaService } from './../src/prisma/prisma.service';

const PASSWORD = 'Demo123!';
const PREFIX = 'E2ERA-';
const EMAILS = {
  dispatcher: 'e2e.ra.dispatcher@logidash.test',
  viewer: 'e2e.ra.viewer@logidash.test',
  driverA: 'e2e.ra.driver.a@logidash.test',
  driverB: 'e2e.ra.driver.b@logidash.test',
  driverC: 'e2e.ra.driver.c@logidash.test',
};

type FactorRow = {
  factor: string;
  weight: number;
  rawValue: number;
  weighted: number;
  reason: string;
  degraded?: boolean;
};
type CandidateBody = {
  id: string;
  driverId: string;
  eligible: boolean;
  score: number;
  rank: number | null;
  explanation: FactorRow[];
  ineligibleReasons: string[] | null;
  driver: { id: string; name: string; vehicle: { id: string } | null };
};
type RunBody = {
  id: string;
  deliveryId: string;
  requestedByUserId: string;
  weights: Record<string, number>;
  candidates: CandidateBody[];
};
type ErrorBody = { statusCode: number; error: string; message: string };
type AssignmentBody = {
  id: string;
  deliveryId: string;
  driverId: string;
  vehicleId: string;
  status: string;
};
type PageBody<T> = { data: T[]; meta: { total: number } };

describe('Recommendations & Assignments (e2e)', () => {
  let app: INestApplication<App>;
  let prisma: PrismaService;
  const tokens: Record<string, string> = {};
  const userIds: Record<string, string> = {};
  let zoneAId = '';
  let zoneBId = '';
  let drvA = ''; // available van driver in zone A   → eligible, best
  let drvB = ''; // available car driver in zone B   → eligible, worse
  let drvC = ''; // busy bike driver in zone A       → ineligible ×3
  let vehA = '';
  let deliveryId = '';
  let firstRun: RunBody;

  const login = (email: string, password = PASSWORD) =>
    request(app.getHttpServer())
      .post('/v1/auth/login')
      .send({ email, password });
  const auth = (who: string) => ({ Authorization: `Bearer ${tokens[who]}` });
  const recsUrl = () => `/v1/deliveries/${deliveryId}/recommendations`;

  const cleanup = async () => {
    await prisma.auditLog.deleteMany({
      where: { actor: { email: { in: Object.values(EMAILS) } } },
    });
    // Deliveries cascade their runs, candidates, and assignments.
    await prisma.delivery.deleteMany({
      where: { reference: { startsWith: PREFIX } },
    });
    // Vehicles before profiles: deleting a profile nulls vehicle.driverId,
    // which would orphan the filter below.
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
    const roleOf = (who: string): Role =>
      who === 'dispatcher'
        ? Role.dispatcher
        : who === 'viewer'
          ? Role.viewer
          : Role.driver;
    for (const [who, email] of Object.entries(EMAILS)) {
      const u = await prisma.user.create({
        data: {
          email,
          name: who,
          role: roleOf(who),
          status: UserStatus.active,
          passwordHash,
        },
      });
      userIds[who] = u.id;
    }

    // Two zones with centers ~7 km apart (well inside the 15 km limits).
    const zoneA = await prisma.zone.create({
      data: {
        name: 'RA Zone A',
        code: `${PREFIX}A`,
        centerLat: 13.7563,
        centerLng: 100.5018,
      },
    });
    const zoneB = await prisma.zone.create({
      data: {
        name: 'RA Zone B',
        code: `${PREFIX}B`,
        centerLat: 13.8,
        centerLng: 100.55,
      },
    });
    zoneAId = zoneA.id;
    zoneBId = zoneB.id;

    const profA = await prisma.driverProfile.create({
      data: {
        userId: userIds.driverA,
        baseZoneId: zoneAId,
        availability: DriverAvailability.available,
        maxConcurrentJobs: 3,
      },
    });
    const profB = await prisma.driverProfile.create({
      data: {
        userId: userIds.driverB,
        baseZoneId: zoneBId,
        availability: DriverAvailability.available,
        maxConcurrentJobs: 3,
      },
    });
    const profC = await prisma.driverProfile.create({
      data: {
        userId: userIds.driverC,
        baseZoneId: zoneAId,
        availability: DriverAvailability.busy,
        maxConcurrentJobs: 2,
      },
    });
    drvA = profA.id;
    drvB = profB.id;
    drvC = profC.id;

    const vanA = await prisma.vehicle.create({
      data: {
        driverId: drvA,
        type: VehicleType.van,
        capacityWeight: 500,
        capacityVolume: 12,
      },
    });
    vehA = vanA.id;
    await prisma.vehicle.create({
      data: {
        driverId: drvB,
        type: VehicleType.car,
        capacityWeight: 150,
        capacityVolume: 4,
      },
    });
    await prisma.vehicle.create({
      data: {
        driverId: drvC,
        type: VehicleType.bike,
        capacityWeight: 15,
        capacityVolume: 0.5,
      },
    });

    // A ready, geocoded delivery in zone A: medium 18.5 kg, high priority.
    const delivery = await prisma.delivery.create({
      data: {
        reference: `${PREFIX}DEL-1`,
        pickupAddress: 'RA Pickup',
        pickupLat: 13.757,
        pickupLng: 100.503,
        dropoffAddress: 'RA Dropoff',
        dropoffLat: 13.76,
        dropoffLng: 100.51,
        zoneId: zoneAId,
        packageSize: PackageSize.medium,
        packageWeight: 18.5,
        packageType: 'retail',
        priority: Priority.high,
        deadlineAt: new Date(Date.now() + 6 * 3_600_000),
        status: DeliveryStatus.ready,
      },
    });
    deliveryId = delivery.id;

    for (const who of ['dispatcher', 'viewer', 'driverA'] as const) {
      const res = await login(EMAILS[who]).expect(200);
      tokens[who] = (res.body as { accessToken: string }).accessToken;
    }
  });

  afterAll(async () => {
    await cleanup();
    await app.close();
  });

  const findCandidate = (run: RunBody, driverId: string): CandidateBody => {
    const found = run.candidates.find((c) => c.driverId === driverId);
    if (!found) {
      throw new Error(`candidate ${driverId} missing from run ${run.id}`);
    }
    return found;
  };

  describe('recommendations — guards and empty states', () => {
    it('401s without a token', async () => {
      await request(app.getHttpServer()).get(recsUrl()).expect(401);
    });

    it('404s an unknown delivery', async () => {
      await request(app.getHttpServer())
        .get('/v1/deliveries/does-not-exist/recommendations')
        .set(auth('dispatcher'))
        .expect(404);
    });

    it('404s a viewer when no run exists yet (viewers never compute)', async () => {
      await request(app.getHttpServer())
        .get(recsUrl())
        .set(auth('viewer'))
        .expect(404);
    });

    it('403s refresh for viewer and driver roles', async () => {
      await request(app.getHttpServer())
        .get(`${recsUrl()}?refresh=true`)
        .set(auth('viewer'))
        .expect(403);
      await request(app.getHttpServer())
        .get(`${recsUrl()}?refresh=true`)
        .set(auth('driverA'))
        .expect(403);
    });
  });

  describe('recommendations — compute', () => {
    it('computes and persists a run for the dispatcher: ranked, explained, ineligible kept', async () => {
      const res = await request(app.getHttpServer())
        .get(recsUrl())
        .set(auth('dispatcher'))
        .expect(200);
      firstRun = res.body as RunBody;

      expect(firstRun.deliveryId).toBe(deliveryId);
      expect(firstRun.requestedByUserId).toBe(userIds.dispatcher);
      expect(firstRun.weights.zoneFit).toBe(0.3);

      const a = findCandidate(firstRun, drvA);
      const b = findCandidate(firstRun, drvB);
      const c = findCandidate(firstRun, drvC);

      // Eligible drivers are scored and ranked; same-zone van beats cross-zone car.
      expect(a.eligible).toBe(true);
      expect(b.eligible).toBe(true);
      expect(a.rank).not.toBeNull();
      expect(b.rank).not.toBeNull();
      expect(a.rank as number).toBeLessThan(b.rank as number);
      expect(a.score).toBeGreaterThan(b.score);
      expect(a.score).toBeGreaterThan(0);
      expect(a.score).toBeLessThanOrEqual(100);

      // Six factors, each with weight/rawValue/weighted/reason; sum = score.
      expect(a.explanation).toHaveLength(6);
      const factors = a.explanation.map((f) => f.factor);
      expect(factors).toEqual([
        'zoneFit',
        'routeProximity',
        'remainingCapacity',
        'workloadBalance',
        'deadlineFit',
        'priorityFit',
      ]);
      const sum = a.explanation.reduce((s, f) => s + f.weighted, 0);
      expect(Math.abs(sum - a.score)).toBeLessThan(0.01);
      const zone = a.explanation[0];
      expect(zone.rawValue).toBe(1); // same zone
      expect(typeof zone.reason).toBe('string');

      // Ineligible driver kept with every failing reason.
      expect(c.eligible).toBe(false);
      expect(c.rank).toBeNull();
      expect(c.score).toBe(0);
      const reasons = c.ineligibleReasons ?? [];
      expect(reasons).toContain('Availability is busy (must be available).');
      expect(reasons).toContain('A bike cannot carry medium packages.');
      expect(
        reasons.some((r) => r.startsWith('Insufficient remaining capacity')),
      ).toBe(true);

      // Driver summary is embedded for the UI cards.
      expect(a.driver.name).toBe('driverA');
      expect(a.driver.vehicle?.id).toBe(vehA);
    });

    it('serves the persisted run to a viewer without recomputing', async () => {
      const res = await request(app.getHttpServer())
        .get(recsUrl())
        .set(auth('viewer'))
        .expect(200);
      const body = res.body as RunBody;
      expect(body.id).toBe(firstRun.id);
    });

    it('refresh creates a new run with identical time-independent factor values', async () => {
      const res = await request(app.getHttpServer())
        .get(`${recsUrl()}?refresh=true`)
        .set(auth('dispatcher'))
        .expect(200);
      const second = res.body as RunBody;
      expect(second.id).not.toBe(firstRun.id);

      for (const driverId of [drvA, drvB]) {
        const before = findCandidate(firstRun, driverId);
        const after = findCandidate(second, driverId);
        // deadlineFit depends on wall-clock `now`; everything else must match.
        const timeless = (rows: FactorRow[]) =>
          rows
            .filter((f) => f.factor !== 'deadlineFit')
            .map((f) => [f.factor, f.rawValue, f.weighted, f.reason]);
        expect(timeless(after.explanation)).toEqual(
          timeless(before.explanation),
        );
        expect(Math.abs(after.score - before.score)).toBeLessThan(1);
      }
    });

    it('wrote a recommendation.run_created audit row for the delivery', async () => {
      const rows = await prisma.auditLog.findMany({
        where: {
          action: 'recommendation.run_created',
          entityType: 'Delivery',
          entityId: deliveryId,
          actorUserId: userIds.dispatcher,
        },
      });
      expect(rows.length).toBeGreaterThanOrEqual(2); // initial + refresh
    });
  });

  describe('assignments', () => {
    const assignUrl = () => `/v1/deliveries/${deliveryId}/assignments`;

    it('403s viewer and driver on create (roles guard)', async () => {
      await request(app.getHttpServer())
        .post(assignUrl())
        .set(auth('viewer'))
        .send({ driverId: drvA })
        .expect(403);
      await request(app.getHttpServer())
        .post(assignUrl())
        .set(auth('driverA'))
        .send({ driverId: drvA })
        .expect(403);
    });

    it('400s a body without driverId (validation details)', async () => {
      const res = await request(app.getHttpServer())
        .post(assignUrl())
        .set(auth('dispatcher'))
        .send({})
        .expect(400);
      const body = res.body as ErrorBody & { details?: string[] };
      expect(body.message).toBe('Validation failed');
      expect(Array.isArray(body.details)).toBe(true);
    });

    it('404s an unknown delivery and an unknown driver', async () => {
      await request(app.getHttpServer())
        .post('/v1/deliveries/does-not-exist/assignments')
        .set(auth('dispatcher'))
        .send({ driverId: drvA })
        .expect(404);
      await request(app.getHttpServer())
        .post(assignUrl())
        .set(auth('dispatcher'))
        .send({ driverId: 'does-not-exist' })
        .expect(404);
    });

    it('409s an ineligible driver with the reasons in the message', async () => {
      const res = await request(app.getHttpServer())
        .post(assignUrl())
        .set(auth('dispatcher'))
        .send({ driverId: drvC })
        .expect(409);
      const body = res.body as ErrorBody;
      expect(body.message).toContain('not eligible');
      expect(body.message).toContain('Availability is busy');
    });

    it('assigns the top driver: 201, delivery → assigned, workload bumped, audited twice', async () => {
      const res = await request(app.getHttpServer())
        .post(assignUrl())
        .set(auth('dispatcher'))
        .send({ driverId: drvA, reason: 'top pick' })
        .expect(201);
      const body = res.body as AssignmentBody;
      expect(body.deliveryId).toBe(deliveryId);
      expect(body.driverId).toBe(drvA);
      expect(body.vehicleId).toBe(vehA);
      expect(body.status).toBe('active');

      const del = await request(app.getHttpServer())
        .get(`/v1/deliveries/${deliveryId}`)
        .set(auth('dispatcher'))
        .expect(200);
      expect((del.body as { status: string }).status).toBe('assigned');

      const drv = await request(app.getHttpServer())
        .get(`/v1/drivers/${drvA}`)
        .set(auth('dispatcher'))
        .expect(200);
      expect((drv.body as { activeJobCount: number }).activeJobCount).toBe(1);

      const created = await prisma.auditLog.findMany({
        where: { action: 'assignment.created', entityId: body.id },
      });
      expect(created).toHaveLength(1);
      const statusRows = await prisma.auditLog.findMany({
        where: {
          action: 'delivery.status_changed',
          entityId: deliveryId,
          actorUserId: userIds.dispatcher,
        },
      });
      expect(statusRows.length).toBeGreaterThanOrEqual(1);
    });

    it('409s a second assignment (delivery no longer ready)', async () => {
      await request(app.getHttpServer())
        .post(assignUrl())
        .set(auth('dispatcher'))
        .send({ driverId: drvB })
        .expect(409);
    });

    it('409s refresh on the now-assigned delivery but still serves the latest run', async () => {
      await request(app.getHttpServer())
        .get(`${recsUrl()}?refresh=true`)
        .set(auth('dispatcher'))
        .expect(409);
      await request(app.getHttpServer())
        .get(recsUrl())
        .set(auth('viewer'))
        .expect(200);
    });

    it('lists assignment history per delivery and per driver (paginated)', async () => {
      const byDelivery = await request(app.getHttpServer())
        .get(assignUrl())
        .set(auth('viewer'))
        .expect(200);
      const delPage = byDelivery.body as PageBody<AssignmentBody>;
      expect(delPage.meta.total).toBe(1);
      expect(delPage.data[0].driverId).toBe(drvA);

      const byDriver = await request(app.getHttpServer())
        .get(`/v1/drivers/${drvA}/assignments`)
        .set(auth('driverA'))
        .expect(200);
      const drvPage = byDriver.body as PageBody<AssignmentBody>;
      expect(drvPage.meta.total).toBeGreaterThanOrEqual(1);
      expect(drvPage.data.some((a) => a.deliveryId === deliveryId)).toBe(true);
    });
  });
});
