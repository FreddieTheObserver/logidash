# Phase 4 — Slice 1: Foundations + Zones + Vehicles — Implementation Plan

> **For agentic workers:** This plan is executed **teach-and-build** style (the
> user types the code with guidance; you never Write/Edit their source files).
> Steps use checkbox (`- [ ]`) syntax. The design spec
> (`docs/superpowers/specs/2026-06-02-logistics-dispatch-api-design.md`) and the
> code standards (`docs/context/code-standards.md`) are locked — implement
> against them, do not re-derive product behavior.

> **Resume note (2026-06-06):** Tasks 1 and 2 are **already implemented, verified
> green, and (about to be) committed** in the prior session. A fresh session
> should pick up at **Task 3 (ZonesModule)**. Tasks 1–2 are retained below
> (collapsed to "what shipped") so the foundations they provide are documented.

**Slice goal:** Land the two cross-cutting API foundations deferred from Phase 3
(global exception filter + offset pagination envelope), then ship the first two
operational domain modules — **Zones** and **Vehicles** — as role-gated,
paginated, Swagger-documented CRUD, with a referential-delete guard on Zones.
Drivers and Deliveries (the lifecycle-heavy modules) and the AuditModule are
**later slices** of Phase 4.

**Architecture:** `common/` gains a global `AllExceptionsFilter` (registered via
`APP_FILTER`) and a reusable pagination kit (query DTO, meta DTO, `paginate()`/
`toSkipTake()` helpers, `@ApiPaginatedResponse()` Swagger decorator). Two new
domain modules under `apps/api/src/modules/` — `zones/` and `vehicles/` — each
follow the established `users/` module shape (controller → service → Prisma,
DTOs with `class-validator` + Swagger decorators, a `*.service.spec.ts` with a
mocked Prisma). Authorization reuses the existing global `JwtAuthGuard` →
`RolesGuard`: **write** endpoints carry `@Roles(admin, dispatcher)`; **read**
endpoints carry no `@Roles` (any authenticated user). All business routes inherit
`/v1` from the global `defaultVersion: '1'`.

**Tech stack:** NestJS 11, `@nestjs/swagger` 11, `class-validator` /
`class-transformer`, Prisma 7 (CJS client at `src/generated/prisma`), Jest +
supertest. No new dependencies.

---

## Conventions locked for this slice

- **Module path:** `apps/api/src/modules/<domain>/` with `dto/` subfolder.
- **Generated types:** import row types as `…Model` from
  `../../generated/prisma/models/<Model>` (e.g. `ZoneModel`, `VehicleModel`) —
  this matches the existing `UsersService` (`UserModel`). Enums import from
  `../../generated/prisma/enums`.
- **Decimal handling:** Prisma returns `runtime.Decimal` for `@db.Decimal`
  columns (`Zone.centerLat/Lng`, `Vehicle.capacityWeight/Volume`). The API
  contract exposes **numbers**, so the `to…Dto` mapper converts with
  `Number(value)` (and `=== null ? null : Number(value)` for nullable ones).
  Inputs accept `number`; Prisma's `*CreateInput`/`*UpdateInput` accept
  `number` for Decimal fields, so no conversion is needed on the way in.
- **Error model (spec §9):** the global filter emits
  `{ statusCode, error, message, details? }`. Services throw
  `ConflictException` (409) for duplicate keys + referential conflicts,
  `NotFoundException` (404) for missing rows; `ValidationPipe` produces 400 with
  a `details` array; the guards produce 401/403.
- **Pagination:** `list(query: PaginationQueryDto)` returns
  `Paginated<XDto>` via `paginate(rows.map(toDto), total, page, limit)`, where
  `total` comes from a sibling `count()` in the same `$transaction([...])`.

## File structure

**Already created (Tasks 1–2, done):**

- `apps/api/src/common/filters/all-exceptions.filter.ts`
- `apps/api/src/common/dto/pagination-query.dto.ts`
- `apps/api/src/common/dto/pagination-meta.dto.ts`
- `apps/api/src/common/pagination/paginate.ts`
- `apps/api/src/common/decorators/api-paginated-response.decorator.ts`
- `apps/api/src/app.module.ts` (modified — `APP_FILTER` registered)

**New in this slice (Tasks 3–5):**

- `apps/api/src/modules/zones/zones.module.ts`
- `apps/api/src/modules/zones/zones.controller.ts`
- `apps/api/src/modules/zones/zones.service.ts` + `zones.service.spec.ts`
- `apps/api/src/modules/zones/dto/create-zone.dto.ts`, `update-zone.dto.ts`, `zone.dto.ts`
- `apps/api/src/modules/vehicles/vehicles.module.ts`
- `apps/api/src/modules/vehicles/vehicles.controller.ts`
- `apps/api/src/modules/vehicles/vehicles.service.ts` + `vehicles.service.spec.ts`
- `apps/api/src/modules/vehicles/dto/create-vehicle.dto.ts`, `update-vehicle.dto.ts`, `vehicle.dto.ts`
- `apps/api/test/zones-vehicles.e2e-spec.ts`

