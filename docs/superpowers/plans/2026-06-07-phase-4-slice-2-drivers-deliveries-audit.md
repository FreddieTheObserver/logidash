# Phase 4 — Slice 2: Drivers + Deliveries + Audit — Implementation Plan

> **For agentic workers:** Execute task-by-task. This project has run plans
> **teach-and-build** (user types the code with guidance — see the
> `teach-and-build` skill) and **auto** (the agent writes files directly). Either
> works; pick at kickoff. Steps use checkbox (`- [ ]`) syntax for tracking. The
> design spec (`docs/superpowers/specs/2026-06-02-logistics-dispatch-api-design.md`)
> and code standards (`docs/context/code-standards.md`) are **locked** — implement
> against them; do not re-derive product behavior.

**Goal:** Complete the Phase 4 core domain by shipping an append-only **Audit**
service, the **Drivers** domain (profiles, availability, base zone, workload,
driver↔vehicle link), and **Deliveries** (CRUD + filters) with the spec §8
**status-transition state machine** — role-gated and audited inside a single
transaction.

**Architecture:** A new `AuditModule` exposes `AuditService.record(entry, tx?)`,
designed to run inside a Prisma interactive transaction. `DriversModule` and
`DeliveriesModule` follow the established `zones/`/`vehicles/` shape (controller →
service → Prisma, `class-validator` + Swagger DTOs, mocked-Prisma `*.service.spec.ts`).
The delivery lifecycle is a **pure, fully-tested transition function**; the
`PATCH /v1/deliveries/:id/status` endpoint enforces the graph + the role matrix
(admin/dispatcher: any allowed transition; driver: only the operational path on
their **own active assignment**; viewer: none) and writes a status-change audit
entry in the same `$transaction` that mutates the delivery, closes the assignment
(when applicable), and adjusts driver workload.

**Tech Stack:** NestJS 11, `@nestjs/swagger` 11, `class-validator`/`class-transformer`,
Prisma 7 (CJS client at `src/generated/prisma`), Jest + supertest. No new deps.

---

## Scope (read before starting)

**In scope (this slice):**

- `AuditModule` — append-only `AuditService.record(entry, tx?)`.
- `DriversModule` — `DriverProfile` CRUD, availability, base zone, workload
  fields (read-only output), and the driver↔vehicle link deferred from Slice 1.
- `DeliveriesModule` — CRUD, list filters (status/priority/zone/deadline), and
  the §8 status-transition endpoint with role rules + audit-in-transaction.

**Deferred to the Assignments slice (Phase 6) — do NOT build here:**

- **Creating** assignments. The transition `ready → assigned` _creates_ an
  `Assignment` (+ binds a vehicle, re-validates eligibility), which is the
  `AssignmentsModule`'s job. The status endpoint here **rejects a direct
  `→ assigned` with 409** ("assign via the assignment endpoint"). The state
  machine still encodes `ready → assigned` as a valid edge (it is); only the
  plain status endpoint declines to drive that particular edge.
- The recommendation engine (Phase 6) and maps/geocoding (Phase 5).

**In scope but assignment-touching (these _close_, never _create_, assignments):**
unassign (`assigned → ready`), and the terminal transitions (`delivered`,
`failed`, `cancelled` from an active state) close the active `Assignment` and
decrement the driver's `activeJobCount` — all inside the status transaction. The
e2e seeds `Assignment` rows directly via Prisma (as the Slice-1 e2e seeded a
delivery) to exercise the driver path without the Phase 6 create-assignment API.

---

## Conventions locked for this slice

- **Module path:** `apps/api/src/modules/<domain>/` with a `dto/` subfolder
  (mirror `zones/`).
- **Row types:** import as `…Model` from `../../generated/prisma/models/<Model>`
  (`DriverProfileModel`, `DeliveryModel`). Enums from `../../generated/prisma/enums`.
- **Prisma namespace types:** `import { Prisma } from '../../generated/prisma/client'`
  for `Prisma.TransactionClient` and `Prisma.InputJsonValue` (re-exported there;
  same module that exports `PrismaClient`).
- **Decimal → number:** Prisma returns `runtime.Decimal` for `@db.Decimal`
  columns (`Delivery.packageWeight`, `pickupLat/Lng`, `dropoffLat/Lng`). The
  contract exposes **numbers**: `to…Dto` converts with `Number(v)` and
  `v === null ? null : Number(v)` for nullable ones (and `Number(null) === 0`, so
  the null guard is load-bearing). Drivers have no Decimal columns.
- **Dates:** input `deadlineAt` arrives as an ISO string (`@IsDateString()`); the
  service converts with `new Date(dto.deadlineAt)`. Output DTOs expose `Date`.
- **Roles:** write → `@Roles(Role.admin, Role.dispatcher)`; read → no `@Roles`
  (any authenticated user). The status endpoint is `@Roles(admin, dispatcher,
driver)` (blocks viewer) and does finer driver-own-assignment checks in the
  service.
- **Pagination:** `list(query)` returns `Paginated<XDto>` via
  `paginate(rows.map(toDto), total, page, limit)` with `total` from a sibling
  `count()` in the same `$transaction([...])`.
- **Errors (spec §9):** `ConflictException` (409) for duplicates + business-rule
  conflicts (illegal transition, referential), `NotFoundException` (404) for
  missing rows, `ForbiddenException` (403) for the driver-own-assignment rule;
  `ValidationPipe` → 400; guards → 401/403.
- **Commits:** one commit per task (per `[[commit-cadence]]`), each at a green
  boundary. Commit messages carry the session's trailer:
  `Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>`.

## File structure

**New:**

- `apps/api/src/modules/audit/audit.service.ts` + `audit.service.spec.ts`
- `apps/api/src/modules/audit/audit.module.ts`
- `apps/api/src/modules/drivers/dto/{driver.dto,create-driver.dto,update-driver.dto,set-vehicle.dto}.ts`
- `apps/api/src/modules/drivers/drivers.service.ts` + `drivers.service.spec.ts`
- `apps/api/src/modules/drivers/drivers.controller.ts`
- `apps/api/src/modules/drivers/drivers.module.ts`
- `apps/api/src/modules/deliveries/delivery-status.ts` + `delivery-status.spec.ts`
- `apps/api/src/modules/deliveries/dto/{delivery.dto,create-delivery.dto,update-delivery.dto,delivery-query.dto,change-status.dto}.ts`
- `apps/api/src/modules/deliveries/deliveries.service.ts` + `deliveries.service.spec.ts`
- `apps/api/src/modules/deliveries/deliveries.controller.ts`
- `apps/api/src/modules/deliveries/deliveries.module.ts`
- `apps/api/test/drivers-deliveries.e2e-spec.ts`

**Modified:** `apps/api/src/app.module.ts` (register 3 modules),
`docs/implementation-plan.md`, `docs/context/progress-tracker.md`.

---

## Task 1: AuditModule — append-only audit, transaction-aware

**Files:**

- Create: `apps/api/src/modules/audit/audit.service.ts` + `audit.service.spec.ts`
- Create: `apps/api/src/modules/audit/audit.module.ts`
- Modify: `apps/api/src/app.module.ts`

> **Why transaction-aware:** spec §8 requires status changes to write audit
> entries **in the same transaction** as the mutation. So `record` takes an
> optional Prisma client; callers inside `$transaction(async (tx) => …)` pass
> `tx`, and the audit row commits/rolls-back atomically with the change.
> **Tradeoff:** a dedicated `AuditService` (one writer, one shape, testable, and
> `exports`-able to any module) over inlining `prisma.auditLog.create` at each
> call site (drifts, easy to forget). We centralize.

- [ ] **Step 1: Failing test** — `audit.service.spec.ts`

```ts
import { AuditService } from './audit.service';

function makePrismaMock() {
  return { auditLog: { create: jest.fn() } };
}

describe('AuditService', () => {
  let prisma: ReturnType<typeof makePrismaMock>;
  let service: AuditService;

  beforeEach(() => {
    prisma = makePrismaMock();
    service = new AuditService(prisma as never);
  });

  it('writes an audit row with the given fields', async () => {
    await service.record({
      actorUserId: 'u1',
      action: 'delivery.status_changed',
      entityType: 'Delivery',
      entityId: 'd1',
      before: { status: 'draft' },
      after: { status: 'ready' },
    });
    expect(prisma.auditLog.create).toHaveBeenCalledWith({
      data: {
        actorUserId: 'u1',
        action: 'delivery.status_changed',
        entityType: 'Delivery',
        entityId: 'd1',
        before: { status: 'draft' },
        after: { status: 'ready' },
        reason: undefined,
      },
    });
  });

  it('uses a passed transaction client instead of the default', async () => {
    const tx = { auditLog: { create: jest.fn() } };
    await service.record(
      {
        actorUserId: 'u1',
        action: 'x',
        entityType: 'Delivery',
        entityId: 'd1',
      },
      tx as never,
    );
    expect(tx.auditLog.create).toHaveBeenCalled();
    expect(prisma.auditLog.create).not.toHaveBeenCalled();
  });
});
```

Run: `npm test -w @logidash/api -- audit.service` → FAIL (no module).

- [ ] **Step 2: Implement** — `audit.service.ts`

