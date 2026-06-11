# logidash — Implementation Plan

Phased plan to build logidash from empty repo to portfolio-ready. Each phase
has a goal, concrete tasks, and a "done when" checklist. Work one unit at a
time (see `docs/context/ai-workflow-rules.md`). Backend leads; frontend
follows the contract.

Legend: ☐ todo · ◐ partial · ☑ done. Update `docs/context/progress-tracker.md` after
each meaningful change.

---

## Phase 1 — Foundation & Monorepo Scaffold

**Goal:** A running NestJS API and React app in an npm-workspace monorepo,
with linting, env config, Docker Postgres, and a health endpoint.

Tasks:

- ☑ Root `package.json` with npm workspaces (`backend`, `frontend`) + root
  scripts (`dev`, `build`, `lint`, `test`, `format`).
- ☑ Shared Prettier config + `.editorconfig` at root; `.gitignore`.
  ESLint is per-package flat config (backend and frontend sit on different
  ESLint/TS majors) — see `docs/implementation-tools.md`.
- ☑ Scaffold `backend/` via Nest CLI (TypeScript, `strict: true`).
- ☑ Scaffold `frontend/` via Vite (React + TS).
- ☑ `docker-compose.yml` with PostgreSQL 16; `.env.example` for both
  packages.
- ☑ `@nestjs/config` with validated env schema (Zod, fail fast on bad env).
- ☑ `GET /health` endpoint; CORS configured for the frontend origin;
  global `ValidationPipe` wired at bootstrap.
- ☑ Husky + lint-staged (pre-commit: Prettier + per-package ESLint on staged files).

**Done when:** `npm run dev` starts both apps, `GET /health` returns OK,
lint passes, Postgres is reachable via Docker.

> **Status:** Done — builds, lint, and backend tests pass; `GET /health`
> verified live (200). `docker-compose.yml` validates; Postgres reachability
> is pending a running Docker Desktop daemon in the dev environment.

---

## Phase 2 — Database Schema & Prisma

**Goal:** The full relational model exists, migrates, and seeds.

Tasks:

- ☑ Add Prisma; configure `DATABASE_URL`.
- ☑ Model all entities from spec §6 (User, DriverProfile, Vehicle, Zone,
  Delivery, Assignment, RecommendationRun, RecommendationCandidate,
  RouteEstimate, AuditLog) with enums, relations, indexes, and the
  RouteEstimate cache-key unique constraint.
- ☑ Create initial migration.
- ☑ `PrismaModule`/`PrismaService` provider.
- ☑ Seed script: demo accounts (one per role), zones, drivers+vehicles,
  deliveries.

**Done when:** migration applies cleanly to a fresh DB and `db:seed`
produces the demo dataset.

> **Status:** Done — `20260602161354_init` migration applied; `npm run db:seed`
> produces demo accounts (password `Demo123!`), 3 zones, 3 drivers with vehicles,
> and 6 deliveries. Prisma 7 with CJS client + `PrismaPg` adapter wired in
> NestJS. Docker Postgres mapped to host port **5433** (avoids conflict with a
> local PostgreSQL install on 5432). Jest config updated for the Prisma 7 client
> (`.js` import `moduleNameMapper` + `--experimental-vm-modules`); unit and e2e
> suites green.

---

## Phase 3 — Auth & Authorization

**Goal:** JWT auth with four roles enforced server-side.

Tasks:

- ☑ `AuthModule`: login endpoint, password hashing (argon2), JWT issuance.
- ☑ Decide + implement token strategy (access-only vs access+refresh) —
  resolved: access JWT (~15m) + opaque, hashed, **rotating** refresh token
  with reuse detection (`/auth/refresh`, `/auth/logout`).
- ☑ `JwtStrategy` + current-user resolution; `@CurrentUser()` decorator.
- ☑ `@Roles()` decorator + `RolesGuard`; global auth guard with public-route
  opt-out (`@Public()`).
- ☑ `UsersModule`: user CRUD (admin-only) + role assignment.
- ☑ Swagger security scheme (bearer) wired so generated client sends tokens.
- ☑ e2e tests proving role differences (admin/dispatcher/driver/viewer).