**Modified (Tasks 3–4, 6):**

- `apps/api/src/app.module.ts` — import `ZonesModule`, `VehiclesModule`
- `docs/implementation-plan.md`, `docs/context/progress-tracker.md`

---

## Task 1: Global exception filter — DONE ✅

**Shipped:** `apps/api/src/common/filters/all-exceptions.filter.ts` — a catch-all
`@Catch()` `ExceptionFilter` that normalizes any thrown error into
`{ statusCode, error, message, details? }`. `HttpException` → real status +
`error`/`message`; class-validator's `message: string[]` → top-level
`'Validation failed'` + `details` array; non-HTTP/unknown errors → generic 500
with the cause logged server-side only (never leaked). Registered globally via
`{ provide: APP_FILTER, useClass: AllExceptionsFilter }` in `app.module.ts` so it
is active in the e2e app too (no `useGlobalFilters` mirroring needed).

- [x] Filter implemented, wired via `APP_FILTER`, `npm run build` + `npm run lint` green.

> **Lint note:** the 5xx range check uses a literal `body.statusCode >= 500`, not
> `HttpStatus.INTERNAL_SERVER_ERROR` — comparing a `number` to a numeric enum
> trips `no-unsafe-enum-comparison`, and casting it trips
> `no-unnecessary-type-assertion`. The literal sidesteps both. `HttpStatus` is
> still used for the _value_ assigned in `buildBody` (assignment, not comparison).

## Task 2: Pagination envelope — DONE ✅

**Shipped (all under `common/`):**

- `dto/pagination-query.dto.ts` — `PaginationQueryDto { page=1, limit=20 }`,
  coerced via `@Type(() => Number)`, bounded `@IsInt @Min(1)` and `@Max(100)` on
  `limit`. Optional via `@IsOptional` + property defaults.
- `dto/pagination-meta.dto.ts` — `PaginationMetaDto { page, limit, total, totalPages }`.
- `pagination/paginate.ts` — `Paginated<T> { data: T[]; meta: PaginationMetaDto }`,
  pure `paginate(data, total, page, limit)` (computes `totalPages = ceil(total/limit)`),
  and `toSkipTake(page, limit) → { skip: (page-1)*limit, take: limit }`.
- `decorators/api-paginated-response.decorator.ts` — `@ApiPaginatedResponse(Model)`
  composes `ApiExtraModels(PaginationMetaDto, model)` + `ApiOkResponse` with an
  `allOf` schema so the generic `{ data: Model[], meta }` envelope appears in the
  OpenAPI spec (generics are erased at runtime; this bridges that).

- [x] All four files compile + lint clean as standalone foundation (first consumer is Task 3).

---

## Task 3: ZonesModule — role-gated CRUD + 409 referential delete

**Files:**

- Create: `apps/api/src/modules/zones/dto/zone.dto.ts`, `create-zone.dto.ts`, `update-zone.dto.ts`
- Create: `apps/api/src/modules/zones/zones.service.ts` + `zones.service.spec.ts`
- Create: `apps/api/src/modules/zones/zones.controller.ts`
- Create: `apps/api/src/modules/zones/zones.module.ts`
- Modify: `apps/api/src/app.module.ts`

> **Zone schema (reference):** `id, name, code @unique, centerLat Decimal?,
centerLng Decimal?, bounds Json?, createdAt, updatedAt`; relations
> `drivers DriverProfile[]` (via `DriverProfile.baseZoneId`) and
> `deliveries Delivery[]` (via `Delivery.zoneId`). **`bounds` is NOT exposed via
> the API in this slice** (reserved). Both zone FKs are required with no cascade,
> so a raw delete of a referenced zone would throw a Prisma FK error — we
> pre-check and return a clean 409 instead.

**Roles:** create/update/delete → `@Roles(admin, dispatcher)`; list/getById →
no `@Roles` (any authenticated user, per spec §3 "viewer read").

- [ ] **Step 1: Output DTO** — `zone.dto.ts`

```ts
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class ZoneDto {
  @ApiProperty() id!: string;
  @ApiProperty() name!: string;
  @ApiProperty() code!: string;
  @ApiPropertyOptional({ type: Number, nullable: true }) centerLat!:
    | number
    | null;
  @ApiPropertyOptional({ type: Number, nullable: true }) centerLng!:
    | number
    | null;
  @ApiProperty() createdAt!: Date;
  @ApiProperty() updatedAt!: Date;
}
```

