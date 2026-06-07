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
  PackageSize,
  Role,
  UserStatus,
  VehicleType,
} from './../src/generated/prisma/enums';
import { PrismaService } from './../src/prisma/prisma.service';

const PASSWORD = 'Demo123!';
const EMAILS = {
  admin: 'e2e.zv.admin@logidash.test',
  dispatcher: 'e2e.zv.dispatcher@logidash.test',
  driver: 'e2e.zv.driver@logidash.test',
  viewer: 'e2e.zv.viewer@logidash.test',
};
const CODE_PREFIX = 'E2EZV-';
const DELIVERY_REF = 'E2EZV-DEL-1';

describe('Zones & Vehicles (e2e)', () => {
  let app: INestApplication<App>;
  let prisma: PrismaService;
  const tokens: Record<string, string> = {};

  const login = (email: string, password = PASSWORD) =>
    request(app.getHttpServer())
      .post('/v1/auth/login')
      .send({ email, password });

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

    // Clean any leftovers from a prior failed run.
    await prisma.delivery.deleteMany({
      where: { reference: { startsWith: 'E2EZV-' } },
    });
    await prisma.zone.deleteMany({
      where: { code: { startsWith: CODE_PREFIX } },
    });
    await prisma.user.deleteMany({
      where: { email: { in: Object.values(EMAILS) } },
    });

    const passwordHash = await argon2.hash(PASSWORD);
    await prisma.user.createMany({
      data: [
        {
          email: EMAILS.admin,
          name: 'A',
          role: Role.admin,
          status: UserStatus.active,
          passwordHash,
        },
        {
          email: EMAILS.dispatcher,
          name: 'D',
          role: Role.dispatcher,
          status: UserStatus.active,
          passwordHash,
        },
        {
          email: EMAILS.driver,
          name: 'Dr',
          role: Role.driver,
          status: UserStatus.active,
          passwordHash,
        },
        {
          email: EMAILS.viewer,
          name: 'V',
          role: Role.viewer,
          status: UserStatus.active,
          passwordHash,
        },
      ],
    });

    for (const [role, email] of Object.entries(EMAILS)) {
      const res = await login(email).expect(200);
      tokens[role] = (res.body as { accessToken: string }).accessToken;
    }
  });

  afterAll(async () => {
    await prisma.delivery.deleteMany({
      where: { reference: { startsWith: 'E2EZV-' } },
    });
    await prisma.zone.deleteMany({
      where: { code: { startsWith: CODE_PREFIX } },
    });
    await prisma.user.deleteMany({
      where: { email: { in: Object.values(EMAILS) } },
    });
    await app.close();
  });

  const auth = (role: string) => ({ Authorization: `Bearer ${tokens[role]}` });

  it('rejects an unauthenticated list with 401', async () => {
    await request(app.getHttpServer()).get('/v1/zones').expect(401);
  });

  it('un-versioned /zones is 404 (versioning enforced)', async () => {
    await request(app.getHttpServer())
      .get('/zones')
      .set(auth('admin'))
      .expect(404);
  });

  it('dispatcher can create a zone; driver and viewer get 403', async () => {
    await request(app.getHttpServer())
      .post('/v1/zones')
      .set(auth('dispatcher'))
      .send({ name: 'E2E Zone A', code: `${CODE_PREFIX}A` })
      .expect(201);

    await request(app.getHttpServer())
      .post('/v1/zones')
      .set(auth('driver'))
      .send({ name: 'Nope', code: `${CODE_PREFIX}X` })
      .expect(403);

    await request(app.getHttpServer())
      .post('/v1/zones')
      .set(auth('viewer'))
      .send({ name: 'Nope', code: `${CODE_PREFIX}Y` })
      .expect(403);
  });

  it('list returns the paginated envelope', async () => {
    const res = await request(app.getHttpServer())
      .get('/v1/zones?page=1&limit=5')
      .set(auth('viewer'))
      .expect(200);
    const body = res.body as {
      data: unknown[];
      meta: { page: number; limit: number; total: number; totalPages: number };
    };
    expect(Array.isArray(body.data)).toBe(true);
    expect(body.meta.page).toBe(1);
    expect(body.meta.limit).toBe(5);
    expect(typeof body.meta.total).toBe('number');
    expect(typeof body.meta.totalPages).toBe('number');
  });

  it('duplicate zone code returns a 409 with the standard error envelope', async () => {
    const res = await request(app.getHttpServer())
      .post('/v1/zones')
      .set(auth('admin'))
      .send({ name: 'Dup', code: `${CODE_PREFIX}A` })
      .expect(409);
    const body = res.body as {
      statusCode: number;
      error: string;
      message: string;
    };
    expect(body.statusCode).toBe(409);
    expect(typeof body.error).toBe('string');
    expect(typeof body.message).toBe('string');
  });

  it('invalid zone body returns 400 with a details array', async () => {
    const res = await request(app.getHttpServer())
      .post('/v1/zones')
      .set(auth('admin'))
      .send({ code: `${CODE_PREFIX}NONAME` }) // missing name
      .expect(400);
    expect(res.body).toMatchObject({ statusCode: 400 });
    expect(Array.isArray((res.body as { details?: unknown }).details)).toBe(
      true,
    );
  });

  it('deleting a zone referenced by a delivery returns 409', async () => {
    const created = await request(app.getHttpServer())
      .post('/v1/zones')
      .set(auth('admin'))
      .send({ name: 'Referenced', code: `${CODE_PREFIX}REF` })
      .expect(201);
    const zoneId = (created.body as { id: string }).id;

    await prisma.delivery.create({
      data: {
        reference: DELIVERY_REF,
        pickupAddress: '1 A St',
        dropoffAddress: '2 B St',
        zoneId,
        packageSize: PackageSize.small,
        packageWeight: 1,
        packageType: 'box',
        deadlineAt: new Date(Date.now() + 86_400_000),
      },
    });

    await request(app.getHttpServer())
      .delete(`/v1/zones/${zoneId}`)
      .set(auth('admin'))
      .expect(409);
  });

  it('dispatcher can create a vehicle; viewer gets 403; list is paginated', async () => {
    await request(app.getHttpServer())
      .post('/v1/vehicles')
      .set(auth('dispatcher'))
      .send({ type: VehicleType.van, capacityWeight: 1000, capacityVolume: 8 })
      .expect(201);

    await request(app.getHttpServer())
      .post('/v1/vehicles')
      .set(auth('viewer'))
      .send({ type: VehicleType.bike, capacityWeight: 5, capacityVolume: 0.1 })
      .expect(403);

    const res = await request(app.getHttpServer())
      .get('/v1/vehicles')
      .set(auth('viewer'))
      .expect(200);
    expect(Array.isArray((res.body as { data: unknown[] }).data)).toBe(true);
  });
});
