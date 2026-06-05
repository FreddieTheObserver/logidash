# Architecture Context

## Stack

| Layer           | Technology                              | Role                                                                                               |
| --------------- | --------------------------------------- | -------------------------------------------------------------------------------------------------- |
| Monorepo        | npm workspaces (`apps/*`, `packages/*`) | Single repo: `apps/api` + `apps/web` deployables, `packages/*` shared code (OpenAPI/Orval client). |
| Backend         | NestJS + TypeScript                     | HTTP API, domain modules, guards/interceptors, OpenAPI generation.                                 |
| Database        | PostgreSQL                              | Source of truth for all relational business data.                                                  |
| ORM             | Prisma                                  | Schema, migrations, type-safe data access in the service layer.                                    |
| Auth            | JWT (Passport) + bcrypt/argon2          | Stateless auth; role-based authorization via guards.                                               |
| API contract    | Swagger / OpenAPI (`@nestjs/swagger`)   | Contract-first source of truth; emitted spec is a build artifact.                                  |
| Maps / routing  | OpenRouteService (behind adapter)       | Geocoding + distance/route estimates; cached in `RouteEstimate`.                                   |
| Frontend        | React + TypeScript + Vite               | Dispatcher command-center UI.                                                                      |
| FE API client   | Orval (from OpenAPI)                    | Generated typed client + TanStack Query hooks; no hand-written types.                              |
| FE server-state | TanStack Query                          | Caching, fetching, mutation/invalidation of server state.                                          |
| FE UI state     | React state / Zustand (sparingly)       | Local UI-only state where it genuinely helps.                                                      |

## System Boundaries

Backend (`apps/api/src/`) is organized by business domain, not by technical
layer. Each business-domain module lives under `modules/<domain>/` and owns
its controllers, services, DTOs, and Prisma access for its aggregate.
Cross-cutting and infrastructure code stays at the `src/` root.

Domain modules (`apps/api/src/modules/`):

- `auth/` — login, JWT issuance/validation, password hashing, current-user
  resolution, role guards.
- `users/` — user accounts, roles (admin/dispatcher/driver/viewer), status.
- `drivers/` — driver profiles, availability, base zone, workload metadata,
  link to a vehicle.
- `vehicles/` — vehicle type, capacity, active/inactive status.
- `zones/` — operational delivery zones and optional geo metadata.
- `deliveries/` — pickup/dropoff, package requirements, priority, deadline,
  lifecycle status transitions.
- `assignments/` — assign/unassign driver+vehicle, assignment-rule
  validation, assignment history.
- `recommendations/` — candidate scoring, ranking, eligibility, explanation;
  persists `RecommendationRun` / `RecommendationCandidate`.
- `maps/` — OpenRouteService adapter (provider interface + concrete client),
  route/distance caching, failure handling.
- `audit/` — append-only audit log of sensitive actions (assignment, status,
  role changes).

Cross-cutting / infrastructure (`apps/api/src/` root, not under `modules/`):

- `common/` — cross-cutting pieces: error filters, response/serialization
  interceptors, validation pipe config, shared DTO primitives, guards,
  decorators (`@Public`, `@Roles`, `@CurrentUser`), and shared types.
- `config/` — environment schema and validation.
- `prisma/` — Prisma client provider module (schema, migrations, and seed
  live in `apps/api/prisma/`).
- `health/` + OpenAPI bootstrap (`main.ts`) — health endpoint, Swagger setup,
  spec emit.

Frontend (`apps/web/src/`):

- `@logidash/api-client` (in `packages/api-client/`) — Orval output (client +
  query hooks + types) consumed by the web app. Generated; not hand-edited.
- `features/` — feature folders (deliveries, drivers, recommendations,
  assignments, dashboard, auth), each owning its pages/components/hooks.
- `components/` — shared presentational + layout components.
- `lib/` — query client config, axios/fetch instance, auth token handling.
- `routes/` — route definitions and route guards (role-aware).

## Storage Model

- **PostgreSQL (via Prisma)**: all business entities and their
  relationships — users, driver profiles, vehicles, zones, deliveries,
  assignments, recommendation runs/candidates, route estimates, audit logs.
- **JSON columns (Postgres `jsonb`)**: structured-but-flexible payloads such
  as recommendation score explanations, recommendation input snapshots, and
  audit before/after diffs. These are read-mostly and never used as the
  primary query key.
- **No blob/file storage in MVP**: the system stores no large binary
  artifacts. If proof-of-delivery media is added later it belongs in object
  storage, not the database.
- **Cache**: route/distance lookups are persisted as `RouteEstimate` rows
  keyed by origin/destination so repeated scoring does not re-hit
  OpenRouteService.
- **Refresh-token store (Postgres)**: `RefreshToken` rows persist only a
  SHA-256 hash of each opaque refresh token, with an expiry and a nullable
  revocation timestamp. This makes refresh sessions revocable and rotatable
  without ever storing a raw token.

## Auth and Access Model

- Authentication uses JWT access tokens plus rotating refresh tokens. Login
  verifies an argon2 password hash and issues a short-lived access token
  (~15m, payload `{ sub, email, role }`) that authenticates every protected
  request statelessly, alongside an opaque refresh token. The refresh token
  is stored only as a hash and rotated on `POST /auth/refresh` (presenting a
  revoked token revokes that user's whole token family — theft detection),
  and revoked on `POST /auth/logout`. `/auth/login`, `/auth/refresh`,
  `/auth/logout`, and `/health` are public (`@Public()`); every other route
  requires a valid access token via the global `JwtAuthGuard`.
- Every authenticated request resolves a current user with a single role.
- Roles and intent:
  - **admin** — full access incl. user/role management and configuration.
  - **dispatcher** — manage deliveries, request recommendations, assign
    drivers, change delivery status; cannot manage users/roles.
  - **driver** — read own profile/assignments; submit status updates for
    own assignments only (location ingestion deferred to v2).
  - **viewer** — read-only access to operational data; no mutations.
- Authorization is enforced in the backend via role guards on controllers
  plus ownership checks where relevant (e.g. a driver only acts on their own
  assignments). The frontend hides controls by role for UX, but the backend
  is the enforcement boundary.

## Invariants

1. Authorization is always enforced server-side; frontend role gating is UX
   only and never the security boundary.
2. All external input (request bodies, params, query) is validated/parsed at
   the controller boundary before any domain logic runs.
3. Recommendation scoring is deterministic and explainable: identical inputs
   produce identical scores, and every candidate carries a per-factor
   explanation. No hidden randomness, no ML in MVP.
4. Delivery status changes follow the allowed transition graph only; illegal
   transitions are rejected, never silently coerced.
5. An assignment may only reference an eligible driver + active, compatible
   vehicle with sufficient remaining capacity; ineligible assignments are
   rejected with a business-rule (409) error.
6. Every assignment change, delivery status change, and role change writes
   an audit log entry (actor, action, entity, before/after, reason,
   timestamp). The audit log is append-only.
7. The OpenRouteService provider is accessed only through the `maps` adapter
   interface; no other module calls the provider directly, and the system
   degrades gracefully (cached/fallback) when the provider fails.
8. The OpenAPI spec is the single source of truth for the API contract; the
   frontend consumes only Orval-generated types derived from it.
