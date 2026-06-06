# API URL Versioning — Design Spec

**Date:** 2026-06-06
**Status:** Approved (brainstorm complete; pending implementation plan)
**Scope:** Introduce URL-based API versioning to the logidash API
(`apps/api`) and define the governance policy that controls when versions
change.

## 1. Motivation

The API currently exposes bare, unversioned routes (`/auth/*`, `/users/*`,
`/health`). Phase 4 (core domain modules — zones, vehicles, drivers,
deliveries, audit, recommendations) is **not yet started**, so introducing
versioning now means every new route is born versioned, avoiding a painful
retrofit once the contract is consumed by the Orval-generated frontend
client.

The work has two halves: (a) wire NestJS URI versioning so routes carry a
`/v1` segment, and (b) document a **versioning scope** — both the spatial
boundary (what is versioned vs. version-neutral) and the governance rule
(what a version means and when it bumps).

## 2. Mechanism & URL shape

Enable NestJS native **URI versioning** in `apps/api/src/main.ts`:

```ts
import { VersioningType, VERSION_NEUTRAL } from '@nestjs/common';

app.enableVersioning({ type: VersioningType.URI, defaultVersion: '1' });
```

- NestJS's default version prefix is `v`, so versioned controllers resolve
  under `/v1`.
- **No `/api` prefix** — `apps/api` is a dedicated API deployable and
  `apps/web` is separate, so there is no surface to disambiguate from.
- `defaultVersion: '1'` makes **every** controller respond at `/v1`
  automatically; controllers do not each declare a version. This keeps
  Phase 4 controllers versioned for free and prevents contributors from
  forgetting.

Resulting routes:

| Route          | Path                                                                   |
| -------------- | ---------------------------------------------------------------------- |
| Auth           | `/v1/auth/login`, `/v1/auth/refresh`, `/v1/auth/logout`, `/v1/auth/me` |
| Users          | `/v1/users` (+ admin CRUD subpaths)                                    |
| Phase 4 domain | `/v1/zones`, `/v1/vehicles`, `/v1/drivers`, `/v1/deliveries`, …        |
| Health         | `/health` (version-neutral)                                            |
| Swagger UI     | `/docs` (version-neutral)                                              |

## 3. Versioning scope

### 3.1 Spatial scope — what is versioned

| In `/v1` (the business contract)                                                                        | Version-neutral (stable ops surface)                                                                         |
| ------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------ |
| `auth`, `users`, and all Phase 4 modules (zones, vehicles, drivers, deliveries, audit, recommendations) | `health` — liveness/readiness probes and uptime monitors pin to a stable path; `docs` — the Swagger UI mount |

`health` opts out explicitly with
`@Controller({ path: 'health', version: VERSION_NEUTRAL })`. `docs` is a
static `SwaggerModule.setup('docs', …)` mount and is unaffected by
versioning.

### 3.2 Governance scope — what a version means and when it bumps

- The URL carries a **major integer only** (`v1`, `v2`, …). No minor or
  patch component appears in the URL.
- A **new version (v2) is introduced _only_ for breaking contract
  changes**, defined as:
  - removing or renaming a field or route,
  - changing a field's type or semantics,
  - making a previously optional input required,
  - changing the response or error envelope shape.
- **Non-breaking changes stay in v1** — no bump. These include: adding new
  endpoints, adding optional fields, and additive enum values.
- When v2 eventually arrives, it is opt-in **per route** via `@Version('2')`.
  v1 continues to be served in parallel through a deprecation window;
  retired v1 routes are flagged with `@ApiOperation({ deprecated: true })`.
- The OpenAPI `info.version` (`0.1.0` today, set via
  `DocumentBuilder.setVersion(...)`) tracks the **release/spec** version and
  is deliberately **independent** of the URL major version. The two are
  never conflated: a release bump (e.g. `0.1.0` → `0.2.0`) does not imply a
  URL version change, and a URL bump (`v1` → `v2`) is driven by contract
  breakage, not release cadence.

## 4. Code changes

Small and contained:

- **`apps/api/src/main.ts`** — add the `enableVersioning(...)` call and the
  `VersioningType` / `VERSION_NEUTRAL` imports.
- **`apps/api/src/health/health.controller.ts`** — change
  `@Controller('health')` to
  `@Controller({ path: 'health', version: VERSION_NEUTRAL })`; keep
  `@Public()`.
- **`apps/api/src/modules/auth/auth.controller.ts`** and
  **`apps/api/src/modules/users/users.controller.ts`** — **no change**;
  they inherit `defaultVersion: '1'` automatically.

## 5. Contract & test impact

- **`apps/api/test/auth.e2e-spec.ts`** — prefix the `/auth/*` and `/users`
  request paths with `/v1`; leave `/health` as-is.
- **`apps/api/test/app.e2e-spec.ts`** — `/health` stays; no change.
- **Swagger / OpenAPI** — the generated spec's paths automatically pick up
  the `/v1` prefix for versioned controllers; `/health` stays bare.
- **Orval client (`packages/api-client`)** — currently an empty reserved
  home (frontend is Phase 7/8), so nothing downstream breaks. When wired,
  the generated client is `/v1`-aware from day one.

## 6. Documentation updates

- **`docs/superpowers/specs/2026-06-02-logistics-dispatch-api-design.md`
  §9** (API & Contract Conventions) — add a "Versioning" bullet capturing
  the rules in §3 above.
- **`docs/context/architecture.md`** — note URI versioning and the
  version-neutral ops surface (`health`, `docs`).
- **`docs/context/progress-tracker.md`** — record this as a contract
  decision.

## 7. Verification

- `npm run build` — compiles clean.
- `npm run lint` — no new violations.
- e2e suite (Docker Postgres on host port 5433) — the role-matrix /
  token-flow tests, now exercising `/v1/...`, prove the rewrite is correct
  and that `/health` remains reachable unversioned.

Delivered as a single logical commit (code + tests + docs together, since
they are one contract change), per the project's commit cadence.

## 8. Out of scope (YAGNI)

- **Per-version Swagger documents.** Only v1 exists; a single `/docs`
  reflecting v1 is sufficient. A version-grouped Swagger setup is deferred
  until a v2 route actually exists.
- **Header or media-type versioning.** URL versioning was chosen
  deliberately; alternative mechanisms are not implemented.
- **Any actual v2 routes.** This change establishes the v1 baseline and the
  policy; it does not introduce a second version.