- [ ] **Step 2: Create DTO** — `create-zone.dto.ts`

```ts
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsNumber,
  IsOptional,
  IsString,
  Max,
  Min,
  MinLength,
} from 'class-validator';

export class CreateZoneDto {
  @ApiProperty() @IsString() @MinLength(1) name!: string;
  @ApiProperty() @IsString() @MinLength(1) code!: string;

  @ApiPropertyOptional({ minimum: -90, maximum: 90 })
  @IsOptional()
  @IsNumber()
  @Min(-90)
  @Max(90)
  centerLat?: number;

  @ApiPropertyOptional({ minimum: -180, maximum: 180 })
  @IsOptional()
  @IsNumber()
  @Min(-180)
  @Max(180)
  centerLng?: number;
}
```

- [ ] **Step 3: Update DTO** — `update-zone.dto.ts`

```ts
import { PartialType } from '@nestjs/swagger';
import { CreateZoneDto } from './create-zone.dto';

export class UpdateZoneDto extends PartialType(CreateZoneDto) {}
```

> **Teaching note / tradeoff:** `PartialType` (from `@nestjs/swagger`, so it
> preserves Swagger metadata) makes every `CreateZoneDto` field optional while
> keeping its validators (applied only when present). This differs from the
> hand-written `UpdateUserDto` in `users/` — we deliberately choose the DRY
> `PartialType` form here (less drift when fields change) over the explicit
> hand-written form (more obvious at a glance). Either is acceptable; this slice
> standardizes on `PartialType` for update DTOs.

- [ ] **Step 4: Write the failing service test** — `zones.service.spec.ts`

```ts
import { ConflictException, NotFoundException } from '@nestjs/common';
import { ZonesService } from './zones.service';

function makePrismaMock() {
  return {
    zone: {
      findUnique: jest.fn(),
      findFirst: jest.fn(),
      findMany: jest.fn(),
      count: jest.fn(),
      create: jest.fn(),
      update: jest.fn(),
      delete: jest.fn(),
    },
    driverProfile: { count: jest.fn() },
    delivery: { count: jest.fn() },
    $transaction: jest.fn((ops: unknown) =>
      Array.isArray(ops) ? Promise.all(ops as Promise<unknown>[]) : ops,
    ),
  };
}

const baseZone = {
  id: 'z1',
  name: 'Downtown',
  code: 'DT',
  centerLat: 1.5 as unknown,
  centerLng: 2.5 as unknown,
  bounds: null,
  createdAt: new Date(),
  updatedAt: new Date(),
};

describe('ZonesService', () => {
  let prisma: ReturnType<typeof makePrismaMock>;
  let service: ZonesService;

  beforeEach(() => {
    prisma = makePrismaMock();
    service = new ZonesService(prisma as never);
  });

  it('create rejects a duplicate code with 409', async () => {
    prisma.zone.findUnique.mockResolvedValue(baseZone);
    await expect(
      service.create({ name: 'Downtown', code: 'DT' }),
    ).rejects.toBeInstanceOf(ConflictException);
  });

  it('create maps Decimal lat/lng to numbers', async () => {
    prisma.zone.findUnique.mockResolvedValue(null);
    prisma.zone.create.mockResolvedValue(baseZone);
    const result = await service.create({ name: 'Downtown', code: 'DT' });
    expect(result.centerLat).toBe(1.5);
    expect(result.centerLng).toBe(2.5);
    expect(typeof result.centerLat).toBe('number');
  });

  it('getById throws 404 when missing', async () => {
    prisma.zone.findUnique.mockResolvedValue(null);
    await expect(service.getById('nope')).rejects.toBeInstanceOf(
      NotFoundException,
    );
  });

  it('list returns a paginated envelope', async () => {
    prisma.zone.findMany.mockResolvedValue([baseZone]);
    prisma.zone.count.mockResolvedValue(1);
    const result = await service.list({ page: 1, limit: 20 });
    expect(result.data).toHaveLength(1);
    expect(result.meta).toEqual({
      page: 1,
      limit: 20,
      total: 1,
      totalPages: 1,
    });
  });

  it('remove rejects when drivers or deliveries reference the zone (409)', async () => {
    prisma.zone.findUnique.mockResolvedValue(baseZone);
    prisma.driverProfile.count.mockResolvedValue(2);
    prisma.delivery.count.mockResolvedValue(0);
    await expect(service.remove('z1')).rejects.toBeInstanceOf(
      ConflictException,
    );
    expect(prisma.zone.delete).not.toHaveBeenCalled();
  });

  it('remove deletes an unreferenced zone', async () => {
    prisma.zone.findUnique.mockResolvedValue(baseZone);
    prisma.driverProfile.count.mockResolvedValue(0);
    prisma.delivery.count.mockResolvedValue(0);
    await service.remove('z1');
    expect(prisma.zone.delete).toHaveBeenCalledWith({ where: { id: 'z1' } });
  });
});
```

