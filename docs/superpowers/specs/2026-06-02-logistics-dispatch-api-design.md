# logidash — Logistics Dispatch API Platform — Design Spec

- Date: 2026-06-02
- Status: Approved (brainstorming complete)
- Type: Backend-first full-stack web application (portfolio)

## 1. Summary

logidash is a backend-first logistics dispatch platform. Dispatchers/admins
manage deliveries, drivers, vehicles, and zones, and assign drivers to
deliveries. The signature feature is a deterministic, explainable,
**scoring-based driver recommendation engine**. The project is built to
demonstrate production-style NestJS engineering, contract-first OpenAPI
design, role-based authorization, a tested domain core, and a third-party
routing integration. A React + TypeScript command-center UI consumes a
type-safe client generated from the OpenAPI contract (via Orval).

## 2. Goals & Non-Goals

### Goals

1. Production-shaped NestJS API: modular domain architecture, strong
   validation, role-based access, OpenAPI docs.
2. Explainable scoring-based recommendation engine with unit-tested logic.
3. Contract-first workflow end to end: NestJS → OpenAPI → Orval client +
   TanStack Query hooks.
4. Polished React command-center UI consuming only generated types.
5. Backend-heavy automated tests + seed data + production-quality docs.

### Non-Goals (MVP)

Live GPS tracking, WebSockets/SSE, customer portal, driver mobile app,
payments, multi-stop route optimization, multi-tenant billing, ML models.

## 3. Personas & Roles

- **admin** — full access incl. user/role management and configuration.
- **dispatcher** — manage deliveries, request recommendations, assign
  drivers/vehicles, change delivery status. No user/role management.
- **driver** — read own profile/assignments; update status of own
  assignments only.
- **viewer** — read-only access to operational data.

Primary user is the dispatcher/admin; the product is judged primarily on
backend quality.

## 4. Core User Flow

1. User signs in → receives JWT → role determines capabilities.
2. Dispatcher creates a delivery (pickup/dropoff, package size/weight/type,
   priority, deadline, zone).
3. Dispatcher requests recommendations → backend returns ranked eligible
   drivers, each with score + explanation.
4. Dispatcher assigns a driver + vehicle → assignment rules validated →
   action audited.
5. Delivery moves through lifecycle; each status change is audited.
6. Dashboard/queue/detail/audit views provide operational visibility.

## 5. Architecture Overview

Monorepo via npm workspaces: `apps/api` (NestJS) + `apps/web` (React+Vite),
plus `packages/*` (e.g. the generated `@logidash/api-client`) and `docs/`.
Backend business domains live under `apps/api/src/modules/`:

`auth`, `users`, `drivers`, `vehicles`, `zones`, `deliveries`,
`assignments`, `recommendations`, `maps`, `audit` — with cross-cutting
`common`, `config`, `prisma`, and `health`/OpenAPI bootstrap at the `src/`
root.

Data lives in PostgreSQL via Prisma. OpenRouteService is accessed only
through the `maps` adapter. Full detail in `docs/context/architecture.md`.

## 6. Data Model

Entities and key fields (final field lists firmed up in the Prisma schema
during Phase 2):

- **User**: `id`, `email` (unique), `passwordHash`, `name`, `role`
  (admin|dispatcher|driver|viewer), `status` (active|disabled), timestamps.
- **DriverProfile**: `id`, `userId` (1:1 to User with role driver),
  `availability` (available|busy|offline), `baseZoneId`, `activeJobCount`
  (workload metadata), `maxConcurrentJobs`, timestamps.