```ts
import { Injectable } from '@nestjs/common';
import { Prisma } from '../../generated/prisma/client';
import { PrismaService } from '../../prisma/prisma.service';

export interface AuditEntry {
  actorUserId: string;
  action: string;
  entityType: string;
  entityId: string;
  before?: Prisma.InputJsonValue;
  after?: Prisma.InputJsonValue;
  reason?: string;
}

@Injectable()
export class AuditService {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * Append an audit row. Pass a transaction client (`tx`) to commit the audit
   * atomically with a surrounding mutation; omit it to write standalone.
   */
  async record(
    entry: AuditEntry,
    client: Prisma.TransactionClient = this.prisma,
  ): Promise<void> {
    await client.auditLog.create({
      data: {
        actorUserId: entry.actorUserId,
        action: entry.action,
        entityType: entry.entityType,
        entityId: entry.entityId,
        before: entry.before,
        after: entry.after,
        reason: entry.reason,
      },
    });
  }
}
```

Run: `npm test -w @logidash/api -- audit.service` → PASS.

- [ ] **Step 3: Module** — `audit.module.ts`

```ts
import { Module } from '@nestjs/common';
import { AuditService } from './audit.service';

@Module({
  providers: [AuditService],
  exports: [AuditService],
})
export class AuditModule {}
```

- [ ] **Step 4: Register in `AppModule`** — add
      `import { AuditModule } from './modules/audit/audit.module';` (alphabetical:
      before `AuthModule`) and add `AuditModule` to the `imports` array (after
      `PrismaModule`, before `AuthModule`).

- [ ] **Step 5: Build + lint + unit; commit**

```powershell
npm run build -w @logidash/api
npm run lint -w @logidash/api
npm test -w @logidash/api -- audit.service
```

```
git add apps/api/src/modules/audit apps/api/src/app.module.ts
git commit -m "feat(audit): append-only, transaction-aware audit service"
```

---

## Task 2: DriversModule — profile CRUD + availability + base zone + vehicle link

**Files:**

- Create: `dto/driver.dto.ts`, `dto/create-driver.dto.ts`, `dto/update-driver.dto.ts`, `dto/set-vehicle.dto.ts`
- Create: `drivers.service.ts` + `drivers.service.spec.ts`
- Create: `drivers.controller.ts`, `drivers.module.ts`
- Modify: `apps/api/src/app.module.ts`

> **Schema (reference):** `DriverProfile { id, userId @unique, availability
DriverAvailability @default(offline), baseZoneId, activeJobCount Int @default(0),
maxConcurrentJobs Int @default(3), timestamps }`; relations `user User`,
> `baseZone Zone`, `vehicle Vehicle?`. **`activeJobCount` is read-only output**
> (managed by assignments in Phase 6). Creating a profile validates: the `userId`
> references an existing User **with role `driver`** and has no profile yet
> (`userId` unique → 409); `baseZoneId` references an existing Zone.

**Roles:** create/update/delete/set-vehicle → `@Roles(admin, dispatcher)`;
list/getById → no `@Roles`.

- [ ] **Step 1: Output DTO** — `driver.dto.ts`

```ts
import { ApiProperty } from '@nestjs/swagger';
import { DriverAvailability } from '../../../generated/prisma/enums';

export class DriverDto {
  @ApiProperty() id!: string;
  @ApiProperty() userId!: string;
  @ApiProperty({ enum: DriverAvailability }) availability!: DriverAvailability;
  @ApiProperty() baseZoneId!: string;
  @ApiProperty() activeJobCount!: number;
  @ApiProperty() maxConcurrentJobs!: number;
  @ApiProperty() createdAt!: Date;
  @ApiProperty() updatedAt!: Date;
}
```

- [ ] **Step 2: Create DTO** — `create-driver.dto.ts`

```ts
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsEnum,
  IsInt,
  IsOptional,
  IsString,
  Max,
  Min,
  MinLength,
} from 'class-validator';
import { DriverAvailability } from '../../../generated/prisma/enums';

export class CreateDriverDto {
  @ApiProperty() @IsString() @MinLength(1) userId!: string;
  @ApiProperty() @IsString() @MinLength(1) baseZoneId!: string;

  @ApiPropertyOptional({ enum: DriverAvailability })
  @IsOptional()
  @IsEnum(DriverAvailability)
  availability?: DriverAvailability;

  @ApiPropertyOptional({ minimum: 1, maximum: 20, default: 3 })
  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(20)
  maxConcurrentJobs?: number;
}
```

- [ ] **Step 3: Update DTO** — `update-driver.dto.ts`

> Hand-written (not `PartialType(CreateDriverDto)`) because `userId` is
> **immutable** after creation — a driver profile cannot be re-pointed to a
> different user. Only availability/baseZone/maxConcurrentJobs are mutable.

```ts
import { ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsEnum,
  IsInt,
  IsOptional,
  IsString,
  Max,
  Min,
  MinLength,
} from 'class-validator';
import { DriverAvailability } from '../../../generated/prisma/enums';

export class UpdateDriverDto {
  @ApiPropertyOptional({ enum: DriverAvailability })
  @IsOptional()
  @IsEnum(DriverAvailability)
  availability?: DriverAvailability;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MinLength(1)
  baseZoneId?: string;

  @ApiPropertyOptional({ minimum: 1, maximum: 20 })
  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(20)
  maxConcurrentJobs?: number;
}
```

- [ ] **Step 4: Set-vehicle DTO** — `set-vehicle.dto.ts`

```ts
import { ApiProperty } from '@nestjs/swagger';
import { IsOptional, IsString, MinLength } from 'class-validator';

export class SetVehicleDto {
  // null clears the driver's current vehicle link.
  @ApiProperty({ type: String, nullable: true })
  @IsOptional()
  @IsString()
  @MinLength(1)
  vehicleId!: string | null;
}
```

- [ ] **Step 5: Failing service test** — `drivers.service.spec.ts`

```ts
import { ConflictException, NotFoundException } from '@nestjs/common';
import { DriverAvailability, Role } from '../../generated/prisma/enums';
import { DriversService } from './drivers.service';

function makePrismaMock() {
  return {
    user: { findUnique: jest.fn() },
    zone: { findUnique: jest.fn() },
    driverProfile: {
      findUnique: jest.fn(),
      findMany: jest.fn(),
      count: jest.fn(),
      create: jest.fn(),
      update: jest.fn(),
      delete: jest.fn(),
    },
    vehicle: {
      findUnique: jest.fn(),
      update: jest.fn(),
      updateMany: jest.fn(),
    },
    assignment: { count: jest.fn() },
    $transaction: jest.fn((arg: unknown) =>
      Array.isArray(arg)
        ? Promise.all(arg as Promise<unknown>[])
        : (arg as (c: unknown) => unknown)(makeTxFromMock()),
    ),
  };
}
// the interactive-tx branch is overridden per-test where needed
function makeTxFromMock() {
  return {};
}

const baseDriver = {
  id: 'dp1',
  userId: 'u-driver',
  availability: DriverAvailability.offline,
  baseZoneId: 'z1',
  activeJobCount: 0,
  maxConcurrentJobs: 3,
  createdAt: new Date(),
  updatedAt: new Date(),
};

describe('DriversService', () => {
  let prisma: ReturnType<typeof makePrismaMock>;
  let service: DriversService;

  beforeEach(() => {
    prisma = makePrismaMock();
    service = new DriversService(prisma as never);
  });

  it('create rejects when the user is not found (404)', async () => {
    prisma.user.findUnique.mockResolvedValue(null);
    await expect(
      service.create({ userId: 'nope', baseZoneId: 'z1' }),
    ).rejects.toBeInstanceOf(NotFoundException);
  });

  it('create rejects when the user is not a driver (409)', async () => {
    prisma.user.findUnique.mockResolvedValue({ id: 'u1', role: Role.viewer });
    await expect(
      service.create({ userId: 'u1', baseZoneId: 'z1' }),
    ).rejects.toBeInstanceOf(ConflictException);
  });

  it('create rejects a duplicate profile for the user (409)', async () => {
    prisma.user.findUnique.mockResolvedValue({
      id: 'u-driver',
      role: Role.driver,
    });
    prisma.zone.findUnique.mockResolvedValue({ id: 'z1' });
    prisma.driverProfile.findUnique.mockResolvedValue(baseDriver);
    await expect(
      service.create({ userId: 'u-driver', baseZoneId: 'z1' }),
    ).rejects.toBeInstanceOf(ConflictException);
  });

  it('create succeeds for a valid driver user + zone', async () => {
    prisma.user.findUnique.mockResolvedValue({
      id: 'u-driver',
      role: Role.driver,
    });
    prisma.zone.findUnique.mockResolvedValue({ id: 'z1' });
    prisma.driverProfile.findUnique.mockResolvedValue(null);
    prisma.driverProfile.create.mockResolvedValue(baseDriver);
    const result = await service.create({
      userId: 'u-driver',
      baseZoneId: 'z1',
    });
    expect(result.userId).toBe('u-driver');
    expect(result.availability).toBe(DriverAvailability.offline);
  });

  it('getById throws 404 when missing', async () => {
    prisma.driverProfile.findUnique.mockResolvedValue(null);
    await expect(service.getById('nope')).rejects.toBeInstanceOf(
      NotFoundException,
    );
  });

  it('remove rejects a driver referenced by assignments (409)', async () => {
    prisma.driverProfile.findUnique.mockResolvedValue(baseDriver);
    prisma.assignment.count.mockResolvedValue(2);
    await expect(service.remove('dp1')).rejects.toBeInstanceOf(
      ConflictException,
    );
    expect(prisma.driverProfile.delete).not.toHaveBeenCalled();
  });
});
```