**Done when:** login works, protected routes reject unauthenticated/forbidden
requests, and role-matrix e2e tests pass.

> **Status:** Done — `auth/` and `users/` modules under `apps/api/src/modules/`.
> Access JWT (HS256, `{ sub, email, role }`, ~15m) + opaque refresh tokens
> stored as SHA-256 hashes in `RefreshToken`, rotated on refresh with
> family-revocation reuse detection, revoked on logout. Two global guards
> (`JwtAuthGuard` → `RolesGuard`) with `@Public()` opt-out on `/auth/*` and
> `/health`. Swagger `/docs` exposes the bearer scheme. Verified green: build,
> lint, unit (19), and the role-matrix + token-rotation e2e (8 e2e total).
> Deferred to later phases: global exception filter + pagination envelope
> (Phase 4); `gen:openapi` emit + Orval client (Phase 7).

---

## Phase 4 — Core Domain Modules (Drivers, Vehicles, Zones, Deliveries)

**Goal:** CRUD + lifecycle for the operational entities, fully validated and
documented, with audit logging.

Tasks:

- ☑ `ZonesModule`: CRUD (admin/dispatcher write; viewer read).
- ☑ `VehiclesModule`: CRUD + active/inactive; capacity fields.
- ☑ `DriversModule`: driver profile, availability, base zone, workload, link
  to vehicle.
- ☑ `DeliveriesModule`: create/read/list (filters: status/priority/zone/
  deadline/assignment), update, and **status transitions** enforcing the
  spec §8 transition graph + role rules (driver may only advance own active
  assignment). _Assignment **creation** (`ready → assigned`) is deferred to
  Phase 6; the status endpoint rejects a direct `→ assigned` with 409._
- ☑ `AuditModule`: append-only audit service; wire status changes through it
  inside transactions.
- ☑ Global exception filter + standardized error model (spec §9).
- ☑ Swagger annotations + DTOs on every endpoint; offset pagination envelope.
  — _All Phase-4 endpoints (Zones, Vehicles, Drivers, Deliveries) are annotated
  and paginated._
- ☑ Unit tests for status-transition logic; e2e for delivery lifecycle.

**Done when:** entities are manageable via the API with correct validation,
illegal transitions return 409, and audit entries are written.

> **Status (Slice 1, 2026-06-07):** foundations (global exception filter +
> offset pagination envelope) + Zones + Vehicles shipped — role-gated,
> paginated, Swagger-documented CRUD with referential-delete 409 guards;
> unit + e2e green.
>
> **Status (Slice 2, 2026-06-08): COMPLETE.** Append-only, transaction-aware
> `AuditModule`; `DriversModule` (profile CRUD, availability, base zone,
> read-only workload, driver↔vehicle link); `DeliveriesModule` (CRUD + filtered
> list + the spec §8 status state machine with the role matrix and audited
> side effects inside one transaction). Verified green: build, lint, 60 unit
> tests, and 24 e2e (4 suites). **Phase 4 core domain is complete.** The only
> remaining lifecycle piece — assignment **creation** (`ready → assigned`) plus
> the recommendation engine — is Phase 6.

---

## Phase 5 — Maps Integration (OpenRouteService)

**Goal:** Geocoding + distance/duration behind an adapter, with caching and
graceful failure.

Tasks:

- ☑ `MapsModule` with `MapsProvider` interface.
- ☑ `OrsMapsProvider`: geocode address → lat/lng; distance/duration between
  two points; API key + base URL from env; timeouts + error mapping.
- ☑ `MockMapsProvider` for tests/no-key local dev; provider selected by env.
- ☑ `RouteEstimate` caching (read-through; rounded-coordinate cache key).
- ☑ Geocode delivery pickup/dropoff on create/update (fill lat/lng).
- ☑ Tests: success, failure/timeout, cache-hit (no real network).

**Done when:** addresses geocode, route estimates are cached, and the system
degrades gracefully when ORS is unavailable.

