import { writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { VersioningType } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';

/**
 * Emits openapi.json without starting the HTTP server or touching the
 * database: lifecycle hooks (and Prisma's $connect) only run on app.init(),
 * which is never called. Boot-time env validation still runs, so anything
 * required-but-irrelevant gets a placeholder. AppModule is imported
 * dynamically AFTER the placeholders are set.
 */
process.env.DATABASE_URL ??=
  'postgresql://placeholder:placeholder@localhost:5432/placeholder';
process.env.JWT_SECRET ??= 'openapi-generation-placeholder-secret-0000';
process.env.MAPS_PROVIDER ??= 'mock';

async function generate(): Promise<void> {
  const { AppModule } = await import('../app.module.js');
  const { createOpenApiDocument } = await import('./swagger.config.js');

  // abortOnError:false makes a bootstrap failure throw (catchable) instead of
  // calling process.exit silently; logger:false keeps the emitted output clean.
  const app = await NestFactory.create(AppModule, {
    logger: false,
    abortOnError: false,
  });
  // Mirror main.ts so emitted paths carry the /v1 prefix.
  app.enableVersioning({ type: VersioningType.URI, defaultVersion: '1' });

  const document = createOpenApiDocument(app);
  const outPath = join(process.cwd(), 'openapi.json');
  writeFileSync(outPath, JSON.stringify(document, null, 2) + '\n');
  await app.close();

  console.log(
    `openapi.json written: ${Object.keys(document.paths).length} paths`,
  );
}

void generate().catch((error: unknown) => {
  console.error(error);
  process.exitCode = 1;
});