- **Vehicle**: `id`, `driverId` (nullable; a driver's assigned vehicle),
  `type` (bike|car|van|truck), `capacityWeight`, `capacityVolume`,
  `status` (active|inactive), timestamps.
- **Zone**: `id`, `name`, `code`, optional center `lat`/`lng`, optional
  bounding metadata, timestamps.
- **Delivery**: `id`, `reference`, `pickupAddress`, `pickupLat/Lng`
  (nullable until geocoded), `dropoffAddress`, `dropoffLat/Lng`, `zoneId`,
  `packageSize` (small|medium|large), `packageWeight`, `packageType`,
  `priority` (low|normal|high|urgent), `deadlineAt`, `status`
  (draft|ready|assigned|picked_up|in_transit|delivered|failed|cancelled),
  `cancellationReason` (nullable), timestamps.
- **Assignment**: `id`, `deliveryId`, `driverId`, `vehicleId`,
  `status` (active|completed|cancelled), `assignedByUserId`, `assignedAt`,
  `unassignedAt` (nullable), `unassignReason` (nullable).
- **RecommendationRun**: `id`, `deliveryId`, `requestedByUserId`,
  `inputSnapshot` (jsonb — delivery + scoring weights + eligible driver
  set at run time), `createdAt`.
- **RecommendationCandidate**: `id`, `runId`, `driverId`, `eligible` (bool),
  `score` (0–100), `rank`, `explanation` (jsonb — per-factor contributions
  and reasons), `ineligibleReasons` (jsonb, when not eligible).
- **RouteEstimate**: `id`, `originLat/Lng`, `destLat/Lng`,
  `distanceMeters`, `durationSeconds`, `provider`, `fetchedAt`,
  unique key on rounded origin/destination coordinates (cache key).
- **AuditLog**: `id`, `actorUserId`, `action`, `entityType`, `entityId`,
  `before` (jsonb), `after` (jsonb), `reason` (nullable), `createdAt`.
  Append-only.

Closed sets are Prisma/Postgres enums. Indexes on delivery
(status, zoneId, deadlineAt), driver availability, assignment
(deliveryId, driverId, status), and the RouteEstimate cache key.

## 7. Recommendation Engine

Two-stage, deterministic, explainable:

### Stage 1 — Eligibility (hard filters)

A driver is eligible only if all hold:

- Driver `availability` is `available`.
- Driver has an `active` vehicle whose `type` is compatible with the
  package and whose remaining capacity (weight/volume) ≥ package needs.
- Driver `activeJobCount` < `maxConcurrentJobs`.
- Delivery is in an assignable status (`ready`).

Ineligible drivers are returned with `ineligibleReasons` (not silently
dropped) so the UI can explain "why not".

### Stage 2 — Scoring (eligible drivers only)

Weighted score in [0,100]; weights live in config so factors can be tuned
and the input snapshot records the weights used:

```
score =
  zoneFit            * 0.30 +   // same zone as delivery scores highest; otherwise
                                //   normalized by zone-center→pickup distance.
                                //   (No zone adjacency graph in MVP.)
  routeProximity     * 0.25 +   // ORS distance/duration driver→pickup, normalized
  remainingCapacity  * 0.15 +   // headroom vs. package requirements
  workloadBalance    * 0.15 +   // fewer active jobs scores higher (fairness)
  deadlineFit        * 0.10 +   // can plausibly meet deadline given est. duration
  priorityFit        * 0.05     // alignment of driver suitability with priority
```

Each factor returns a normalized 0–1 value and a human-readable reason;
the `explanation` jsonb stores `{ factor, weight, rawValue, weighted,
reason }[]` plus the final score. Identical inputs → identical output.

`routeProximity` and `deadlineFit` use OpenRouteService distance/duration
between the driver's **base zone location** and the pickup, read through the
`maps` adapter and cached in `RouteEstimate`. (In v2, when live tracking
exists, this switches to the driver's last-known coordinates.) If ORS is unavailable,
the engine degrades gracefully: it falls back to zone-based proximity and
flags in the explanation that route data was estimated/unavailable.

API:

- `GET /deliveries/:id/recommendations` — compute (or return latest) ranked
  candidates with explanations; persists a `RecommendationRun`.
- `POST /deliveries/:id/assignments` — assign a chosen driver+vehicle
  (validates eligibility again at assignment time).

## 8. Delivery Lifecycle

Allowed transitions (anything else → 409):

```
draft      → ready | cancelled
ready      → assigned | cancelled
assigned   → picked_up | ready (unassign) | cancelled
picked_up  → in_transit | failed | cancelled
in_transit → delivered | failed
delivered  → (terminal)
failed     → (terminal)
cancelled  → (terminal)
```

Status changes that involve assignment also create/close `Assignment`
records and write audit entries within a single transaction.

**Who may change status:** admin and dispatcher may perform any allowed
transition. A driver may only advance their _own_ active assignment along
the operational path (`assigned → picked_up → in_transit → delivered |
failed`); they cannot cancel, unassign, or touch deliveries that are not
theirs. viewer cannot change status.

## 9. API & Contract Conventions

- Contract-first: NestJS `@nestjs/swagger` decorators are mandatory on every
  endpoint; the emitted OpenAPI spec is the source of truth.
- Orval consumes the spec to generate the frontend client + TanStack Query
  hooks + types.
- Error model (global exception filter): `400` validation (field details),
  `401` unauthenticated, `403` forbidden, `404` not found, `409`
  business-rule conflict. Body: `{ statusCode, error, message, details? }`.
- List endpoints return a paginated envelope (offset pagination in MVP).
- Auth: `Authorization: Bearer <jwt>`; role guards on protected routes.
- Versioning: URL-based (`/v1/...`, no `/api` prefix) via NestJS URI
  versioning with a global `defaultVersion: '1'`. `health` and `docs` are
  version-neutral (stable ops surface). The URL carries a major integer
  only; a new version (v2) is introduced solely for breaking contract
  changes (removing/renaming a field or route, changing a field's
  type/semantics, making an optional input required, or changing the
  response/error envelope), served in parallel with v1 behind a deprecation
  window. The OpenAPI `info.version` tracks the release/spec version and is
  independent of the URL major. Full rationale:
  `docs/superpowers/specs/2026-06-06-api-url-versioning-design.md`.

## 10. Frontend

React + TypeScript (Vite) command center. Pages: Dashboard, Deliveries
queue, Delivery detail (with recommendation panel + audit timeline), Drivers,
Driver detail, Admin. Server state via TanStack Query (Orval hooks); UI-only
state via React/Zustand sparingly. Role-aware navigation and route guards
(UX only). All async surfaces handle loading/empty/error. Visual contract in
`docs/context/ui-context.md`.

## 11. Testing & Docs

- Unit: scoring factors, eligibility rules, status-transition logic.
- e2e: auth, role enforcement, delivery lifecycle, assignment validation,
  recommendation endpoints.
- `maps` adapter: mock provider for success/failure/cache-hit; no real
  network in tests.
- Seed data: realistic drivers, vehicles, zones, deliveries + demo accounts
  for each role.
- Docs: README (overview, architecture, setup, test commands, demo
  accounts), contract workflow explanation, ERD/schema overview, auth/role
  matrix, recommendation scoring explanation, env var guide, v2 roadmap.

## 12. Scope Boundaries

In/out/stretch scope as in `docs/context/project-overview.md`. Live Driver
Operations (location updates, admin live map, freshness, history, realtime)
is the headline v2/stretch feature; the architecture leaves room for a
future `DriverLocationsModule` / `RealtimeModule`, and the recommendation
engine is designed to later consume latest-known driver coordinates.

## 13. Success Criteria

1. Role-based access provably differs across the four roles (tested).
2. Create delivery → recommendations returns ranked drivers w/ explanations.
3. Ineligible assignment is rejected with a clear 409 business-rule error.
4. Every assignment/status change is in the audit log (actor, time, reason).
5. OpenAPI → Orval client powers the full create→recommend→assign→status UI
   flow.
6. Backend unit + e2e suite passes; seed data reproduces the demo scenario.

## 14. Open Questions

- Refresh-token strategy (access-only vs access+refresh rotation) — resolve
  in Phase 3.
- Pagination style (offset assumed for MVP; cursor is a later option).
- Deployment target — deferred until MVP feature-complete.