> **Status:** Done (2026-06-10) — `modules/maps/` ships the `MapsProvider`
> interface (`MAPS_PROVIDER` token), `OrsMapsProvider` (native `fetch` +
> `AbortSignal.timeout`, typed `MapsProviderError` mapping: timeout/http/
> network), a deterministic `MockMapsProvider` (FNV-1a hash geocode +
> haversine route), and a `MapsService` facade with read-through
> `RouteEstimate` caching on a 4-decimal rounded-coordinate key (`upsert`
> absorbs concurrent misses; provider failure → `null` for graceful
> degradation). Provider selected via `MAPS_PROVIDER` env (defaults: `ors`
> when `ORS_API_KEY` is set, else `mock`). Deliveries geocode pickup/dropoff
> best-effort on create and re-geocode only changed addresses on update
> (failures leave/reset coords `null`, never block the write). e2e forces
> `MAPS_PROVIDER=mock` — no real network in tests. Verified green: build,
> lint, 96 unit (16 suites), 27 e2e (5 suites).

---

## Phase 6 — Recommendation Engine & Assignments

**Goal:** The signature feature — eligibility + scoring + assignment.

Tasks:

- ☑ Eligibility rules (spec §7 stage 1) as pure, tested functions.
- ☑ Scoring factors (zoneFit, routeProximity, remainingCapacity,
  workloadBalance, deadlineFit, priorityFit) as pure functions returning
  `{ value, reason }`; weights from config.
- ☑ `RecommendationsModule`:
  `GET /deliveries/:id/recommendations` → ranked candidates with
  explanations; persist `RecommendationRun` + `RecommendationCandidate`
  (incl. ineligible reasons).
- ☑ `AssignmentsModule`: `POST /deliveries/:id/assignments` (re-validates
  eligibility), unassign, assignment history; updates driver workload and
  delivery status; writes audit; all in a transaction.
- ☑ Extensive unit tests for each factor + ranking determinism; e2e for
  recommend→assign + ineligible-assignment 409.

**Done when:** recommendations return deterministic, explained rankings and
assignments enforce all business rules with audit trails.

> **Status:** Done (2026-06-11) — `modules/recommendations/` ships a pure engine
> core (`engine/`: eligibility, six factors, score/rank, contexts — all
> unit-tested) orchestrated by `RecommendationsService`;
> `GET /v1/deliveries/:id/recommendations` returns the latest persisted run or
> computes lazily (`?refresh=true` forces a fresh run; admin/dispatcher only,
> delivery must be `ready`) and persists `RecommendationRun` +
> `RecommendationCandidate` (ineligible kept with `score 0`/`rank null` +
> reasons) + an audit row in one transaction. `modules/assignments/` drives the
> deferred `ready → assigned` edge: `POST /v1/deliveries/:id/assignments`
> `{ driverId, reason? }` re-runs the same `checkEligibility`,
> status-guard-flips the delivery (409 on lost races), binds the driver's linked
> vehicle, increments workload, and writes `assignment.created` +
> `delivery.status_changed` audit rows atomically; history at
> `GET /v1/deliveries/:id/assignments` and `GET /v1/drivers/:id/assignments`.
> (Unassign was not built here — it already exists as
> `PATCH /v1/deliveries/:id/status` → `ready` from Phase 4.) ORS degradation:
> route-dependent factors fall back to zone-distance estimates flagged
> `degraded` in the explanation. Verified green: build, lint,
> **151 unit (23 suites)**, **43 e2e (6 suites)**. Branch
> `phase-6-recommendations-assignments`.

---

## Phase 7 — Contract Emit & Frontend Client Generation

**Goal:** Lock the contract-first pipeline.

Tasks:

- ☑ `gen:openapi` script emits `openapi.json` (with examples, auth, error
  shapes).
- ☑ Orval config (`react-query` mode) → `packages/api-client/src/generated/`.
- ☑ axios mutator with auth interceptor
  (`packages/api-client/src/http/custom-instance.ts`).
- ☑ `gen:client` script; verify generated hooks/types compile.
- ☑ Document the workflow in README (NestJS → OpenAPI → Orval).

**Done when:** a contract change regenerates the client and the frontend
type-checks against generated types only.