Run: `npm test -w @logidash/api -- zones.service` → FAIL (module not found).

- [ ] **Step 5: Implement the service** — `zones.service.ts`

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
import type { ZoneModel } from '../../generated/prisma/models/Zone';
import { PrismaService } from '../../prisma/prisma.service';
import { CreateZoneDto } from './dto/create-zone.dto';
import { UpdateZoneDto } from './dto/update-zone.dto';
import { ZoneDto } from './dto/zone.dto';

function toZoneDto(zone: ZoneModel): ZoneDto {
  return {
    id: zone.id,
    name: zone.name,
    code: zone.code,
    centerLat: zone.centerLat === null ? null : Number(zone.centerLat),
    centerLng: zone.centerLng === null ? null : Number(zone.centerLng),
    createdAt: zone.createdAt,
    updatedAt: zone.updatedAt,
  };
}

@Injectable()
export class ZonesService {
  constructor(private readonly prisma: PrismaService) {}

  async create(dto: CreateZoneDto): Promise<ZoneDto> {
    const existing = await this.prisma.zone.findUnique({
      where: { code: dto.code },
    });
    if (existing) {
      throw new ConflictException('Zone code already in use');
    }
    const zone = await this.prisma.zone.create({
      data: {
        name: dto.name,
        code: dto.code,
        centerLat: dto.centerLat,
        centerLng: dto.centerLng,
      },
    });
    return toZoneDto(zone);
  }

  async list(query: PaginationQueryDto): Promise<Paginated<ZoneDto>> {
    const { skip, take } = toSkipTake(query.page, query.limit);
    const [rows, total] = await this.prisma.$transaction([
      this.prisma.zone.findMany({ skip, take, orderBy: { code: 'asc' } }),
      this.prisma.zone.count(),
    ]);
    return paginate(rows.map(toZoneDto), total, query.page, query.limit);
  }

  async getById(id: string): Promise<ZoneDto> {
    const zone = await this.prisma.zone.findUnique({ where: { id } });
    if (!zone) {
      throw new NotFoundException('Zone not found');
    }
    return toZoneDto(zone);
  }

  async update(id: string, dto: UpdateZoneDto): Promise<ZoneDto> {
    await this.getById(id); // 404 if missing
    if (dto.code) {
      const clash = await this.prisma.zone.findFirst({
        where: { code: dto.code, id: { not: id } },
      });
      if (clash) {
        throw new ConflictException('Zone code already in use');
      }
    }
    const zone = await this.prisma.zone.update({
      where: { id },
      data: { ...dto },
    });
    return toZoneDto(zone);
  }

  async remove(id: string): Promise<void> {
    await this.getById(id); // 404 if missing
    const [driverCount, deliveryCount] = await this.prisma.$transaction([
      this.prisma.driverProfile.count({ where: { baseZoneId: id } }),
      this.prisma.delivery.count({ where: { zoneId: id } }),
    ]);
    if (driverCount > 0 || deliveryCount > 0) {
      throw new ConflictException(
        'Zone is referenced by drivers or deliveries and cannot be deleted',
      );
    }
    await this.prisma.zone.delete({ where: { id } });
  }
}
```

Run: `npm test -w @logidash/api -- zones.service` → PASS.

- [ ] **Step 6: Controller** — `zones.controller.ts`

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
  Query,
} from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { ApiPaginatedResponse } from '../../common/decorators/api-paginated-response.decorator';
import { Roles } from '../../common/decorators/roles.decorator';
import { PaginationQueryDto } from '../../common/dto/pagination-query.dto';
import type { Paginated } from '../../common/pagination/paginate';
import { Role } from '../../generated/prisma/enums';
import { CreateZoneDto } from './dto/create-zone.dto';
import { UpdateZoneDto } from './dto/update-zone.dto';
import { ZoneDto } from './dto/zone.dto';
import { ZonesService } from './zones.service';

@ApiTags('zones')
@ApiBearerAuth()
@Controller('zones')
export class ZonesController {
  constructor(private readonly zones: ZonesService) {}

  @Post()
  @Roles(Role.admin, Role.dispatcher)
  create(@Body() dto: CreateZoneDto): Promise<ZoneDto> {
    return this.zones.create(dto);
  }

  @Get()
  @ApiPaginatedResponse(ZoneDto)
  list(@Query() query: PaginationQueryDto): Promise<Paginated<ZoneDto>> {
    return this.zones.list(query);
  }

  @Get(':id')
  getById(@Param('id') id: string): Promise<ZoneDto> {
    return this.zones.getById(id);
  }

  @Patch(':id')
  @Roles(Role.admin, Role.dispatcher)
  update(
    @Param('id') id: string,
    @Body() dto: UpdateZoneDto,
  ): Promise<ZoneDto> {
    return this.zones.update(id, dto);
  }

  @Delete(':id')
  @Roles(Role.admin, Role.dispatcher)
  @HttpCode(204)
  remove(@Param('id') id: string): Promise<void> {
    return this.zones.remove(id);
  }
}
```

