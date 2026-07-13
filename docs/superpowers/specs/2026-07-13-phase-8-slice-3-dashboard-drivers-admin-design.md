# Phase 8 Slice 3 — Dashboard, Drivers, Admin (design)

**Date:** 2026-07-13 · **Status:** approved · **Branch:**
`phase-8-slice-3-dashboard-drivers-admin` (from `main`)

Closes out Phase 8 by replacing the three remaining `RouteStub` screens —
**Dashboard** (`/`), **Drivers** (`/drivers`, `/drivers/:id`), **Admin**
(`/admin`) — and landing the deferred **nav count badges**. Like Slice 2,
this is a **full-stack slice**: the screens need four additive, read-only
API capabilities (no schema migration — joins and counts over existing
tables), landed backend-first, then contract re-emit, then UI.

Authoritative screen layouts: `design_handoff_command_center/README.md`
§§2, 5, 6, 7. Token/typography contract: `docs/context/ui-context.md`.

## Approved scope decisions

1. **Recent activity feed: IN.** A slim read-only `GET /v1/audit` ships in
   this slice (the filterable audit _browser UI_ stays deferred).
2. **Admin depth: full CRUD.** Users add/edit/role/status; Zones and
   Vehicles add/edit/delete — all endpoints already exist.
3. **Approach:** additive backend enrichment over frontend-only trimming
   (Slice 2 precedent). `DriverDto` without a `name` cannot render the
   Drivers screen, and dispatchers/viewers cannot resolve names via the
   admin-only `usersList`.

## Backend — four additive, read-only capabilities

### 1. `GET /v1/dashboard/stats` → `DashboardStatsDto`

New slim `modules/dashboard/` (controller + service + DTO; no repository
of its own — Prisma counts only).

```
DashboardStatsDto {
  deliveries: {
    draft: number; ready: number; active: number;   // assigned+picked_up+in_transit
    atRisk: number; breached: number;               // over non-terminal only
    open: number;                                   // draft+ready+active
  };
  drivers: { available: number; busy: number; offline: number; total: number };
}
```

- **SLA semantics** mirror the web's `deadlineState` (`apps/web/src/lib/format.ts`):
  `breached` = non-terminal and `deadlineAt < now`; `atRisk` = non-terminal and
  `deadlineAt` within **90 minutes** of `now`. The 90-minute window is a named
  constant in the dashboard module, documented as mirroring the frontend.
- **Implementation:** `groupBy status` for deliveries + two deadline-window
  `count()`s + `groupBy availability` for drivers, all in one `$transaction`.
- **Gating:** any authenticated role (matches the delivery-scoped audit
  endpoint's precedent: `JwtAuthGuard` only, no `@Roles`).

### 2. `DriverDto` enrichment — `name` + `vehicle` summary

```
DriverDto += {
  name: string;                                  // joined User.name
  vehicle: DriverVehicleSummaryDto | null;       // the linked vehicle
}
DriverVehicleSummaryDto { id, type, status, capacityWeight, capacityVolume }
```

One `include` on the drivers service's `findMany`/`findUnique` (user select

- vehicle) — no N+1. Same pattern as Slice 2's `assignedDriver`.

### 3. `AssignmentDto` enrichment — `delivery` summary

```
AssignmentDto += { delivery: AssignmentDeliverySummaryDto }
AssignmentDeliverySummaryDto { id, reference, status }
```

Populated in both `listByDelivery` and `listByDriver` (and `create`'s
return) via one `include`. Additive; makes the driver-detail history table
linkable and human-readable.

### 4. `GET /v1/audit` → paginated `AuditEntryDto` (+ `entityId`)

On the existing `AuditModule` (new controller): newest-first, actor joined,
standard offset pagination envelope — the same shape as
`GET /v1/deliveries/:id/audit`, minus the delivery scoping. Any
authenticated role. Powers the dashboard's Recent activity card.

`AuditEntryDto` gains **`entityId: string`** (the `AuditLog` column already
exists — additive DTO exposure, populated on both audit endpoints). A
global feed row is meaningless without it; rows with
`entityType === 'delivery'` become links to `/deliveries/:entityId`.

### Contract

`pnpm gen` after the backend lands: re-emit `openapi.json` (22 → **24
paths**) + regenerate the Orval client; both committed, CI drift check
stays green. New hooks per the `operationIdFactory`
(`Controller.method` → camelCase): `DashboardController.getStats` →
`useDashboardGetStats`; `AuditController.list` → `useAuditList`.

## Frontend

### Dashboard (`features/dashboard/`, route `/`)

Handoff §2. `max-w-1200`, vertical stack:

- **Four metric cards** (2-col, 4 on `lg+`) fed by `useDashboardStats`:
  Pending deliveries (`ready`, info/inbox), Active assignments (`active`,
  primary/route), SLA risk (`atRisk + breached`, warning/alert), Drivers
  available (`available`/`total`, success/users). Skeletons while loading.
- **Needs attention** card (spans 2 on `xl`): top 6 open deliveries sorted
  by deadline. Source: one `deliveriesList({ limit: 100 })` fetch,
  client-filtered non-terminal, sorted by `deadlineAt` asc. (No server
  sort/multi-status param — logged gap, fine at demo scale.) Rows: SLA-toned
  status square, reference + priority chip, zone · pickup → dropoff,
  relative deadline + status chip; click → `/deliveries/:id`. "View queue"
  → `/deliveries`.
- **Driver availability** card: Available/Busy/Offline rows with tone dot +
  proportional bar + tabular count, from the same stats query.