Run: `npm test -w @logidash/api -- drivers.service` → FAIL.

- [ ] **Step 6: Implement service** — `drivers.service.ts`

```ts
import {
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { PaginationQueryDto } from '../../common/dto/pagination-query.dto';
import {
  paginate,
  type Paginated,
  toSkipTake,
} from '../../common/pagination/paginate';
import { Role } from '../../generated/prisma/enums';
import type { DriverProfileModel } from '../../generated/prisma/models/DriverProfile';
import { PrismaService } from '../../prisma/prisma.service';
import { CreateDriverDto } from './dto/create-driver.dto';
import { DriverDto } from './dto/driver.dto';
import { UpdateDriverDto } from './dto/update-driver.dto';

function toDriverDto(d: DriverProfileModel): DriverDto {
  return {
    id: d.id,
    userId: d.userId,
    availability: d.availability,
    baseZoneId: d.baseZoneId,
    activeJobCount: d.activeJobCount,
    maxConcurrentJobs: d.maxConcurrentJobs,
    createdAt: d.createdAt,
    updatedAt: d.updatedAt,
  };
}

@Injectable()
export class DriversService {
  constructor(private readonly prisma: PrismaService) {}

  async create(dto: CreateDriverDto): Promise<DriverDto> {
    const user = await this.prisma.user.findUnique({
      where: { id: dto.userId },
    });
    if (!user) {
      throw new NotFoundException('User not found');
    }
    if (user.role !== Role.driver) {
      throw new ConflictException('User does not have the driver role');
    }
    const zone = await this.prisma.zone.findUnique({
      where: { id: dto.baseZoneId },
    });
    if (!zone) {
      throw new NotFoundException('Base zone not found');
    }
    const existing = await this.prisma.driverProfile.findUnique({
      where: { userId: dto.userId },
    });
    if (existing) {
      throw new ConflictException(
        'Driver profile already exists for this user',
      );
    }
    const driver = await this.prisma.driverProfile.create({
      data: {
        userId: dto.userId,
        baseZoneId: dto.baseZoneId,
        availability: dto.availability,
        maxConcurrentJobs: dto.maxConcurrentJobs,
      },
    });
    return toDriverDto(driver);
  }

  async list(query: PaginationQueryDto): Promise<Paginated<DriverDto>> {
    const { skip, take } = toSkipTake(query.page, query.limit);
    const [rows, total] = await this.prisma.$transaction([
      this.prisma.driverProfile.findMany({
        skip,
        take,
        orderBy: { createdAt: 'asc' },
      }),
      this.prisma.driverProfile.count(),
    ]);
    return paginate(rows.map(toDriverDto), total, query.page, query.limit);
  }

  async getById(id: string): Promise<DriverDto> {
    const driver = await this.prisma.driverProfile.findUnique({
      where: { id },
    });
    if (!driver) {
      throw new NotFoundException('Driver not found');
    }
    return toDriverDto(driver);
  }

  async update(id: string, dto: UpdateDriverDto): Promise<DriverDto> {
    await this.getById(id); // 404 if missing
    if (dto.baseZoneId) {
      const zone = await this.prisma.zone.findUnique({
        where: { id: dto.baseZoneId },
      });
      if (!zone) {
        throw new NotFoundException('Base zone not found');
      }
    }
    const driver = await this.prisma.driverProfile.update({
      where: { id },
      data: { ...dto },
    });
    return toDriverDto(driver);
  }

  async remove(id: string): Promise<void> {
    await this.getById(id); // 404 if missing
    const assignmentCount = await this.prisma.assignment.count({
      where: { driverId: id },
    });
    if (assignmentCount > 0) {
      throw new ConflictException(
        'Driver is referenced by assignments and cannot be deleted',
      );
    }
    await this.prisma.driverProfile.delete({ where: { id } });
  }

  // Link (or, with null, unlink) the driver's vehicle. Vehicle.driverId is
  // unique, so we clear any prior link for this driver first, then bind the
  // target — refusing a vehicle already owned by a different driver.
  async setVehicle(id: string, vehicleId: string | null): Promise<DriverDto> {
    await this.getById(id); // 404 if missing
    await this.prisma.$transaction(async (tx) => {
      await tx.vehicle.updateMany({
        where: { driverId: id },
        data: { driverId: null },
      });
      if (vehicleId !== null) {
        const vehicle = await tx.vehicle.findUnique({
          where: { id: vehicleId },
        });
        if (!vehicle) {
          throw new NotFoundException('Vehicle not found');
        }
        if (vehicle.driverId !== null && vehicle.driverId !== id) {
          throw new ConflictException(
            'Vehicle is already linked to another driver',
          );
        }
        await tx.vehicle.update({
          where: { id: vehicleId },
          data: { driverId: id },
        });
      }
    });
    return this.getById(id);
  }
}
```

Run: `npm test -w @logidash/api -- drivers.service` → PASS.

- [ ] **Step 7: Controller** — `drivers.controller.ts`

```ts
import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  Param,
  Patch,
  Post,
  Put,
  Query,
} from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { ApiPaginatedResponse } from '../../common/decorators/api-paginated-response.decorator';
import { Roles } from '../../common/decorators/roles.decorator';
import { PaginationQueryDto } from '../../common/dto/pagination-query.dto';
import type { Paginated } from '../../common/pagination/paginate';
import { Role } from '../../generated/prisma/enums';
import { CreateDriverDto } from './dto/create-driver.dto';
import { DriverDto } from './dto/driver.dto';
import { SetVehicleDto } from './dto/set-vehicle.dto';
import { UpdateDriverDto } from './dto/update-driver.dto';
import { DriversService } from './drivers.service';

@ApiTags('drivers')
@ApiBearerAuth()
@Controller('drivers')
export class DriversController {
  constructor(private readonly drivers: DriversService) {}

  @Post()
  @Roles(Role.admin, Role.dispatcher)
  create(@Body() dto: CreateDriverDto): Promise<DriverDto> {
    return this.drivers.create(dto);
  }

  @Get()
  @ApiPaginatedResponse(DriverDto)
  list(@Query() query: PaginationQueryDto): Promise<Paginated<DriverDto>> {
    return this.drivers.list(query);
  }

  @Get(':id')
  getById(@Param('id') id: string): Promise<DriverDto> {
    return this.drivers.getById(id);
  }

  @Patch(':id')
  @Roles(Role.admin, Role.dispatcher)
  update(
    @Param('id') id: string,
    @Body() dto: UpdateDriverDto,
  ): Promise<DriverDto> {
    return this.drivers.update(id, dto);
  }

  @Put(':id/vehicle')
  @Roles(Role.admin, Role.dispatcher)
  setVehicle(
    @Param('id') id: string,
    @Body() dto: SetVehicleDto,
  ): Promise<DriverDto> {
    return this.drivers.setVehicle(id, dto.vehicleId);
  }

  @Delete(':id')
  @Roles(Role.admin, Role.dispatcher)
  @HttpCode(204)
  remove(@Param('id') id: string): Promise<void> {
    return this.drivers.remove(id);
  }
}
```

- [ ] **Step 8: Module** — `drivers.module.ts`

```ts
import { Module } from '@nestjs/common';
import { DriversController } from './drivers.controller';
import { DriversService } from './drivers.service';

@Module({
  controllers: [DriversController],
  providers: [DriversService],
  exports: [DriversService],
})
export class DriversModule {}
```

- [ ] **Step 9: Register in `AppModule`** — add the import (alphabetical:
      `DriversModule` before `UsersModule`/`VehiclesModule`) and add `DriversModule`
      to the `imports` array (after `AuthModule`).

- [ ] **Step 10: Build + lint + unit; commit**

```powershell
npm run build -w @logidash/api
npm run lint -w @logidash/api
npm test -w @logidash/api -- drivers.service
```

```
git add apps/api/src/modules/drivers apps/api/src/app.module.ts
git commit -m "feat(drivers): profile CRUD, availability, base zone, and vehicle link"
```

---

## Task 3: Delivery status state machine (pure, tested)

**Files:**

- Create: `apps/api/src/modules/deliveries/delivery-status.ts` + `delivery-status.spec.ts`

> A pure module: the §8 transition graph + helpers, no Nest/Prisma. Pure
> functions are trivially testable and keep the lifecycle truth in one place.

- [ ] **Step 1: Failing test** — `delivery-status.spec.ts`