- [ ] **Step 7: Module** — `zones.module.ts`

```ts
import { Module } from '@nestjs/common';
import { ZonesController } from './zones.controller';
import { ZonesService } from './zones.service';

@Module({
  controllers: [ZonesController],
  providers: [ZonesService],
  exports: [ZonesService],
})
export class ZonesModule {}
```

- [ ] **Step 8: Register in `AppModule`**

In `apps/api/src/app.module.ts`, add `import { ZonesModule } from './modules/zones/zones.module';` and add `ZonesModule` to the `imports` array (after `UsersModule`).

- [ ] **Step 9: Build + lint + unit**

```powershell
npm run build -w @logidash/api
npm run lint -w @logidash/api
npm test -w @logidash/api -- zones.service
```

Expected: all PASS.

- [ ] **Step 10: Commit**

```
git add apps/api/src/modules/zones apps/api/src/app.module.ts
git commit -m "feat(zones): role-gated CRUD with pagination + referential delete guard"
```

---

## Task 4: VehiclesModule — role-gated CRUD + active/inactive

**Files:**

- Create: `apps/api/src/modules/vehicles/dto/vehicle.dto.ts`, `create-vehicle.dto.ts`, `update-vehicle.dto.ts`
- Create: `apps/api/src/modules/vehicles/vehicles.service.ts` + `vehicles.service.spec.ts`
- Create: `apps/api/src/modules/vehicles/vehicles.controller.ts`
- Create: `apps/api/src/modules/vehicles/vehicles.module.ts`
- Modify: `apps/api/src/app.module.ts`

> **Vehicle schema (reference):** `id, driverId String? @unique, type VehicleType,
capacityWeight Decimal, capacityVolume Decimal, status VehicleStatus
@default(active), createdAt, updatedAt`; relations `driver DriverProfile?` and
> `assignments Assignment[]`. **Driver↔vehicle linking is deferred to the Drivers
> slice** (DriverProfile is owned there) — `driverId` is **read-only output** in
> this slice (reflects seed links), not settable via create/update. **active/
> inactive** is the `status` field, toggled through the update endpoint. `remove`
> guards against vehicles referenced by assignments (clean 409).

**Roles:** same matrix as Zones — write `@Roles(admin, dispatcher)`, read open.

- [ ] **Step 1: Output DTO** — `vehicle.dto.ts`

```ts
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { VehicleStatus, VehicleType } from '../../../generated/prisma/enums';

export class VehicleDto {
  @ApiProperty() id!: string;
  @ApiProperty({ enum: VehicleType }) type!: VehicleType;
  @ApiProperty() capacityWeight!: number;
  @ApiProperty() capacityVolume!: number;
  @ApiProperty({ enum: VehicleStatus }) status!: VehicleStatus;
  @ApiPropertyOptional({ type: String, nullable: true }) driverId!:
    | string
    | null;
  @ApiProperty() createdAt!: Date;
  @ApiProperty() updatedAt!: Date;
}
```

- [ ] **Step 2: Create DTO** — `create-vehicle.dto.ts`

```ts
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsEnum, IsOptional, IsPositive } from 'class-validator';
import { VehicleStatus, VehicleType } from '../../../generated/prisma/enums';

export class CreateVehicleDto {
  @ApiProperty({ enum: VehicleType }) @IsEnum(VehicleType) type!: VehicleType;
  @ApiProperty({ minimum: 0 }) @IsPositive() capacityWeight!: number;
  @ApiProperty({ minimum: 0 }) @IsPositive() capacityVolume!: number;

  @ApiPropertyOptional({ enum: VehicleStatus })
  @IsOptional()
  @IsEnum(VehicleStatus)
  status?: VehicleStatus;
}
```

> `@IsPositive()` implies a number and rejects ≤ 0 — capacities must be > 0.
> With the global `ValidationPipe`'s `transform: true`, a numeric JSON body value
> arrives as a `number`; `@IsPositive` validates it. (If clients send capacities
> as strings, add `@Type(() => Number)` — not needed for JSON number bodies.)

