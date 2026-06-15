# Phase 8 Slice 2 — Critical Flow Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Deliver the create → recommend → assign → status arc across the Deliveries queue and Delivery detail + recommendation panel, backed by three new read-only API capabilities (delivery audit timeline, pickup→dropoff route estimate, active-driver summary on deliveries) so the detail screen renders only real data.

**Architecture:** Full-stack slice. Backend: three additive, read-only capabilities on the existing deliveries surface (NestJS 11 + Prisma 7), then re-emit the OpenAPI contract and regenerate the Orval client. Frontend: React 19 + Vite SPA consuming only the generated `@logidash/api-client` hooks, building on the Slice 1 foundation (Tailwind 4 tokens, `components/ui/` primitives, TanStack Query + auth providers, role-aware router/shell). Components are ported 1:1 from `design_handoff_command_center/prototype/` (cited per task) with typed props, `lucide-react` icons, token classes, and real hooks replacing mock data.

**Tech Stack:** NestJS 11, Prisma 7, class-validator, `@nestjs/swagger`; Orval v8 (react-query/axios); React 19, TypeScript 6 (strict, `verbatimModuleSyntax`, `erasableSyntaxOnly`), Vite 8, Tailwind 4, React Router v7, TanStack Query 5, lucide-react, Vitest + React Testing Library + jsdom; Jest (api unit + e2e).

**Spec:** `docs/superpowers/specs/2026-06-15-phase-8-slice-2-critical-flow-design.md`

**Conventions for every task:**

- **Branch:** `phase-8-slice-2-critical-flow` (created in Task 1). Per-task commit; **no `Co-Authored-By` trailer** (user preference).
- **Backend:** code lives under `apps/api/src/modules/`. Verify with `pnpm --filter @logidash/api lint:check` and `pnpm --filter @logidash/api build` before committing; run the relevant `*.spec.ts` with `pnpm --filter @logidash/api test`. Prisma 7 client imports are `../../generated/prisma/...`; enums from `../../generated/prisma/enums`.
- **Contract:** any controller/DTO change is followed (Task 6) by `pnpm gen:openapi && pnpm gen:client`; both artifacts are committed. Never hand-edit `packages/api-client/src/generated/**` or `apps/api/openapi.json`.
- **Frontend:** type-only imports use `import type { … }` (`verbatimModuleSyntax`). No implicit `React` namespace — a file using `React.ReactNode` etc. must `import type React from 'react'` or use named type imports. No enums/parameter-properties/namespaces (`erasableSyntaxOnly`) — use string-literal unions + plain objects. No unused locals/params. No raw hex in components — only token classes (`bg-surface`, `text-primary`, …) or inline `var(--token)`; the only hex exception is the `Avatar` hash palette (Slice 1). Verify with `pnpm --filter @logidash/web lint:check` and (where types changed) `pnpm --filter @logidash/web build`.
- **Prototype reference files** are in `design_handoff_command_center/prototype/`: `deliveries.jsx`, `delivery-detail.jsx`, `ui.jsx`, `tokens.css`. "Port lines X–Y" means transcribe that structure with the typed-prop / `ICONS` / token-class / real-hook changes named in the step — they are complete in-repo reference code, not placeholders. The handoff `README.md` (§3, §4) is authoritative where the prototype and `ui-context.md` diverge.
- **e2e** runs against Docker Postgres on **5433** (`pnpm --filter @logidash/api db:seed` first); the harness forces `MAPS_PROVIDER=mock`.

---

## Task 1: Branch + dead-file cleanup

**Files:**

- Delete: `apps/api/src/modules/recommendations/dto/create-assignment.dto.ts`

- [ ] **Step 1: Create the slice branch from the Slice 1 branch**

```bash
git checkout phase-8-slice-1-foundations-auth
git checkout -b phase-8-slice-2-critical-flow
```

- [ ] **Step 2: Confirm the stray DTO is dead, then delete it**

It is an untracked duplicate of `apps/api/src/modules/assignments/dto/create-assignment.dto.ts`, not imported anywhere.

Run (expect **no** matches): `git grep -n "recommendations/dto/create-assignment" -- apps/api/src` and confirm nothing imports it.

```bash
rm apps/api/src/modules/recommendations/dto/create-assignment.dto.ts
```

- [ ] **Step 3: Verify the API still builds**

Run: `pnpm --filter @logidash/api build`
Expected: PASS.

- [ ] **Step 4: Commit**

```bash
git add -A
git commit -m "chore(api): remove stray duplicate create-assignment DTO"
```

---

## Task 2: `assignedDriver` summary on `DeliveryDto`

**Files:**

- Modify: `apps/api/src/modules/deliveries/dto/delivery.dto.ts`
- Modify: `apps/api/src/modules/deliveries/deliveries.service.ts`
- Modify: `apps/api/src/modules/deliveries/deliveries.service.spec.ts`

- [ ] **Step 1: Add the summary DTO + field**

In `apps/api/src/modules/deliveries/dto/delivery.dto.ts`, add above `DeliveryDto`:

```ts
export class DeliverySummaryDriverDto {
  @ApiProperty() id!: string;
  @ApiProperty() name!: string;
}
```

Then add to `DeliveryDto` (after `cancellationReason`):

```ts
  @ApiPropertyOptional({ type: DeliverySummaryDriverDto, nullable: true })
  assignedDriver!: DeliverySummaryDriverDto | null;
```

- [ ] **Step 2: Map the active driver in the service**

In `apps/api/src/modules/deliveries/deliveries.service.ts`:

Import the enum (already imports `AssignmentStatus`) and the new DTO type:

```ts
import { DeliveryDto, DeliverySummaryDriverDto } from './dto/delivery.dto';
```

Replace the `toDeliveryDto` signature + body to accept the active driver:

```ts
function toDeliveryDto(
  d: DeliveryModel,
  assignedDriver: DeliverySummaryDriverDto | null = null,
): DeliveryDto {
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
    assignedDriver,
    createdAt: d.createdAt,
    updatedAt: d.updatedAt,
  };
}
```

Add a small helper near `toDeliveryDto` and the include constant:

```ts
const ACTIVE_DRIVER_INCLUDE = {
  assignments: {
    where: { status: AssignmentStatus.active },
    take: 1,
    include: { driver: { include: { user: true } } },
  },
} as const;

function activeDriverOf(d: {
  assignments?: { driver: { id: string; user: { name: string } } }[];
}): DeliverySummaryDriverDto | null {
  const active = d.assignments?.[0];
  return active
    ? { id: active.driver.id, name: active.driver.user.name }
    : null;
}
```

In `list`, add the include and pass the driver:

```ts
const [rows, total] = await this.prisma.$transaction([
  this.prisma.delivery.findMany({
    where,
    skip,
    take,
    orderBy: { deadlineAt: 'asc' },
    include: ACTIVE_DRIVER_INCLUDE,
  }),
  this.prisma.delivery.count({ where }),
]);
return paginate(
  rows.map((r) => toDeliveryDto(r, activeDriverOf(r))),
  total,
  query.page,
  query.limit,
);
```

In `getById`, switch the lookup to include and map:

```ts
const delivery = await this.prisma.delivery.findUnique({
  where: { id },
  include: ACTIVE_DRIVER_INCLUDE,
});
if (!delivery) {
  throw new NotFoundException('Delivery not found');
}
return toDeliveryDto(delivery, activeDriverOf(delivery));
```

> `update` and `changeStatus` return `toDeliveryDto(updated)` (one-arg) — `assignedDriver` defaults to `null` there, which is acceptable (the FE refetches the detail query after a mutation). `create` is handled in Task 4 (it also defaults to `null`, correct for a brand-new delivery).

- [ ] **Step 3: Add a unit test for the mapping**

In `apps/api/src/modules/deliveries/deliveries.service.spec.ts`, add a test that `getById` includes the active driver. Follow the file's existing prisma-mock pattern; assert:

```ts
it('returns the active driver summary on getById', async () => {
  prisma.delivery.findUnique.mockResolvedValue({
    ...baseDelivery,
    assignments: [{ driver: { id: 'drv1', user: { name: 'Alex Driver' } } }],
  });
  const result = await service.getById('d1');
  expect(result.assignedDriver).toEqual({ id: 'drv1', name: 'Alex Driver' });
});

it('returns null assignedDriver when unassigned', async () => {
  prisma.delivery.findUnique.mockResolvedValue({
    ...baseDelivery,
    assignments: [],
  });
  const result = await service.getById('d1');
  expect(result.assignedDriver).toBeNull();
});
```