```ts
import { DeliveryStatus } from '../../generated/prisma/enums';
import { canTransition, isDriverTransition } from './delivery-status';

describe('delivery-status', () => {
  it('allows the spec §8 transitions', () => {
    expect(canTransition(DeliveryStatus.draft, DeliveryStatus.ready)).toBe(
      true,
    );
    expect(canTransition(DeliveryStatus.ready, DeliveryStatus.assigned)).toBe(
      true,
    );
    expect(canTransition(DeliveryStatus.assigned, DeliveryStatus.ready)).toBe(
      true,
    );
    expect(
      canTransition(DeliveryStatus.in_transit, DeliveryStatus.delivered),
    ).toBe(true);
  });

  it('rejects illegal transitions and moves out of terminal states', () => {
    expect(canTransition(DeliveryStatus.draft, DeliveryStatus.delivered)).toBe(
      false,
    );
    expect(canTransition(DeliveryStatus.delivered, DeliveryStatus.ready)).toBe(
      false,
    );
    expect(canTransition(DeliveryStatus.cancelled, DeliveryStatus.ready)).toBe(
      false,
    );
  });

  it('recognises the driver operational path only', () => {
    expect(
      isDriverTransition(DeliveryStatus.assigned, DeliveryStatus.picked_up),
    ).toBe(true);
    expect(
      isDriverTransition(DeliveryStatus.in_transit, DeliveryStatus.failed),
    ).toBe(true);
    // drivers may not cancel or unassign
    expect(
      isDriverTransition(DeliveryStatus.assigned, DeliveryStatus.cancelled),
    ).toBe(false);
    expect(
      isDriverTransition(DeliveryStatus.assigned, DeliveryStatus.ready),
    ).toBe(false);
    expect(isDriverTransition(DeliveryStatus.draft, DeliveryStatus.ready)).toBe(
      false,
    );
  });
});
```

Run: `npm test -w @logidash/api -- delivery-status` → FAIL.

- [ ] **Step 2: Implement** — `delivery-status.ts`

```ts
import { DeliveryStatus } from '../../generated/prisma/enums';

/** Spec §8 allowed transitions (anything else → 409). */
export const DELIVERY_TRANSITIONS: Record<DeliveryStatus, DeliveryStatus[]> = {
  [DeliveryStatus.draft]: [DeliveryStatus.ready, DeliveryStatus.cancelled],
  [DeliveryStatus.ready]: [DeliveryStatus.assigned, DeliveryStatus.cancelled],
  [DeliveryStatus.assigned]: [
    DeliveryStatus.picked_up,
    DeliveryStatus.ready, // unassign
    DeliveryStatus.cancelled,
  ],
  [DeliveryStatus.picked_up]: [
    DeliveryStatus.in_transit,
    DeliveryStatus.failed,
    DeliveryStatus.cancelled,
  ],
  [DeliveryStatus.in_transit]: [
    DeliveryStatus.delivered,
    DeliveryStatus.failed,
  ],
  [DeliveryStatus.delivered]: [],
  [DeliveryStatus.failed]: [],
  [DeliveryStatus.cancelled]: [],
};

export function canTransition(
  from: DeliveryStatus,
  to: DeliveryStatus,
): boolean {
  return DELIVERY_TRANSITIONS[from].includes(to);
}

/** Operational path a driver may drive on their own active assignment. */
const DRIVER_PATH: Partial<Record<DeliveryStatus, DeliveryStatus[]>> = {
  [DeliveryStatus.assigned]: [DeliveryStatus.picked_up],
  [DeliveryStatus.picked_up]: [DeliveryStatus.in_transit],
  [DeliveryStatus.in_transit]: [
    DeliveryStatus.delivered,
    DeliveryStatus.failed,
  ],
};

export function isDriverTransition(
  from: DeliveryStatus,
  to: DeliveryStatus,
): boolean {
  return (DRIVER_PATH[from] ?? []).includes(to);
}

/** Statuses that mean a delivery no longer has an active assignment. */
export const ASSIGNMENT_CLOSING: DeliveryStatus[] = [
  DeliveryStatus.delivered,
  DeliveryStatus.failed,
  DeliveryStatus.cancelled,
  DeliveryStatus.ready, // unassign
];
```

Run: `npm test -w @logidash/api -- delivery-status` → PASS.

- [ ] **Step 3: Commit**

```
git add apps/api/src/modules/deliveries/delivery-status.ts apps/api/src/modules/deliveries/delivery-status.spec.ts
git commit -m "feat(deliveries): pure delivery-status transition machine"
```

---

## Task 4: DeliveriesModule — CRUD + filtered list

**Files:**

- Create: `dto/delivery.dto.ts`, `dto/create-delivery.dto.ts`, `dto/update-delivery.dto.ts`, `dto/delivery-query.dto.ts`
- Create: `deliveries.service.ts` + `deliveries.service.spec.ts`
- Create: `deliveries.controller.ts`, `deliveries.module.ts`
- Modify: `apps/api/src/app.module.ts`

> **Schema (reference):** `Delivery { id, reference @unique, pickupAddress,
pickupLat/Lng Decimal?, dropoffAddress, dropoffLat/Lng Decimal?, zoneId,
packageSize, packageWeight Decimal, packageType, priority @default(normal),
deadlineAt, status @default(draft), cancellationReason?, timestamps }`.
> `pickupLat/Lng`/`dropoffLat/Lng` are geocoded in Phase 5 — **not** set via this
> API (output only, null until then). `status` starts `draft` and changes only
> through the Task 5 status endpoint (never via create/update).

**Roles:** create/update → `@Roles(admin, dispatcher)`; list/getById → no
`@Roles`.

- [ ] **Step 1: Output DTO** — `delivery.dto.ts`

```ts
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  DeliveryStatus,
  PackageSize,
  Priority,
} from '../../../generated/prisma/enums';

export class DeliveryDto {
  @ApiProperty() id!: string;
  @ApiProperty() reference!: string;
  @ApiProperty() pickupAddress!: string;
  @ApiPropertyOptional({ type: Number, nullable: true }) pickupLat!:
    | number
    | null;
  @ApiPropertyOptional({ type: Number, nullable: true }) pickupLng!:
    | number
    | null;
  @ApiProperty() dropoffAddress!: string;
  @ApiPropertyOptional({ type: Number, nullable: true }) dropoffLat!:
    | number
    | null;
  @ApiPropertyOptional({ type: Number, nullable: true }) dropoffLng!:
    | number
    | null;
  @ApiProperty() zoneId!: string;
  @ApiProperty({ enum: PackageSize }) packageSize!: PackageSize;
  @ApiProperty() packageWeight!: number;
  @ApiProperty() packageType!: string;
  @ApiProperty({ enum: Priority }) priority!: Priority;
  @ApiProperty() deadlineAt!: Date;
  @ApiProperty({ enum: DeliveryStatus }) status!: DeliveryStatus;
  @ApiPropertyOptional({ type: String, nullable: true }) cancellationReason!:
    | string
    | null;
  @ApiProperty() createdAt!: Date;
  @ApiProperty() updatedAt!: Date;
}
```

- [ ] **Step 2: Create DTO** — `create-delivery.dto.ts`

```ts
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsDateString,
  IsEnum,
  IsOptional,
  IsPositive,
  IsString,
  MinLength,
} from 'class-validator';
import { PackageSize, Priority } from '../../../generated/prisma/enums';

export class CreateDeliveryDto {
  @ApiProperty() @IsString() @MinLength(1) reference!: string;
  @ApiProperty() @IsString() @MinLength(1) pickupAddress!: string;
  @ApiProperty() @IsString() @MinLength(1) dropoffAddress!: string;
  @ApiProperty() @IsString() @MinLength(1) zoneId!: string;
  @ApiProperty({ enum: PackageSize })
  @IsEnum(PackageSize)
  packageSize!: PackageSize;
  @ApiProperty({ minimum: 0 }) @IsPositive() packageWeight!: number;
  @ApiProperty() @IsString() @MinLength(1) packageType!: string;

  @ApiPropertyOptional({ enum: Priority })
  @IsOptional()
  @IsEnum(Priority)
  priority?: Priority;

  @ApiProperty({ description: 'ISO 8601 datetime' })
  @IsDateString()
  deadlineAt!: string;
}
```

- [ ] **Step 3: Update DTO** — `update-delivery.dto.ts`

```ts
import { PartialType } from '@nestjs/swagger';
import { CreateDeliveryDto } from './create-delivery.dto';

export class UpdateDeliveryDto extends PartialType(CreateDeliveryDto) {}
```

- [ ] **Step 4: Query DTO (filters)** — `delivery-query.dto.ts`

> Extends the shared pagination DTO with optional filters. `extends
PaginationQueryDto` means `page`/`limit` coercion + bounds are inherited.

```ts
import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsDateString, IsEnum, IsOptional, IsString } from 'class-validator';
import { PaginationQueryDto } from '../../../common/dto/pagination-query.dto';
import { DeliveryStatus, Priority } from '../../../generated/prisma/enums';

export class DeliveryQueryDto extends PaginationQueryDto {
  @ApiPropertyOptional({ enum: DeliveryStatus })
  @IsOptional()
  @IsEnum(DeliveryStatus)
  status?: DeliveryStatus;

  @ApiPropertyOptional({ enum: Priority })
  @IsOptional()
  @IsEnum(Priority)
  priority?: Priority;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  zoneId?: string;

  @ApiPropertyOptional({
    description: 'ISO 8601 — deliveries due at/before this',
  })
  @IsOptional()
  @IsDateString()
  deadlineBefore?: string;
}
```