- [ ] **Step 3: Update DTO** — `update-vehicle.dto.ts`

```ts
import { PartialType } from '@nestjs/swagger';
import { CreateVehicleDto } from './create-vehicle.dto';

export class UpdateVehicleDto extends PartialType(CreateVehicleDto) {}
```

- [ ] **Step 4: Write the failing service test** — `vehicles.service.spec.ts`

```ts
import { ConflictException, NotFoundException } from '@nestjs/common';
import { VehicleStatus, VehicleType } from '../../generated/prisma/enums';
import { VehiclesService } from './vehicles.service';

function makePrismaMock() {
  return {
    vehicle: {
      findUnique: jest.fn(),
      findMany: jest.fn(),
      count: jest.fn(),
      create: jest.fn(),
      update: jest.fn(),
      delete: jest.fn(),
    },
    assignment: { count: jest.fn() },
    $transaction: jest.fn((ops: unknown) =>
      Array.isArray(ops) ? Promise.all(ops as Promise<unknown>[]) : ops,
    ),
  };
}

const baseVehicle = {
  id: 'v1',
  driverId: null,
  type: VehicleType.van,
  capacityWeight: 1000 as unknown,
  capacityVolume: 8 as unknown,
  status: VehicleStatus.active,
  createdAt: new Date(),
  updatedAt: new Date(),
};

describe('VehiclesService', () => {
  let prisma: ReturnType<typeof makePrismaMock>;
  let service: VehiclesService;

  beforeEach(() => {
    prisma = makePrismaMock();
    service = new VehiclesService(prisma as never);
  });

  it('create maps Decimal capacities to numbers and defaults status active', async () => {
    prisma.vehicle.create.mockResolvedValue(baseVehicle);
    const result = await service.create({
      type: VehicleType.van,
      capacityWeight: 1000,
      capacityVolume: 8,
    });
    expect(result.capacityWeight).toBe(1000);
    expect(typeof result.capacityVolume).toBe('number');
    expect(result.status).toBe(VehicleStatus.active);
  });

  it('getById throws 404 when missing', async () => {
    prisma.vehicle.findUnique.mockResolvedValue(null);
    await expect(service.getById('nope')).rejects.toBeInstanceOf(
      NotFoundException,
    );
  });

  it('list returns a paginated envelope', async () => {
    prisma.vehicle.findMany.mockResolvedValue([baseVehicle]);
    prisma.vehicle.count.mockResolvedValue(1);
    const result = await service.list({ page: 1, limit: 20 });
    expect(result.data).toHaveLength(1);
    expect(result.meta.total).toBe(1);
    expect(result.meta.totalPages).toBe(1);
  });

  it('remove rejects a vehicle referenced by assignments (409)', async () => {
    prisma.vehicle.findUnique.mockResolvedValue(baseVehicle);
    prisma.assignment.count.mockResolvedValue(1);
    await expect(service.remove('v1')).rejects.toBeInstanceOf(
      ConflictException,
    );
    expect(prisma.vehicle.delete).not.toHaveBeenCalled();
  });

  it('remove deletes an unreferenced vehicle', async () => {
    prisma.vehicle.findUnique.mockResolvedValue(baseVehicle);
    prisma.assignment.count.mockResolvedValue(0);
    await service.remove('v1');
    expect(prisma.vehicle.delete).toHaveBeenCalledWith({ where: { id: 'v1' } });
  });
});
```

Run: `npm test -w @logidash/api -- vehicles.service` → FAIL.

- [ ] **Step 5: Implement the service** — `vehicles.service.ts`

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
import type { VehicleModel } from '../../generated/prisma/models/Vehicle';
import { PrismaService } from '../../prisma/prisma.service';
import { CreateVehicleDto } from './dto/create-vehicle.dto';
import { UpdateVehicleDto } from './dto/update-vehicle.dto';
import { VehicleDto } from './dto/vehicle.dto';

function toVehicleDto(vehicle: VehicleModel): VehicleDto {
  return {
    id: vehicle.id,
    type: vehicle.type,
    capacityWeight: Number(vehicle.capacityWeight),
    capacityVolume: Number(vehicle.capacityVolume),
    status: vehicle.status,
    driverId: vehicle.driverId,
    createdAt: vehicle.createdAt,
    updatedAt: vehicle.updatedAt,
  };
}

@Injectable()
export class VehiclesService {
  constructor(private readonly prisma: PrismaService) {}

  async create(dto: CreateVehicleDto): Promise<VehicleDto> {
    const vehicle = await this.prisma.vehicle.create({
      data: {
        type: dto.type,
        capacityWeight: dto.capacityWeight,
        capacityVolume: dto.capacityVolume,
        status: dto.status,
      },
    });
    return toVehicleDto(vehicle);
  }