**Status — COMPLETE (13/13 tasks, 2026-06-11, branch
`phase-7-contract-and-client-generation`).** Shipped: a shared OpenAPI document
builder (`apps/api/src/openapi/swagger.config.ts`, used by both `/docs` and the
emit script) with stable `operationId`s; a documented `ErrorResponseDto` +
`ApiErrorResponses()` helper; explicit response/error decorators on every
endpoint. `pnpm gen:openapi` emits a **committed** `apps/api/openapi.json` (20
paths) by booting `AppModule` with placeholder env and no `listen()` — run as
`nest build && node dist/...` (not `tsx`: esbuild drops decorator metadata,
breaking NestJS DI). `pnpm gen:client` runs Orval (react-query) into the
**committed** `packages/api-client/src/generated/`, funneled through a
hand-written axios mutator that attaches the bearer token and does single-flight
silent refresh on 401 (localStorage token storage with memory fallback).
`apps/web` configures the client at startup and type-checks against generated
types only. CI's `quality` job regenerates both and fails on drift. Detailed plan

- deviations: `docs/superpowers/plans/2026-06-11-phase-7-contract-and-client-generation.md`
  and the progress tracker. Verified green: build, lint, format, \*\*160 unit (api)
- 12 unit (api-client)**, **43 e2e\*\*; `pnpm gen` leaves zero drift.

---

## Phase 8 — Frontend Command Center

**Goal:** Polished React UI consuming generated hooks; production states.

Tasks:

- ☐ App shell (sidebar + top bar), token/theme setup from `ui-context.md`,
  Tailwind + shadcn/ui.
- ☐ Auth: login page, token storage, route guards, role-aware nav.
- ☐ Dashboard: metrics (pending, active assignments, SLA risk, driver
  availability).
- ☐ Deliveries queue: filters, status chips, pagination; empty/loading/error.
- ☐ Delivery detail: info, route estimate, **recommendation panel** (ranked
  drivers + expandable per-factor explanation), assign action, status
  controls, audit timeline.
- ☐ Drivers list + driver detail (availability, vehicle, workload, history).
- ☐ Admin: users/roles, zones, vehicle types.
- ☐ Vitest + RTL tests for key components/hooks.

**Done when:** the full create→recommend→assign→status flow works in the UI
using only generated client hooks, with proper async states.

---

## Phase 9 — Tests, Seed, Docs & Portfolio Polish

**Goal:** Reviewer-ready.

Tasks:

- ☐ Fill test gaps: auth/role matrix, lifecycle, assignment validation,
  scoring, maps adapter; ensure suite is green.
- ☐ Finalize seed data into a compelling demo scenario.
- ☐ README: overview, architecture, setup, env guide, demo accounts, test
  commands, contract workflow, scoring explanation, v2 roadmap.
- ☐ ERD / schema overview (Prisma ERD or diagram) + auth/role matrix doc.
- ☐ "Technical highlights" section for portfolio reviewers.
- ☐ (Stretch) Playwright smoke test; (stretch) Dockerize apps; (stretch)
  deploy + add live demo links.

**Done when:** a reviewer can clone, set env, `db:seed`, run the demo, read
Swagger, and exercise the full flow; tests pass; docs are complete.

---

## v2 / Stretch (post-MVP)

- **Live Driver Operations**: `POST /driver-location-updates`,
  `DriverLocation` history + latest-location presence, staleness rules
  (stale/offline), admin live map, WebSocket/SSE updates; switch
  `routeProximity`/`deadlineFit` to last-known coordinates.
- Deeper analytics (SLA trends, workload heatmaps, failed-delivery analysis).
- Advanced dispatching (multi-stop routes, batching, assignment simulation).

---

## Dependency Order (summary)

```
Phase 1 (scaffold)
  └─ Phase 2 (schema)
       └─ Phase 3 (auth/roles)
            └─ Phase 4 (core domain + audit)
                 ├─ Phase 5 (maps)            ──┐
                 └─ Phase 6 (recommendations) ◀─┘ (needs maps + domain)
                      └─ Phase 7 (contract emit + client)
                           └─ Phase 8 (frontend)
                                └─ Phase 9 (tests/seed/docs/polish)
```