(Reuse/define `baseDelivery` to match the existing spec's delivery shape; add the `assignments` field to the mock returns.)

- [ ] **Step 4: Run the spec → pass; lint; build**

```bash
pnpm --filter @logidash/api test -- deliveries.service
pnpm --filter @logidash/api lint:check
pnpm --filter @logidash/api build
```

Expected: spec passes; lint + build clean.

- [ ] **Step 5: Commit**

```bash
git add apps/api/src/modules/deliveries
git commit -m "feat(api): expose active assigned driver on DeliveryDto"
```

---

## Task 3: Route-estimate endpoint

**Files:**

- Modify: `apps/api/src/modules/maps/maps.service.ts`
- Modify: `apps/api/src/modules/maps/maps.service.spec.ts`
- Create: `apps/api/src/modules/deliveries/dto/route-estimate.dto.ts`
- Modify: `apps/api/src/modules/deliveries/deliveries.service.ts`
- Modify: `apps/api/src/modules/deliveries/deliveries.controller.ts`
- Modify: `apps/api/src/modules/deliveries/deliveries.service.spec.ts`

- [ ] **Step 1: Add `getRouteEstimateDetailed` and delegate `getRouteEstimate` to it**

In `apps/api/src/modules/maps/maps.service.ts`, add a richer method and refactor the existing one to delegate (keeps behavior identical for the Phase 6 engine):

```ts
export interface DetailedRouteEstimate extends RouteResult {
  provider: string;
  cached: boolean;
}

// inside MapsService:
async getRouteEstimateDetailed(
  origin: GeoPoint,
  dest: GeoPoint,
): Promise<DetailedRouteEstimate | null> {
  const cacheKey = buildCacheKey(origin, dest);

  const cached = await this.prisma.routeEstimate.findUnique({
    where: { cacheKey },
  });
  if (cached) {
    return {
      distanceMeters: cached.distanceMeters,
      durationSeconds: cached.durationSeconds,
      provider: cached.provider,
      cached: true,
    };
  }

  let route: RouteResult;
  try {
    route = await this.provider.route(origin, dest);
  } catch (error) {
    if (error instanceof MapsProviderError) {
      this.logger.warn(
        `Route estimate unavailable (${error.kind}): ${error.message}`,
      );
      return null;
    }
    throw error;
  }

  await this.prisma.routeEstimate.upsert({
    where: { cacheKey },
    create: {
      cacheKey,
      originLat: roundCoord(origin.lat),
      originLng: roundCoord(origin.lng),
      destLat: roundCoord(dest.lat),
      destLng: roundCoord(dest.lng),
      distanceMeters: route.distanceMeters,
      durationSeconds: route.durationSeconds,
      provider: this.provider.name,
    },
    update: {},
  });

  return { ...route, provider: this.provider.name, cached: false };
}

async getRouteEstimate(
  origin: GeoPoint,
  dest: GeoPoint,
): Promise<RouteResult | null> {
  const detailed = await this.getRouteEstimateDetailed(origin, dest);
  return detailed
    ? {
        distanceMeters: detailed.distanceMeters,
        durationSeconds: detailed.durationSeconds,
      }
    : null;
}
```

Export `DetailedRouteEstimate` (add it to the file's exports). Remove the now-duplicated body from the old `getRouteEstimate`.

- [ ] **Step 2: Extend the maps spec**

In `apps/api/src/modules/maps/maps.service.spec.ts`, add tests for the new method (mirroring the existing cache-hit/miss tests):

```ts
it('getRouteEstimateDetailed returns cached=true on a cache hit', async () => {
  prisma.routeEstimate.findUnique.mockResolvedValue({
    distanceMeters: 1000,
    durationSeconds: 120,
    provider: 'mock',
  });
  const r = await service.getRouteEstimateDetailed(O, D);
  expect(r).toEqual({
    distanceMeters: 1000,
    durationSeconds: 120,
    provider: 'mock',
    cached: true,
  });
  expect(provider.route).not.toHaveBeenCalled();
});

it('getRouteEstimateDetailed computes + upserts with cached=false on a miss', async () => {
  prisma.routeEstimate.findUnique.mockResolvedValue(null);
  provider.route.mockResolvedValue({
    distanceMeters: 2000,
    durationSeconds: 300,
  });
  const r = await service.getRouteEstimateDetailed(O, D);
  expect(r).toEqual({
    distanceMeters: 2000,
    durationSeconds: 300,
    provider: provider.name,
    cached: false,
  });
  expect(prisma.routeEstimate.upsert).toHaveBeenCalled();
});

it('getRouteEstimateDetailed returns null on provider error', async () => {
  prisma.routeEstimate.findUnique.mockResolvedValue(null);
  provider.route.mockRejectedValue(new MapsProviderError('network', 'down'));
  expect(await service.getRouteEstimateDetailed(O, D)).toBeNull();
});
```

(Use the spec's existing `O`/`D` geo fixtures and `provider`/`prisma` mocks; the existing `getRouteEstimate` tests still pass unchanged since it now delegates.)

- [ ] **Step 3: Create `RouteEstimateDto`**

`apps/api/src/modules/deliveries/dto/route-estimate.dto.ts`:

```ts
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class RouteEstimateDto {
  @ApiProperty({
    description: 'False when coordinates are missing or the provider is down',
  })
  available!: boolean;

  @ApiProperty({
    description: 'True when the estimate is unavailable/degraded',
  })
  degraded!: boolean;

  @ApiPropertyOptional({ type: Number }) distanceMeters?: number;
  @ApiPropertyOptional({ type: Number }) durationSeconds?: number;
  @ApiPropertyOptional({ description: 'Maps provider name (e.g. ors, mock)' })
  provider?: string;
  @ApiPropertyOptional({
    description: 'Whether the estimate was served from cache',
  })
  cached?: boolean;
}
```

- [ ] **Step 4: Add the service method**

In `apps/api/src/modules/deliveries/deliveries.service.ts`, import the DTO and add:

```ts
import { RouteEstimateDto } from './dto/route-estimate.dto';

// inside DeliveriesService:
async getRouteEstimate(id: string): Promise<RouteEstimateDto> {
  const d = await this.prisma.delivery.findUnique({ where: { id } });
  if (!d) {
    throw new NotFoundException('Delivery not found');
  }
  if (
    d.pickupLat === null ||
    d.pickupLng === null ||
    d.dropoffLat === null ||
    d.dropoffLng === null
  ) {
    return { available: false, degraded: true };
  }
  const est = await this.maps.getRouteEstimateDetailed(
    { lat: Number(d.pickupLat), lng: Number(d.pickupLng) },
    { lat: Number(d.dropoffLat), lng: Number(d.dropoffLng) },
  );
  if (!est) {
    return { available: false, degraded: true };
  }
  return {
    available: true,
    degraded: false,
    distanceMeters: est.distanceMeters,
    durationSeconds: est.durationSeconds,
    provider: est.provider,
    cached: est.cached,
  };
}
```

- [ ] **Step 5: Add the controller route**

In `apps/api/src/modules/deliveries/deliveries.controller.ts`, import `RouteEstimateDto` and add (after `getById`):

```ts
@Get(':id/route-estimate')
@ApiOkResponse({ type: RouteEstimateDto })
@ApiErrorResponses(404)
getRouteEstimate(@Param('id') id: string): Promise<RouteEstimateDto> {
  return this.deliveries.getRouteEstimate(id);
}
```

- [ ] **Step 6: Service unit tests for coords-missing + available paths**

Add to `deliveries.service.spec.ts`:

```ts
it('route estimate is unavailable when coords are missing', async () => {
  prisma.delivery.findUnique.mockResolvedValue({
    ...baseDelivery,
    pickupLat: null,
  });
  expect(await service.getRouteEstimate('d1')).toEqual({
    available: false,
    degraded: true,
  });
});

it('route estimate is available via the maps adapter', async () => {
  prisma.delivery.findUnique.mockResolvedValue({
    ...baseDelivery,
    pickupLat: 13.7,
    pickupLng: 100.5,
    dropoffLat: 13.8,
    dropoffLng: 100.6,
  });
  maps.getRouteEstimateDetailed.mockResolvedValue({
    distanceMeters: 5000,
    durationSeconds: 600,
    provider: 'mock',
    cached: false,
  });
  expect(await service.getRouteEstimate('d1')).toEqual({
    available: true,
    degraded: false,
    distanceMeters: 5000,
    durationSeconds: 600,
    provider: 'mock',
    cached: false,
  });
});
```

(Add `getRouteEstimateDetailed: jest.fn()` to the existing `maps` mock object in this spec.)

- [ ] **Step 7: Run specs → pass; lint; build**

```bash
pnpm --filter @logidash/api test -- "maps.service|deliveries.service"
pnpm --filter @logidash/api lint:check
pnpm --filter @logidash/api build
```

- [ ] **Step 8: Commit**

```bash
git add apps/api/src/modules/maps apps/api/src/modules/deliveries
git commit -m "feat(api): GET /deliveries/:id/route-estimate (pickup→dropoff via maps adapter)"
```

---

## Task 4: Audit timeline endpoint + `delivery.created`

**Files:**

- Create: `apps/api/src/modules/audit/dto/audit-entry.dto.ts`
- Modify: `apps/api/src/modules/audit/audit.service.ts`
- Modify: `apps/api/src/modules/audit/audit.service.spec.ts`
- Modify: `apps/api/src/modules/deliveries/deliveries.service.ts`
- Modify: `apps/api/src/modules/deliveries/deliveries.controller.ts`

- [ ] **Step 1: Create `AuditEntryDto`**

`apps/api/src/modules/audit/dto/audit-entry.dto.ts`:

```ts
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Role } from '../../../generated/prisma/enums';

export class AuditEntryDto {
  @ApiProperty() id!: string;
  @ApiProperty() action!: string;
  @ApiProperty() entityType!: string;
  @ApiProperty() actorUserId!: string;
  @ApiProperty() actorName!: string;
  @ApiProperty({ enum: Role }) actorRole!: Role;
  @ApiPropertyOptional({
    type: 'object',
    additionalProperties: true,
    nullable: true,
  })
  before?: Record<string, unknown>;
  @ApiPropertyOptional({
    type: 'object',
    additionalProperties: true,
    nullable: true,
  })
  after?: Record<string, unknown>;
  @ApiPropertyOptional({ type: String, nullable: true }) reason?: string;
  @ApiProperty() createdAt!: Date;
}
```

- [ ] **Step 2: Add `listForDelivery` to `AuditService`**

In `apps/api/src/modules/audit/audit.service.ts`, add imports + method:

```ts
import { PaginationQueryDto } from '../../common/dto/pagination-query.dto';
import { paginate, type Paginated, toSkipTake } from '../../common/pagination/paginate';
import { AuditEntryDto } from './dto/audit-entry.dto';

type AuditRowWithActor = Prisma.AuditLogGetPayload<{ include: { actor: true } }>;

function toAuditEntryDto(row: AuditRowWithActor): AuditEntryDto {
  return {
    id: row.id,
    action: row.action,
    entityType: row.entityType,
    actorUserId: row.actorUserId,
    actorName: row.actor.name,
    actorRole: row.actor.role,
    before: (row.before as Record<string, unknown> | null) ?? undefined,
    after: (row.after as Record<string, unknown> | null) ?? undefined,
    reason: row.reason ?? undefined,
    createdAt: row.createdAt,
  };
}

// inside AuditService:
async listForDelivery(
  deliveryId: string,
  query: PaginationQueryDto,
): Promise<Paginated<AuditEntryDto>> {
  const assignments = await this.prisma.assignment.findMany({
    where: { deliveryId },
    select: { id: true },
  });
  const assignmentIds = assignments.map((a) => a.id);
  const where: Prisma.AuditLogWhereInput = {
    OR: [
      { entityType: 'Delivery', entityId: deliveryId },
      ...(assignmentIds.length
        ? [{ entityType: 'Assignment', entityId: { in: assignmentIds } }]
        : []),
    ],
  };
  const { skip, take } = toSkipTake(query.page, query.limit);
  const [rows, total] = await this.prisma.$transaction([
    this.prisma.auditLog.findMany({
      where,
      include: { actor: true },
      orderBy: { createdAt: 'desc' },
      skip,
      take,
    }),
    this.prisma.auditLog.count({ where }),
  ]);
  return paginate(rows.map(toAuditEntryDto), total, query.page, query.limit);
}
```

- [ ] **Step 3: Write `delivery.created` into `create()` (transactional)**

In `deliveries.service.ts`, change `create` to take the user and emit the audit row in one transaction. Update the signature:

```ts
async create(dto: CreateDeliveryDto, user: AuthUser): Promise<DeliveryDto> {
  // ... keep the existing reference-clash + zone checks + geocode (Promise.all) ...
  const delivery = await this.prisma.$transaction(async (tx) => {
    const created = await tx.delivery.create({
      data: {
        reference: dto.reference,
        pickupAddress: dto.pickupAddress,
        pickupLat: pickup?.lat ?? null,
        pickupLng: pickup?.lng ?? null,
        dropoffAddress: dto.dropoffAddress,
        dropoffLat: dropoff?.lat ?? null,
        dropoffLng: dropoff?.lng ?? null,
        zoneId: dto.zoneId,
        packageSize: dto.packageSize,
        packageWeight: dto.packageWeight,
        packageType: dto.packageType,
        priority: dto.priority,
        deadlineAt: new Date(dto.deadlineAt),
      },
    });
    await this.audit.record(
      {
        actorUserId: user.id,
        action: 'delivery.created',
        entityType: 'Delivery',
        entityId: created.id,
        after: {
          reference: created.reference,
          status: created.status,
          zoneId: created.zoneId,
          priority: created.priority,
          packageSize: created.packageSize,
        },
      },
      tx,
    );
    return created;
  });
  return toDeliveryDto(delivery);
}
```

- [ ] **Step 4: Add `listAudit` to `DeliveriesService` + the controller route**

In `deliveries.service.ts`:

```ts
import { PaginationQueryDto } from '../../common/dto/pagination-query.dto';
import { AuditEntryDto } from '../audit/dto/audit-entry.dto';

// inside DeliveriesService:
async listAudit(
  id: string,
  query: PaginationQueryDto,
): Promise<Paginated<AuditEntryDto>> {
  await this.getById(id); // 404 if missing
  return this.audit.listForDelivery(id, query);
}
```

In `deliveries.controller.ts`, import `AuditEntryDto`, `PaginationQueryDto`, then update `create` to pass the user and add the audit route:

```ts
@Post()
@Roles(Role.admin, Role.dispatcher)
@ApiCreatedResponse({ type: DeliveryDto })
@ApiErrorResponses(400, 403, 404)
create(
  @Body() dto: CreateDeliveryDto,
  @CurrentUser() user: AuthUser,
): Promise<DeliveryDto> {
  return this.deliveries.create(dto, user);
}

@Get(':id/audit')
@ApiPaginatedResponse(AuditEntryDto)
@ApiErrorResponses(404)
getAudit(
  @Param('id') id: string,
  @Query() query: PaginationQueryDto,
): Promise<Paginated<AuditEntryDto>> {
  return this.deliveries.listAudit(id, query);
}
```

(`CurrentUser`, `AuthUser`, `Query`, `ApiPaginatedResponse`, `Paginated` are already imported in this controller.)

- [ ] **Step 5: Audit service unit test**

In `apps/api/src/modules/audit/audit.service.spec.ts`, add a test that `listForDelivery` ORs Delivery + assignment ids and maps the actor. Using the existing prisma mock pattern:

```ts
it('lists delivery + assignment audit rows newest-first with actor', async () => {
  prisma.assignment.findMany.mockResolvedValue([{ id: 'a1' }]);
  prisma.$transaction.mockResolvedValue([
    [
      {
        id: 'l1',
        action: 'delivery.status_changed',
        entityType: 'Delivery',
        actorUserId: 'u1',
        reason: null,
        before: { status: 'ready' },
        after: { status: 'assigned' },
        createdAt: new Date(),
        actor: { name: 'Dee', role: 'dispatcher' },
      },
    ],
    1,
  ]);
  const res = await service.listForDelivery('d1', { page: 1, limit: 20 });
  expect(prisma.assignment.findMany).toHaveBeenCalledWith({
    where: { deliveryId: 'd1' },
    select: { id: true },
  });
  expect(res.data[0]).toMatchObject({
    actorName: 'Dee',
    actorRole: 'dispatcher',
    after: { status: 'assigned' },
  });
});
```

(Add `assignment.findMany` and `auditLog.findMany`/`count` to the spec's prisma mock; `$transaction` returns the `[rows, total]` tuple.)

- [ ] **Step 6: Fix the `create` callers in the deliveries spec**

`deliveries.service.spec.ts`'s existing `create` tests now must pass a `user`. Update those calls to `service.create(dto, { id: 'u1', email: 'a@x', name: 'A', role: 'admin' })` and assert `audit.record` was called with `action: 'delivery.created'`. Ensure the spec's `$transaction` mock invokes its callback with a `tx` exposing `delivery.create` (mirror the Task-5 status-endpoint pattern already in this file).

- [ ] **Step 7: Run specs → pass; lint; build**

```bash
pnpm --filter @logidash/api test -- "audit.service|deliveries.service"
pnpm --filter @logidash/api lint:check
pnpm --filter @logidash/api build
```

- [ ] **Step 8: Commit**

```bash
git add apps/api/src/modules/audit apps/api/src/modules/deliveries
git commit -m "feat(api): GET /deliveries/:id/audit + delivery.created audit row"
```

---

## Task 5: Backend e2e for the three additions

**Files:**

- Modify: `apps/api/test/recommendations-assignments.e2e-spec.ts` (or the deliveries e2e — pick whichever already seeds a `ready` delivery + driver; the recommendations/assignments suite does)

- [ ] **Step 1: Add assertions to the existing assign happy-path**

After the suite assigns a driver to a `ready` delivery (existing flow), add:

```ts
it('exposes assignedDriver on the delivery after assignment', async () => {
  const res = await request(app.getHttpServer())
    .get(`/v1/deliveries/${deliveryId}`)
    .set('Authorization', `Bearer ${dispatcherToken}`)
    .expect(200);
  const body = res.body as DeliveryDto;
  expect(body.assignedDriver).not.toBeNull();
  expect(typeof body.assignedDriver?.name).toBe('string');
});

it('returns the delivery audit timeline newest-first', async () => {
  const res = await request(app.getHttpServer())
    .get(`/v1/deliveries/${deliveryId}/audit`)
    .set('Authorization', `Bearer ${dispatcherToken}`)
    .expect(200);
  const body = res.body as { data: AuditEntryDto[]; meta: unknown };
  const actions = body.data.map((e) => e.action);
  expect(actions).toContain('assignment.created');
  expect(body.data[0]).toHaveProperty('actorName');
});

it('returns a route estimate (mock provider) for a geocoded delivery', async () => {
  const res = await request(app.getHttpServer())
    .get(`/v1/deliveries/${deliveryId}/route-estimate`)
    .set('Authorization', `Bearer ${dispatcherToken}`)
    .expect(200);
  const body = res.body as RouteEstimateDto;
  // Seeded/created deliveries geocode under MAPS_PROVIDER=mock, so this resolves.
  expect(body.available).toBe(true);
  expect(body.provider).toBe('mock');
});

it('404s the route estimate / audit for an unknown delivery', async () => {
  await request(app.getHttpServer())
    .get('/v1/deliveries/does-not-exist/route-estimate')
    .set('Authorization', `Bearer ${dispatcherToken}`)
    .expect(404);
});
```

Import the response types from the api source DTOs (the suite already imports from `../src/...`). If the chosen delivery isn't geocoded in the seed, create one via `POST /v1/deliveries` first (addresses geocode best-effort under the mock provider) and use its id.

- [ ] **Step 2: Run e2e (Docker Postgres on 5433)**

```bash
docker compose up -d
pnpm --filter @logidash/api db:seed
pnpm --filter @logidash/api test:e2e
```

Expected: all suites green, including the new assertions.

- [ ] **Step 3: Commit**

```bash
git add apps/api/test
git commit -m "test(api): e2e for assignedDriver, audit timeline, route estimate"
```

---

## Task 6: Re-emit contract + regenerate the client

**Files:**

- Modify (generated): `apps/api/openapi.json`
- Modify (generated): `packages/api-client/src/generated/**`

- [ ] **Step 1: Regenerate both artifacts**

```bash
pnpm gen:openapi
pnpm gen:client
```

- [ ] **Step 2: Sanity-check the new surface exists**

Confirm the generated client now has the new hooks/types:

```bash
git status --porcelain packages/api-client/src/generated apps/api/openapi.json
```

Expect new files like `model/routeEstimateDto.ts`, `model/auditEntryDto.ts`, `model/deliverySummaryDriverDto.ts`, a `deliveriesGetAudit200.ts`, and `deliveries.ts` gaining `useDeliveriesGetRouteEstimate` + `useDeliveriesGetAudit`; `deliveryDto.ts` gains `assignedDriver`.

- [ ] **Step 3: Typecheck the client + web against the new types**

```bash
pnpm --filter @logidash/api-client test
pnpm --filter @logidash/web build
```

Expected: PASS (no consumer yet depends on the new fields).

- [ ] **Step 4: Commit the regenerated artifacts**

```bash
git add apps/api/openapi.json packages/api-client/src/generated
git commit -m "chore(contract): regenerate OpenAPI + client for Slice 2 endpoints"
```

---

## Task 7: `Modal` UI primitive

**Files:**

- Create: `apps/web/src/components/ui/Modal.tsx`
- Test: `apps/web/src/components/ui/Modal.test.tsx`

A dialog primitive (the prototype renders the assign modal inline; we extract a reusable one). Behavior matches the handoff Interactions: Escape + outside-click close, `--shadow-pop`, backdrop, focus moved into the dialog.

- [ ] **Step 1: Write the failing test**

`apps/web/src/components/ui/Modal.test.tsx`:

```tsx
import { it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { Modal } from './Modal';

it('renders when open and closes on Escape', async () => {
  const user = userEvent.setup();
  const onClose = vi.fn();
  render(
    <Modal open title="Confirm" onClose={onClose}>
      <p>Body</p>
    </Modal>,
  );
  expect(screen.getByText('Body')).toBeInTheDocument();
  await user.keyboard('{Escape}');
  expect(onClose).toHaveBeenCalled();
});

it('renders nothing when closed', () => {
  render(
    <Modal open={false} title="Confirm" onClose={() => {}}>
      <p>Body</p>
    </Modal>,
  );
  expect(screen.queryByText('Body')).not.toBeInTheDocument();
});
```

- [ ] **Step 2: Run → fail**

Run: `pnpm --filter @logidash/web test -- Modal`
Expected: FAIL (module not found).

- [ ] **Step 3: Implement**

`apps/web/src/components/ui/Modal.tsx`:

```tsx
import type React from 'react';
import { useEffect, useRef } from 'react';
import { ICONS } from './icons';

interface ModalProps {
  open: boolean;
  title: string;
  onClose: () => void;
  children: React.ReactNode;
  footer?: React.ReactNode;
}

export function Modal({ open, title, onClose, children, footer }: ModalProps) {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    document.addEventListener('keydown', onKey);
    ref.current?.focus();
    return () => document.removeEventListener('keydown', onKey);
  }, [open, onClose]);

  if (!open) return null;
  const Close = ICONS.x;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4"
      style={{ background: 'rgba(16,24,40,.45)' }}
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div
        ref={ref}
        role="dialog"
        aria-modal="true"
        aria-label={title}
        tabIndex={-1}
        className="w-full max-w-[440px] rounded-lg bg-surface outline-none"
        style={{ boxShadow: 'var(--shadow-pop)' }}
      >
        <div className="flex items-center justify-between border-b px-5 py-4">
          <h2 className="text-[16px] font-semibold tracking-tight">{title}</h2>
          <button
            type="button"
            aria-label="Close"
            onClick={onClose}
            className="rounded-md p-1 text-[color:var(--color-text-muted)] hover:bg-surface-alt"
          >
            <Close size={18} />
          </button>
        </div>
        <div className="px-5 py-4">{children}</div>
        {footer ? (
          <div className="flex justify-end gap-2 border-t px-5 py-4">
            {footer}
          </div>
        ) : null}
      </div>
    </div>
  );
}
```

- [ ] **Step 4: Run → pass; lint**

```bash
pnpm --filter @logidash/web test -- Modal
pnpm --filter @logidash/web lint:check
```

- [ ] **Step 5: Commit**

```bash
git add apps/web/src/components/ui/Modal.tsx apps/web/src/components/ui/Modal.test.tsx
git commit -m "feat(web): modal/dialog primitive"
```

---

## Task 8: SLA + transition helpers (`lib/sla.ts`, `lib/delivery-transitions.ts`)

**Files:**

- Create: `apps/web/src/lib/sla.ts`
- Test: `apps/web/src/lib/sla.test.ts`
- Create: `apps/web/src/lib/delivery-transitions.ts`
- Test: `apps/web/src/lib/delivery-transitions.test.ts`

- [ ] **Step 1: Failing tests**

`apps/web/src/lib/sla.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { deriveSla } from './sla';

const NOW = new Date('2026-06-15T12:00:00Z').getTime();
const at = (min: number) => new Date(NOW + min * 60_000).toISOString();

describe('deriveSla', () => {
  it('returns null for terminal statuses', () => {
    expect(deriveSla('delivered', at(-10), NOW)).toBeNull();
    expect(deriveSla('cancelled', at(-10), NOW)).toBeNull();
    expect(deriveSla('failed', at(10), NOW)).toBeNull();
  });
  it('classifies non-terminal deliveries', () => {
    expect(deriveSla('ready', at(-1), NOW)).toBe('breached');
    expect(deriveSla('assigned', at(30), NOW)).toBe('at-risk');
    expect(deriveSla('in_transit', at(200), NOW)).toBe('on-track');
  });
});
```

`apps/web/src/lib/delivery-transitions.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { allowedTransitions } from './delivery-transitions';

describe('allowedTransitions', () => {
  it('omits ->assigned for dispatchers (assign flow only)', () => {
    const t = allowedTransitions('ready', 'dispatcher', false);
    expect(t).toContain('cancelled');
    expect(t).not.toContain('assigned');
  });
  it('gives drivers only their own operational path', () => {
    expect(allowedTransitions('assigned', 'driver', true)).toEqual([
      'picked_up',
    ]);
    expect(allowedTransitions('assigned', 'driver', false)).toEqual([]);
  });
  it('gives viewers nothing', () => {
    expect(allowedTransitions('ready', 'viewer', false)).toEqual([]);
  });
});
```

- [ ] **Step 2: Run → fail**

Run: `pnpm --filter @logidash/web test -- "sla|delivery-transitions"`
Expected: FAIL.

- [ ] **Step 3: Implement `lib/sla.ts`**

```ts
import type { DeliveryDtoStatus } from '@logidash/api-client';
import { deadlineState, type DeadlineState } from './format';

const TERMINAL: ReadonlySet<DeliveryDtoStatus> = new Set([
  'delivered',
  'failed',
  'cancelled',
]);

export function deriveSla(
  status: DeliveryDtoStatus,
  deadlineAt: string,
  now: number = Date.now(),
): DeadlineState | null {
  if (TERMINAL.has(status)) return null;
  return deadlineState(deadlineAt, now);
}
```

- [ ] **Step 4: Implement `lib/delivery-transitions.ts`**

```ts
import type { DeliveryDtoStatus, Role } from '@logidash/api-client';

// Mirrors the handoff lifecycle graph (README "Delivery Lifecycle").
export const DELIVERY_TRANSITIONS: Record<
  DeliveryDtoStatus,
  DeliveryDtoStatus[]
> = {
  draft: ['ready', 'cancelled'],
  ready: ['assigned', 'cancelled'],
  assigned: ['picked_up', 'ready', 'cancelled'],
  picked_up: ['in_transit', 'failed', 'cancelled'],
  in_transit: ['delivered', 'failed'],
  delivered: [],
  failed: [],
  cancelled: [],
};

// The driver operational path (own active assignment only).
const DRIVER_PATH: Partial<Record<DeliveryDtoStatus, DeliveryDtoStatus[]>> = {
  assigned: ['picked_up'],
  picked_up: ['in_transit', 'failed'],
  in_transit: ['delivered', 'failed'],
};

export function allowedTransitions(
  status: DeliveryDtoStatus,
  role: Role,
  isOwnActiveAssignment: boolean,
): DeliveryDtoStatus[] {
  if (role === 'viewer') return [];
  if (role === 'driver') {
    return isOwnActiveAssignment ? (DRIVER_PATH[status] ?? []) : [];
  }
  // admin / dispatcher: all allowed edges except ->assigned (assign flow owns it)
  return DELIVERY_TRANSITIONS[status].filter((s) => s !== 'assigned');
}
```

- [ ] **Step 5: Run → pass; lint**

```bash
pnpm --filter @logidash/web test -- "sla|delivery-transitions"
pnpm --filter @logidash/web lint:check
```

- [ ] **Step 6: Commit**

```bash
git add apps/web/src/lib/sla.ts apps/web/src/lib/sla.test.ts apps/web/src/lib/delivery-transitions.ts apps/web/src/lib/delivery-transitions.test.ts
git commit -m "feat(web): SLA + delivery-transition helpers"
```

---

## Task 9: `useZoneMap` hook

**Files:**

- Create: `apps/web/src/hooks/useZoneMap.ts`

- [ ] **Step 1: Implement**

```ts
import { useMemo } from 'react';
import { useZonesList, type ZoneDto } from '@logidash/api-client';

export function useZoneMap() {
  const query = useZonesList({ limit: 100 });
  const zoneMap = useMemo(() => {
    const m = new Map<string, ZoneDto>();
    for (const z of query.data?.data ?? []) m.set(z.id, z);
    return m;
  }, [query.data]);

  const zoneCode = (id: string): string => zoneMap.get(id)?.code ?? id;
  return { zoneMap, zoneCode, isLoading: query.isPending };
}
```

> Confirm `useZonesList` returns the paginated envelope under `.data.data` (Phase 7 `zonesList200` = `{ data: ZoneDto[]; meta }`). Adjust if the generated shape differs.

- [ ] **Step 2: Build**

Run: `pnpm --filter @logidash/web build`
Expected: PASS.

- [ ] **Step 3: Commit**

```bash
git add apps/web/src/hooks/useZoneMap.ts
git commit -m "feat(web): useZoneMap (zone id → code) hook"
```

---

## Task 10: Deliveries queue screen

**Files:**

- Create: `apps/web/src/features/deliveries/DeliveriesPage.tsx`
- Create: `apps/web/src/features/deliveries/components/DeliveryToolbar.tsx`
- Create: `apps/web/src/features/deliveries/components/DeliveryTable.tsx`
- Test: `apps/web/src/features/deliveries/DeliveriesPage.test.tsx`

Port the layout/styling from `prototype/deliveries.jsx`. Replace mock data + state with `useDeliveriesList` + `useZoneMap`; server filters = Status/Priority/Zone + pagination; Search/SLA/Assignment are client-side over the loaded page.

- [ ] **Step 1: `DeliveryToolbar`**

Props: `{ filters, onChange, onClear, onNew, canCreate }`. `filters` is a typed object `{ search: string; status: DeliveryDtoStatus | 'all'; priority: DeliveryDtoPriority | 'all'; zoneId: string | 'all'; sla: 'all' | DeadlineState; assignment: 'all' | 'assigned' | 'unassigned' }`. Render the search `Input` (icon `search`), five `Select`s (Status/Priority/Zone/SLA/Assignment — Zone options from `useZoneMap`), a "Clear (n)" ghost `Button` shown when any non-`all`/non-empty filter is set, and a right-aligned primary `Button icon="plus"` "New delivery" (only when `canCreate`). Active selects get `style={{ borderColor: 'var(--color-primary)', color: 'var(--color-primary)' }}`. Port the toolbar markup from `prototype/deliveries.jsx` (toolbar section).

- [ ] **Step 2: `DeliveryTable`**

Props: `{ rows: DeliveryDto[]; zoneCode: (id: string) => string; onOpen: (id: string) => void; onRecommend: (id: string) => void; onCancel: (id: string) => void; canAct: boolean }`. Port the table from `prototype/deliveries.jsx` (table section): sticky header, zebra rows (`bg-surface-alt` on odd), row hover (`--tint-primary`), columns Reference / `StatusChip` / `PriorityChip` / Zone code / Route (`{pickupAddress} → {dropoffAddress}`, truncate `max-w-[200px]`) / Package (`{packageSize} · {packageWeight}kg`) / `SlaChip` or "—" when `deriveSla(...) === null` / Deadline (`fromNow(deadlineAt)`, tabular, right; danger color when SLA breached) / Driver (`row.assignedDriver ? <Avatar/> + first name : 'Unassigned'`) / kebab `Menu` (on row hover) with `MenuItem`s Open / Recommend (only if `row.status === 'ready'`) / Cancel (danger; hide for terminal). The whole `<tr>` is `onClick={() => onOpen(row.id)}`, `tabIndex={0}`, `onKeyDown` Enter → open; the kebab `Menu` stops propagation.

- [ ] **Step 3: `DeliveriesPage`**

```tsx
// Sketch — fill in from the prototype layout.
export function DeliveriesPage() {
  const navigate = useNavigate();
  const { user } = useAuth();
  const { zoneCode } = useZoneMap();
  const [page, setPage] = useState(1);
  const [filters, setFilters] = useState<Filters>(DEFAULT_FILTERS);
  const [newOpen, setNewOpen] = useState(false);

  const params = {
    page,
    limit: 8,
    ...(filters.status !== 'all' ? { status: filters.status } : {}),
    ...(filters.priority !== 'all' ? { priority: filters.priority } : {}),
    ...(filters.zoneId !== 'all' ? { zoneId: filters.zoneId } : {}),
  };
  const q = useDeliveriesList(params);

  const canCreate = user?.role === 'admin' || user?.role === 'dispatcher';

  // client-side narrow over the loaded page
  const rows = (q.data?.data ?? []).filter((d) =>
    matchesClientFilters(d, filters),
  );

  // states: q.isPending → skeleton rows; q.isError → ErrorState onRetry=q.refetch;
  // rows.length === 0 → EmptyState (Clear filters); else DeliveryTable + pagination
}
```

- Add a module-level `DEFAULT_FILTERS`, a `Filters` type, and a pure `matchesClientFilters(d, filters)` (search across reference/pickup/dropoff/packageType; SLA via `deriveSla(d.status, d.deadlineAt)`; assignment via `d.assignedDriver`).
- Pagination footer reads `q.data.meta` (`{ total, page, limit, … }`); reset `page` to 1 when a server filter changes.
- When a server filter changes, also reset client filters appropriately; "Clear" resets to `DEFAULT_FILTERS` and `page` to 1.
- Render `<NewDeliveryModal open={newOpen} onClose={() => setNewOpen(false)} />` (built in Task 14; import it now and stub the file if executing strictly in order — or reorder Task 14 before this; either is fine).

- [ ] **Step 4: Test the four states**

`apps/web/src/features/deliveries/DeliveriesPage.test.tsx` — mock the hooks and assert each state. Example for empty + data:

```tsx
import { it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';

const useDeliveriesList = vi.fn();
vi.mock('@logidash/api-client', () => ({
  useDeliveriesList: (...a: unknown[]) => useDeliveriesList(...a),
  useZonesList: () => ({ data: { data: [] }, isPending: false }),
}));
vi.mock('../../app/auth/auth-context', () => ({
  useAuth: () => ({ user: { role: 'dispatcher' } }),
}));

import { DeliveriesPage } from './DeliveriesPage';
const wrap = () =>
  render(
    <MemoryRouter>
      <DeliveriesPage />
    </MemoryRouter>,
  );

it('shows the empty state when no rows match', () => {
  useDeliveriesList.mockReturnValue({
    data: { data: [], meta: { total: 0, page: 1, limit: 8 } },
    isPending: false,
    isError: false,
  });
  wrap();
  expect(screen.getByText(/no deliveries/i)).toBeInTheDocument();
});

it('renders rows in the data state', () => {
  useDeliveriesList.mockReturnValue({
    data: {
      data: [
        {
          id: 'd1',
          reference: 'D-1',
          status: 'ready',
          priority: 'high',
          zoneId: 'z1',
          pickupAddress: 'A',
          dropoffAddress: 'B',
          packageSize: 'small',
          packageWeight: 2,
          deadlineAt: new Date(Date.now() + 3600000).toISOString(),
          assignedDriver: null,
        },
      ],
      meta: { total: 1, page: 1, limit: 8 },
    },
    isPending: false,
    isError: false,
  });
  wrap();
  expect(screen.getByText('D-1')).toBeInTheDocument();
  expect(screen.getByText(/unassigned/i)).toBeInTheDocument();
});
```

(Mock `NewDeliveryModal` to render nothing in this test to avoid pulling its hooks.)

- [ ] **Step 5: Run → pass; lint; build**

```bash
pnpm --filter @logidash/web test -- DeliveriesPage
pnpm --filter @logidash/web lint:check
```

- [ ] **Step 6: Commit**

```bash
git add apps/web/src/features/deliveries/DeliveriesPage.tsx apps/web/src/features/deliveries/components/DeliveryToolbar.tsx apps/web/src/features/deliveries/components/DeliveryTable.tsx apps/web/src/features/deliveries/DeliveriesPage.test.tsx
git commit -m "feat(web): deliveries queue (filters, table, pagination, 4 states)"
```

---

## Task 11: Delivery detail shell + info card + route strip + status bar

**Files:**

- Create: `apps/web/src/features/deliveries/DeliveryDetailPage.tsx`
- Create: `apps/web/src/features/deliveries/components/DeliveryInfoCard.tsx`
- Create: `apps/web/src/features/deliveries/components/RouteEstimateStrip.tsx`
- Create: `apps/web/src/features/deliveries/components/StatusTransitionBar.tsx`

Port from `prototype/delivery-detail.jsx` (status bar + details card + route strip). Recommendation panel + audit timeline are Tasks 12 + 15.

- [ ] **Step 1: `RouteEstimateStrip`**

Props: `{ deliveryId: string }`. Uses `useDeliveriesGetRouteEstimate(deliveryId)`. While pending → a `Skeleton`. When `data.available && !data.degraded` → `route` icon (info tint) + Distance `{(distanceMeters/1000).toFixed(1)} km` + Est. duration `{Math.round(durationSeconds/60)} min` (both 15px/600 tabular) + a **success** `Chip` `{provider}{cached ? ' · cached' : ''}`. Otherwise → a **warning** `Chip` "Estimate unavailable". Port the strip markup from `prototype/delivery-detail.jsx`.

- [ ] **Step 2: `DeliveryInfoCard`**

Props: `{ delivery: DeliveryDto; zoneCode: (id: string) => string }`. Port the 2-col info grid (Pickup, Dropoff, Zone | Package, Priority, Deadline) — icon + muted label + value rows. Render `<RouteEstimateStrip deliveryId={delivery.id} />` below the grid.

- [ ] **Step 3: `StatusTransitionBar`**

Props: `{ delivery: DeliveryDto; zoneCode: (id: string) => string; isOwnActiveAssignment: boolean; onChangeStatus: (to: DeliveryDtoStatus, reason?: string) => void; pending: boolean; error: string | null }`. Port the status control bar from `prototype/delivery-detail.jsx`: `package` square + reference + `StatusChip` + `PriorityChip` + "{zoneCode} · created {fromNow(createdAt)}" subline; SLA block (clock + Deadline + `fromNow(deadlineAt)` + `SlaChip`) when `deriveSla(...)` is non-null. Compute buttons via `allowedTransitions(delivery.status, user.role, isOwnActiveAssignment)` (get `user` from `useAuth`): each maps to a `Button` — forward = primary, `cancelled`/`failed` = danger, `ready` = secondary, labels from a `TRANSITION_LABEL` map (`{ ready:'Mark Ready', assigned:'…', picked_up:'Mark Picked up', in_transit:'Mark In transit', delivered:'Mark Delivered', failed:'Mark Failed', cancelled:'Cancel' }`). For `cancelled`/`failed`, open a tiny inline reason prompt (a `Modal` or an inline `Input`) before calling `onChangeStatus(to, reason)`. Viewer (no buttons) shows a "Read-only" `Chip`. Render `error` inline (danger text) when set.

- [ ] **Step 4: `DeliveryDetailPage` (queries + layout; mutations wired in Task 13)**

```tsx
export function DeliveryDetailPage() {
  const { id = '' } = useParams();
  const navigate = useNavigate();
  const { zoneCode } = useZoneMap();
  const delivery = useDeliveriesGetById(id);
  const assignments = useAssignmentsListByDelivery(id);

  // active assignment + whether it belongs to the current user (driver path)
  // (used by the status bar + the recommendation "Assigned" marker in Task 12)

  if (delivery.isPending) return <DetailSkeleton />;
  if (delivery.isError || !delivery.data)
    return <ErrorState onRetry={delivery.refetch} />;

  // Layout: breadcrumb → StatusTransitionBar → grid(2fr/1fr):
  //   left: DeliveryInfoCard + <RecommendationPanel deliveryId={id} ... /> (Task 12)
  //   right: <AuditTimeline deliveryId={id} /> (Task 15)
}
```

Add a `DetailSkeleton` (a few `Skeleton`/`Card` blocks). Import `RecommendationPanel`/`AuditTimeline` (Tasks 12/15) — if executing strictly in order, render placeholders and replace them in those tasks.

- [ ] **Step 5: Lint; build**

```bash
pnpm --filter @logidash/web lint:check
pnpm --filter @logidash/web build
```

- [ ] **Step 6: Commit**

```bash
git add apps/web/src/features/deliveries/DeliveryDetailPage.tsx apps/web/src/features/deliveries/components/DeliveryInfoCard.tsx apps/web/src/features/deliveries/components/RouteEstimateStrip.tsx apps/web/src/features/deliveries/components/StatusTransitionBar.tsx
git commit -m "feat(web): delivery detail shell + info card + route strip + status bar"
```

---

## Task 12: Recommendation panel

**Files:**

- Create: `apps/web/src/features/deliveries/components/RecommendationPanel.tsx`
- Create: `apps/web/src/features/deliveries/components/WeightsLegend.tsx`
- Create: `apps/web/src/features/deliveries/components/CandidateCard.tsx`
- Create: `apps/web/src/features/deliveries/components/FactorBreakdown.tsx`
- Create: `apps/web/src/features/deliveries/components/IneligibleList.tsx`
- Test: `apps/web/src/features/deliveries/components/RecommendationPanel.test.tsx`

Port from `prototype/delivery-detail.jsx` (recommendation panel, factor breakdown, ineligible section). Data from `useRecommendationsGetForDelivery`.

- [ ] **Step 1: `WeightsLegend`**

Props: `{ weights: ScoringWeightsDto }`. A `--color-surface-alt` bar listing the six factors with their weights from `weights` (labels: Zone fit, Route proximity, Remaining capacity, Workload balance, Deadline fit, Priority fit; factor→icon map: zoneFit→mapPin, routeProximity→route, remainingCapacity→scale, workloadBalance→activity, deadlineFit→clock, priorityFit→flag).

- [ ] **Step 2: `FactorBreakdown`**

Props: `{ explanation: FactorContributionDto[]; score: number }`. A bordered table: columns Factor / Normalized (a `Meter value={rawValue}` + `rawValue.toFixed(2)`) / Weight (`×{weight.toFixed(2)}`) / Points (`+{weighted.toFixed(1)}`), one row per factor with `reason` beneath (muted), `degraded` rows get a small "estimated" marker; footer "Weighted total = {score} / 100".

- [ ] **Step 3: `CandidateCard`**

Props: `{ candidate: RecommendationCandidateDto; zoneCode: (id:string)=>string; isTopPick: boolean; isAssigned: boolean; canAssign: boolean; onAssign: (c: RecommendationCandidateDto) => void }`. Port the eligible candidate card: rank square (primary fill when `isTopPick`), `Avatar`, name + chips ("Top pick" when `isTopPick`; "Assigned" success chip when `isAssigned`), meta line `{candidate.driver.vehicle?.type ?? 'No vehicle'} · {zoneCode(candidate.driver.baseZoneId)} · {candidate.driver.activeJobCount}/{candidate.driver.maxConcurrentJobs} jobs`, a `ScoreChip score={candidate.score}` with "SCORE" caption, an Assign `Button` (`disabled` when `!canAssign || isAssigned`; label "Assigned" when `isAssigned`) → `onAssign(candidate)`, and an expand chevron toggling `FactorBreakdown` (collapsed = the 6 mini bars from `candidate.explanation`).

- [ ] **Step 4: `IneligibleList`**

Props: `{ candidates: RecommendationCandidateDto[]; zoneCode }`. Collapsible "Ineligible drivers (n) — shown with reasons"; each card (`bg-surface-alt`): `Avatar`, name, vehicle, an `ScoreChip eligible={false}` ("Ineligible" danger outline), and a bulleted `candidate.ineligibleReasons` list (each with a danger `x` icon).

- [ ] **Step 5: `RecommendationPanel`**

Props: `{ deliveryId: string; deliveryStatus: DeliveryDtoStatus; assignedDriverId: string | null; onAssign: (c: RecommendationCandidateDto) => void }`. Logic:

```tsx
const { user } = useAuth();
const canCompute = user?.role === 'admin' || user?.role === 'dispatcher';
const [refresh, setRefresh] = useState(false);
const q = useRecommendationsGetForDelivery(
  deliveryId,
  refresh ? { refresh: true } : undefined,
  { query: { retry: false } },
);

// 404 (no run / not ready / cannot compute) → no-run EmptyState (CTA "Run recommendations" when canCompute && deliveryStatus === 'ready', triggers setRefresh(true)+refetch)
// loading → skeleton cards
// data → header chip "{eligible} eligible · {n} not", <WeightsLegend weights={run.weights}/>,
//   eligible candidates (rank asc) → <CandidateCard isTopPick={rank===1} isAssigned={candidate.driverId===assignedDriverId} canAssign={deliveryStatus==='ready' && canCompute} .../>,
//   <IneligibleList candidates={ineligible}/>
```

Split `run.candidates` into `eligible` (`c.eligible`) and `ineligible`. Read the 404 from `q.error` (axios `response.status === 404`).

- [ ] **Step 6: Test rendering from a mock run**

`RecommendationPanel.test.tsx`: mock `useRecommendationsGetForDelivery` to return a `RecommendationRunDto` with one eligible (rank 1, score 82) + one ineligible (reasons), and assert the score, "Top pick", a factor `reason`, and an ineligible reason all render; and that a 404 error renders the no-run CTA. Mock `useAuth` → dispatcher.

- [ ] **Step 7: Wire into `DeliveryDetailPage`** (replace the Task 11 placeholder) passing `assignedDriverId` (from the active assignment) and `onAssign` (Task 13).

- [ ] **Step 8: Run → pass; lint; build**

```bash
pnpm --filter @logidash/web test -- RecommendationPanel
pnpm --filter @logidash/web lint:check && pnpm --filter @logidash/web build
```

- [ ] **Step 9: Commit**

```bash
git add apps/web/src/features/deliveries/components/RecommendationPanel.tsx apps/web/src/features/deliveries/components/WeightsLegend.tsx apps/web/src/features/deliveries/components/CandidateCard.tsx apps/web/src/features/deliveries/components/FactorBreakdown.tsx apps/web/src/features/deliveries/components/IneligibleList.tsx apps/web/src/features/deliveries/components/RecommendationPanel.test.tsx apps/web/src/features/deliveries/DeliveryDetailPage.tsx
git commit -m "feat(web): recommendation panel (ranked candidates + factor breakdown + ineligible)"
```

---

## Task 13: Assign modal + assign/status mutations + invalidation

**Files:**

- Create: `apps/web/src/features/deliveries/components/AssignModal.tsx`
- Test: `apps/web/src/features/deliveries/components/AssignModal.test.tsx`
- Modify: `apps/web/src/features/deliveries/DeliveryDetailPage.tsx`

- [ ] **Step 1: Write the failing test (409 surfaced inline)**

`AssignModal.test.tsx`:

```tsx
import { it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

const mutateAsync = vi.fn();
vi.mock('@logidash/api-client', () => ({
  useAssignmentsCreate: () => ({ mutateAsync, isPending: false }),
}));

import { AssignModal } from './AssignModal';

const candidate = {
  driverId: 'drv1',
  score: 82,
  rank: 1,
  driver: {
    id: 'drv1',
    name: 'Alex',
    vehicle: { type: 'van' },
    baseZoneId: 'z1',
    activeJobCount: 1,
    maxConcurrentJobs: 3,
  },
} as never;

it('shows the server 409 message inline and stays open', async () => {
  const user = userEvent.setup();
  mutateAsync.mockRejectedValue({
    response: { status: 409, data: { message: 'Driver is not eligible' } },
  });
  render(
    <AssignModal
      open
      deliveryId="d1"
      reference="D-1"
      candidate={candidate}
      onClose={() => {}}
      onAssigned={() => {}}
    />,
  );
  await user.click(screen.getByRole('button', { name: /confirm assign/i }));
  expect(await screen.findByText(/not eligible/i)).toBeInTheDocument();
});
```

- [ ] **Step 2: Run → fail**

Run: `pnpm --filter @logidash/web test -- AssignModal`
Expected: FAIL.

- [ ] **Step 3: Implement `AssignModal`**

Props: `{ open: boolean; deliveryId: string; reference: string; candidate: RecommendationCandidateDto; onClose: () => void; onAssigned: () => void }`. Uses `useAssignmentsCreate`. Body shows driver name, vehicle, reference, and the candidate score/rank + the note "Eligibility is re-validated on the server and the action is audited." Footer: secondary "Cancel" (`onClose`) + primary "Confirm assign". On confirm:

```tsx
const [error, setError] = useState<string | null>(null);
async function confirm() {
  setError(null);
  try {
    await mutateAsync({ deliveryId, data: { driverId: candidate.driverId } });
    onAssigned();
    onClose();
  } catch (err) {
    const e = err as {
      response?: { status?: number; data?: { message?: string } };
    };
    setError(e.response?.data?.message ?? 'Could not assign this driver.');
  }
}
```

Render `error` (danger) above the footer; keep the modal open on error.

- [ ] **Step 4: Wire assign + status into `DeliveryDetailPage`**

In `DeliveryDetailPage`, add `useDeliveriesChangeStatus` and a `queryClient` from `useQueryClient`. Provide `onAssign` (open `AssignModal` with the chosen candidate) and `onChangeStatus(to, reason)` (call the status mutation). On any success, invalidate:

```ts
const invalidate = () => {
  void qc.invalidateQueries({ queryKey: getDeliveriesGetByIdQueryKey(id) });
  void qc.invalidateQueries({
    queryKey: getRecommendationsGetForDeliveryQueryKey(id),
  });
  void qc.invalidateQueries({ queryKey: getDeliveriesGetAuditQueryKey(id) });
  void qc.invalidateQueries({
    queryKey: getAssignmentsListByDeliveryQueryKey(id),
  });
  void qc.invalidateQueries({ queryKey: ['/v1/deliveries'] }); // list (prefix)
};
```

(Import the `get…QueryKey` helpers from `@logidash/api-client`.) Show a success `Toast` after assign/status. Map a status-change `409` to the `StatusTransitionBar` `error` prop.

- [ ] **Step 5: Run → pass; lint; build**

```bash
pnpm --filter @logidash/web test -- AssignModal
pnpm --filter @logidash/web lint:check && pnpm --filter @logidash/web build
```

- [ ] **Step 6: Commit**

```bash
git add apps/web/src/features/deliveries/components/AssignModal.tsx apps/web/src/features/deliveries/components/AssignModal.test.tsx apps/web/src/features/deliveries/DeliveryDetailPage.tsx
git commit -m "feat(web): assign modal + assign/status mutations with cache invalidation"
```

---

## Task 14: New delivery modal

**Files:**

- Create: `apps/web/src/features/deliveries/components/NewDeliveryModal.tsx`

(If executed before Task 10, the `DeliveriesPage` import resolves immediately; otherwise replace the Task-10 stub.)

- [ ] **Step 1: Implement**

Props: `{ open: boolean; onClose: () => void }`. Uses `useDeliveriesCreate`, `useZoneMap`, and `useNavigate`. A `Modal` with a `<form>`: `Field`+`Input` for reference, pickup address, dropoff address, package type, package weight (`type="number"`, positive); `Field`+`Select` for zone (`zoneMap` options → `<option value={z.id}>{z.code} — {z.name}</option>`), package size (`CreateDeliveryDtoPackageSize` enum values), priority (`CreateDeliveryDtoPriority` enum values); `Field`+`Input type="datetime-local"` for deadline (convert to ISO via `new Date(value).toISOString()`). Footer: Cancel + primary "Create delivery".

```tsx
async function submit() {
  setErrors({});
  try {
    const created = await mutateAsync({
      data: {
        reference,
        pickupAddress,
        dropoffAddress,
        zoneId,
        packageSize,
        packageWeight: Number(packageWeight),
        packageType,
        priority,
        deadlineAt: new Date(deadline).toISOString(),
      },
    });
    onClose();
    navigate(`/deliveries/${created.id}`);
  } catch (err) {
    const e = err as {
      response?: {
        status?: number;
        data?: { message?: string; details?: Record<string, string[]> };
      };
    };
    if (e.response?.status === 400 && e.response.data?.details) {
      setErrors(mapDetailsToFieldErrors(e.response.data.details));
    } else {
      setFormError(
        e.response?.data?.message ?? 'Could not create the delivery.',
      );
    }
  }
}
```

Add a `mapDetailsToFieldErrors` helper (`details: Record<string, string[]>` → `Record<string,string>` taking the first message). Pass per-field `error` to each `Field`. Show `formError` at the top.

> Confirm the generated `CreateDeliveryDto` field names + the enum model names (`createDeliveryDtoPackageSize.ts`, `createDeliveryDtoPriority.ts`) and use their exported value objects for the `<option>` lists.

- [ ] **Step 2: Lint; build**

```bash
pnpm --filter @logidash/web lint:check && pnpm --filter @logidash/web build
```

- [ ] **Step 3: Commit**

```bash
git add apps/web/src/features/deliveries/components/NewDeliveryModal.tsx
git commit -m "feat(web): new delivery modal (create flow with inline 400 validation)"
```

---

## Task 15: Audit timeline + router wiring

**Files:**

- Create: `apps/web/src/features/deliveries/components/AuditTimeline.tsx`
- Modify: `apps/web/src/features/deliveries/DeliveryDetailPage.tsx`
- Modify: `apps/web/src/routes/router.tsx`

- [ ] **Step 1: `AuditTimeline`**

Props: `{ deliveryId: string }`. Uses `useDeliveriesGetAudit(deliveryId)`. Port the timeline from `prototype/delivery-detail.jsx`: a vertical connector line; per entry a tinted round icon by `action` (map: `delivery.created`→package, `delivery.status_changed`→arrowRight, `recommendation.run_created`→sparkles, `assignment.created`→user, default→activity), an action label (a `ACTION_LABEL` map; status entries append `{before.status} → {after.status}` read from the JSON), the `reason` if present, and "{actorName} · {actorRole} · {fromNow(createdAt)}". Loading → skeleton rows; error → small `ErrorState`. Reads rows from `q.data?.data ?? []` (newest-first from the API).

- [ ] **Step 2: Wire into `DeliveryDetailPage`** — replace the Task 11 right-column placeholder with `<AuditTimeline deliveryId={id} />` (sticky on `xl`).

- [ ] **Step 3: Add the detail route**

In `apps/web/src/routes/router.tsx`, replace the `/deliveries` `RouteStub` and add the detail route:

```tsx
import { DeliveriesPage } from '../features/deliveries/DeliveriesPage';
import { DeliveryDetailPage } from '../features/deliveries/DeliveryDetailPage';
// ...
{ path: 'deliveries', element: <DeliveriesPage /> },
{ path: 'deliveries/:id', element: <DeliveryDetailPage /> },
```

(Both sit inside the existing `AppShell` children, available to all roles — the shell + guards already protect them.)

- [ ] **Step 4: Lint; build**

```bash
pnpm --filter @logidash/web lint:check && pnpm --filter @logidash/web build
```

- [ ] **Step 5: Commit**

```bash
git add apps/web/src/features/deliveries/components/AuditTimeline.tsx apps/web/src/features/deliveries/DeliveryDetailPage.tsx apps/web/src/routes/router.tsx
git commit -m "feat(web): audit timeline + deliveries/detail routes"
```

---

## Task 16: Full verification + docs sync

**Files:**

- Modify: `docs/context/progress-tracker.md`
- Modify (if refined): `docs/context/architecture.md`, `docs/implementation-plan.md`

- [ ] **Step 1: Full static + unit verification (all packages)**

Run, expecting all green:

```bash
pnpm --filter @logidash/api lint:check
pnpm --filter @logidash/api build
pnpm --filter @logidash/api test
pnpm --filter @logidash/api-client test
pnpm --filter @logidash/web lint:check
pnpm --filter @logidash/web build
pnpm --filter @logidash/web test
```

- [ ] **Step 2: Contract drift check**

```bash
pnpm gen:openapi && pnpm gen:client
git diff --exit-code apps/api/openapi.json packages/api-client/src/generated
```

Expected: **no diff** (Task 6 already committed the regenerated artifacts).

- [ ] **Step 3: e2e (Docker Postgres on 5433)**

```bash
docker compose up -d
pnpm --filter @logidash/api db:seed
pnpm --filter @logidash/api test:e2e
```

Expected: all suites green (including Task 5's additions).

- [ ] **Step 4: Manual smoke (booted API)**

Boot API (:3000, `JWT_SECRET` ≥32, `MAPS_PROVIDER` unset→mock without a key) + Postgres on 5433 + seed; `apps/web/.env` `VITE_API_URL=http://localhost:3000`; `pnpm --filter @logidash/web dev`. As **dispatcher**:

- `/deliveries` lists, filters (Status/Priority/Zone server-side; Search/SLA/Assignment client-side), paginates.
- "New delivery" → create → lands on the new detail.
- On a `ready` delivery: recommendations show ranked candidates + factor breakdown + ineligible reasons; Assign top pick → status flips to `assigned`, candidate shows "Assigned", toast, two new audit entries; advance status along the graph.
- Route-estimate strip shows `mock` distance/duration; audit timeline lists real events.
- As **viewer**: detail is read-only. As **driver**: only own-assignment status controls.

- [ ] **Step 5: Docs sync**

Update `docs/context/progress-tracker.md`: add a Phase 8 Slice 2 entry (the two screens + the three API additions + create flow), verification counts (api unit/e2e, api-client, web tests), the branch name, and move "Current Goal"/"Next Up" to **Slice 3 — Dashboard, Drivers, Admin**. Note the new endpoints in `architecture.md`/`implementation-plan.md` where they describe the deliveries module + contract surface.

- [ ] **Step 6: Commit**

```bash
git add docs/context/progress-tracker.md docs/context/architecture.md docs/implementation-plan.md
git commit -m "docs(phase-8): sync tracker + context after Slice 2"
```

---

## Acceptance (slice "done when")

- The create → recommend → assign → status arc works end-to-end against the running API: create a delivery, run recommendations, assign with server-side 409 surfaced inline on failure, watch the status flip + "Assigned" + toast + audit entries, then advance status along the allowed graph.
- Driver = own-assignment controls only; viewer = read-only; role-gated actions correct.
- Route-estimate strip and audit timeline render real API data; queue Driver column shows the active driver.
- `pnpm gen` leaves zero drift; CI quality + e2e green.
- All package `lint:check` / `build` / `test` (+ api `test:e2e`) green; per-task commits on `phase-8-slice-2-critical-flow`; tracker updated.
