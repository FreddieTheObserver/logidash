# Phase 8 Slice 3 — Dashboard, Drivers, Admin Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the three remaining `RouteStub` screens (Dashboard, Drivers list/detail, Admin) and land the nav count badges, backed by four additive read-only API capabilities.

**Architecture:** Full-stack slice, backend-first (Slice 2 precedent): (1) `GET /v1/dashboard/stats`, (2) `DriverDto` + `name`/`vehicle` summary, (3) `AssignmentDto` + `delivery` summary, (4) `GET /v1/audit` + `entityId` on `AuditEntryDto` — then contract re-emit + Orval regen, then the three screens consuming only `@logidash/api-client` hooks. No schema migration.

**Tech Stack:** NestJS 11 + Prisma 7 (api), OpenAPI → Orval react-query client, React 19 + Tailwind 4 + TanStack Query (web), Jest (api) / Vitest+RTL (web).

**Spec:** `docs/superpowers/specs/2026-07-13-phase-8-slice-3-dashboard-drivers-admin-design.md`

## Global Constraints

- Branch: `phase-8-slice-3-dashboard-drivers-admin` (already created, spec committed). One commit per task. No `Co-Authored-By` trailer in commit messages.
- Frontend consumes **only** `@logidash/api-client` — never hand-written API types; never edit `packages/api-client/src/generated/*` by hand (regenerate via `pnpm gen`).
- Components consume tokens (`var(--color-*)`, `var(--tint-*)`, `TONE`), never raw hex. Never put a `*/` sequence inside a CSS comment in `tailwind.css`.
- Every async surface: loading (skeleton) / empty / error / data states.
- API error contract: `400` carries flat `details: string[]` (leading property name maps to the field); business rules are `409` with `message`.
- SLA semantics: breached = non-terminal past deadline; at-risk = non-terminal within **90 min** (`apps/web/src/lib/format.ts` `deadlineState`; server mirrors via `AT_RISK_WINDOW_MS`).
- Audit `entityType` values are **capitalized** (`'Delivery'`, `'Assignment'`) — match exactly in frontend checks.
- The pre-commit hook runs ESLint with `--max-warnings 0` and reverts on non-fixable errors — run `pnpm --filter <pkg> lint:check` before committing when in doubt.
- e2e requires Docker Postgres on **5433** (`docker compose up -d`), runs serially (`maxWorkers: 1`). e2e `login` helpers must **not** be `async`.

---

### Task 1: `GET /v1/audit` + `entityId` on `AuditEntryDto`

**Files:**

- Modify: `apps/api/src/modules/audit/dto/audit-entry.dto.ts`
- Modify: `apps/api/src/modules/audit/audit.service.ts`
- Create: `apps/api/src/modules/audit/audit.controller.ts`
- Modify: `apps/api/src/modules/audit/audit.module.ts`
- Test: `apps/api/src/modules/audit/audit.service.spec.ts` (extend)

**Interfaces:**

- Consumes: existing `AuditService`, `paginate`/`toSkipTake`, `PaginationQueryDto`, `ApiPaginatedResponse`, `ApiErrorResponses`.
- Produces: `AuditService.listRecent(query: PaginationQueryDto): Promise<Paginated<AuditEntryDto>>`; route `GET /v1/audit` (operationId `auditList` → hook `useAuditList`); `AuditEntryDto.entityId: string` now present on **both** audit endpoints.

- [ ] **Step 1: Write the failing tests** — extend `audit.service.spec.ts` (reuse the file's existing prisma-mock helpers; wire `$transaction` with `mockResolvedValue` after construction, per the repo's mock convention):

```ts
describe('listRecent', () => {
  it('returns newest-first entries with actor fields and entityId', async () => {
    const row = {
      id: 'a1',
      action: 'delivery.created',
      entityType: 'Delivery',
      entityId: 'd1',
      actorUserId: 'u1',
      before: null,
      after: { reference: 'DEL-1' },
      reason: null,
      createdAt: new Date('2026-07-13T10:00:00Z'),
      actor: { name: 'Dana Dispatcher', role: 'dispatcher' },
    };
    prisma.$transaction.mockResolvedValue([[row], 1]);

    const page = await service.listRecent({ page: 1, limit: 8 });

    expect(prisma.auditLog.findMany).toHaveBeenCalledWith({
      include: { actor: true },
      orderBy: { createdAt: 'desc' },
      skip: 0,
      take: 8,
    });
    expect(page.meta.total).toBe(1);
    expect(page.data[0]).toMatchObject({
      id: 'a1',
      entityId: 'd1',
      actorName: 'Dana Dispatcher',
      actorRole: 'dispatcher',
    });
  });
});

// And in the existing listForDelivery expectations: assert `entityId` is now
// present on the mapped DTO (add `entityId: 'd1'` to the existing fixture's
// expected object).
```

- [ ] **Step 2: Run to verify failure**

Run: `pnpm --filter @logidash/api test -- audit.service`
Expected: FAIL — `service.listRecent is not a function` (and/or missing `entityId`).

- [ ] **Step 3: Implement** —

`audit-entry.dto.ts`: add after `entityType`:

```ts
  @ApiProperty() entityId!: string;
```

`audit.service.ts`: add `entityId: row.entityId,` to `toAuditEntryDto` (after `entityType`), and add the method:

```ts
  async listRecent(
    query: PaginationQueryDto,
  ): Promise<Paginated<AuditEntryDto>> {
    const { skip, take } = toSkipTake(query.page, query.limit);
    const [rows, total] = await this.prisma.$transaction([
      this.prisma.auditLog.findMany({
        include: { actor: true },
        orderBy: { createdAt: 'desc' },
        skip,
        take,
      }),
      this.prisma.auditLog.count(),
    ]);
    return paginate(rows.map(toAuditEntryDto), total, query.page, query.limit);
  }
```

`audit.controller.ts` (new — any authenticated role, matching the delivery-scoped audit precedent):

```ts
import { Controller, Get, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { ApiErrorResponses } from '../../common/decorators/api-error-responses.decorator';
import { ApiPaginatedResponse } from '../../common/decorators/api-paginated-response.decorator';
import { PaginationQueryDto } from '../../common/dto/pagination-query.dto';
import type { Paginated } from '../../common/pagination/paginate';
import { AuditService } from './audit.service';
import { AuditEntryDto } from './dto/audit-entry.dto';

@ApiTags('audit')
@ApiBearerAuth()
@ApiErrorResponses(401)
@Controller('audit')
export class AuditController {
  constructor(private readonly audit: AuditService) {}

  @Get()
  @ApiPaginatedResponse(AuditEntryDto)
  @ApiErrorResponses(400)
  list(@Query() query: PaginationQueryDto): Promise<Paginated<AuditEntryDto>> {
    return this.audit.listRecent(query);
  }
}
```

`audit.module.ts`: add `controllers: [AuditController]` (import it).

- [ ] **Step 4: Run to verify pass**

Run: `pnpm --filter @logidash/api test -- audit.service` then `pnpm --filter @logidash/api build && pnpm --filter @logidash/api lint:check`
Expected: PASS, build + lint clean. (The deliveries service maps through the same `toAuditEntryDto`, so the delivery timeline gains `entityId` for free — its spec fixtures may need the field added.)

- [ ] **Step 5: Commit**

```bash
git add apps/api/src/modules/audit
git commit -m "feat(api): GET /v1/audit global feed + entityId on audit entries"
```

---

### Task 2: `GET /v1/dashboard/stats`

**Files:**

- Create: `apps/api/src/modules/dashboard/dto/dashboard-stats.dto.ts`
- Create: `apps/api/src/modules/dashboard/dashboard.service.ts`
- Create: `apps/api/src/modules/dashboard/dashboard.controller.ts`
- Create: `apps/api/src/modules/dashboard/dashboard.module.ts`
- Modify: `apps/api/src/app.module.ts` (register `DashboardModule`)
- Test: `apps/api/src/modules/dashboard/dashboard.service.spec.ts`

**Interfaces:**

- Consumes: `PrismaService`, Prisma enums `DeliveryStatus`/`DriverAvailability`.
- Produces: `DashboardService.getStats(now?: Date): Promise<DashboardStatsDto>`; route `GET /v1/dashboard/stats` (operationId `dashboardGetStats` → hook `useDashboardGetStats`); `DashboardStatsDto { deliveries: { draft, ready, active, atRisk, breached, open }, drivers: { available, busy, offline, total } }`; exported `AT_RISK_WINDOW_MS`.

- [ ] **Step 1: Write the failing spec** — `dashboard.service.spec.ts`:

```ts
import { Test } from '@nestjs/testing';
import { PrismaService } from '../../prisma/prisma.service';
import { DashboardService } from './dashboard.service';

describe('DashboardService', () => {
  let service: DashboardService;
  const prisma = {
    delivery: { groupBy: jest.fn(), count: jest.fn() },
    driverProfile: { groupBy: jest.fn() },
    $transaction: jest.fn(),
  };

  beforeEach(async () => {
    jest.clearAllMocks();
    const module = await Test.createTestingModule({
      providers: [
        DashboardService,
        { provide: PrismaService, useValue: prisma },
      ],
    }).compile();
    service = module.get(DashboardService);
  });

  it('maps status and availability buckets into the stats DTO', async () => {
    prisma.$transaction.mockResolvedValue([
      [
        { status: 'draft', _count: { _all: 2 } },
        { status: 'ready', _count: { _all: 3 } },
        { status: 'assigned', _count: { _all: 1 } },
        { status: 'in_transit', _count: { _all: 2 } },
        { status: 'delivered', _count: { _all: 9 } },
      ],
      1, // breached
      2, // atRisk
      [
        { availability: 'available', _count: { _all: 2 } },
        { availability: 'busy', _count: { _all: 1 } },
      ],
    ]);

    const stats = await service.getStats(new Date('2026-07-13T10:00:00Z'));

    expect(stats.deliveries).toEqual({
      draft: 2,
      ready: 3,
      active: 3, // assigned 1 + picked_up 0 + in_transit 2
      atRisk: 2,
      breached: 1,
      open: 8, // draft 2 + ready 3 + active 3
    });
    expect(stats.drivers).toEqual({
      available: 2,
      busy: 1,
      offline: 0,
      total: 3,
    });
  });

  it('returns zeros on an empty database', async () => {
    prisma.$transaction.mockResolvedValue([[], 0, 0, []]);
    const stats = await service.getStats();
    expect(stats.deliveries.open).toBe(0);
    expect(stats.drivers.total).toBe(0);
  });

  it('queries breached/at-risk windows around the provided now', async () => {
    prisma.$transaction.mockResolvedValue([[], 0, 0, []]);
    const now = new Date('2026-07-13T10:00:00Z');
    await service.getStats(now);
    // Second element of the $transaction array is the breached count query.
    expect(prisma.delivery.count).toHaveBeenNthCalledWith(1, {
      where: expect.objectContaining({ deadlineAt: { lt: now } }),
    });
    expect(prisma.delivery.count).toHaveBeenNthCalledWith(2, {
      where: expect.objectContaining({
        deadlineAt: { gte: now, lt: new Date('2026-07-13T11:30:00Z') },
      }),
    });
  });
});
```