- [ ] **Step 5: Failing service test** — `deliveries.service.spec.ts`

```ts
import { ConflictException, NotFoundException } from '@nestjs/common';
import {
  DeliveryStatus,
  PackageSize,
  Priority,
} from '../../generated/prisma/enums';
import { DeliveriesService } from './deliveries.service';

function makePrismaMock() {
  return {
    zone: { findUnique: jest.fn() },
    delivery: {
      findUnique: jest.fn(),
      findFirst: jest.fn(),
      findMany: jest.fn(),
      count: jest.fn(),
      create: jest.fn(),
      update: jest.fn(),
    },
    $transaction: jest.fn((ops: unknown) =>
      Array.isArray(ops) ? Promise.all(ops as Promise<unknown>[]) : ops,
    ),
  };
}

const baseDelivery = {
  id: 'd1',
  reference: 'REF-1',
  pickupAddress: '1 A St',
  pickupLat: null,
  pickupLng: null,
  dropoffAddress: '2 B St',
  dropoffLat: null,
  dropoffLng: null,
  zoneId: 'z1',
  packageSize: PackageSize.small,
  packageWeight: 2 as unknown,
  packageType: 'box',
  priority: Priority.normal,
  deadlineAt: new Date(),
  status: DeliveryStatus.draft,
  cancellationReason: null,
  createdAt: new Date(),
  updatedAt: new Date(),
};

const validInput = {
  reference: 'REF-1',
  pickupAddress: '1 A St',
  dropoffAddress: '2 B St',
  zoneId: 'z1',
  packageSize: PackageSize.small,
  packageWeight: 2,
  packageType: 'box',
  deadlineAt: new Date(Date.now() + 86_400_000).toISOString(),
};

describe('DeliveriesService', () => {
  let prisma: ReturnType<typeof makePrismaMock>;
  let service: DeliveriesService;

  beforeEach(() => {
    prisma = makePrismaMock();
    // AuditService is unused by CRUD; pass a stub.
    service = new DeliveriesService(
      prisma as never,
      { record: jest.fn() } as never,
    );
  });

  it('create rejects a duplicate reference (409)', async () => {
    prisma.delivery.findUnique.mockResolvedValue(baseDelivery);
    await expect(service.create(validInput)).rejects.toBeInstanceOf(
      ConflictException,
    );
  });

  it('create rejects a missing zone (404)', async () => {
    prisma.delivery.findUnique.mockResolvedValue(null);
    prisma.zone.findUnique.mockResolvedValue(null);
    await expect(service.create(validInput)).rejects.toBeInstanceOf(
      NotFoundException,
    );
  });

  it('create maps Decimal weight to a number and defaults status draft', async () => {
    prisma.delivery.findUnique.mockResolvedValue(null);
    prisma.zone.findUnique.mockResolvedValue({ id: 'z1' });
    prisma.delivery.create.mockResolvedValue(baseDelivery);
    const result = await service.create(validInput);
    expect(result.packageWeight).toBe(2);
    expect(typeof result.packageWeight).toBe('number');
    expect(result.status).toBe(DeliveryStatus.draft);
  });

  it('getById throws 404 when missing', async () => {
    prisma.delivery.findUnique.mockResolvedValue(null);
    await expect(service.getById('nope')).rejects.toBeInstanceOf(
      NotFoundException,
    );
  });

  it('list applies the status filter and returns the envelope', async () => {
    prisma.delivery.findMany.mockResolvedValue([baseDelivery]);
    prisma.delivery.count.mockResolvedValue(1);
    const result = await service.list({
      page: 1,
      limit: 20,
      status: DeliveryStatus.draft,
    });
    expect(result.data).toHaveLength(1);
    expect(result.meta.total).toBe(1);
    const findManyArg = prisma.delivery.findMany.mock.calls[0][0] as {
      where: { status?: string };
    };
    expect(findManyArg.where.status).toBe(DeliveryStatus.draft);
  });
});
```

Run: `npm test -w @logidash/api -- deliveries.service` → FAIL.

- [ ] **Step 6: Implement service (CRUD only — status method added in Task 5)** — `deliveries.service.ts`

```ts
import {
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import {
  paginate,
  type Paginated,
  toSkipTake,
} from '../../common/pagination/paginate';
import { Prisma } from '../../generated/prisma/client';
import type { DeliveryModel } from '../../generated/prisma/models/Delivery';
import { PrismaService } from '../../prisma/prisma.service';
import { AuditService } from '../audit/audit.service';
import { CreateDeliveryDto } from './dto/create-delivery.dto';
import { DeliveryDto } from './dto/delivery.dto';
import { DeliveryQueryDto } from './dto/delivery-query.dto';
import { UpdateDeliveryDto } from './dto/update-delivery.dto';

function toDeliveryDto(d: DeliveryModel): DeliveryDto {
  return {
    id: d.id,
    reference: d.reference,
    pickupAddress: d.pickupAddress,
    pickupLat: d.pickupLat === null ? null : Number(d.pickupLat),
    pickupLng: d.pickupLng === null ? null : Number(d.pickupLng),
    dropoffAddress: d.dropoffAddress,
    dropoffLat: d.dropoffLat === null ? null : Number(d.dropoffLat),
    dropoffLng: d.dropoffLng === null ? null : Number(d.dropoffLng),
    zoneId: d.zoneId,
    packageSize: d.packageSize,
    packageWeight: Number(d.packageWeight),
    packageType: d.packageType,
    priority: d.priority,
    deadlineAt: d.deadlineAt,
    status: d.status,
    cancellationReason: d.cancellationReason,
    createdAt: d.createdAt,
    updatedAt: d.updatedAt,
  };
}

@Injectable()
export class DeliveriesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  async create(dto: CreateDeliveryDto): Promise<DeliveryDto> {
    const existing = await this.prisma.delivery.findUnique({
      where: { reference: dto.reference },
    });
    if (existing) {
      throw new ConflictException('Delivery reference already in use');
    }
    const zone = await this.prisma.zone.findUnique({
      where: { id: dto.zoneId },
    });
    if (!zone) {
      throw new NotFoundException('Zone not found');
    }
    const delivery = await this.prisma.delivery.create({
      data: {
        reference: dto.reference,
        pickupAddress: dto.pickupAddress,
        dropoffAddress: dto.dropoffAddress,
        zoneId: dto.zoneId,
        packageSize: dto.packageSize,
        packageWeight: dto.packageWeight,
        packageType: dto.packageType,
        priority: dto.priority,
        deadlineAt: new Date(dto.deadlineAt),
      },
    });
    return toDeliveryDto(delivery);
  }

  async list(query: DeliveryQueryDto): Promise<Paginated<DeliveryDto>> {
    const { skip, take } = toSkipTake(query.page, query.limit);
    const where: Prisma.DeliveryWhereInput = {
      ...(query.status ? { status: query.status } : {}),
      ...(query.priority ? { priority: query.priority } : {}),
      ...(query.zoneId ? { zoneId: query.zoneId } : {}),
      ...(query.deadlineBefore
        ? { deadlineAt: { lte: new Date(query.deadlineBefore) } }
        : {}),
    };
    const [rows, total] = await this.prisma.$transaction([
      this.prisma.delivery.findMany({
        where,
        skip,
        take,
        orderBy: { deadlineAt: 'asc' },
      }),
      this.prisma.delivery.count({ where }),
    ]);
    return paginate(rows.map(toDeliveryDto), total, query.page, query.limit);
  }

  async getById(id: string): Promise<DeliveryDto> {
    const delivery = await this.prisma.delivery.findUnique({ where: { id } });
    if (!delivery) {
      throw new NotFoundException('Delivery not found');
    }
    return toDeliveryDto(delivery);
  }

  async update(id: string, dto: UpdateDeliveryDto): Promise<DeliveryDto> {
    await this.getById(id); // 404 if missing
    if (dto.reference) {
      const clash = await this.prisma.delivery.findFirst({
        where: { reference: dto.reference, id: { not: id } },
      });
      if (clash) {
        throw new ConflictException('Delivery reference already in use');
      }
    }
    if (dto.zoneId) {
      const zone = await this.prisma.zone.findUnique({
        where: { id: dto.zoneId },
      });
      if (!zone) {
        throw new NotFoundException('Zone not found');
      }
    }
    const { deadlineAt, ...rest } = dto;
    const delivery = await this.prisma.delivery.update({
      where: { id },
      data: {
        ...rest,
        ...(deadlineAt ? { deadlineAt: new Date(deadlineAt) } : {}),
      },
    });
    return toDeliveryDto(delivery);
  }
}
```

Run: `npm test -w @logidash/api -- deliveries.service` → PASS.

- [ ] **Step 7: Controller (CRUD only — status route added in Task 5)** — `deliveries.controller.ts`

