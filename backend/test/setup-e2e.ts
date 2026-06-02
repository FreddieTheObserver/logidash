/**
 * e2e env bootstrap. Provides safe defaults so the app module (which validates
 * env at boot) can start under Jest. Since Phase 2, AppModule wires PrismaModule
 * and PrismaService.onModuleInit calls `$connect()`, so the default points at the
 * Docker Postgres (docker-compose maps host port 5433). Set DATABASE_URL in the
 * environment to override (e.g. a dedicated test database in CI).
 */
process.env.NODE_ENV = 'test';
process.env.DATABASE_URL ??=
  'postgresql://logidash:logidash@localhost:5433/logidash';
process.env.JWT_SECRET ??= 'test-secret';
process.env.FRONTEND_ORIGIN ??= 'http://localhost:5173';