  async list(query: PaginationQueryDto): Promise<Paginated<VehicleDto>> {
    const { skip, take } = toSkipTake(query.page, query.limit);
    const [rows, total] = await this.prisma.$transaction([
      this.prisma.vehicle.findMany({
        skip,
        take,
        orderBy: { createdAt: 'asc' },
      }),
      this.prisma.vehicle.count(),
    ]);
    return paginate(rows.map(toVehicleDto), total, query.page, query.limit);
  }

  async getById(id: string): Promise<VehicleDto> {
    const vehicle = await this.prisma.vehicle.findUnique({ where: { id } });
    if (!vehicle) {
      throw new NotFoundException('Vehicle not found');
    }
    return toVehicleDto(vehicle);
  }

  async update(id: string, dto: UpdateVehicleDto): Promise<VehicleDto> {
    await this.getById(id); // 404 if missing
    const vehicle = await this.prisma.vehicle.update({
      where: { id },
      data: { ...dto },
    });
    return toVehicleDto(vehicle);
  }

  async remove(id: string): Promise<void> {
    await this.getById(id); // 404 if missing
    const assignmentCount = await this.prisma.assignment.count({
      where: { vehicleId: id },
    });
    if (assignmentCount > 0) {
      throw new ConflictException(
        'Vehicle is referenced by assignments and cannot be deleted',
      );
    }
    await this.prisma.vehicle.delete({ where: { id } });
  }
}
```

Run: `npm test -w @logidash/api -- vehicles.service` → PASS.

- [ ] **Step 6: Controller** — `vehicles.controller.ts`

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
  Query,
} from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { ApiPaginatedResponse } from '../../common/decorators/api-paginated-response.decorator';
import { Roles } from '../../common/decorators/roles.decorator';
import { PaginationQueryDto } from '../../common/dto/pagination-query.dto';
import type { Paginated } from '../../common/pagination/paginate';
import { Role } from '../../generated/prisma/enums';
import { CreateVehicleDto } from './dto/create-vehicle.dto';
import { UpdateVehicleDto } from './dto/update-vehicle.dto';
import { VehicleDto } from './dto/vehicle.dto';
import { VehiclesService } from './vehicles.service';

@ApiTags('vehicles')
@ApiBearerAuth()
@Controller('vehicles')
export class VehiclesController {
  constructor(private readonly vehicles: VehiclesService) {}

  @Post()
  @Roles(Role.admin, Role.dispatcher)
  create(@Body() dto: CreateVehicleDto): Promise<VehicleDto> {
    return this.vehicles.create(dto);
  }

  @Get()
  @ApiPaginatedResponse(VehicleDto)
  list(@Query() query: PaginationQueryDto): Promise<Paginated<VehicleDto>> {
    return this.vehicles.list(query);
  }

  @Get(':id')
  getById(@Param('id') id: string): Promise<VehicleDto> {
    return this.vehicles.getById(id);
  }

  @Patch(':id')
  @Roles(Role.admin, Role.dispatcher)
  update(
    @Param('id') id: string,
    @Body() dto: UpdateVehicleDto,
  ): Promise<VehicleDto> {
    return this.vehicles.update(id, dto);
  }

  @Delete(':id')
  @Roles(Role.admin, Role.dispatcher)
  @HttpCode(204)
  remove(@Param('id') id: string): Promise<void> {
    return this.vehicles.remove(id);
  }
}
```

- [ ] **Step 7: Module** — `vehicles.module.ts`

```ts
import { Module } from '@nestjs/common';
import { VehiclesController } from './vehicles.controller';
import { VehiclesService } from './vehicles.service';

@Module({
  controllers: [VehiclesController],
  providers: [VehiclesService],
  exports: [VehiclesService],
})
export class VehiclesModule {}
```

- [ ] **Step 8: Register in `AppModule`** — add the import + `VehiclesModule` to `imports` (after `ZonesModule`).

- [ ] **Step 9: Build + lint + unit**

```powershell
npm run build -w @logidash/api
npm run lint -w @logidash/api
npm test -w @logidash/api -- vehicles.service
```

- [ ] **Step 10: Commit**

```
git add apps/api/src/modules/vehicles apps/api/src/app.module.ts
git commit -m "feat(vehicles): role-gated CRUD with pagination and active/inactive status"
```

---

## Task 5: e2e — role matrix + paginated envelope + error shapes

**Files:**

- Create: `apps/api/test/zones-vehicles.e2e-spec.ts`