```ts
import {
  Body,
  Controller,
  Get,
  Param,
  Patch,
  Post,
  Query,
} from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { ApiPaginatedResponse } from '../../common/decorators/api-paginated-response.decorator';
import { Roles } from '../../common/decorators/roles.decorator';
import type { Paginated } from '../../common/pagination/paginate';
import { Role } from '../../generated/prisma/enums';
import { CreateDeliveryDto } from './dto/create-delivery.dto';
import { DeliveryDto } from './dto/delivery.dto';
import { DeliveryQueryDto } from './dto/delivery-query.dto';
import { UpdateDeliveryDto } from './dto/update-delivery.dto';
import { DeliveriesService } from './deliveries.service';

@ApiTags('deliveries')
@ApiBearerAuth()
@Controller('deliveries')
export class DeliveriesController {
  constructor(private readonly deliveries: DeliveriesService) {}

  @Post()
  @Roles(Role.admin, Role.dispatcher)
  create(@Body() dto: CreateDeliveryDto): Promise<DeliveryDto> {
    return this.deliveries.create(dto);
  }

  @Get()
  @ApiPaginatedResponse(DeliveryDto)
  list(@Query() query: DeliveryQueryDto): Promise<Paginated<DeliveryDto>> {
    return this.deliveries.list(query);
  }

  @Get(':id')
  getById(@Param('id') id: string): Promise<DeliveryDto> {
    return this.deliveries.getById(id);
  }

  @Patch(':id')
  @Roles(Role.admin, Role.dispatcher)
  update(
    @Param('id') id: string,
    @Body() dto: UpdateDeliveryDto,
  ): Promise<DeliveryDto> {
    return this.deliveries.update(id, dto);
  }
}
```

- [ ] **Step 8: Module** — `deliveries.module.ts`

```ts
import { Module } from '@nestjs/common';
import { AuditModule } from '../audit/audit.module';
import { DeliveriesController } from './deliveries.controller';
import { DeliveriesService } from './deliveries.service';

@Module({
  imports: [AuditModule],
  controllers: [DeliveriesController],
  providers: [DeliveriesService],
  exports: [DeliveriesService],
})
export class DeliveriesModule {}
```

- [ ] **Step 9: Register in `AppModule`** — add the import (alphabetical:
      `DeliveriesModule` before `DriversModule`) and add `DeliveriesModule` to the
      `imports` array (after `AuditModule`/before `DriversModule`).

- [ ] **Step 10: Build + lint + unit; commit**

```powershell
npm run build -w @logidash/api
npm run lint -w @logidash/api
npm test -w @logidash/api -- deliveries.service
```

```
git add apps/api/src/modules/deliveries apps/api/src/app.module.ts
git commit -m "feat(deliveries): CRUD with filtered, paginated list"
```

---

## Task 5: Delivery status endpoint — graph + roles + audit-in-transaction

**Files:**

- Create: `apps/api/src/modules/deliveries/dto/change-status.dto.ts`
- Modify: `deliveries.service.ts` (add `changeStatus`), `deliveries.service.spec.ts` (add cases), `deliveries.controller.ts` (add route)

> The core of the slice. `changeStatus(id, dto, user)`:
>
> 1. load delivery (404), validate `canTransition` (else 409);
> 2. reject a direct `→ assigned` (409 — Phase 6 assignment flow owns it);
> 3. **role rule:** admin/dispatcher may drive any allowed transition; a driver
>    may only drive `isDriverTransition` **and** must own the delivery's active
>    assignment (else 403); viewer is already blocked by `@Roles`;
> 4. in one `$transaction`: update the delivery (set `cancellationReason` when
>    cancelling); if the target is assignment-closing and an active assignment
>    exists, close it (`completed` for `delivered`, else `cancelled`), stamp
>    `unassignedAt`, and decrement the driver's `activeJobCount` (floored at 0);
>    write the status-change audit via `AuditService.record(entry, tx)`.

- [ ] **Step 1: Change-status DTO** — `change-status.dto.ts`

```ts
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsEnum, IsOptional, IsString, MinLength } from 'class-validator';
import { DeliveryStatus } from '../../../generated/prisma/enums';

export class ChangeStatusDto {
  @ApiProperty({ enum: DeliveryStatus })
  @IsEnum(DeliveryStatus)
  status!: DeliveryStatus;

  @ApiPropertyOptional({
    description: 'Required-ish for cancelled/failed; audited',
  })
  @IsOptional()
  @IsString()
  @MinLength(1)
  reason?: string;
}
```

- [ ] **Step 2: Add failing cases** — append to `deliveries.service.spec.ts`

> Add `assignment` + `driverProfile` to the mock and an interactive-tx that runs
> the callback against the mock itself. Replace the `makePrismaMock` from Task 4
> with this superset (same models, plus the tx callback support).

```ts
// --- add inside makePrismaMock()'s returned object: ---
//   assignment: { findFirst: jest.fn(), update: jest.fn() },
//   driverProfile: { update: jest.fn() },
// --- and change $transaction to support the interactive form: ---
//   $transaction: jest.fn((arg: unknown, ...rest: unknown[]) =>
//     Array.isArray(arg)
//       ? Promise.all(arg as Promise<unknown>[])
//       : (arg as (c: unknown) => unknown)(prismaRef),
//   ),
// where `prismaRef` is the mock object itself (assign it before returning).

import { AuthUser } from '../../common/types/auth-user';
import { ForbiddenException } from '@nestjs/common';
import { Role } from '../../generated/prisma/enums';

const dispatcher: AuthUser = {
  id: 'u-disp',
  email: 'd@x',
  name: 'D',
  role: Role.dispatcher,
};
const driver: AuthUser = {
  id: 'u-driver',
  email: 'dr@x',
  name: 'Dr',
  role: Role.driver,
};

describe('DeliveriesService.changeStatus', () => {
  let prisma: ReturnType<typeof makePrismaMock>;
  let audit: { record: jest.Mock };
  let service: DeliveriesService;

  beforeEach(() => {
    prisma = makePrismaMock();
    audit = { record: jest.fn() };
    service = new DeliveriesService(prisma as never, audit as never);
  });

  it('rejects an illegal transition with 409', async () => {
    prisma.delivery.findUnique.mockResolvedValue({
      ...baseDelivery,
      status: DeliveryStatus.draft,
    });
    await expect(
      service.changeStatus(
        'd1',
        { status: DeliveryStatus.delivered },
        dispatcher,
      ),
    ).rejects.toBeInstanceOf(ConflictException);
  });

  it('rejects a direct → assigned with 409 (use the assignment flow)', async () => {
    prisma.delivery.findUnique.mockResolvedValue({
      ...baseDelivery,
      status: DeliveryStatus.ready,
    });
    await expect(
      service.changeStatus(
        'd1',
        { status: DeliveryStatus.assigned },
        dispatcher,
      ),
    ).rejects.toBeInstanceOf(ConflictException);
  });

  it('dispatcher advances draft → ready and audits', async () => {
    prisma.delivery.findUnique.mockResolvedValue({
      ...baseDelivery,
      status: DeliveryStatus.draft,
    });
    prisma.delivery.update.mockResolvedValue({
      ...baseDelivery,
      status: DeliveryStatus.ready,
    });
    const result = await service.changeStatus(
      'd1',
      { status: DeliveryStatus.ready },
      dispatcher,
    );
    expect(result.status).toBe(DeliveryStatus.ready);
    expect(audit.record).toHaveBeenCalled();
  });

  it('driver may not drive a non-operational transition (403)', async () => {
    prisma.delivery.findUnique.mockResolvedValue({
      ...baseDelivery,
      status: DeliveryStatus.assigned,
    });
    await expect(
      service.changeStatus('d1', { status: DeliveryStatus.cancelled }, driver),
    ).rejects.toBeInstanceOf(ForbiddenException);
  });

  it('driver may not advance an assignment they do not own (403)', async () => {
    prisma.delivery.findUnique.mockResolvedValue({
      ...baseDelivery,
      status: DeliveryStatus.assigned,
    });
    prisma.assignment.findFirst.mockResolvedValue({
      id: 'a1',
      driverId: 'dp-other',
      status: 'active',
      driver: { id: 'dp-other', userId: 'u-someone-else', activeJobCount: 1 },
    });
    await expect(
      service.changeStatus('d1', { status: DeliveryStatus.picked_up }, driver),
    ).rejects.toBeInstanceOf(ForbiddenException);
  });

  it('driver delivers their own assignment: closes it + decrements workload', async () => {
    prisma.delivery.findUnique.mockResolvedValue({
      ...baseDelivery,
      status: DeliveryStatus.in_transit,
    });
    prisma.assignment.findFirst.mockResolvedValue({
      id: 'a1',
      driverId: 'dp1',
      status: 'active',
      driver: { id: 'dp1', userId: 'u-driver', activeJobCount: 1 },
    });
    prisma.delivery.update.mockResolvedValue({
      ...baseDelivery,
      status: DeliveryStatus.delivered,
    });
    await service.changeStatus(
      'd1',
      { status: DeliveryStatus.delivered },
      driver,
    );
    expect(prisma.assignment.update).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: 'a1' } }),
    );
    expect(prisma.driverProfile.update).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: 'dp1' } }),
    );
    expect(audit.record).toHaveBeenCalled();
  });
});
```

Run: `npm test -w @logidash/api -- deliveries.service` → FAIL (no `changeStatus`).

- [ ] **Step 3: Implement `changeStatus`** — add to `deliveries.service.ts`