- [ ] **Step 2: Run to verify failure**

Run: `pnpm --filter @logidash/api test -- dashboard.service`
Expected: FAIL — cannot resolve `./dashboard.service`.

- [ ] **Step 3: Implement** —

`dto/dashboard-stats.dto.ts`:

```ts
import { ApiProperty } from '@nestjs/swagger';

export class DeliveryStatsDto {
  @ApiProperty() draft!: number;
  @ApiProperty() ready!: number;
  /** assigned + picked_up + in_transit */
  @ApiProperty() active!: number;
  /** non-terminal, deadline within the at-risk window */
  @ApiProperty() atRisk!: number;
  /** non-terminal, deadline in the past */
  @ApiProperty() breached!: number;
  /** draft + ready + active */
  @ApiProperty() open!: number;
}

export class DriverStatsDto {
  @ApiProperty() available!: number;
  @ApiProperty() busy!: number;
  @ApiProperty() offline!: number;
  @ApiProperty() total!: number;
}

export class DashboardStatsDto {
  @ApiProperty({ type: DeliveryStatsDto }) deliveries!: DeliveryStatsDto;
  @ApiProperty({ type: DriverStatsDto }) drivers!: DriverStatsDto;
}
```

`dashboard.service.ts`:

```ts
import { Injectable } from '@nestjs/common';
import {
  DeliveryStatus,
  DriverAvailability,
} from '../../generated/prisma/enums';
import { PrismaService } from '../../prisma/prisma.service';
import { DashboardStatsDto } from './dto/dashboard-stats.dto';

/** Mirrors apps/web/src/lib/format.ts `deadlineState` (at-risk < 90 min). */
export const AT_RISK_WINDOW_MS = 90 * 60_000;

const OPEN_STATUSES: DeliveryStatus[] = [
  DeliveryStatus.draft,
  DeliveryStatus.ready,
  DeliveryStatus.assigned,
  DeliveryStatus.picked_up,
  DeliveryStatus.in_transit,
];

@Injectable()
export class DashboardService {
  constructor(private readonly prisma: PrismaService) {}

  async getStats(now: Date = new Date()): Promise<DashboardStatsDto> {
    const atRiskUntil = new Date(now.getTime() + AT_RISK_WINDOW_MS);
    const [byStatus, breached, atRisk, byAvailability] =
      await this.prisma.$transaction([
        this.prisma.delivery.groupBy({
          by: ['status'],
          _count: { _all: true },
        }),
        this.prisma.delivery.count({
          where: { status: { in: OPEN_STATUSES }, deadlineAt: { lt: now } },
        }),
        this.prisma.delivery.count({
          where: {
            status: { in: OPEN_STATUSES },
            deadlineAt: { gte: now, lt: atRiskUntil },
          },
        }),
        this.prisma.driverProfile.groupBy({
          by: ['availability'],
          _count: { _all: true },
        }),
      ]);

    const statusCount = (s: DeliveryStatus): number =>
      byStatus.find((r) => r.status === s)?._count._all ?? 0;
    const availCount = (a: DriverAvailability): number =>
      byAvailability.find((r) => r.availability === a)?._count._all ?? 0;

    const draft = statusCount(DeliveryStatus.draft);
    const ready = statusCount(DeliveryStatus.ready);
    const active =
      statusCount(DeliveryStatus.assigned) +
      statusCount(DeliveryStatus.picked_up) +
      statusCount(DeliveryStatus.in_transit);
    const available = availCount(DriverAvailability.available);
    const busy = availCount(DriverAvailability.busy);
    const offline = availCount(DriverAvailability.offline);

    return {
      deliveries: {
        draft,
        ready,
        active,
        atRisk,
        breached,
        open: draft + ready + active,
      },
      drivers: { available, busy, offline, total: available + busy + offline },
    };
  }
}
```

`dashboard.controller.ts`:

```ts
import { Controller, Get } from '@nestjs/common';
import { ApiBearerAuth, ApiOkResponse, ApiTags } from '@nestjs/swagger';
import { ApiErrorResponses } from '../../common/decorators/api-error-responses.decorator';
import { DashboardService } from './dashboard.service';
import { DashboardStatsDto } from './dto/dashboard-stats.dto';

@ApiTags('dashboard')
@ApiBearerAuth()
@ApiErrorResponses(401)
@Controller('dashboard')
export class DashboardController {
  constructor(private readonly dashboard: DashboardService) {}

  @Get('stats')
  @ApiOkResponse({ type: DashboardStatsDto })
  getStats(): Promise<DashboardStatsDto> {
    return this.dashboard.getStats();
  }
}
```

`dashboard.module.ts`:

```ts
import { Module } from '@nestjs/common';
import { DashboardController } from './dashboard.controller';
import { DashboardService } from './dashboard.service';

@Module({
  controllers: [DashboardController],
  providers: [DashboardService],
})
export class DashboardModule {}
```

`app.module.ts`: add `DashboardModule` to `imports` (alphabetical placement with the other feature modules).

- [ ] **Step 4: Run to verify pass**

Run: `pnpm --filter @logidash/api test -- dashboard.service && pnpm --filter @logidash/api build && pnpm --filter @logidash/api lint:check`
Expected: 3 tests PASS; build + lint clean.

- [ ] **Step 5: Commit**

```bash
git add apps/api/src/modules/dashboard apps/api/src/app.module.ts
git commit -m "feat(api): GET /v1/dashboard/stats (delivery + driver counts, SLA windows)"
```

---

### Task 3: `DriverDto` enrichment — `name` + `vehicle` summary

**Files:**

- Modify: `apps/api/src/modules/drivers/dto/driver.dto.ts`
- Modify: `apps/api/src/modules/drivers/drivers.service.ts`
- Test: `apps/api/src/modules/drivers/drivers.service.spec.ts` (extend fixtures + assertions)

**Interfaces:**

- Produces: `DriverDto.name: string`, `DriverDto.vehicle: DriverVehicleSummaryDto | null` where `DriverVehicleSummaryDto { id, type: VehicleType, status: VehicleStatus, capacityWeight: number, capacityVolume: number }`. Every `DriversService` method returning `DriverDto` carries them.

