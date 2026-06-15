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
import { PackageSize, Role, UserStatus } from './../src/generated/prisma/enums';
import { PrismaService } from './../src/prisma/prisma.service';

const PASSWORD = 'Demo123!';
const PREFIX = 'E2EMG-';
const DISPATCHER_EMAIL = 'e2e.mg.dispatcher@logidash.test';

// Mock provider's demo area: a 0.15° box around Bangkok's city center.
const CENTER = { lat: 13.7563, lng: 100.5018 };
const SPREAD = 0.15;

interface DeliveryBody {
  id: string;
  pickupLat: number | null;
  pickupLng: number | null;
  dropoffLat: number | null;
  dropoffLng: number | null;
}

describe('Maps geocoding of deliveries (e2e)', () => {
  let app: INestApplication<App>;
  let prisma: PrismaService;
  let token = '';
  let zoneId = '';

  const auth = () => ({ Authorization: `Bearer ${token}` });

  const createDelivery = (
    reference: string,
    pickupAddress: string,
    dropoffAddress: string,
  ) =>
    request(app.getHttpServer())
      .post('/v1/deliveries')
      .set(auth())
      .send({
        reference,
        pickupAddress,
        dropoffAddress,
        zoneId,
        packageSize: PackageSize.small,
        packageWeight: 2,
        packageType: 'box',
        deadlineAt: new Date(Date.now() + 86_400_000).toISOString(),
      });

  const cleanup = async () => {
    // delivery.created (and any status-change) rows audit the actor, so remove
    // them before the user or the FK reference would orphan.
    await prisma.auditLog.deleteMany({
      where: { actor: { email: DISPATCHER_EMAIL } },
    });
    await prisma.delivery.deleteMany({
      where: { reference: { startsWith: PREFIX } },
    });
    await prisma.zone.deleteMany({ where: { code: { startsWith: PREFIX } } });
    await prisma.user.deleteMany({ where: { email: DISPATCHER_EMAIL } });
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
    await prisma.user.create({
      data: {
        email: DISPATCHER_EMAIL,
        name: 'mg dispatcher',
        role: Role.dispatcher,
        status: UserStatus.active,
        passwordHash: await argon2.hash(PASSWORD),
      },
    });
    const zone = await prisma.zone.create({
      data: { name: 'MG Zone', code: `${PREFIX}Z` },
    });
    zoneId = zone.id;

    const res = await request(app.getHttpServer())
      .post('/v1/auth/login')
      .send({ email: DISPATCHER_EMAIL, password: PASSWORD })
      .expect(200);
    token = (res.body as { accessToken: string }).accessToken;
  });

  afterAll(async () => {
    await cleanup();
    await app.close();
  });

  it('create fills pickup/dropoff coordinates inside the mock demo area', async () => {
    const res = await createDelivery(
      `${PREFIX}C1`,
      '123 Main Street',
      '456 Other Avenue',
    ).expect(201);
    const body = res.body as DeliveryBody;

    for (const [lat, lng] of [
      [body.pickupLat, body.pickupLng],
      [body.dropoffLat, body.dropoffLng],
    ]) {
      expect(typeof lat).toBe('number');
      expect(typeof lng).toBe('number');
      expect(lat!).toBeGreaterThanOrEqual(CENTER.lat - SPREAD);
      expect(lat!).toBeLessThanOrEqual(CENTER.lat + SPREAD);
      expect(lng!).toBeGreaterThanOrEqual(CENTER.lng - SPREAD);
      expect(lng!).toBeLessThanOrEqual(CENTER.lng + SPREAD);
    }
    // Different addresses geocode to different points.
    expect([body.pickupLat, body.pickupLng]).not.toEqual([
      body.dropoffLat,
      body.dropoffLng,
    ]);
  });

  it('geocoding is deterministic: identical addresses yield identical coords', async () => {
    const first = await createDelivery(
      `${PREFIX}D1`,
      '99 Warehouse Road',
      '7 Depot Lane',
    ).expect(201);
    const second = await createDelivery(
      `${PREFIX}D2`,
      '99 Warehouse Road',
      '7 Depot Lane',
    ).expect(201);
    const a = first.body as DeliveryBody;
    const b = second.body as DeliveryBody;

    expect(a.pickupLat).toBe(b.pickupLat);
    expect(a.pickupLng).toBe(b.pickupLng);
    expect(a.dropoffLat).toBe(b.dropoffLat);
    expect(a.dropoffLng).toBe(b.dropoffLng);
  });

  it('update re-geocodes the changed pickup address and leaves dropoff coords intact', async () => {
    const created = await createDelivery(
      `${PREFIX}U1`,
      'Old Pickup Plaza',
      'Steady Dropoff Street',
    ).expect(201);
    const before = created.body as DeliveryBody;

    const updated = await request(app.getHttpServer())
      .patch(`/v1/deliveries/${before.id}`)
      .set(auth())
      .send({ pickupAddress: 'Brand New Pickup Point' })
      .expect(200);
    const after = updated.body as DeliveryBody;

    expect([after.pickupLat, after.pickupLng]).not.toEqual([
      before.pickupLat,
      before.pickupLng,
    ]);
    expect(after.dropoffLat).toBe(before.dropoffLat);
    expect(after.dropoffLng).toBe(before.dropoffLng);
  });
});
