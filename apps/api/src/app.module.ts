import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { APP_FILTER, APP_GUARD } from '@nestjs/core';
import { ThrottlerGuard, ThrottlerModule } from '@nestjs/throttler';
import { AllExceptionsFilter } from './common/filters/all-exceptions.filter';
import { validateEnv } from './config/env.validation';
import { HealthModule } from './health/health.module';
import { AuditModule } from './modules/audit/audit.module';
import { AuthModule } from './modules/auth/auth.module';
import { DeliveriesModule } from './modules/deliveries/deliveries.module';
import { DriversModule } from './modules/drivers/drivers.module';
import { MapsModule } from './modules/maps/maps.module';
import { UsersModule } from './modules/users/users.module';
import { VehiclesModule } from './modules/vehicles/vehicles.module';
import { ZonesModule } from './modules/zones/zones.module';
import { PrismaModule } from './prisma/prisma.module';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      validate: validateEnv,
    }),
    // Baseline abuse protection: cap requests per IP. Stricter per-route limits
    // (e.g. auth) are applied with @Throttle on the controllers. Skipped under
    // tests so the e2e suites' rapid logins don't trip a 429.
    ThrottlerModule.forRoot({
      throttlers: [{ ttl: 60_000, limit: 100 }],
      skipIf: () => process.env.NODE_ENV === 'test',
    }),
    PrismaModule,
    AuditModule,
    AuthModule,
    DeliveriesModule,
    DriversModule,
    MapsModule,
    UsersModule,
    ZonesModule,
    VehiclesModule,
    HealthModule,
  ],
  providers: [
    { provide: APP_FILTER, useClass: AllExceptionsFilter },
    // Rate limiting runs as a global guard alongside the auth guards (registered
    // in AuthModule); it protects public routes (e.g. login) too.
    { provide: APP_GUARD, useClass: ThrottlerGuard },
  ],
})
export class AppModule {}