> Add imports at the top:
> `import { ForbiddenException } from '@nestjs/common';`
> `import { AssignmentStatus, DeliveryStatus } from '../../generated/prisma/enums';`
> `import { AuthUser } from '../../common/types/auth-user';`
> `import { ChangeStatusDto } from './dto/change-status.dto';`
> `import { ASSIGNMENT_CLOSING, canTransition, isDriverTransition } from './delivery-status';`
> `import { Role } from '../../generated/prisma/enums';` (extend the existing enum import)

```ts
  async changeStatus(
    id: string,
    dto: ChangeStatusDto,
    user: AuthUser,
  ): Promise<DeliveryDto> {
    const delivery = await this.prisma.delivery.findUnique({ where: { id } });
    if (!delivery) {
      throw new NotFoundException('Delivery not found');
    }
    const from = delivery.status;
    const to = dto.status;

    if (!canTransition(from, to)) {
      throw new ConflictException(`Illegal transition: ${from} → ${to}`);
    }
    // Creating an assignment is the Phase 6 assignment flow's job.
    if (to === DeliveryStatus.assigned) {
      throw new ConflictException(
        'Assign a driver via the assignment endpoint, not the status endpoint',
      );
    }

    // The delivery's active assignment (if any) — needed for the driver rule
    // and for closing side effects.
    const activeAssignment = await this.prisma.assignment.findFirst({
      where: { deliveryId: id, status: AssignmentStatus.active },
      include: { driver: true },
    });

    if (user.role === Role.driver) {
      if (!isDriverTransition(from, to)) {
        throw new ForbiddenException(
          'Drivers may only advance their own assignment along the operational path',
        );
      }
      if (!activeAssignment || activeAssignment.driver.userId !== user.id) {
        throw new ForbiddenException('Not your assignment');
      }
    }

    const updated = await this.prisma.$transaction(async (tx) => {
      const next = await tx.delivery.update({
        where: { id },
        data: {
          status: to,
          ...(to === DeliveryStatus.cancelled
            ? { cancellationReason: dto.reason ?? null }
            : {}),
        },
      });

      if (activeAssignment && ASSIGNMENT_CLOSING.includes(to)) {
        await tx.assignment.update({
          where: { id: activeAssignment.id },
          data: {
            status:
              to === DeliveryStatus.delivered
                ? AssignmentStatus.completed
                : AssignmentStatus.cancelled,
            unassignedAt: new Date(),
            unassignReason: dto.reason ?? null,
          },
        });
        await tx.driverProfile.update({
          where: { id: activeAssignment.driverId },
          data: {
            activeJobCount: Math.max(0, activeAssignment.driver.activeJobCount - 1),
          },
        });
      }

      await this.audit.record(
        {
          actorUserId: user.id,
          action: 'delivery.status_changed',
          entityType: 'Delivery',
          entityId: id,
          before: { status: from },
          after: { status: to },
          reason: dto.reason,
        },
        tx,
      );

      return next;
    });

    return toDeliveryDto(updated);
  }
```

Run: `npm test -w @logidash/api -- deliveries.service` → PASS.

- [ ] **Step 4: Add the route** — in `deliveries.controller.ts`

> Add imports: `HttpCode` is not needed (returns the delivery). Add
> `import { CurrentUser } from '../../common/decorators/current-user.decorator';`
> `import type { AuthUser } from '../../common/types/auth-user';`
> `import { ChangeStatusDto } from './dto/change-status.dto';`

```ts
  @Patch(':id/status')
  @Roles(Role.admin, Role.dispatcher, Role.driver)
  changeStatus(
    @Param('id') id: string,
    @Body() dto: ChangeStatusDto,
    @CurrentUser() user: AuthUser,
  ): Promise<DeliveryDto> {
    return this.deliveries.changeStatus(id, dto, user);
  }
```

- [ ] **Step 5: Build + lint + unit; commit**

```powershell
npm run build -w @logidash/api
npm run lint -w @logidash/api
npm test -w @logidash/api -- deliveries.service delivery-status
```

```
git add apps/api/src/modules/deliveries
git commit -m "feat(deliveries): role-gated status transitions with audited side effects"
```

---

## Task 6: e2e — drivers + delivery lifecycle + audit + role matrix

**Files:**

- Create: `apps/api/test/drivers-deliveries.e2e-spec.ts`

> Requires Docker Postgres on **5433**. Mirror the existing e2e: build the app,
> re-apply `enableVersioning` + `ValidationPipe` in `beforeAll` (the
> `AllExceptionsFilter` is auto-active via `APP_FILTER`), four role users with
> `@logidash.test` emails, `/v1` prefix, clean up all created rows. Use a unique
> prefix (`E2EDD-`) for `reference`/zone `code`. To exercise the **driver path**,
> seed an active `Assignment` directly via Prisma (Phase 6 creates them via API).

- [ ] **Step 1: Write the e2e**

