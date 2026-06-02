# logidash — Implementation Plan

Phased plan to build logidash from empty repo to portfolio-ready. Each phase
has a goal, concrete tasks, and a "done when" checklist. Work one unit at a
time (see `docs/context/ai-workflow-rules.md`). Backend leads; frontend
follows the contract.

Legend: ☐ todo · ☑ done. Update `docs/context/progress-tracker.md` after
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

- ☐ Add Prisma; configure `DATABASE_URL`.
- ☐ Model all entities from spec §6 (User, DriverProfile, Vehicle, Zone,
  Delivery, Assignment, RecommendationRun, RecommendationCandidate,
  RouteEstimate, AuditLog) with enums, relations, indexes, and the
  RouteEstimate cache-key unique constraint.
- ☐ Create initial migration.
- ☐ `PrismaModule`/`PrismaService` provider.
- ☐ Seed script: demo accounts (one per role), zones, drivers+vehicles,
  deliveries.

**Done when:** migration applies cleanly to a fresh DB and `db:seed`
produces the demo dataset.

---

## Phase 3 — Auth & Authorization

**Goal:** JWT auth with four roles enforced server-side.

Tasks:

- ☐ `AuthModule`: login endpoint, password hashing (argon2), JWT issuance.
- ☐ Decide + implement token strategy (access-only vs access+refresh) —
  resolve the open question here.
- ☐ `JwtStrategy` + current-user resolution; `@CurrentUser()` decorator.
- ☐ `@Roles()` decorator + `RolesGuard`; global auth guard with public-route
  opt-out.
- ☐ `UsersModule`: user CRUD (admin-only) + role assignment.
- ☐ Swagger security scheme (bearer) wired so generated client sends tokens.
- ☐ e2e tests proving role differences (admin/dispatcher/driver/viewer).

**Done when:** login works, protected routes reject unauthenticated/forbidden
requests, and role-matrix e2e tests pass.

---

## Phase 4 — Core Domain Modules (Drivers, Vehicles, Zones, Deliveries)

**Goal:** CRUD + lifecycle for the operational entities, fully validated and
documented, with audit logging.

Tasks:

- ☐ `ZonesModule`: CRUD (admin/dispatcher write; viewer read).
- ☐ `VehiclesModule`: CRUD + active/inactive; capacity fields.
- ☐ `DriversModule`: driver profile, availability, base zone, workload, link
  to vehicle.
- ☐ `DeliveriesModule`: create/read/list (filters: status/priority/zone/
  deadline/assignment), update, and **status transitions** enforcing the
  spec §8 transition graph + role rules (driver may only advance own active
  assignment).
- ☐ `AuditModule`: append-only audit service; wire status changes through it
  inside transactions.
- ☐ Global exception filter + standardized error model (spec §9).
- ☐ Swagger annotations + DTOs on every endpoint; offset pagination envelope.
- ☐ Unit tests for status-transition logic; e2e for delivery lifecycle.

**Done when:** entities are manageable via the API with correct validation,
illegal transitions return 409, and audit entries are written.

---

## Phase 5 — Maps Integration (OpenRouteService)

**Goal:** Geocoding + distance/duration behind an adapter, with caching and
graceful failure.

Tasks:

- ☐ `MapsModule` with `MapsProvider` interface.
- ☐ `OrsMapsProvider`: geocode address → lat/lng; distance/duration between
  two points; API key + base URL from env; timeouts + error mapping.
- ☐ `MockMapsProvider` for tests/no-key local dev; provider selected by env.
- ☐ `RouteEstimate` caching (read-through; rounded-coordinate cache key).
- ☐ Geocode delivery pickup/dropoff on create/update (fill lat/lng).
- ☐ Tests: success, failure/timeout, cache-hit (no real network).

**Done when:** addresses geocode, route estimates are cached, and the system
degrades gracefully when ORS is unavailable.

---

## Phase 6 — Recommendation Engine & Assignments

**Goal:** The signature feature — eligibility + scoring + assignment.

Tasks:

- ☐ Eligibility rules (spec §7 stage 1) as pure, tested functions.
- ☐ Scoring factors (zoneFit, routeProximity, remainingCapacity,
  workloadBalance, deadlineFit, priorityFit) as pure functions returning
  `{ value, reason }`; weights from config.
- ☐ `RecommendationsModule`:
  `GET /deliveries/:id/recommendations` → ranked candidates with
  explanations; persist `RecommendationRun` + `RecommendationCandidate`
  (incl. ineligible reasons).
- ☐ `AssignmentsModule`: `POST /deliveries/:id/assignments` (re-validates
  eligibility), unassign, assignment history; updates driver workload and
  delivery status; writes audit; all in a transaction.
- ☐ Extensive unit tests for each factor + ranking determinism; e2e for
  recommend→assign + ineligible-assignment 409.

**Done when:** recommendations return deterministic, explained rankings and
assignments enforce all business rules with audit trails.

---

## Phase 7 — Contract Emit & Frontend Client Generation

**Goal:** Lock the contract-first pipeline.

Tasks:

- ☐ `gen:openapi` script emits `openapi.json` (with examples, auth, error
  shapes).
- ☐ Orval config (`react-query` mode) → `frontend/src/api/generated/`.
- ☐ axios mutator with auth interceptor (`frontend/src/lib/http.ts`).
- ☐ `gen:client` script; verify generated hooks/types compile.
- ☐ Document the workflow in README (NestJS → OpenAPI → Orval).

**Done when:** a contract change regenerates the client and the frontend
type-checks against generated types only.

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
