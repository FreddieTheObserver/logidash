/**
 * e2e env bootstrap. Provides safe defaults so the app module (which validates
 * env at boot) can start under Jest without a real .env or live infrastructure.
 * The placeholder DATABASE_URL only needs to satisfy schema validation — no
 * connection is made until the Prisma layer lands in Phase 2.
 */
process.env.NODE_ENV = 'test';
process.env.DATABASE_URL ??=
  'postgresql://logidash:logidash@localhost:5432/logidash_test';
process.env.JWT_SECRET ??= 'test-secret';
process.env.FRONTEND_ORIGIN ??= 'http://localhost:5173';