> Requires Docker Postgres on **5433**. Mirrors the auth e2e: builds its own Nest
> app, re-applies `enableVersioning` + `ValidationPipe` in `beforeAll`
> (the `AllExceptionsFilter` is auto-active via `APP_FILTER` — no mirroring), uses
> the `/v1` prefix on business routes, version-neutral `/health`, four role users
> with `@logidash.test` emails, and cleans up all rows it creates.

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
    expect(res.body).toMatchObject({
      statusCode: 409,
      error: expect.any(String),
      message: expect.any(String),
    });
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
```

> **Cleanup note:** vehicles created here are not code-keyed, so they persist in
> the test DB. That's acceptable (the e2e asserts behavior, not row counts). If
> you prefer a spotless DB, capture created vehicle ids and `prisma.vehicle.delete`
> them in `afterAll` — optional.

- [ ] **Step 2: Run the e2e** (Docker Postgres up on 5433)

```powershell
npm run test:e2e -w @logidash/api
```

Expected: PASS — the new zones/vehicles suite plus the existing auth e2e stay green.

- [ ] **Step 3: Commit**

```
git add apps/api/test/zones-vehicles.e2e-spec.ts
git commit -m "test(api): e2e for zones/vehicles role matrix, pagination, and error shapes"
```

---

## Task 6: Docs sync

**Files:**

- Modify: `docs/implementation-plan.md`
- Modify: `docs/context/progress-tracker.md`

- [ ] **Step 1: Implementation plan** — in Phase 4, mark the now-done items and add a slice status note:
  - Tick `☑ ZonesModule: CRUD (admin/dispatcher write; viewer read)`.
  - Tick `☑ VehiclesModule: CRUD + active/inactive; capacity fields`.
  - Tick `☑ Global exception filter + standardized error model (spec §9)`.
  - For `Swagger annotations + DTOs … offset pagination envelope`, note the
    pagination envelope + filter foundations landed (Slice 1); the rest follows
    per-module.
  - Add: `> **Status (Slice 1, 2026-06-06):** foundations (exception filter +
pagination) + Zones + Vehicles shipped, role-gated and paginated, with unit +
e2e green. Drivers, Deliveries (status graph), and Audit are later slices.`

- [ ] **Step 2: Progress tracker** — update **Current Phase**/**Current Goal** to
      "Phase 4 Slice 1 done; next slice = Drivers + Deliveries + Audit", add a
      **Completed** bullet for Slice 1 (filter, pagination, Zones, Vehicles, e2e),
      and a Session Note dated 2026-06-06.

- [ ] **Step 3: Final verification (whole API)**

```powershell
npm run build -w @logidash/api
npm run lint -w @logidash/api
npm test -w @logidash/api
npm run test:e2e -w @logidash/api
```

Expected: all PASS.

- [ ] **Step 4: Commit**

```
git add docs/implementation-plan.md docs/context/progress-tracker.md
git commit -m "docs: mark Phase 4 Slice 1 (foundations + zones + vehicles) complete"
```

---

## Self-Review

**Spec coverage (Phase 4 Slice 1 scope):**

- Global exception filter + `{ statusCode, error, message, details? }` (spec §9) → Task 1. ✅
- Offset pagination envelope (spec §9) → Task 2. ✅
- `ZonesModule` CRUD, admin/dispatcher write + viewer read → Task 3. ✅
- Zone referential-delete → 409 (spec §9 business-rule conflict) → Task 3. ✅
- `VehiclesModule` CRUD + active/inactive + capacity fields → Task 4. ✅
- Role matrix + paginated envelope + error-shape e2e → Task 5. ✅
- Docs sync → Task 6. ✅

**Deferred to later Phase 4 slices (intentional):** `DriversModule`,
`DeliveriesModule` (spec §8 status-transition graph + driver-own-assignment
rule), `AuditModule` (append-only audit in transactions), and driver↔vehicle
linking. The recommendation engine (Phase 6) and maps (Phase 5) are separate
phases.

**Invariant check (`code-standards.md`):** business rules live in services (not
controllers); controllers are thin (validate → delegate → shape); all DB access
via Prisma in the service layer; every endpoint has `class-validator` DTOs +
Swagger decorators; authorization via `@Roles` + the global `RolesGuard` (no ad
hoc checks); errors flow through the global filter; lists return the predictable
paginated envelope. No invariant violated.

**Type consistency:** `ZoneModel`/`VehicleModel` row types map to `ZoneDto`/
`VehicleDto` via `to…Dto` (Decimal → number). `Paginated<XDto>` is produced by
`paginate(...)` and documented by `@ApiPaginatedResponse(XDto)`. `PaginationQueryDto`
is consumed by every `list(...)`. Role enum imported from `generated/prisma/enums`
throughout.

**Placeholder scan:** every code step shows full code; no "TBD"/"similar to Task
N". One optional note (vehicle cleanup in e2e) gives an explicit choice, not a
placeholder.