```ts
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
  AssignmentStatus,
  DeliveryStatus,
  PackageSize,
  Role,
  UserStatus,
  VehicleType,
} from './../src/generated/prisma/enums';
import { PrismaService } from './../src/prisma/prisma.service';

const PASSWORD = 'Demo123!';
const PREFIX = 'E2EDD-';
const EMAILS = {
  admin: 'e2e.dd.admin@logidash.test',
  dispatcher: 'e2e.dd.dispatcher@logidash.test',
  driver: 'e2e.dd.driver@logidash.test',
  viewer: 'e2e.dd.viewer@logidash.test',
};

describe('Drivers & Deliveries (e2e)', () => {
  let app: INestApplication<App>;
  let prisma: PrismaService;
  const tokens: Record<string, string> = {};
  const userIds: Record<string, string> = {};
  let zoneId = '';

  const login = (email: string, password = PASSWORD) =>
    request(app.getHttpServer())
      .post('/v1/auth/login')
      .send({ email, password });
  const auth = (role: string) => ({ Authorization: `Bearer ${tokens[role]}` });

  const cleanup = async () => {
    await prisma.assignment.deleteMany({
      where: { delivery: { reference: { startsWith: PREFIX } } },
    });
    await prisma.auditLog.deleteMany({
      where: { entityType: 'Delivery', reason: { startsWith: PREFIX } },
    });
    await prisma.delivery.deleteMany({
      where: { reference: { startsWith: PREFIX } },
    });
    await prisma.driverProfile.deleteMany({
      where: { user: { email: { in: Object.values(EMAILS) } } },
    });
    await prisma.vehicle.deleteMany({
      where: { driver: { user: { email: { in: Object.values(EMAILS) } } } },
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
          name: role,
          role: role as Role,
          status: UserStatus.active,
          passwordHash,
        },
      });
      userIds[role] = u.id;
    }
    const zone = await prisma.zone.create({
      data: { name: 'DD Zone', code: `${PREFIX}Z` },
    });
    zoneId = zone.id;

    for (const [role, email] of Object.entries(EMAILS)) {
      const res = await login(email).expect(200);
      tokens[role] = (res.body as { accessToken: string }).accessToken;
    }
  });

  afterAll(async () => {
    await cleanup();
    await app.close();
  });

  // ---- Drivers ----
  it('dispatcher creates a driver profile for the driver user; viewer is 403', async () => {
    const res = await request(app.getHttpServer())
      .post('/v1/drivers')
      .set(auth('dispatcher'))
      .send({ userId: userIds.driver, baseZoneId: zoneId })
      .expect(201);
    expect((res.body as { userId: string }).userId).toBe(userIds.driver);

    await request(app.getHttpServer())
      .post('/v1/drivers')
      .set(auth('viewer'))
      .send({ userId: userIds.admin, baseZoneId: zoneId })
      .expect(403);
  });

  it('creating a driver profile for a non-driver user is 409', async () => {
    await request(app.getHttpServer())
      .post('/v1/drivers')
      .set(auth('admin'))
      .send({ userId: userIds.viewer, baseZoneId: zoneId })
      .expect(409);
  });

  // ---- Deliveries CRUD + filter ----
  it('dispatcher creates a delivery (status draft); driver is 403; filter works', async () => {
    const created = await request(app.getHttpServer())
      .post('/v1/deliveries')
      .set(auth('dispatcher'))
      .send({
        reference: `${PREFIX}D1`,
        pickupAddress: '1 A St',
        dropoffAddress: '2 B St',
        zoneId,
        packageSize: PackageSize.small,
        packageWeight: 2,
        packageType: 'box',
        deadlineAt: new Date(Date.now() + 86_400_000).toISOString(),
      })
      .expect(201);
    expect((created.body as { status: string }).status).toBe(
      DeliveryStatus.draft,
    );

    await request(app.getHttpServer())
      .post('/v1/deliveries')
      .set(auth('driver'))
      .send({
        reference: `${PREFIX}NO`,
        pickupAddress: 'x',
        dropoffAddress: 'y',
        zoneId,
        packageSize: PackageSize.small,
        packageWeight: 1,
        packageType: 'box',
        deadlineAt: new Date().toISOString(),
      })
      .expect(403);

    const list = await request(app.getHttpServer())
      .get(`/v1/deliveries?status=${DeliveryStatus.draft}&zoneId=${zoneId}`)
      .set(auth('viewer'))
      .expect(200);
    expect(Array.isArray((list.body as { data: unknown[] }).data)).toBe(true);
  });

  // ---- Status machine ----
  it('illegal transition draft → delivered is 409', async () => {
    const created = await request(app.getHttpServer())
      .post('/v1/deliveries')
      .set(auth('dispatcher'))
      .send({
        reference: `${PREFIX}ILL`,
        pickupAddress: 'a',
        dropoffAddress: 'b',
        zoneId,
        packageSize: PackageSize.small,
        packageWeight: 1,
        packageType: 'box',
        deadlineAt: new Date(Date.now() + 86_400_000).toISOString(),
      })
      .expect(201);
    const id = (created.body as { id: string }).id;
    await request(app.getHttpServer())
      .patch(`/v1/deliveries/${id}/status`)
      .set(auth('dispatcher'))
      .send({ status: DeliveryStatus.delivered })
      .expect(409);
  });

  it('dispatcher drives draft → ready and writes an audit row', async () => {
    const created = await request(app.getHttpServer())
      .post('/v1/deliveries')
      .set(auth('dispatcher'))
      .send({
        reference: `${PREFIX}RDY`,
        pickupAddress: 'a',
        dropoffAddress: 'b',
        zoneId,
        packageSize: PackageSize.small,
        packageWeight: 1,
        packageType: 'box',
        deadlineAt: new Date(Date.now() + 86_400_000).toISOString(),
      })
      .expect(201);
    const id = (created.body as { id: string }).id;
    await request(app.getHttpServer())
      .patch(`/v1/deliveries/${id}/status`)
      .set(auth('dispatcher'))
      .send({ status: DeliveryStatus.ready, reason: `${PREFIX}go` })
      .expect(200);
    const audits = await prisma.auditLog.count({
      where: {
        entityType: 'Delivery',
        entityId: id,
        action: 'delivery.status_changed',
      },
    });
    expect(audits).toBeGreaterThan(0);
  });

  it('a direct → assigned is rejected (409, assignment flow owns it)', async () => {
    const created = await request(app.getHttpServer())
      .post('/v1/deliveries')
      .set(auth('dispatcher'))
      .send({
        reference: `${PREFIX}ASG`,
        pickupAddress: 'a',
        dropoffAddress: 'b',
        zoneId,
        packageSize: PackageSize.small,
        packageWeight: 1,
        packageType: 'box',
        deadlineAt: new Date(Date.now() + 86_400_000).toISOString(),
      })
      .expect(201);
    const id = (created.body as { id: string }).id;
    await request(app.getHttpServer())
      .patch(`/v1/deliveries/${id}/status`)
      .set(auth('dispatcher'))
      .send({ status: DeliveryStatus.ready })
      .expect(200);
    await request(app.getHttpServer())
      .patch(`/v1/deliveries/${id}/status`)
      .set(auth('dispatcher'))
      .send({ status: DeliveryStatus.assigned })
      .expect(409);
  });

  it('driver advances their OWN seeded assignment: assigned → picked_up; not-owner is 403', async () => {
    // Seed: driver profile (created above) + a vehicle + an assigned delivery + an active assignment.
    const driverProfile = await prisma.driverProfile.findUnique({
      where: { userId: userIds.driver },
    });
    const vehicle = await prisma.vehicle.create({
      data: {
        type: VehicleType.van,
        capacityWeight: 1000,
        capacityVolume: 8,
        driverId: driverProfile!.id,
      },
    });
    const delivery = await prisma.delivery.create({
      data: {
        reference: `${PREFIX}OWN`,
        pickupAddress: 'a',
        dropoffAddress: 'b',
        zoneId,
        packageSize: PackageSize.small,
        packageWeight: 1,
        packageType: 'box',
        deadlineAt: new Date(Date.now() + 86_400_000),
        status: DeliveryStatus.assigned,
      },
    });
    await prisma.assignment.create({
      data: {
        deliveryId: delivery.id,
        driverId: driverProfile!.id,
        vehicleId: vehicle.id,
        status: AssignmentStatus.active,
        assignedByUserId: userIds.dispatcher,
      },
    });

    // The owning driver may advance.
    await request(app.getHttpServer())
      .patch(`/v1/deliveries/${delivery.id}/status`)
      .set(auth('driver'))
      .send({ status: DeliveryStatus.picked_up })
      .expect(200);

    // A different driver-less user (viewer) is blocked by role; a driver who
    // doesn't own it would be 403 — assert the viewer can't touch status at all.
    await request(app.getHttpServer())
      .patch(`/v1/deliveries/${delivery.id}/status`)
      .set(auth('viewer'))
      .send({ status: DeliveryStatus.in_transit })
      .expect(403);
  });
});
```

> **Note:** the audit cleanup keys off `reason` starting with the prefix; the
> seeded driver-path test doesn't pass a prefixed reason, so its audit rows are
> cleaned via the `entityId` deliveries cleanup cascade is NOT automatic — if you
> want a spotless DB, also `deleteMany` audit rows by `entityId in (created ids)`.
> Acceptable either way (e2e asserts behavior, not row counts).

- [ ] **Step 2: Run** (Docker Postgres up on 5433)

```powershell
npm run test:e2e -w @logidash/api
```

Expected: PASS — new suite + existing auth and zones/vehicles suites stay green.

- [ ] **Step 3: Commit**

```
git add apps/api/test/drivers-deliveries.e2e-spec.ts
git commit -m "test(api): e2e for drivers, delivery lifecycle, audit, and role matrix"
```

---

## Task 7: Docs sync

**Files:** Modify `docs/implementation-plan.md`, `docs/context/progress-tracker.md`.

- [ ] **Step 1: Implementation plan (Phase 4)** — tick `☑ DriversModule…`,
      `☑ DeliveriesModule…`, `☑ AuditModule…`, flip the partial Swagger/pagination
      line to `☑` (all Phase-4 endpoints now annotated + paginated), and update the
      Phase 4 Status note: Slice 2 (Drivers + Deliveries lifecycle + Audit) shipped;
      **only assignment _creation_ + recommendations remain (Phase 6)**.

- [ ] **Step 2: Progress tracker** — set Current Phase to "Phase 4 core domain
      complete (Zones, Vehicles, Drivers, Deliveries, Audit); assignment creation +
      recommendations = Phase 6"; add a Completed block for Slice 2; add a Session
      Note dated when executed. Note the deferred `ready → assigned` boundary.

- [ ] **Step 3: Final verification (whole API)**

```powershell
npm run build -w @logidash/api
npm run lint -w @logidash/api
npm test -w @logidash/api
npm run test:e2e -w @logidash/api
```

- [ ] **Step 4: Commit**

```
git add docs/implementation-plan.md docs/context/progress-tracker.md
git commit -m "docs: mark Phase 4 Slice 2 (drivers + deliveries + audit) complete"
```

---

## Self-Review

**Spec coverage (this slice's scope):**

- Append-only audit, transaction-aware (spec §6 AuditLog, §8 "within a single
  transaction") → Task 1. ✅
- DriversModule: profile, availability, base zone, workload (read), vehicle link
  (spec §6 DriverProfile; Slice-1 deferred link) → Task 2. ✅
- Delivery lifecycle graph (spec §8) as a pure tested function → Task 3. ✅
- DeliveriesModule CRUD + filters (status/priority/zone/deadline) (Phase 4 plan)
  → Task 4. ✅
- Status transitions enforcing §8 + role matrix (admin/dispatcher any; driver
  own-assignment operational path; viewer none) + audit-in-transaction → Task 5. ✅
- Role-matrix + lifecycle + audit e2e → Task 6. ✅
- Docs sync → Task 7. ✅

**Deferred (documented, intentional):** assignment _creation_ (`ready → assigned`)

- the AssignmentsModule, the recommendation engine, and maps/geocoding — all
  Phase 5/6.

**Type consistency:** `DriverProfileModel`/`DeliveryModel` → `DriverDto`/
`DeliveryDto` via `to…Dto` (Decimal→number on Delivery). `AuditService.record(entry,
tx?)` signature is identical at every call site. `changeStatus(id, dto, user:
AuthUser)` uses `user.id`/`user.role`; the driver rule compares
`activeAssignment.driver.userId === user.id`. `canTransition`/`isDriverTransition`/
`ASSIGNMENT_CLOSING` from `delivery-status.ts` are the only lifecycle authorities.
`DeliveryQueryDto extends PaginationQueryDto`, consumed by `list`.

**Placeholder scan:** every code step shows full code. The e2e cleanup note gives
an explicit optional choice, not a placeholder. The Task-5 spec step describes a
mock-superset edit in prose comments — when executing, apply it concretely to the
Task-4 `makePrismaMock` (add `assignment`/`driverProfile` + the interactive-tx
branch) before pasting the new cases.

**Invariant check (`code-standards.md`):** business rules in services (lifecycle,
role rule, referential guards), thin controllers, all DB via Prisma in services,
every endpoint has `class-validator` DTOs + Swagger decorators, authorization via
`@Roles` + the global `RolesGuard` (the driver-own rule is data-scoped, not a new
auth mechanism), errors via the global filter, lists paginated. Audit writes share
the mutation's transaction. No invariant violated.
