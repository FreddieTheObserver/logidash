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
import { Role, UserStatus } from './../src/generated/prisma/enums';
import { PrismaService } from './../src/prisma/prisma.service';

const PASSWORD = 'Demo123!';
const EMAILS = {
  admin: 'e2e.admin@logidash.test',
  dispatcher: 'e2e.dispatcher@logidash.test',
  driver: 'e2e.driver@logidash.test',
  viewer: 'e2e.viewer@logidash.test',
};

describe('Auth & roles (e2e)', () => {
  let app: INestApplication<App>;
  let prisma: PrismaService;

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleFixture.createNestApplication();
    app.enableVersioning({
      type: VersioningType.URI,
      defaultVersion: '1',
    });
    app.useGlobalPipes(
      new ValidationPipe({
        whitelist: true,
        forbidNonWhitelisted: true,
        transform: true,
      }),
    );
    await app.init();

    prisma = app.get(PrismaService);
    const passwordHash = await argon2.hash(PASSWORD);
    await prisma.user.deleteMany({
      where: { email: { in: Object.values(EMAILS) } },
    });
    await prisma.user.createMany({
      data: [
        {
          email: EMAILS.admin,
          name: 'E2E Admin',
          role: Role.admin,
          status: UserStatus.active,
          passwordHash,
        },
        {
          email: EMAILS.dispatcher,
          name: 'E2E Dispatcher',
          role: Role.dispatcher,
          status: UserStatus.active,
          passwordHash,
        },
        {
          email: EMAILS.driver,
          name: 'E2E Driver',
          role: Role.driver,
          status: UserStatus.active,
          passwordHash,
        },
        {
          email: EMAILS.viewer,
          name: 'E2E Viewer',
          role: Role.viewer,
          status: UserStatus.active,
          passwordHash,
        },
      ],
    });
  });

  afterAll(async () => {
    await prisma.user.deleteMany({
      where: { email: { in: Object.values(EMAILS) } },
    });
    await app.close();
  });

  const login = (email: string, password = PASSWORD) =>
    request(app.getHttpServer())
      .post('/v1/auth/login')
      .send({ email, password });

  it('GET /health is public (200 without a token)', async () => {
    await request(app.getHttpServer()).get('/health').expect(200);
  });

  it('GET /auth/me without a token is 401', async () => {
    await request(app.getHttpServer()).get('/v1/auth/me').expect(401);
  });

  it('un-versioned business route is 404 (versioning is enforced)', async () => {
    await request(app.getHttpServer()).get('/auth/me').expect(404);
  });

  it('login with bad password is 401', async () => {
    await login(EMAILS.admin, 'wrong').expect(401);
  });

  it('login succeeds and /auth/me returns the role', async () => {
    const res = await login(EMAILS.admin).expect(200);
    const { accessToken } = res.body as { accessToken: string };
    const me = await request(app.getHttpServer())
      .get('/v1/auth/me')
      .set('Authorization', `Bearer ${accessToken}`)
      .expect(200);
    expect((me.body as { role: string }).role).toBe('admin');
  });

  it('admin can list users; other roles get 403', async () => {
    const tokens: Record<string, string> = {};
    for (const [role, email] of Object.entries(EMAILS)) {
      const res = await login(email).expect(200);
      tokens[role] = (res.body as { accessToken: string }).accessToken;
    }
    await request(app.getHttpServer())
      .get('/v1/users')
      .set('Authorization', `Bearer ${tokens.admin}`)
      .expect(200);
    for (const role of ['dispatcher', 'driver', 'viewer']) {
      await request(app.getHttpServer())
        .get('/v1/users')
        .set('Authorization', `Bearer ${tokens[role]}`)
        .expect(403);
    }
  });

  it('refresh rotates tokens and the old refresh token is rejected (reuse → 401)', async () => {
    const res = await login(EMAILS.dispatcher).expect(200);
    const { refreshToken } = res.body as { refreshToken: string };

    const rotated = await request(app.getHttpServer())
      .post('/v1/auth/refresh')
      .send({ refreshToken })
      .expect(200);
    expect((rotated.body as { refreshToken: string }).refreshToken).not.toBe(
      refreshToken,
    );

    // Presenting the now-revoked original token must fail.
    await request(app.getHttpServer())
      .post('/v1/auth/refresh')
      .send({ refreshToken })
      .expect(401);
  });

  it('logout revokes the refresh token', async () => {
    const res = await login(EMAILS.viewer).expect(200);
    const { refreshToken } = res.body as { refreshToken: string };
    await request(app.getHttpServer())
      .post('/v1/auth/logout')
      .send({ refreshToken })
      .expect(204);
    await request(app.getHttpServer())
      .post('/v1/auth/refresh')
      .send({ refreshToken })
      .expect(401);
  });
});