- [ ] **Step 1: Extend the failing spec** — in `drivers.service.spec.ts`, extend the driver row fixtures with the relations and assert the mapping (follow the file's existing fixture helpers):

```ts
// Fixture rows gain:
//   user: { name: 'Priya Kumar' },
//   vehicle: {
//     id: 'v1', type: 'van', status: 'active',
//     capacityWeight: new Prisma.Decimal(120), capacityVolume: new Prisma.Decimal(3.5),
//   },
// (Use plain numbers if the spec's existing Decimal handling does — match siblings.)

it('maps the joined user name and vehicle summary', async () => {
  // arrange list() to resolve the enriched row
  const page = await service.list({ page: 1, limit: 20 });
  expect(page.data[0].name).toBe('Priya Kumar');
  expect(page.data[0].vehicle).toEqual({
    id: 'v1',
    type: 'van',
    status: 'active',
    capacityWeight: 120,
    capacityVolume: 3.5,
  });
});

it('maps a missing vehicle to null', async () => {
  // row with vehicle: null
  const page = await service.list({ page: 1, limit: 20 });
  expect(page.data[0].vehicle).toBeNull();
});
```

- [ ] **Step 2: Run to verify failure**

Run: `pnpm --filter @logidash/api test -- drivers.service`
Expected: FAIL — `name`/`vehicle` undefined on the DTO.

- [ ] **Step 3: Implement** —

`driver.dto.ts` (full replacement):

```ts
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  DriverAvailability,
  VehicleStatus,
  VehicleType,
} from '../../../generated/prisma/enums';

export class DriverVehicleSummaryDto {
  @ApiProperty() id!: string;
  @ApiProperty({ enum: VehicleType }) type!: VehicleType;
  @ApiProperty({ enum: VehicleStatus }) status!: VehicleStatus;
  @ApiProperty() capacityWeight!: number;
  @ApiProperty() capacityVolume!: number;
}

export class DriverDto {
  @ApiProperty() id!: string;
  @ApiProperty() userId!: string;
  @ApiProperty() name!: string;
  @ApiProperty({ enum: DriverAvailability }) availability!: DriverAvailability;
  @ApiProperty() baseZoneId!: string;
  @ApiProperty() activeJobCount!: number;
  @ApiProperty() maxConcurrentJobs!: number;
  @ApiPropertyOptional({ type: DriverVehicleSummaryDto, nullable: true })
  vehicle!: DriverVehicleSummaryDto | null;
  @ApiProperty() createdAt!: Date;
  @ApiProperty() updatedAt!: Date;
}
```

`drivers.service.ts`: replace the row type + mapper and thread the include:

```ts
import { Prisma } from '../../generated/prisma/client';

const driverInclude = {
  user: { select: { name: true } },
  vehicle: true,
} satisfies Prisma.DriverProfileInclude;

type DriverRow = Prisma.DriverProfileGetPayload<{
  include: typeof driverInclude;
}>;

function toDriverDto(d: DriverRow): DriverDto {
  return {
    id: d.id,
    userId: d.userId,
    name: d.user.name,
    availability: d.availability,
    baseZoneId: d.baseZoneId,
    activeJobCount: d.activeJobCount,
    maxConcurrentJobs: d.maxConcurrentJobs,
    vehicle: d.vehicle
      ? {
          id: d.vehicle.id,
          type: d.vehicle.type,
          status: d.vehicle.status,
          capacityWeight: Number(d.vehicle.capacityWeight),
          capacityVolume: Number(d.vehicle.capacityVolume),
        }
      : null,
    createdAt: d.createdAt,
    updatedAt: d.updatedAt,
  };
}
```

Add `include: driverInclude` to: `create` (the `driverProfile.create` call), `list` (`findMany`), `getById` (`findUnique`), `update` (`driverProfile.update`). Remove the now-unused `DriverProfileModel` import. `setVehicle` already returns `this.getById(id)` — no change.

- [ ] **Step 4: Run to verify pass**

Run: `pnpm --filter @logidash/api test -- drivers.service && pnpm --filter @logidash/api build && pnpm --filter @logidash/api lint:check`
Expected: PASS (all pre-existing tests too — their mock rows need `user`/`vehicle` added), build + lint clean.

- [ ] **Step 5: Commit**

```bash
git add apps/api/src/modules/drivers
git commit -m "feat(api): expose driver name + linked vehicle summary on DriverDto"
```

---

### Task 4: `AssignmentDto` enrichment — `delivery` summary

**Files:**

- Modify: `apps/api/src/modules/assignments/dto/assignment.dto.ts`
- Modify: `apps/api/src/modules/assignments/assignments.service.ts`
- Test: `apps/api/src/modules/assignments/assignments.service.spec.ts` (extend)

**Interfaces:**

- Produces: `AssignmentDto.delivery: AssignmentDeliverySummaryDto` where `AssignmentDeliverySummaryDto { id, reference, status: DeliveryStatus }` — on `create`, `listByDelivery`, `listByDriver`.

- [ ] **Step 1: Extend the failing spec** — assignment fixture rows gain `delivery: { id: 'd1', reference: 'DEL-1', status: 'assigned' }`; assert:

```ts
it('maps the delivery summary onto listed assignments', async () => {
  const page = await service.listByDriver('drv1', { page: 1, limit: 20 });
  expect(page.data[0].delivery).toEqual({
    id: 'd1',
    reference: 'DEL-1',
    status: 'assigned',
  });
});
```

(Also add the `delivery` object to the `create` test's `tx.assignment.create` resolved row so the happy-path assertion keeps passing.)

- [ ] **Step 2: Run to verify failure**

Run: `pnpm --filter @logidash/api test -- assignments.service`
Expected: FAIL — `delivery` undefined.

- [ ] **Step 3: Implement** —

`assignment.dto.ts`: add imports + class + field:

```ts
import { AssignmentStatus, DeliveryStatus } from '../../../generated/prisma/enums';

export class AssignmentDeliverySummaryDto {
  @ApiProperty() id!: string;
  @ApiProperty() reference!: string;
  @ApiProperty({ enum: DeliveryStatus }) status!: DeliveryStatus;
}

// on AssignmentDto, after `deliveryId`:
  @ApiProperty({ type: AssignmentDeliverySummaryDto })
  delivery!: AssignmentDeliverySummaryDto;
```

`assignments.service.ts`:

```ts
import { Prisma } from '../../generated/prisma/client';

const assignmentInclude = {
  delivery: { select: { id: true, reference: true, status: true } },
} satisfies Prisma.AssignmentInclude;

type AssignmentRow = Prisma.AssignmentGetPayload<{
  include: typeof assignmentInclude;
}>;

function toAssignmentDto(a: AssignmentRow): AssignmentDto {
  return {
    id: a.id,
    deliveryId: a.deliveryId,
    delivery: {
      id: a.delivery.id,
      reference: a.delivery.reference,
      status: a.delivery.status,
    },
    driverId: a.driverId,
    vehicleId: a.vehicleId,
    status: a.status,
    assignedByUserId: a.assignedByUserId,
    assignedAt: a.assignedAt,
    unassignedAt: a.unassignedAt,
    unassignReason: a.unassignReason,
    createdAt: a.createdAt,
    updatedAt: a.updatedAt,
  };
}
```

Add `include: assignmentInclude` to `tx.assignment.create` (in `create`) and the `findMany` in the private `list`. Remove the unused `AssignmentModel` import.

> Note: the `create` include reads the delivery row **inside** the same
> transaction that just flipped it to `assigned`, so the summary status is
> `assigned` — correct and race-free.

- [ ] **Step 4: Run to verify pass**

Run: `pnpm --filter @logidash/api test -- assignments.service && pnpm --filter @logidash/api build && pnpm --filter @logidash/api lint:check`
Expected: PASS, build + lint clean.

- [ ] **Step 5: Commit**

```bash
git add apps/api/src/modules/assignments
git commit -m "feat(api): delivery summary (id/reference/status) on AssignmentDto"
```

---

### Task 5: e2e for the new API surface

**Files:**

- Create: `apps/api/test/dashboard-audit.e2e-spec.ts`

**Interfaces:**

- Consumes: all Task 1–4 endpoints/DTOs against real Postgres (5433).

- [ ] **Step 1: Write the suite.** Copy the boot + login + cleanup pattern of `apps/api/test/drivers-deliveries.e2e-spec.ts` verbatim (module fixture from `AppModule`, `enableVersioning` + `ValidationPipe` in `beforeAll`, non-`async` `login` helper, `PREFIX`-scoped cleanup that deletes audit rows via `actor: { email: { in: … } }` **before** users). Use `PREFIX = 'E2EDA-'` and emails `e2e.da.<role>@logidash.test`. Seed in `beforeAll`: one user per role, a zone, a driver profile (availability `available`) with an active van (capacity 100/5), and — because the stats endpoint counts **globally** — capture a **baseline** `GET /v1/dashboard/stats` right after login, before seeding deliveries. Then seed three deliveries: `ready` with deadline **+2h** (on-track), `ready` with deadline **+30min** (at-risk), `draft` with deadline **−1h** (breached). Tests (delta-assert against the baseline):

```ts
it('rejects unauthenticated stats requests', () =>
  request(app.getHttpServer()).get('/v1/dashboard/stats').expect(401));

it('counts seeded deliveries and drivers in the stats buckets', async () => {
  const res = await request(app.getHttpServer())
    .get('/v1/dashboard/stats')
    .set(auth('viewer'))
    .expect(200);
  const s = res.body as DashboardStats; // typed local interface, per repo e2e style
  expect(s.deliveries.ready - baseline.deliveries.ready).toBe(2);
  expect(s.deliveries.draft - baseline.deliveries.draft).toBe(1);
  expect(s.deliveries.open - baseline.deliveries.open).toBe(3);
  expect(s.deliveries.atRisk - baseline.deliveries.atRisk).toBe(1);
  expect(s.deliveries.breached - baseline.deliveries.breached).toBe(1);
  expect(s.drivers.available - baseline.drivers.available).toBe(1);
  expect(s.drivers.total - baseline.drivers.total).toBe(1);
});

it('serves the global audit feed newest-first with entityId + actor', async () => {
  // create a delivery as dispatcher → writes a delivery.created audit row
  const created = await request(app.getHttpServer())
    .post('/v1/deliveries')
    .set(auth('dispatcher'))
    .send({
      /* PREFIX-referenced valid body */
    })
    .expect(201);
  const res = await request(app.getHttpServer())
    .get('/v1/audit?page=1&limit=10')
    .set(auth('viewer'))
    .expect(200);
  const entries = (res.body as Paginated<AuditEntry>).data;
  const mine = entries.find(
    (e) => e.action === 'delivery.created' && e.entityId === created.body.id,
  );
  expect(mine).toBeDefined();
  expect(mine!.entityType).toBe('Delivery');
  expect(typeof mine!.actorName).toBe('string');
  // newest-first: our just-created row must appear on page 1
});

it('exposes name + vehicle summary on drivers', async () => {
  const res = await request(app.getHttpServer())
    .get('/v1/drivers?limit=100')
    .set(auth('viewer'))
    .expect(200);
  const mine = res.body.data.find(
    (d: DriverRow) => d.userId === userIds.driver,
  );
  expect(mine.name).toBeDefined();
  expect(mine.vehicle).toMatchObject({ type: 'van', status: 'active' });
});

it('exposes the delivery summary on assignment history', async () => {
  // flip the on-track ready delivery to assigned via POST assignments,
  // then GET /v1/drivers/:driverId/assignments and expect
  // data[0].delivery = { id, reference: <PREFIX ref>, status: 'assigned' }
});
```

- [ ] **Step 2: Run the suite** (needs Docker Postgres up: `docker compose up -d`, then `pnpm --filter @logidash/api db:migrate` if fresh)

Run: `pnpm --filter @logidash/api test:e2e -- dashboard-audit`
Expected: all tests PASS.

- [ ] **Step 3: Run the full e2e set**

Run: `pnpm --filter @logidash/api test:e2e`
Expected: previous 48 + new tests all green (serial, ~15s).

- [ ] **Step 4: Commit**

```bash
git add apps/api/test/dashboard-audit.e2e-spec.ts
git commit -m "test(api): e2e for dashboard stats, global audit feed, enriched DTOs"
```

---

### Task 6: Contract re-emit + client regeneration

**Files:**

- Modify (generated): `apps/api/openapi.json`, `packages/api-client/src/generated/**`

- [ ] **Step 1: Regenerate**

Run: `pnpm gen`
Expected: `gen:openapi` emits **24 paths** (22 + `/v1/dashboard/stats` + `/v1/audit`); Orval regenerates; `pnpm --filter @logidash/api-client typecheck` passes.

- [ ] **Step 2: Sanity-check the new surface**

Run: `grep -l "useDashboardGetStats\|useAuditList" packages/api-client/src/generated/endpoints -r`
Expected: `endpoints/dashboard/dashboard.ts` and `endpoints/audit/audit.ts` exist; models include `dashboardStatsDto.ts`, `auditListParams.ts`; `driverDto.ts` has `name` + `vehicle`; `assignmentDto.ts` has `delivery`; `auditEntryDto.ts` has `entityId`.

- [ ] **Step 3: Verify zero residual drift + api-client tests**

Run: `pnpm gen && git status -s` → only the intended artifact changes; `pnpm --filter @logidash/api-client test` → 12 tests PASS.

- [ ] **Step 4: Commit**

```bash
git add apps/api/openapi.json packages/api-client/src/generated
git commit -m "chore(contract): regenerate OpenAPI (24 paths) + client for Slice 3"
```

---

### Task 7: Promote `mapDetailMessages` to `lib/api-errors.ts`

**Files:**

- Create: `apps/web/src/lib/api-errors.ts` (moved from `apps/web/src/features/deliveries/create-delivery-errors.ts`)
- Move test: `apps/web/src/features/deliveries/create-delivery-errors.test.ts` → `apps/web/src/lib/api-errors.test.ts`
- Modify: `apps/web/src/features/deliveries/components/NewDeliveryModal.tsx` (import path + shared `ApiError`)

**Interfaces:**

- Produces: `mapDetailMessages(details: string[]): { fields: Record<string, string>; rest: string[] }` and `type ApiError = { response?: { status?: number; data?: ErrorResponseDto } }` from `../../lib/api-errors` — consumed by every admin modal in Tasks 12–13.

- [ ] **Step 1: Move + extend**

```bash
git mv apps/web/src/features/deliveries/create-delivery-errors.ts apps/web/src/lib/api-errors.ts
git mv apps/web/src/features/deliveries/create-delivery-errors.test.ts apps/web/src/lib/api-errors.test.ts
```

In `api-errors.ts`, append the shared error shape (moved out of `NewDeliveryModal.tsx`):

```ts
import type { ErrorResponseDto } from '@logidash/api-client';

export type ApiError = {
  response?: {
    status?: number;
    data?: ErrorResponseDto;
  };
};
```

Update the moved test's import to `./api-errors`. In `NewDeliveryModal.tsx`: delete the local `ApiError` type, and import both from `../../../lib/api-errors`.

- [ ] **Step 2: Verify**

Run: `pnpm --filter @logidash/web test && pnpm --filter @logidash/web lint:check && pnpm --filter @logidash/web build`
Expected: 29 tests PASS (same count — moved, not changed), lint + build clean.

- [ ] **Step 3: Commit**

```bash
git add -A apps/web/src
git commit -m "refactor(web): promote 400-details mapper to lib/api-errors"
```

---

### Task 8: Nav count badges

**Files:**

- Modify: `apps/web/src/components/shell/nav.ts`
- Modify: `apps/web/src/components/shell/Sidebar.tsx`
- Test: `apps/web/src/components/shell/Sidebar.test.tsx` (new)

**Interfaces:**

- Consumes: `useDashboardGetStats` from `@logidash/api-client`.
- Produces: `NavItem.badge?: 'openDeliveries' | 'availableDrivers'`; the shared stats query (`refetchInterval: 60_000`, `staleTime: 30_000`) that DashboardPage reuses via the query cache.

- [ ] **Step 1: Write the failing test** — `Sidebar.test.tsx`:

```tsx
import { it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';

const useDashboardGetStats = vi.fn();
vi.mock('@logidash/api-client', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@logidash/api-client')>();
  return {
    ...actual,
    useDashboardGetStats: (...a: unknown[]) => useDashboardGetStats(...a),
  };
});

import { Sidebar } from './Sidebar';

it('renders open-deliveries and available-drivers badges from stats', () => {
  useDashboardGetStats.mockReturnValue({
    data: {
      deliveries: {
        draft: 1,
        ready: 2,
        active: 3,
        atRisk: 0,
        breached: 0,
        open: 6,
      },
      drivers: { available: 4, busy: 1, offline: 0, total: 5 },
    },
  });
  render(
    <MemoryRouter>
      <Sidebar role="dispatcher" />
    </MemoryRouter>,
  );
  expect(screen.getByText('6')).toBeInTheDocument(); // Deliveries badge
  expect(screen.getByText('4')).toBeInTheDocument(); // Drivers badge
});

it('renders no badges while stats are loading', () => {
  useDashboardGetStats.mockReturnValue({ data: undefined });
  render(
    <MemoryRouter>
      <Sidebar role="dispatcher" />
    </MemoryRouter>,
  );
  expect(screen.queryByText('6')).not.toBeInTheDocument();
});
```

- [ ] **Step 2: Run to verify failure**

Run: `pnpm --filter @logidash/web test -- Sidebar`
Expected: FAIL — no badge rendered.

- [ ] **Step 3: Implement** —

`nav.ts`: extend the interface + two items:

```ts
export interface NavItem {
  to: string;
  label: string;
  icon: IconName;
  roles: Role[];
  badge?: 'openDeliveries' | 'availableDrivers';
}
// Deliveries item gains: badge: 'openDeliveries'
// Drivers item gains:    badge: 'availableDrivers'
```

`Sidebar.tsx`: add the query + badge rendering inside the `NavLink` children (after the label span):

```tsx
import { useDashboardGetStats } from '@logidash/api-client';
// inside Sidebar():
const statsQ = useDashboardGetStats({
  query: { refetchInterval: 60_000, staleTime: 30_000 },
});
const badgeValue = (badge?: NavItem['badge']): number | null => {
  const s = statsQ.data;
  if (!badge || !s) return null;
  return badge === 'openDeliveries' ? s.deliveries.open : s.drivers.available;
};
// in the NavLink children render-prop, after the label span:
{
  badgeValue(item.badge) !== null && (
    <span
      className="tnum rounded-full px-1.5 py-0.5 text-center text-[11.5px] font-semibold"
      style={{
        minWidth: 20,
        background: isActive
          ? 'rgba(37,99,235,.15)'
          : 'var(--color-surface-alt)',
        color: isActive ? 'var(--color-primary)' : 'var(--color-text-muted)',
      }}
    >
      {badgeValue(item.badge)}
    </span>
  );
}
```

(Also import `type NavItem` in `Sidebar.tsx`.)

- [ ] **Step 4: Run to verify pass**

Run: `pnpm --filter @logidash/web test -- Sidebar && pnpm --filter @logidash/web lint:check`
Expected: PASS. Note: `AppShell`-rendered pages' existing tests mock the api-client module — if any render `Sidebar` unmocked they'll now call `useDashboardGetStats`; add it to those mocks if a failure appears.

- [ ] **Step 5: Commit**

```bash
git add apps/web/src/components/shell apps/web/src/components/shell/Sidebar.test.tsx
git commit -m "feat(web): nav count badges from shared dashboard stats query"
```

---

### Task 9: Dashboard — metric cards + driver availability + page shell + route

**Files:**

- Create: `apps/web/src/features/dashboard/DashboardPage.tsx`
- Create: `apps/web/src/features/dashboard/components/MetricCards.tsx`
- Create: `apps/web/src/features/dashboard/components/DriverAvailabilityCard.tsx`
- Modify: `apps/web/src/routes/router.tsx` (index route → `DashboardPage`)
- Test: `apps/web/src/features/dashboard/DashboardPage.test.tsx`

**Interfaces:**

- Consumes: `useDashboardGetStats`, `DashboardStatsDto`, `Card`, `Skeleton`, `ErrorState`, `ICONS`, `TONE`.
- Produces: `DashboardPage` (default dashboard route component); `MetricCards({ stats, isPending })`, `DriverAvailabilityCard({ stats, isPending })` — `stats: DashboardStatsDto | undefined`.

- [ ] **Step 1: Implement `MetricCards.tsx`**

```tsx
import type { DashboardStatsDto } from '@logidash/api-client';
import { Card } from '../../../components/ui/Card';
import { Skeleton } from '../../../components/ui/Skeleton';
import { ICONS, type IconName } from '../../../components/ui/icons';
import { TONE, type Tone } from '../../../lib/tone';

interface Metric {
  key: string;
  label: string;
  sub: string;
  icon: IconName;
  tone: Tone;
  value: (s: DashboardStatsDto) => string;
}

const METRICS: Metric[] = [
  {
    key: 'pending',
    label: 'Pending deliveries',
    sub: 'ready for assignment',
    icon: 'inbox',
    tone: 'info',
    value: (s) => String(s.deliveries.ready),
  },
  {
    key: 'active',
    label: 'Active assignments',
    sub: 'assigned · picked up · in transit',
    icon: 'route',
    tone: 'primary',
    value: (s) => String(s.deliveries.active),
  },
  {
    key: 'sla',
    label: 'SLA risk',
    sub: 'at-risk or breached',
    icon: 'alert',
    tone: 'warning',
    value: (s) => String(s.deliveries.atRisk + s.deliveries.breached),
  },
  {
    key: 'drivers',
    label: 'Drivers available',
    sub: 'of the whole fleet',
    icon: 'users',
    tone: 'success',
    value: (s) => `${s.drivers.available}/${s.drivers.total}`,
  },
];

export function MetricCards({
  stats,
  isPending,
}: {
  stats: DashboardStatsDto | undefined;
  isPending: boolean;
}) {
  return (
    <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
      {METRICS.map((m) => {
        const Icon = ICONS[m.icon];
        const t = TONE[m.tone];
        return (
          <Card key={m.key} className="p-4">
            <span
              className="flex items-center justify-center rounded-md"
              style={{ width: 34, height: 34, background: t.bg, color: t.fg }}
            >
              <Icon size={18} />
            </span>
            {isPending || !stats ? (
              <div className="mt-3 space-y-2">
                <Skeleton className="h-7 w-16" />
                <Skeleton className="h-3 w-24" />
              </div>
            ) : (
              <>
                <div
                  className="tnum mt-3 text-[28px] font-semibold leading-none"
                  style={{ color: 'var(--color-text)' }}
                >
                  {m.value(stats)}
                </div>
                <div
                  className="mt-1 text-[12.5px]"
                  style={{ color: 'var(--color-text-muted)' }}
                >
                  {m.label}
                </div>
                <div
                  className="text-[11.5px]"
                  style={{ color: 'var(--color-text-muted)' }}
                >
                  {m.sub}
                </div>
              </>
            )}
          </Card>
        );
      })}
    </div>
  );
}
```

(If `Skeleton`'s props differ — it takes `className`/size props per its existing usage in `DeliveryTableSkeleton` — match that call style.)

- [ ] **Step 2: Implement `DriverAvailabilityCard.tsx`**

```tsx
import type { DashboardStatsDto } from '@logidash/api-client';
import { Card } from '../../../components/ui/Card';
import { Skeleton } from '../../../components/ui/Skeleton';
import { Meter } from '../../../components/ui/Meter';
import { TONE, type Tone } from '../../../lib/tone';

const ROWS: {
  key: 'available' | 'busy' | 'offline';
  label: string;
  tone: Tone;
}[] = [
  { key: 'available', label: 'Available', tone: 'success' },
  { key: 'busy', label: 'Busy', tone: 'warning' },
  { key: 'offline', label: 'Offline', tone: 'neutral' },
];

export function DriverAvailabilityCard({
  stats,
  isPending,
}: {
  stats: DashboardStatsDto | undefined;
  isPending: boolean;
}) {
  return (
    <Card className="p-4">
      <h2
        className="text-[13.5px] font-semibold"
        style={{ color: 'var(--color-text)' }}
      >
        Driver availability
      </h2>
      <div className="mt-3 space-y-3">
        {isPending || !stats
          ? ROWS.map((r) => <Skeleton key={r.key} className="h-4 w-full" />)
          : ROWS.map((r) => {
              const count = stats.drivers[r.key];
              const share = stats.drivers.total
                ? count / stats.drivers.total
                : 0;
              return (
                <div key={r.key} className="flex items-center gap-3">
                  <span
                    className="h-2 w-2 shrink-0 rounded-full"
                    style={{ background: TONE[r.tone].fg }}
                  />
                  <span
                    className="w-16 text-[12.5px]"
                    style={{ color: 'var(--color-text-muted)' }}
                  >
                    {r.label}
                  </span>
                  <span className="flex-1">
                    <Meter value={share} tone={r.tone} />
                  </span>
                  <span
                    className="tnum w-6 text-right text-[12.5px] font-medium"
                    style={{ color: 'var(--color-text)' }}
                  >
                    {count}
                  </span>
                </div>
              );
            })}
      </div>
    </Card>
  );
}
```

- [ ] **Step 3: Implement `DashboardPage.tsx`** (placeholder slots for the Task 10 cards keep this task shippable):

```tsx
import { useDashboardGetStats } from '@logidash/api-client';
import { ErrorState } from '../../components/ui/ErrorState';
import { MetricCards } from './components/MetricCards';
import { DriverAvailabilityCard } from './components/DriverAvailabilityCard';

export function DashboardPage() {
  const statsQ = useDashboardGetStats({
    query: { refetchInterval: 60_000, staleTime: 30_000 },
  });

  if (statsQ.isError) {
    return (
      <div className="mx-auto max-w-[1200px] p-6">
        <ErrorState
          body="The dashboard stats could not be loaded."
          onRetry={() => void statsQ.refetch()}
        />
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-[1200px] space-y-6 p-6">
      <MetricCards stats={statsQ.data} isPending={statsQ.isPending} />
      <div className="grid gap-4 xl:grid-cols-[2fr_1fr]">
        <div /> {/* NeedsAttentionCard lands in the next task */}
        <div className="space-y-4">
          <DriverAvailabilityCard
            stats={statsQ.data}
            isPending={statsQ.isPending}
          />
        </div>
      </div>
    </div>
  );
}
```

`router.tsx`: replace `{ index: true, element: <RouteStub title="Dashboard" slice="Slice 3" /> }` with `{ index: true, element: <DashboardPage /> }` (+ import).

- [ ] **Step 4: Write the test** — `DashboardPage.test.tsx` (mock `useDashboardGetStats` exactly like `Sidebar.test.tsx`; wrap in `MemoryRouter`): loading → skeletons present; data → `getByText('2')` for ready metric, `4/5` for drivers, availability counts; error → error state + retry.

- [ ] **Step 5: Verify + commit**

Run: `pnpm --filter @logidash/web test -- Dashboard && pnpm --filter @logidash/web lint:check && pnpm --filter @logidash/web build`
Expected: PASS.

```bash
git add apps/web/src/features/dashboard apps/web/src/routes/router.tsx
git commit -m "feat(web): dashboard metric cards + driver availability (stats-driven)"
```

---

### Task 10: Dashboard — needs attention + recent activity + invalidation

**Files:**

- Create: `apps/web/src/features/dashboard/components/NeedsAttentionCard.tsx`
- Create: `apps/web/src/features/dashboard/components/RecentActivityCard.tsx`
- Modify: `apps/web/src/features/dashboard/DashboardPage.tsx` (mount both)
- Modify: `apps/web/src/features/deliveries/DeliveryDetailPage.tsx` (`invalidate()` + 2 keys)
- Modify: `apps/web/src/features/deliveries/components/NewDeliveryModal.tsx` (invalidate stats + audit on create)
- Test: extend `DashboardPage.test.tsx`

**Interfaces:**

- Consumes: `useDeliveriesList`, `useAuditList`, `getDashboardGetStatsQueryKey`, `getAuditListQueryKey`, `deriveSla`/`TERMINAL` (`lib/sla`), `fromNow` (`lib/format`), `SLA_TONE`, `DELIVERY_TONE`, `useZoneMap`.
- Produces: `NeedsAttentionCard()`, `RecentActivityCard()` (self-fetching, no props).

- [ ] **Step 1: Implement `NeedsAttentionCard.tsx`**

```tsx
import { useNavigate } from 'react-router-dom';
import { useDeliveriesList } from '@logidash/api-client';
import { Card } from '../../../components/ui/Card';
import { Chip, StatusChip, PriorityChip } from '../../../components/ui/Chip';
import { Button } from '../../../components/ui/Button';
import { Skeleton } from '../../../components/ui/Skeleton';
import { EmptyState } from '../../../components/ui/EmptyState';
import { ErrorState } from '../../../components/ui/ErrorState';
import { ICONS } from '../../../components/ui/icons';
import { useZoneMap } from '../../../hooks/useZoneMap';
import { deriveSla, TERMINAL } from '../../../lib/sla';
import { fromNow } from '../../../lib/format';
import { SLA_TONE, TONE } from '../../../lib/tone';

const MAX_ROWS = 6;

export function NeedsAttentionCard() {
  const navigate = useNavigate();
  const { zoneCode } = useZoneMap();
  // No server-side sort/multi-status params (logged gap) — fetch one wide
  // page and derive the queue client-side; fine at demo scale.
  const q = useDeliveriesList({ limit: 100 });

  const Clock = ICONS.clock;
  const Chevron = ICONS.chevronRight;

  const rows = (q.data?.data ?? [])
    .filter((d) => !TERMINAL.has(d.status))
    .sort(
      (a, b) =>
        new Date(a.deadlineAt).getTime() - new Date(b.deadlineAt).getTime(),
    )
    .slice(0, MAX_ROWS);

  return (
    <Card className="overflow-hidden">
      <div
        className="flex items-center gap-2 border-b px-4 py-3"
        style={{ borderColor: 'var(--color-border)' }}
      >
        <h2
          className="text-[13.5px] font-semibold"
          style={{ color: 'var(--color-text)' }}
        >
          Needs attention
        </h2>
        {q.data && <Chip size="sm">{rows.length}</Chip>}
        <span className="flex-1" />
        <Button
          variant="ghost"
          size="sm"
          onClick={() => navigate('/deliveries')}
        >
          View queue
        </Button>
      </div>

      {q.isError ? (
        <ErrorState
          body="Open deliveries could not be loaded."
          onRetry={() => void q.refetch()}
        />
      ) : q.isPending ? (
        <div className="space-y-3 p-4">
          {Array.from({ length: 4 }).map((_, i) => (
            <Skeleton key={i} className="h-9 w-full" />
          ))}
        </div>
      ) : rows.length === 0 ? (
        <EmptyState
          icon="check"
          title="All caught up"
          body="No open deliveries right now."
        />
      ) : (
        rows.map((d) => {
          const sla = deriveSla(d.status, d.deadlineAt);
          const tone = sla ? SLA_TONE[sla] : 'info';
          return (
            <button
              key={d.id}
              type="button"
              onClick={() => navigate(`/deliveries/${d.id}`)}
              className="hover:bg-surface-alt flex w-full items-center gap-3 border-t px-4 py-2.5 text-left"
              style={{ borderColor: 'var(--color-border)' }}
            >
              <span
                className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md"
                style={{ background: TONE[tone].bg, color: TONE[tone].fg }}
              >
                <Clock size={15} />
              </span>
              <span className="min-w-0 flex-1">
                <span className="flex items-center gap-2">
                  <span
                    className="tnum text-[13px] font-medium"
                    style={{ color: 'var(--color-text)' }}
                  >
                    {d.reference}
                  </span>
                  <PriorityChip priority={d.priority} />
                </span>
                <span
                  className="block truncate text-[12px]"
                  style={{ color: 'var(--color-text-muted)' }}
                >
                  {zoneCode(d.zoneId)} · {d.pickupAddress} → {d.dropoffAddress}
                </span>
              </span>
              <span
                className="tnum shrink-0 text-[12px]"
                style={{ color: 'var(--color-text-muted)' }}
              >
                {fromNow(d.deadlineAt)}
              </span>
              <StatusChip status={d.status} />
              <Chevron size={15} style={{ color: 'var(--color-text-muted)' }} />
            </button>
          );
        })
      )}
    </Card>
  );
}
```

(Adapt `Chip`/`StatusChip`/`PriorityChip`/`Button` prop names to their actual signatures in `components/ui` — e.g. if `Button` has no `ghost` variant, use `secondary`.)

- [ ] **Step 2: Implement `RecentActivityCard.tsx`**

```tsx
import { Link } from 'react-router-dom';
import { useAuditList } from '@logidash/api-client';
import { Card } from '../../../components/ui/Card';
import { Skeleton } from '../../../components/ui/Skeleton';
import { EmptyState } from '../../../components/ui/EmptyState';
import { ErrorState } from '../../../components/ui/ErrorState';
import { ICONS, type IconName } from '../../../components/ui/icons';
import { fromNow } from '../../../lib/format';
import { TONE, type Tone } from '../../../lib/tone';

function actionMeta(action: string): { icon: IconName; tone: Tone } {
  if (action.startsWith('assignment'))
    return { icon: 'route', tone: 'primary' };
  if (action.includes('status')) return { icon: 'activity', tone: 'info' };
  if (action.startsWith('recommendation'))
    return { icon: 'sparkles', tone: 'primary' };
  return { icon: 'plus', tone: 'neutral' }; // *.created and everything else
}

function humanize(action: string): string {
  const s = action.replace(/[._]/g, ' ');
  return s.charAt(0).toUpperCase() + s.slice(1);
}

export function RecentActivityCard() {
  const q = useAuditList({ page: 1, limit: 8 });

  return (
    <Card className="p-4">
      <h2
        className="text-[13.5px] font-semibold"
        style={{ color: 'var(--color-text)' }}
      >
        Recent activity
      </h2>
      <div className="mt-3 space-y-3">
        {q.isError ? (
          <ErrorState
            body="Recent activity could not be loaded."
            onRetry={() => void q.refetch()}
          />
        ) : q.isPending ? (
          Array.from({ length: 5 }).map((_, i) => (
            <Skeleton key={i} className="h-6 w-full" />
          ))
        ) : (q.data?.data.length ?? 0) === 0 ? (
          <EmptyState icon="inbox" title="No activity yet" body="" />
        ) : (
          q.data!.data.map((e) => {
            const meta = actionMeta(e.action);
            const Icon = ICONS[meta.icon];
            const body = (
              <>
                <span
                  className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full"
                  style={{
                    background: TONE[meta.tone].bg,
                    color: TONE[meta.tone].fg,
                  }}
                >
                  <Icon size={13} />
                </span>
                <span className="min-w-0 flex-1">
                  <span
                    className="block truncate text-[12.5px]"
                    style={{ color: 'var(--color-text)' }}
                  >
                    {humanize(e.action)}
                    {e.reason ? ` — ${e.reason}` : ''}
                  </span>
                  <span
                    className="block text-[11.5px]"
                    style={{ color: 'var(--color-text-muted)' }}
                  >
                    {e.actorName} · {e.actorRole} · {fromNow(e.createdAt)}
                  </span>
                </span>
              </>
            );
            // entityType values are capitalized in audit rows.
            return e.entityType === 'Delivery' ? (
              <Link
                key={e.id}
                to={`/deliveries/${e.entityId}`}
                className="hover:bg-surface-alt -mx-2 flex items-start gap-2.5 rounded-md px-2 py-1"
              >
                {body}
              </Link>
            ) : (
              <div key={e.id} className="flex items-start gap-2.5 py-1">
                {body}
              </div>
            );
          })
        )}
      </div>
    </Card>
  );
}
```

- [ ] **Step 3: Mount in `DashboardPage.tsx`** — replace the placeholder `<div />` with `<NeedsAttentionCard />` and add `<RecentActivityCard />` under `DriverAvailabilityCard` in the right column.

- [ ] **Step 4: Extend invalidation** —

`DeliveryDetailPage.tsx` `invalidate()` gains:

```ts
void qc.invalidateQueries({ queryKey: getDashboardGetStatsQueryKey() });
void qc.invalidateQueries({ queryKey: getAuditListQueryKey() });
```

(import both key getters from `@logidash/api-client`). `NewDeliveryModal.tsx`: after a successful create (before `onClose()`), add the same two invalidations via `useQueryClient()`.

- [ ] **Step 5: Extend `DashboardPage.test.tsx`** — mock `useDeliveriesList` (one terminal + two open deliveries out of deadline order) and `useAuditList` (one `Delivery` entry, one `Assignment` entry): assert only open rows render sorted by deadline (`getAllByText` order), the Delivery activity row is a link to `/deliveries/<entityId>` and the Assignment row is not a link.

- [ ] **Step 6: Verify + commit**

Run: `pnpm --filter @logidash/web test && pnpm --filter @logidash/web lint:check && pnpm --filter @logidash/web build`
Expected: PASS.

```bash
git add apps/web/src/features/dashboard apps/web/src/features/deliveries
git commit -m "feat(web): needs-attention + recent-activity cards; stats/audit invalidation"
```

---

### Task 11: Drivers list page

**Files:**

- Create: `apps/web/src/features/drivers/driver-filters.ts`
- Create: `apps/web/src/features/drivers/components/DriverToolbar.tsx`
- Create: `apps/web/src/features/drivers/components/DriverTable.tsx`
- Create: `apps/web/src/features/drivers/DriversPage.tsx`
- Modify: `apps/web/src/routes/router.tsx` (`/drivers` → `DriversPage`)
- Modify: `apps/web/src/lib/format.ts` (add `initials`)
- Test: `apps/web/src/features/drivers/driver-filters.test.ts`, `apps/web/src/features/drivers/DriversPage.test.tsx`, extend `apps/web/src/lib/format.test.ts`

**Interfaces:**

- Consumes: `useDriversList`, `DriverDto` (now with `name`/`vehicle`), `useZoneMap`, `AvailabilityChip`, `Meter`, `Avatar`.
- Produces: `initials(name: string): string` in `lib/format`; `DriverFilters { search: string; availability: DriverDtoAvailability | 'all' }`, `DEFAULT_DRIVER_FILTERS`, `matchesDriverFilters(d, f)`, `workloadTone(active, max): Tone`; `DriverTable({ rows, zoneCode, onOpen })` + `DriverTableSkeleton`; `DriverToolbar({ filters, onChange, onClear })`; route `/drivers`.

- [ ] **Step 1: Write failing tests for the pure helpers** —

`format.test.ts` addition:

```ts
it('derives two-letter initials', () => {
  expect(initials('Priya Kumar')).toBe('PK');
  expect(initials('Cher')).toBe('C');
  expect(initials('')).toBe('?');
});
```

`driver-filters.test.ts`:

```ts
import { it, expect } from 'vitest';
import {
  DEFAULT_DRIVER_FILTERS,
  matchesDriverFilters,
  workloadTone,
} from './driver-filters';
import type { DriverDto } from '@logidash/api-client';

const driver = (over: Partial<DriverDto>): DriverDto =>
  ({
    id: 'd1',
    userId: 'u1',
    name: 'Priya Kumar',
    availability: 'available',
    baseZoneId: 'z1',
    activeJobCount: 1,
    maxConcurrentJobs: 3,
    vehicle: null,
    createdAt: '',
    updatedAt: '',
    ...over,
  }) as DriverDto;

it('matches on name search, case-insensitively', () => {
  expect(
    matchesDriverFilters(driver({}), {
      ...DEFAULT_DRIVER_FILTERS,
      search: 'priya',
    }),
  ).toBe(true);
  expect(
    matchesDriverFilters(driver({}), {
      ...DEFAULT_DRIVER_FILTERS,
      search: 'zed',
    }),
  ).toBe(false);
});

it('filters by availability', () => {
  expect(
    matchesDriverFilters(driver({ availability: 'busy' }), {
      ...DEFAULT_DRIVER_FILTERS,
      availability: 'available',
    }),
  ).toBe(false);
});

it('tones the workload meter', () => {
  expect(workloadTone(3, 3)).toBe('danger');
  expect(workloadTone(2, 3)).toBe('warning'); // 0.66 > 0.6
  expect(workloadTone(1, 3)).toBe('success');
  expect(workloadTone(0, 0)).toBe('success');
});
```

- [ ] **Step 2: Run to verify failure**

Run: `pnpm --filter @logidash/web test -- driver-filters format`
Expected: FAIL — modules/functions missing.

- [ ] **Step 3: Implement helpers** —

`lib/format.ts` addition:

```ts
export function initials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return '?';
  return parts
    .slice(0, 2)
    .map((p) => p[0]!.toUpperCase())
    .join('');
}
```

`driver-filters.ts`:

```ts
import type { DriverDto, DriverDtoAvailability } from '@logidash/api-client';
import type { Tone } from '../../lib/tone';

export interface DriverFilters {
  search: string;
  availability: DriverDtoAvailability | 'all';
}

export const DEFAULT_DRIVER_FILTERS: DriverFilters = {
  search: '',
  availability: 'all',
};

export function matchesDriverFilters(d: DriverDto, f: DriverFilters): boolean {
  if (f.availability !== 'all' && d.availability !== f.availability)
    return false;
  const q = f.search.trim().toLowerCase();
  if (!q) return true;
  return d.name.toLowerCase().includes(q);
}

export function workloadTone(active: number, max: number): Tone {
  if (max > 0 && active >= max) return 'danger';
  if (max > 0 && active / max > 0.6) return 'warning';
  return 'success';
}
```

- [ ] **Step 4: Implement the components** —

`DriverToolbar.tsx` (mirror `DeliveryToolbar`'s structure — search `Input` with `search` icon + one availability `Select` + conditional "Clear" ghost button; availability options `all|available|busy|offline`):

```tsx
import { Input, Select } from '../../../components/ui/Field';
import { Button } from '../../../components/ui/Button';
import { DEFAULT_DRIVER_FILTERS, type DriverFilters } from '../driver-filters';

const AVAILABILITIES = ['available', 'busy', 'offline'] as const;

export function DriverToolbar({
  filters,
  onChange,
  onClear,
}: {
  filters: DriverFilters;
  onChange: (f: DriverFilters) => void;
  onClear: () => void;
}) {
  const active =
    filters.search !== '' ||
    filters.availability !== DEFAULT_DRIVER_FILTERS.availability;
  return (
    <div className="flex flex-wrap items-center gap-2">
      <div className="w-64">
        <Input
          value={filters.search}
          onChange={(e) => onChange({ ...filters, search: e.target.value })}
          placeholder="Search driver name…"
          aria-label="Search drivers"
        />
      </div>
      <div className="w-40">
        <Select
          value={filters.availability}
          onChange={(e) =>
            onChange({
              ...filters,
              availability: e.target.value as DriverFilters['availability'],
            })
          }
          aria-label="Availability filter"
        >
          <option value="all">All availability</option>
          {AVAILABILITIES.map((a) => (
            <option key={a} value={a}>
              {a.charAt(0).toUpperCase() + a.slice(1)}
            </option>
          ))}
        </Select>
      </div>
      {active && (
        <Button variant="secondary" size="sm" icon="x" onClick={onClear}>
          Clear
        </Button>
      )}
    </div>
  );
}
```

`DriverTable.tsx` — sticky-header zebra table, mirroring `DeliveryTable`'s table classes/structure. Columns: Driver (`Avatar initials={initials(d.name)} name={d.name} id={d.id} size={28}` + name), Availability (`AvailabilityChip`), Base zone (`zoneCode(d.baseZoneId)`), Vehicle (`d.vehicle ? d.vehicle.type : '—'`), Workload (`Meter value={max ? active/max : 0} tone={workloadTone(...)}` + `tnum` `{active}/{max}`), trailing chevron. Rows: `<tr tabIndex={0} onClick={() => onOpen(d.id)} onKeyDown={Enter → onOpen}>`. Export `DriverTableSkeleton` with 8 skeleton rows matching the column rhythm (copy `DeliveryTableSkeleton`'s approach).

`DriversPage.tsx` — mirror `DeliveriesPage` exactly, with `PAGE_SIZE = 8`, `useDriversList({ page, limit: PAGE_SIZE })`, client filters via `matchesDriverFilters`, the same four states (`ErrorState` / `DriverTableSkeleton` / `EmptyState icon="users" title="No drivers match"` with Clear action / table + the same pagination footer markup), and `onOpen={(id) => navigate(`/drivers/${id}`)}`.

`router.tsx`: replace the drivers `RouteStub` element with `<DriversPage />`.

- [ ] **Step 5: Write `DriversPage.test.tsx`** — mock `useDriversList` + `useZonesList` (as in `DeliveriesPage.test.tsx`): loading state renders skeleton; data state renders a row with name, availability chip text, vehicle type, `1/3` workload; empty search filter hides non-matching rows.

- [ ] **Step 6: Verify + commit**

Run: `pnpm --filter @logidash/web test && pnpm --filter @logidash/web lint:check && pnpm --filter @logidash/web build`
Expected: PASS.

```bash
git add apps/web/src/features/drivers apps/web/src/routes/router.tsx apps/web/src/lib
git commit -m "feat(web): drivers queue (search, availability filter, workload meters)"
```

---

### Task 12: Driver detail page

**Files:**

- Create: `apps/web/src/features/drivers/DriverDetailPage.tsx`
- Create: `apps/web/src/features/drivers/components/DriverProfileCard.tsx`
- Create: `apps/web/src/features/drivers/components/DriverWorkloadCard.tsx`
- Create: `apps/web/src/features/drivers/components/AssignmentHistoryCard.tsx`
- Modify: `apps/web/src/routes/router.tsx` (add `/drivers/:id` under the same role gate)
- Test: `apps/web/src/features/drivers/DriverDetailPage.test.tsx`

**Interfaces:**

- Consumes: `useDriversGetById`, `useAssignmentsListByDriver` (with the Task 4 `delivery` summary), `useZoneMap`, `initials`, `fromNow`, `AvailabilityChip`, `StatusChip`, `Chip`, `Meter`, `Avatar`, `Card`, `Skeleton`, `ErrorState`, `EmptyState`.
- Produces: route `/drivers/:id`; `DriverProfileCard({ driver, zoneCode })`, `DriverWorkloadCard({ driver })`, `AssignmentHistoryCard({ driverId })`.

- [ ] **Step 1: Implement `DriverProfileCard.tsx`** — `Card` with 56px `Avatar`, name (16px/600), `AvailabilityChip`; info rows (icon + muted label + value): Base zone (`zoneCode(driver.baseZoneId)`), Vehicle (`driver.vehicle ? `${driver.vehicle.type} · ${driver.vehicle.status}` : 'No vehicle linked'`), Joined (`new Date(driver.createdAt).toLocaleDateString()`).

- [ ] **Step 2: Implement `DriverWorkloadCard.tsx`** — three stat boxes (28px tnum value + 12.5px muted label): Active jobs (`activeJobCount`), Job slots (`maxConcurrentJobs`), Vehicle capacity (`driver.vehicle ? `${driver.vehicle.capacityWeight} kg` : '—'`); below, a labeled job-slots meter: `Meter value={max ? active/max : 0} tone={workloadTone(active, max)}` with a `{active}/{max}` tnum caption (import `workloadTone` from `../driver-filters`).

- [ ] **Step 3: Implement `AssignmentHistoryCard.tsx`** — self-fetching with local `page` state and `PAGE_SIZE = 8`, `useAssignmentsListByDriver(driverId, { page, limit: PAGE_SIZE })`. Table columns: Reference (`<Link to={`/deliveries/${a.delivery.id}`}>{a.delivery.reference}</Link>`, primary color, tnum), Delivery status (`StatusChip status={a.delivery.status}`), Assignment (`Chip` — tone `info` for `active`, `success` for `completed`, `neutral` for `cancelled`), When (`fromNow(a.assignedAt)`), Note (`a.unassignReason ?? '—'`, truncated). Same pagination footer markup as `DeliveriesPage`. States: skeleton rows / `EmptyState icon="inbox" title="No assignments yet"` / error with retry.

- [ ] **Step 4: Implement `DriverDetailPage.tsx`**

```tsx
import { useParams, Link } from 'react-router-dom';
import { useDriversGetById } from '@logidash/api-client';
import { useZoneMap } from '../../hooks/useZoneMap';
import { Skeleton } from '../../components/ui/Skeleton';
import { ErrorState } from '../../components/ui/ErrorState';
import { DriverProfileCard } from './components/DriverProfileCard';
import { DriverWorkloadCard } from './components/DriverWorkloadCard';
import { AssignmentHistoryCard } from './components/AssignmentHistoryCard';

export function DriverDetailPage() {
  const { id = '' } = useParams();
  const { zoneCode } = useZoneMap();
  const q = useDriversGetById(id);

  if (q.isError) {
    return (
      <div className="mx-auto max-w-[1100px] p-6">
        <ErrorState
          body="This driver could not be loaded."
          onRetry={() => void q.refetch()}
        />
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-[1100px] space-y-4 p-6">
      <Link
        to="/drivers"
        className="text-[12px]"
        style={{ color: 'var(--color-text-muted)' }}
      >
        ← Drivers
      </Link>
      {q.isPending ? (
        <div className="grid gap-4 lg:grid-cols-[1fr_2fr]">
          <Skeleton className="h-56 w-full" />
          <Skeleton className="h-56 w-full" />
        </div>
      ) : (
        <>
          <div className="grid gap-4 lg:grid-cols-[1fr_2fr]">
            <DriverProfileCard driver={q.data} zoneCode={zoneCode} />
            <DriverWorkloadCard driver={q.data} />
          </div>
          <AssignmentHistoryCard driverId={q.data.id} />
        </>
      )}
    </div>
  );
}
```

`router.tsx`: inside the existing drivers role-gated children, add `{ path: 'drivers/:id', element: <DriverDetailPage /> }`.

- [ ] **Step 5: Write `DriverDetailPage.test.tsx`** — mock `useDriversGetById` (driver with vehicle + name), `useAssignmentsListByDriver` (one assignment with `delivery: { id: 'd9', reference: 'DEL-9', status: 'delivered' }`), `useZonesList`. Assert: name + availability render; vehicle line renders; history row shows `DEL-9` as a link with `href="/deliveries/d9"`; workload caption `1/3` renders.

- [ ] **Step 6: Verify + commit**

Run: `pnpm --filter @logidash/web test && pnpm --filter @logidash/web lint:check && pnpm --filter @logidash/web build`
Expected: PASS.

```bash
git add apps/web/src/features/drivers apps/web/src/routes/router.tsx
git commit -m "feat(web): driver detail (profile, workload, linked assignment history)"
```

---

### Task 13: Admin — shell + Users tab

**Files:**

- Create: `apps/web/src/features/admin/AdminPage.tsx`
- Create: `apps/web/src/features/admin/components/UsersTab.tsx`
- Create: `apps/web/src/features/admin/components/UserModal.tsx`
- Modify: `apps/web/src/routes/router.tsx` (`/admin` → `AdminPage`)
- Test: `apps/web/src/features/admin/AdminPage.test.tsx`, `apps/web/src/features/admin/components/UserModal.test.tsx`

**Interfaces:**

- Consumes: `useUsersList` (unpaginated `UserDto[]`), `useUsersCreate`, `useUsersUpdate`, `useZonesList`, `useVehiclesList` (tab counts), `mapDetailMessages`/`ApiError` from `lib/api-errors`, `Modal`, `Field/Input/Select`, `Menu/MenuItem`, `Toast`/`ToastData`, `getUsersListQueryKey`.
- Produces: route `/admin`; `AdminPage` with tab state `'users' | 'zones' | 'vehicles'` (Zones/Vehicles tabs render placeholders until Task 14); `UserModal({ open, onClose, user })` — `user: UserDto | null` selects create vs edit mode.

- [ ] **Step 1: Implement `AdminPage.tsx`** — `max-w-[1100px] p-6`; one `Card`; a tab bar (three buttons: label + count `Chip`; active = 2px bottom border `--color-primary` + primary text, inactive muted); counts from `useUsersList()` (`data?.length`), `useZonesList({ limit: 1 })` (`data?.meta.total`), `useVehiclesList({ limit: 1 })` (`data?.meta.total`); below, a description row (muted 12.5px, per-tab copy) + right-aligned "Add {user|zone|vehicle}" primary `Button`; then the active tab's component. Keep tab state local (`useState<'users' | 'zones' | 'vehicles'>('users')`). The Add button toggles the active tab's modal open-state, all owned by `AdminPage` and passed down. Success toasts: a single `ToastData | null` state in `AdminPage` passed a setter down the tabs, rendered once via `<Toast toast={toast} />`.

- [ ] **Step 2: Implement `UsersTab.tsx`** — `useUsersList()`; states: skeleton rows / error + retry / table. Sticky-header zebra table (copy `DeliveryTable` classes): Avatar + name, email (muted), role `Chip` (tone map `{ admin: 'primary', dispatcher: 'info', driver: 'success', viewer: 'neutral' }`), status `Chip` (`active → success`, `disabled → neutral`), created (`toLocaleDateString`, tnum), trailing kebab `Menu` (`more` icon `Button variant="ghost"`) with `MenuItem`s: **Edit** (opens `UserModal` with the row), **Disable/Enable** (fires `useUsersUpdate` with `{ status: 'disabled' | 'active' }` directly; on `409` set an inline row-level error line under the table header showing `err.response.data.message` — the last-admin guard; on success invalidate `getUsersListQueryKey()` + toast).

- [ ] **Step 3: Implement `UserModal.tsx`** — dual-mode form following `NewDeliveryModal`'s exact remount-on-open pattern:

```tsx
import { useState } from 'react';
import type { FormEvent } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import {
  useUsersCreate,
  useUsersUpdate,
  getUsersListQueryKey,
  CreateUserDtoRole,
} from '@logidash/api-client';
import type { UserDto } from '@logidash/api-client';
import { Modal } from '../../../components/ui/Modal';
import { Field, Input, Select } from '../../../components/ui/Field';
import { Button } from '../../../components/ui/Button';
import { ICONS } from '../../../components/ui/icons';
import { mapDetailMessages, type ApiError } from '../../../lib/api-errors';

const ROLES = Object.values(CreateUserDtoRole);

export function UserModal({
  open,
  onClose,
  user,
  onSaved,
}: {
  open: boolean;
  onClose: () => void;
  user: UserDto | null;
  onSaved: (msg: string) => void;
}) {
  return (
    <Modal
      open={open}
      title={user ? `Edit ${user.name}` : 'Add user'}
      onClose={onClose}
    >
      {open && (
        <UserForm key="form" user={user} onClose={onClose} onSaved={onSaved} />
      )}
    </Modal>
  );
}

function UserForm({
  user,
  onClose,
  onSaved,
}: {
  user: UserDto | null;
  onClose: () => void;
  onSaved: (msg: string) => void;
}) {
  const qc = useQueryClient();
  const create = useUsersCreate();
  const update = useUsersUpdate();
  const isPending = create.isPending || update.isPending;

  const [name, setName] = useState(user?.name ?? '');
  const [email, setEmail] = useState(user?.email ?? '');
  const [password, setPassword] = useState('');
  const [role, setRole] = useState<(typeof ROLES)[number]>(
    user?.role ?? 'viewer',
  );
  const [status, setStatus] = useState(user?.status ?? 'active');
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [formError, setFormError] = useState<string | null>(null);
  const Alert = ICONS.alert;

  async function submit(e: FormEvent) {
    e.preventDefault();
    setErrors({});
    setFormError(null);
    try {
      if (user) {
        await update.mutateAsync({
          id: user.id,
          data: { name, role, status },
        });
      } else {
        await create.mutateAsync({ data: { name, email, password, role } });
      }
      void qc.invalidateQueries({ queryKey: getUsersListQueryKey() });
      onSaved(user ? 'User updated.' : 'User created.');
      onClose();
    } catch (err) {
      const e = err as ApiError;
      const data = e.response?.data;
      if (e.response?.status === 400 && data?.details?.length) {
        const { fields, rest } = mapDetailMessages(data.details);
        setErrors(fields);
        if (rest.length > 0) setFormError(rest.join('; '));
      } else {
        // 409: e.g. duplicate email, or the last-admin guard on edit.
        setFormError(data?.message ?? 'Could not save the user.');
      }
    }
  }

  return (
    <form onSubmit={(e) => void submit(e)} noValidate>
      <div className="space-y-3">
        {formError && (
          <div
            className="flex items-center gap-2 rounded-md px-3 py-2 text-[13px]"
            style={{
              background: 'var(--tint-danger)',
              color: 'var(--color-danger)',
            }}
            role="alert"
          >
            <Alert size={15} />
            {formError}
          </div>
        )}
        <Field label="Name" error={errors['name']} required>
          <Input
            value={name}
            onChange={(e) => setName(e.target.value)}
            invalid={!!errors['name']}
          />
        </Field>
        {!user && (
          <>
            <Field label="Email" error={errors['email']} required>
              <Input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                invalid={!!errors['email']}
              />
            </Field>
            <Field label="Password" error={errors['password']} required>
              <Input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="Min 8 characters"
                invalid={!!errors['password']}
              />
            </Field>
          </>
        )}
        <Field label="Role" error={errors['role']} required>
          <Select
            value={role}
            onChange={(e) => setRole(e.target.value as (typeof ROLES)[number])}
          >
            {ROLES.map((r) => (
              <option key={r} value={r}>
                {r.charAt(0).toUpperCase() + r.slice(1)}
              </option>
            ))}
          </Select>
        </Field>
        {user && (
          <Field label="Status" error={errors['status']}>
            <Select
              value={status}
              onChange={(e) => setStatus(e.target.value as UserDto['status'])}
            >
              <option value="active">Active</option>
              <option value="disabled">Disabled</option>
            </Select>
          </Field>
        )}
      </div>
      <div
        className="mt-4 flex justify-end gap-2 border-t pt-4"
        style={{ borderColor: 'var(--color-border)' }}
      >
        <Button type="button" variant="secondary" onClick={onClose}>
          Cancel
        </Button>
        <Button type="submit" variant="primary" disabled={isPending}>
          {isPending ? 'Saving…' : user ? 'Save changes' : 'Create user'}
        </Button>
      </div>
    </form>
  );
}
```

(Check the generated `useUsersUpdate` mutation variable shape — Orval emits `{ id, data }`; match it. `UpdateUserDto` allows `name`/`role`/`status`.)

`router.tsx`: replace the admin `RouteStub` with `<AdminPage />`.

- [ ] **Step 4: Tests** — `AdminPage.test.tsx`: mock the three list hooks; assert the Users tab renders rows and tab switching swaps content (Zones placeholder until Task 14 — assert by tab-panel heading). `UserModal.test.tsx` (mirror `AssignModal.test.tsx`'s mutation-mock style): submits create with typed values; a mocked 400 (`details: ['email must be an email']`) renders the inline field error and keeps the modal open; a mocked 409 renders the form-level message.

- [ ] **Step 5: Verify + commit**

Run: `pnpm --filter @logidash/web test && pnpm --filter @logidash/web lint:check && pnpm --filter @logidash/web build`
Expected: PASS.

```bash
git add apps/web/src/features/admin apps/web/src/routes/router.tsx
git commit -m "feat(web): admin shell + users tab (add/edit/disable, 400+409 inline)"
```

---

### Task 14: Admin — Zones + Vehicles tabs

**Files:**

- Create: `apps/web/src/features/admin/components/ZonesTab.tsx`
- Create: `apps/web/src/features/admin/components/ZoneModal.tsx`
- Create: `apps/web/src/features/admin/components/VehiclesTab.tsx`
- Create: `apps/web/src/features/admin/components/VehicleModal.tsx`
- Create: `apps/web/src/features/admin/components/ConfirmDeleteModal.tsx`
- Create: `apps/web/src/hooks/useDriverMap.ts`
- Modify: `apps/web/src/features/admin/AdminPage.tsx` (mount real tabs)
- Delete: `apps/web/src/routes/RouteStub.tsx` (last stub replaced in Task 13)
- Test: `apps/web/src/features/admin/components/ZonesTab.test.tsx`

**Interfaces:**

- Consumes: `useZonesList/Create/Update/Remove`, `useVehiclesList/Create/Update/Remove`, `useDriversList`, `getZonesListQueryKey`/`getVehiclesListQueryKey`, `CreateVehicleDtoType`/`CreateVehicleDtoStatus`, `lib/api-errors`.
- Produces: `useDriverMap(): { driverName(id: string | null | undefined): string; isLoading }`; `ConfirmDeleteModal({ open, title, body, onClose, onConfirm, pending, error })` (shared by both tabs); `ZoneModal`/`VehicleModal({ open, onClose, zone|vehicle, onSaved })` (null = create).

- [ ] **Step 1: Implement `useDriverMap.ts`**

```ts
import { useMemo } from 'react';
import { useDriversList, type DriverDto } from '@logidash/api-client';

export function useDriverMap() {
  const query = useDriversList({ limit: 100 });
  const map = useMemo(() => {
    const m = new Map<string, DriverDto>();
    for (const d of query.data?.data ?? []) m.set(d.id, d);
    return m;
  }, [query.data]);
  const driverName = (id: string | null | undefined): string =>
    id ? (map.get(id)?.name ?? '—') : '—';
  return { driverName, isLoading: query.isPending };
}
```

- [ ] **Step 2: Implement `ConfirmDeleteModal.tsx`**

```tsx
import { Modal } from '../../../components/ui/Modal';
import { Button } from '../../../components/ui/Button';
import { ICONS } from '../../../components/ui/icons';

export function ConfirmDeleteModal({
  open,
  title,
  body,
  onClose,
  onConfirm,
  pending,
  error,
}: {
  open: boolean;
  title: string;
  body: string;
  onClose: () => void;
  onConfirm: () => void;
  pending: boolean;
  error: string | null;
}) {
  const Alert = ICONS.alert;
  return (
    <Modal open={open} title={title} onClose={onClose}>
      <p className="text-[13px]" style={{ color: 'var(--color-text-muted)' }}>
        {body}
      </p>
      {error && (
        <div
          className="mt-3 flex items-center gap-2 rounded-md px-3 py-2 text-[13px]"
          style={{
            background: 'var(--tint-danger)',
            color: 'var(--color-danger)',
          }}
          role="alert"
        >
          <Alert size={15} />
          {error}
        </div>
      )}
      <div
        className="mt-4 flex justify-end gap-2 border-t pt-4"
        style={{ borderColor: 'var(--color-border)' }}
      >
        <Button type="button" variant="secondary" onClick={onClose}>
          Cancel
        </Button>
        <Button
          type="button"
          variant="danger"
          disabled={pending}
          onClick={onConfirm}
        >
          {pending ? 'Deleting…' : 'Delete'}
        </Button>
      </div>
    </Modal>
  );
}
```

- [ ] **Step 3: Implement `ZonesTab.tsx` + `ZoneModal.tsx`** — `ZonesTab`: local `page` state, `useZonesList({ page, limit: 8 })`, table (zone name with a `map`-icon tinted square, code `Chip`, center `lat,lng` tnum or "—", kebab: Edit / Delete) + the shared pagination footer + skeleton/empty/error states. Delete flows through `ConfirmDeleteModal` + `useZonesRemove`; on `409` set the modal's `error` to `err.response.data.message` (referential guard) and keep it open; on success invalidate `getZonesListQueryKey()` + toast via `onSaved`. `ZoneModal`: same dual-mode form skeleton as `UserModal` (remount-on-open, `mapDetailMessages` for 400s, form-level message otherwise) with fields Name (`Input`), Code (`Input`, uppercase hint), Center latitude / Center longitude (optional `Input type="number"`, `step="0.000001"`, empty string → omit from the payload; both-or-neither validated client-side with a form error). Create via `useZonesCreate`, edit via `useZonesUpdate` (`{ id, data }`).

- [ ] **Step 4: Implement `VehiclesTab.tsx` + `VehicleModal.tsx`** — `VehiclesTab`: `useVehiclesList({ page, limit: 8 })` + `useDriverMap`; table (type — capitalize, capacity weight `{n} kg` tnum, capacity volume `{n} m³` tnum, status `Chip` (`active → success`, `inactive → neutral`), driver `driverName(v.driverId)`, kebab: Edit / Delete). Delete identical to zones (assignment-referential 409 inline). `VehicleModal`: fields Type (`Select` over `Object.values(CreateVehicleDtoType)`), Capacity weight / Capacity volume (`Input type="number"` `min={0}` `step="0.1"`, `Number(...)` into the payload), Status (`Select` over `Object.values(CreateVehicleDtoStatus)`, edit mode only); create `useVehiclesCreate`, edit `useVehiclesUpdate`.

- [ ] **Step 5: Wire into `AdminPage.tsx`** — replace the Task 13 placeholders with `<ZonesTab …/>` / `<VehiclesTab …/>` (passing the shared `onSaved` toast setter); delete `apps/web/src/routes/RouteStub.tsx` and its import if any remain:

```bash
git rm apps/web/src/routes/RouteStub.tsx
```

- [ ] **Step 6: Test** — `ZonesTab.test.tsx`: rows render from a mocked list; opening Delete and confirming with a mocked 409 (`message: 'Zone is referenced…'`) shows the inline error and keeps the modal open; a successful delete invalidates + closes (mutation mock style of `AssignModal.test.tsx`).

- [ ] **Step 7: Verify + commit**

Run: `pnpm --filter @logidash/web test && pnpm --filter @logidash/web lint:check && pnpm --filter @logidash/web build`
Expected: PASS.

```bash
git add -A apps/web/src
git commit -m "feat(web): admin zones + vehicles tabs (full CRUD, 409 guards inline)"
```

---

### Task 15: Full verification + docs sync

**Files:**

- Modify: `docs/context/progress-tracker.md`, `docs/implementation-plan.md`
- Modify (if needed): `docs/superpowers/specs/2026-07-13-phase-8-slice-3-dashboard-drivers-admin-design.md` (`entityType === 'delivery'` → `'Delivery'` casing fix)

- [ ] **Step 1: Full suite**

Run, in order (Docker Postgres up):

```bash
pnpm build
pnpm lint:check
pnpm test                       # api unit (25+ suites), api-client (12), web (40+)
pnpm --filter @logidash/api test:e2e   # 48 + new dashboard-audit tests
pnpm gen && git status -s       # → zero drift
```

Expected: everything green, no drift.

- [ ] **Step 2: Docs sync** — progress-tracker: new "Current Phase" entry for Slice 3 (complete, task count, verified-green numbers, trimmed gaps list from the spec, next: Phase 8 live smoke + merge, then Phase 9); implementation-plan: tick the three Phase 8 checkboxes (Dashboard / Drivers / Admin) + the Vitest line, update the status paragraph; fix the spec's `entityType` casing.

- [ ] **Step 3: Commit**

```bash
git add docs
git commit -m "docs(phase-8): sync tracker + plan after Slice 3"
```

---

## Post-plan self-review (done at write time)

- **Spec coverage:** stats endpoint (T2), DriverDto (T3), AssignmentDto (T4), audit feed + entityId (T1), e2e (T5), contract (T6), badges (T8), dashboard (T9–10), drivers (T11–12), admin full CRUD (T13–14), invalidation (T10), trims documented (T15 docs). ✓
- **Type consistency:** `listRecent` / `getStats(now?)` / `DriverVehicleSummaryDto` / `AssignmentDeliverySummaryDto` / `useDashboardGetStats` / `useAuditList` / `initials` / `workloadTone` used identically across tasks. ✓
- **Known judgment calls:** UI prop names (`Button variant="ghost"`, `Skeleton className`) must match the actual primitives at implementation time — noted inline where flagged.
