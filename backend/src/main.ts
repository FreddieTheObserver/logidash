import { Logger, ValidationPipe } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import type { Env } from './config/env.validation';

async function bootstrap(): Promise<void> {
  const app = await NestFactory.create(AppModule);
  const config = app.get<ConfigService<Env, true>>(ConfigService);

  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
    }),
  );

  app.enableCors({
    origin: config.get('FRONTEND_ORIGIN', { infer: true }),
    credentials: true,
  });

  const port = config.get('PORT', { infer: true });
  await app.listen(port);
  Logger.log(`logidash API listening on http://localhost:${port}`, 'Bootstrap');
}

void bootstrap();