- **Recent activity** card: `useAuditList({ limit: 8 })` — tinted action
  icon (by action family: created/status/run/assignment), humanized action
  label, actor name · role, optional reason, relative time. Rows with
  `entityType === 'delivery'` link to `/deliveries/:entityId`; other rows
  are static. (Human-readable entity references — e.g. the delivery's
  `reference` — would need per-type joins; logged gap.)

All async surfaces get loading/empty/error states.

### Drivers (`features/drivers/`)

Handoff §§5–6. Route gating unchanged (`admin`/`dispatcher`/`viewer`).

- **List** (`/drivers`): paginated table, page size 8. Columns: Driver
  (avatar + enriched `name`), Availability (chip), Base zone (`useZoneMap`),
  Vehicle (`vehicle.type` or "—"), Workload (`Meter` + `active/max`,
  tones: danger at max, warning > 0.6, else success), trailing chevron.
  Toolbar: search + availability select, both **client-side over the
  current page** (page-scoped, Slice 2 precedent — no server params).
  Row click / Enter → `/drivers/:id`. Four states (loading skeleton /
  empty / error / data).
- **Detail** (`/drivers/:id`): `useDriversGetById` + paginated
  `useAssignmentsListByDriver`.
  - **Profile card**: 56px avatar, name, availability chip; info rows:
    base zone, vehicle (type + status), joined (`createdAt`).
  - **Workload & capacity card**: stat boxes — Active jobs
    (`activeJobCount`), Job slots (`maxConcurrentJobs`), Vehicle capacity
    (`vehicle.capacityWeight` kg or "—"); a job-slots meter
    (`active/max`).
  - **Assignment history table**: Reference (links to
    `/deliveries/:id` via the enriched `delivery` summary), delivery
    status chip, assignment status chip (active→info, completed→success,
    cancelled→neutral), When (`assignedAt` relative), Note
    (`unassignReason` ?? "—"). Paginated, newest first.

### Admin (`features/admin/`, route `/admin`, admin-only — already gated)

Handoff §7, one tabbed card: **Users & roles / Zones / Vehicles** (the
prototype's "Vehicle types" becomes **Vehicles** — the API models
individual vehicles, not a type catalog). Tab count badges from list meta
totals (`usersList` is unpaginated → `length`). Each tab: description row +
"Add" primary button + table + kebab actions. All modals reuse the
`NewDeliveryModal` pattern: `Modal` primitive, labels-above-inputs, `400
details` mapped to per-field errors by leading property name, `409`
surfaced inline, disabled submit while pending, success `Toast`.

- **Users**: table (avatar+name, email, role chip — admin=primary,
  dispatcher=info, driver=success, viewer=neutral — status chip, created).
  Add (name/email/password/role via `usersCreate`), Edit (name/role/status
  via `usersUpdate`), kebab quick Disable/Enable. The **last-admin 409**
  (demote/disable the only active admin) surfaces inline.
- **Zones**: paginated table (name, code chip, center lat,lng tabular or
  "—"). Add/Edit (name, code, optional center), Delete with confirm modal —
  referential-delete **409** (zones with drivers/deliveries) inline.
- **Vehicles**: paginated table (type, capacity weight, capacity volume,
  status chip, driver — resolved via a `useDriverMap` hook over the
  enriched `driversList`, or "—"). Add/Edit (type, capacities, status),
  Delete with confirm — assignment referential **409** inline.

### Nav badges + caching

- `NAV` config gains an optional badge source; `Sidebar` consumes the
  shared `dashboard-stats` query — Deliveries badge = `deliveries.open`,
  Drivers badge = `drivers.available`. Badge styling per handoff (tabular,
  pill, active tint).
- The stats query uses `refetchInterval: 60_000` + matching `staleTime`, so
  Sidebar + Dashboard share one cache entry and one request.
- `DeliveryDetailPage.invalidate()` (5 keys today) additionally invalidates
  the **dashboard-stats** and **audit list** query keys, so assigning or
  changing status refreshes badges, metrics, and the activity feed.

## Trimmed (no API backing — logged, not built)

Driver phone; vehicle plate/label; driver "On-time rate" / "Avg. score"
stats; capacity-used % (active load per driver isn't exposed); zone
delivery/driver counts in admin; user "last active"; profile-card "Assign
delivery" button (assignment lives on delivery detail); server-side
sort/multi-status list params (dashboard sorts client-side); human-readable
entity references in the global audit feed (needs per-type joins); admin
restricted-state banner (the route is already role-gated).

## Testing

- **API unit:** dashboard stats service (status buckets, SLA windows,
  driver availability, empty DB); audit list service/controller;
  drivers service enrichment (name + vehicle, null vehicle); assignments
  delivery-summary mapping.
- **API e2e:** extend the existing suites — stats endpoint reflects seeded
  data + any-auth gating; `GET /v1/audit` pagination + newest-first;
  enriched fields present on drivers + assignments responses.
- **Web (RTL):** DashboardPage (skeleton → metrics render from mocked
  stats), DriversPage (rows render, availability filter), DriverDetailPage
  (profile + history rows link), AdminPage (tab switch, one full modal flow
  incl. 400 field mapping), Sidebar badge rendering.
- Full verification before merge: build, `lint:check`, api + api-client +
  web unit, e2e (Docker Postgres 5433), `pnpm gen` zero drift.

## Delivery mechanics

Branch `phase-8-slice-3-dashboard-drivers-admin` off `main`; one commit per
task; ordering backend → contract regen → frontend (shared pieces → screens
→ badges) → tests already alongside each task → docs sync
(`progress-tracker.md`, `implementation-plan.md`, `ui-context.md` if
conventions shift). After this slice: the Phase 8 live booted-stack smoke,
then merge → `main`, then Phase 9.
