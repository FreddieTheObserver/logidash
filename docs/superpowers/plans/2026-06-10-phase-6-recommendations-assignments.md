# Phase 6 — Recommendation Engine & Assignments — Implementation Plan

> **For agentic workers:** Execute task-by-task. This project has run plans
> **teach-and-build** (user types the code with guidance — see the
> `teach-and-build` skill) and **auto** (the agent writes files directly). Either
> works; pick at kickoff. Steps use checkbox (`- [ ]`) syntax for tracking. The
> design spec (`docs/superpowers/specs/2026-06-02-logistics-dispatch-api-design.md`)
> and code standards (`docs/context/code-standards.md`) are **locked** — implement
> against them; do not re-derive product behavior.

**Goal:** Ship the signature feature — the deterministic, explainable driver
recommendation engine (`GET /v1/deliveries/:id/recommendations`, persisting
`RecommendationRun`/`RecommendationCandidate`) and the `AssignmentsModule`
(`POST /v1/deliveries/:id/assignments` driving the deferred `ready → assigned`
edge, plus assignment history) — transactional, audited, and role-gated.

**Architecture:** A new `modules/recommendations/` owns a **pure functional
engine core** (`engine/`: eligibility hard filters, six scoring factors, score
combiner + ranker, context builders — all plain functions over plain-number
contexts, no Prisma/Nest imports beyond generated enums/types) orchestrated by
`RecommendationsService`, which loads rows, consumes
`MapsService.getRouteEstimate` (falling back to zone-based proximity when it
returns `null`), and persists each run + candidates + an audit row in one
`$transaction`. A new `modules/assignments/` re-runs the same `checkEligibility`
at assignment time and flips `ready → assigned` with a status-guarded
`updateMany` (loses races cleanly with 409), increments driver workload, and
writes two audit rows (`assignment.created` + `delivery.status_changed`) — all
in one transaction, mirroring the Phase 4 `changeStatus` pattern in reverse.

**Tech Stack:** NestJS 11, `@nestjs/swagger`, `class-validator`/`class-transformer`,
Prisma 7 (CJS client at `src/generated/prisma`), Jest + supertest, pnpm. **No new
dependencies, no schema migration** (all Phase 6 tables shipped in Phase 2).

---

## Context

Phases 1–5 left exactly one gap between "CRUD platform" and "dispatch product":
nothing can create an `Assignment`, and the engine that justifies _who_ to
assign doesn't exist. Everything it needs is already in place:

- Schema: `RecommendationRun`, `RecommendationCandidate`, `Assignment` (+ enums,
  indexes) exist since Phase 2 — `apps/api/prisma/schema.prisma:181-230`.
- The Phase 4 status endpoint deliberately 409s a direct `→ assigned`
  (`deliveries.service.ts:220`) and already **closes** assignments + decrements
  `activeJobCount` on unassign/terminal transitions. Phase 6 builds the
  **creation** side only.
- `MapsService.getRouteEstimate(origin, dest)` (Phase 5) returns
  `RouteResult | null` with read-through `RouteEstimate` caching; `null` means
  "degrade gracefully" (`maps.service.ts:41-88`).
- `AuditService.record(entry, tx?)` is transaction-aware (`audit.service.ts`).
- Pagination kit, exception filter, role guards, e2e harness conventions — all
  established in Phases 3–4.

**Decisions locked with the user (2026-06-10), to be recorded in the spec (Task 1):**

1. **Vehicle↔package compatibility matrix (size-tiered):** bike → small;
   car → small+medium; van/truck → all sizes. Weight is a separate check:
   remaining capacity (capacityWeight − Σ active load) ≥ packageWeight.
2. **priorityFit = priority pressure × free slots:**
   `value = 1 − pressure(priority) × (activeJobCount/maxConcurrentJobs)`,
   pressure: low 0, normal 0.25, high 0.5, urgent 1.0.
3. **Assignment body is `{ driverId, reason? }`** — the vehicle is resolved from
   the driver's linked vehicle (1:1 `Vehicle.driverId @unique`); 409 if
   none/inactive/incompatible.

**Design decisions made in this plan (documented in spec §7 by Task 1):**

- `GET /deliveries/:id/recommendations` returns the **latest persisted run**
  when one exists; **computes lazily** when none exists and the caller is
  admin/dispatcher and the delivery is `ready`; `?refresh=true` **forces a new
  run** (admin/dispatcher only → else 403; delivery must be `ready` → else 409).
  Any authenticated role may _read_ an existing run (viewer sees the panel
  read-only per the design handoff); 404 when no run exists and the caller
  can't/can't-yet compute one. This satisfies spec §7's "compute (or return
  latest) … persists a RecommendationRun" and the UI's "Re-run" button.
- **Weights + normalization constants live in code-config**
  (`engine/weights.ts`), injected via a `RECOMMENDATION_WEIGHTS` DI token and
  recorded verbatim in each run's `inputSnapshot` — satisfying spec §7 "weights
  live in config … snapshot records the weights used" without env-var plumbing
  (six floats that must sum to 1 make a poor env surface; a unit test enforces
  the sum instead).
- **Ineligible candidates persist `score: 0, rank: null`** (the schema's
  `score` column is non-nullable) with `ineligibleReasons` as a string array —
  the UI shows the "Ineligible" chip, never the 0.
- **Determinism & time:** `now` is captured once per run by the service and
  passed into the pure engine (and recorded in the snapshot), so identical
  inputs (including `now`) produce identical output — testable without clock
  mocking.
- **Scoring arithmetic matches the prototype's explanation table:**
  `weighted = rawValue × weight × 100` rounded to 1 dp; `score = Σ weighted`
  rounded to 2 dp (fits `Decimal(5,2)`), so the UI's per-factor rows sum
  exactly to the displayed score. Ties rank by `driverId` asc (total order →
  deterministic ranking).
- The **eligibility re-check at assignment time** reuses the exact same pure
  `checkEligibility` the engine uses — one source of truth for the rules.
- The 409 for an ineligible assignment joins the reasons into `message` (the
  exception filter only emits `details` for class-validator arrays — don't
  touch the shared filter in this phase).

**Out of scope (do NOT build here):** audit _read_ endpoint (Phase 8/9 concern),
OpenAPI emit + Orval client (Phase 7), UI (Phase 8), driver availability
auto-flipping on assignment (availability stays manually managed; workload is
the automatic part), unassign endpoint (already exists as
`PATCH /deliveries/:id/status` → `ready`), live driver coordinates (v2).

---

## Conventions locked for this phase

- **Module path:** `apps/api/src/modules/<domain>/` with `dto/` subfolder; the
  pure core under `modules/recommendations/engine/`. Mirror `zones/`/`deliveries/`.
- **Imports from engine files:** enums via
  `import { … } from '../../../generated/prisma/enums'`; model row types as
  `…Model` from `'../../../generated/prisma/models/<Model>'`; `GeoPoint`/
  `RouteResult` from `'../../maps/maps-provider.interface'`.
- **JSON-bound shapes are `type` aliases, not `interface`** — interfaces lack
  implicit index signatures and won't assign to `Prisma.InputJsonValue`.
- **Decimal → number:** `Number(v)` with explicit null guards
  (`Number(null) === 0` — the guard is load-bearing).
- **Roles:** mutations `@Roles(Role.admin, Role.dispatcher)`; reads no
  `@Roles` (any authenticated user — Phase 4 precedent: deliveries/drivers
  reads are open to all roles). Conditional rules (who may _compute_ a run)
  live in the service, like the Phase 4 driver-ownership rule.
- **Tests:** mocked-Prisma service specs using the `makePrismaMock` idiom from
  `deliveries.service.spec.ts` (assign `$transaction` impl **after**
  construction; inferred `jest.fn()` objects, no `jest.Mocked<>`); e2e helpers
  must **not** be `async`; **never** `expect.any(…)` inside `toMatchObject`
  (cast `res.body` to a type + `typeof` asserts instead).
- **Commits:** one commit per task (commit messages given per task). Pre-commit
  hook auto-fixes formatting but **reverts the commit** on non-fixable lint
  errors — run `pnpm --filter @logidash/api lint` before committing.
- **Run commands from the repo root** (Windows PowerShell-safe forms given).

## File structure (what this phase creates/touches)

```
apps/api/src/modules/recommendations/
  engine/
    types.ts                 # FactorName/Weights/FactorContribution/contexts (type aliases)
    weights.ts               # DEFAULT_WEIGHTS, SCORING_CONSTANTS, COMPATIBLE_PACKAGE_SIZES, DI token
    weights.spec.ts
    geo.ts                   # haversineKm, estimateRouteFallback
    geo.spec.ts
    eligibility.ts           # checkEligibility (spec §7 stage 1)
    eligibility.spec.ts
    factors.ts               # six factor functions (spec §7 stage 2)
    factors.spec.ts
    score.ts                 # scoreCandidate, rankCandidates
    score.spec.ts
    context.ts               # toDriverContext/toDeliveryContext (rows → plain contexts)
    context.spec.ts
    active-load.ts           # activeLoadsByDriver(client, ids) — Σ packageWeight of active jobs
  dto/
    recommendation.dto.ts    # Run/Candidate/Factor/Weights DTOs (Swagger)
    recommendation-query.dto.ts  # ?refresh=true
  recommendations.service.ts
  recommendations.service.spec.ts
  recommendations.controller.ts
  recommendations.module.ts
apps/api/src/modules/assignments/
  dto/
    create-assignment.dto.ts # { driverId, reason? }
    assignment.dto.ts
  assignments.service.ts
  assignments.service.spec.ts
  assignments.controller.ts
  assignments.module.ts
apps/api/src/app.module.ts                       # + RecommendationsModule, AssignmentsModule
apps/api/test/recommendations-assignments.e2e-spec.ts
docs/superpowers/specs/2026-06-02-logistics-dispatch-api-design.md  # §7 clarifications
docs/superpowers/plans/2026-06-10-phase-6-recommendations-assignments.md  # this plan
docs/context/progress-tracker.md                 # Task 13
docs/implementation-plan.md                      # Task 13
```

---

### Task 1: Branch, commit this plan, and lock the §7 clarifications into the spec

**Files:**

- Create: `docs/superpowers/plans/2026-06-10-phase-6-recommendations-assignments.md` (this document)
- Modify: `docs/superpowers/specs/2026-06-02-logistics-dispatch-api-design.md` (§7)

- [ ] **Step 1: Create the phase branch from up-to-date main**

```powershell
git checkout main; git pull; git checkout -b phase-6-recommendations-assignments
```

- [ ] **Step 2: Save this plan into the repo**

Copy this document verbatim to
`docs/superpowers/plans/2026-06-10-phase-6-recommendations-assignments.md`.

- [ ] **Step 3: Append the locked decisions to spec §7**

In `docs/superpowers/specs/2026-06-02-logistics-dispatch-api-design.md`, insert
after the `routeProximity`/`deadlineFit` degradation paragraph (the one ending
"…flags in the explanation that route data was estimated/unavailable.") and
before the `API:` block:

```markdown
**Phase 6 clarifications (locked 2026-06-10):**

- **Vehicle↔package compatibility (size-tiered):** bike → small; car → small,
  medium; van/truck → all sizes. Weight is checked separately: remaining
  capacity = `capacityWeight − Σ packageWeight(active assignments)` and must be
  ≥ the delivery's `packageWeight`. (Packages have no numeric volume in MVP;
  the size matrix is the volume proxy.)
- **priorityFit:** `value = 1 − pressure × (activeJobCount/maxConcurrentJobs)`
  with pressure low 0 / normal 0.25 / high 0.5 / urgent 1.0 — urgent work
  prefers drivers with free slots; low priority is indifferent.
- **GET /deliveries/:id/recommendations semantics:** returns the latest
  persisted run; computes lazily when none exists (admin/dispatcher + delivery
  `ready`); `?refresh=true` forces a new run (403 for other roles, 409 when not
  `ready`); 404 when no run exists and none can be computed. Any authenticated
  role may read an existing run.
- **Assignment request body:** `{ driverId, reason? }` — the vehicle is the
  driver's linked vehicle (1:1), re-validated server-side.
- **Weights/constants** live in code config (`engine/weights.ts`), are injected
  via DI, and are recorded per run in `inputSnapshot`.
- **Ineligible candidates** persist `score 0, rank null` + `ineligibleReasons`.
- **Determinism:** the service captures `now` once per run, passes it into the
  pure engine, and records it in the snapshot.
```

- [ ] **Step 4: Commit**

```powershell
git add docs/superpowers/plans/2026-06-10-phase-6-recommendations-assignments.md "docs/superpowers/specs/2026-06-02-logistics-dispatch-api-design.md"
git commit -m "docs(spec,plan): lock phase 6 scoring decisions and implementation plan"
```

---

### Task 2: Engine contracts — types, weights, constants, compatibility matrix

**Files:**

- Create: `apps/api/src/modules/recommendations/engine/types.ts`
- Create: `apps/api/src/modules/recommendations/engine/weights.ts`
- Test: `apps/api/src/modules/recommendations/engine/weights.spec.ts`

- [ ] **Step 1: Write `types.ts`** (no test — pure type declarations)

```ts
import type { GeoPoint } from '../../maps/maps-provider.interface';
import {
  DeliveryStatus,
  DriverAvailability,
  PackageSize,
  Priority,
  VehicleStatus,
  VehicleType,
} from '../../../generated/prisma/enums';

/** The six scoring factors (spec §7 stage 2). */
export type FactorName =
  | 'zoneFit'
  | 'routeProximity'
  | 'remainingCapacity'
  | 'workloadBalance'
  | 'deadlineFit'
  | 'priorityFit';

/** Weights keyed by factor; must sum to 1 (enforced by weights.spec.ts). */
export type ScoringWeights = Record<FactorName, number>;

/** Normalized factor output. `degraded` marks route-data fallback (spec §7). */
export type FactorResult = {
  value: number; // 0..1
  reason: string;
  degraded?: boolean;
};

/**
 * One row of a candidate's `explanation` jsonb.
 * weighted = rawValue × weight × 100 (1 dp); score = Σ weighted (2 dp).
 * Type alias (not interface) so it assigns to Prisma.InputJsonValue.
 */
export type FactorContribution = {
  factor: FactorName;
  weight: number;
  rawValue: number;
  weighted: number;
  reason: string;
  degraded?: boolean;
};

export type VehicleContext = {
  id: string;
  type: VehicleType;
  status: VehicleStatus;
  capacityWeightKg: number;
};

/** Plain-number view of a driver row (+joins) — all the engine ever sees. */
export type DriverContext = {
  driverId: string;
  availability: DriverAvailability;
  activeJobCount: number;
  maxConcurrentJobs: number;
  /** Σ packageWeight (kg) over the driver's active assignments. */
  activeLoadKg: number;
  baseZoneId: string;
  baseZoneCode: string;
  baseZoneCenter: GeoPoint | null;
  vehicle: VehicleContext | null;
};

/** Plain-number view of the delivery being scored. */
export type DeliveryContext = {
  id: string;
  zoneId: string;
  zoneCode: string;
  pickup: GeoPoint | null;
  packageSize: PackageSize;
  packageWeightKg: number;
  priority: Priority;
  deadlineAt: Date;
  status: DeliveryStatus;
};
```

- [ ] **Step 2: Write the failing test `weights.spec.ts`**

```ts
import {
  PackageSize,
  Priority,
  VehicleType,
} from '../../../generated/prisma/enums';
import {
  COMPATIBLE_PACKAGE_SIZES,
  DEFAULT_WEIGHTS,
  SCORING_CONSTANTS,
} from './weights';

describe('scoring configuration', () => {
  it('weights sum to exactly 1', () => {
    const sum = Object.values(DEFAULT_WEIGHTS).reduce((a, b) => a + b, 0);
    expect(sum).toBeCloseTo(1, 10);
  });

  it('matches the spec §7 weight table', () => {
    expect(DEFAULT_WEIGHTS).toEqual({
      zoneFit: 0.3,
      routeProximity: 0.25,
      remainingCapacity: 0.15,
      workloadBalance: 0.15,
      deadlineFit: 0.1,
      priorityFit: 0.05,
    });
  });

  it('compatibility matrix covers every vehicle type with ≥1 size', () => {
    for (const type of Object.values(VehicleType)) {
      expect(COMPATIBLE_PACKAGE_SIZES[type].length).toBeGreaterThan(0);
    }
  });

  it('encodes the locked size tiers', () => {
    expect(COMPATIBLE_PACKAGE_SIZES[VehicleType.bike]).toEqual([
      PackageSize.small,
    ]);
    expect(COMPATIBLE_PACKAGE_SIZES[VehicleType.car]).toEqual([
      PackageSize.small,
      PackageSize.medium,
    ]);
    expect(COMPATIBLE_PACKAGE_SIZES[VehicleType.van]).toContain(
      PackageSize.large,
    );
    expect(COMPATIBLE_PACKAGE_SIZES[VehicleType.truck]).toContain(
      PackageSize.large,
    );
  });

  it('defines priority pressure for every priority', () => {
    for (const p of Object.values(Priority)) {
      expect(SCORING_CONSTANTS.priorityPressure[p]).toBeGreaterThanOrEqual(0);
      expect(SCORING_CONSTANTS.priorityPressure[p]).toBeLessThanOrEqual(1);
    }
  });
});
```

- [ ] **Step 3: Run it — expect FAIL (module not found)**

```powershell
pnpm --filter @logidash/api test -- weights.spec
```

- [ ] **Step 4: Write `weights.ts`**

```ts
import {
  PackageSize,
  Priority,
  VehicleType,
} from '../../../generated/prisma/enums';
import type { ScoringWeights } from './types';

/** DI token so the service receives weights as config (swappable in tests). */
export const RECOMMENDATION_WEIGHTS = Symbol('RECOMMENDATION_WEIGHTS');

/** Spec §7 stage-2 weights. Tunable in one place; each run snapshots them. */
export const DEFAULT_WEIGHTS: ScoringWeights = {
  zoneFit: 0.3,
  routeProximity: 0.25,
  remainingCapacity: 0.15,
  workloadBalance: 0.15,
  deadlineFit: 0.1,
  priorityFit: 0.05,
};

/**
 * Normalization constants (spec §7 Phase 6 clarifications). Kept beside the
 * weights so a run's inputSnapshot records the full scoring configuration.
 */
export const SCORING_CONSTANTS = {
  /** Cross-zone zoneFit is capped below same-zone (which is always 1.0). */
  crossZoneCap: 0.8,
  /** km of zone-center→pickup distance at which zoneFit reaches 0. */
  zoneDistanceLimitKm: 15,
  /** km of driving distance at which routeProximity reaches 0. */
  routeDistanceLimitKm: 15,
  /** Straight-line → road-distance factor for degraded estimates. */
  roadFactor: 1.3,
  /** Assumed speed (km/h) for degraded duration estimates. */
  fallbackSpeedKmh: 30,
  /** Neutral value when a factor's inputs are entirely unavailable. */
  neutralValue: 0.5,
  /** priorityFit pressure per priority (multiplies the driver's load ratio). */
  priorityPressure: {
    [Priority.low]: 0,
    [Priority.normal]: 0.25,
    [Priority.high]: 0.5,
    [Priority.urgent]: 1,
  } as Record<Priority, number>,
};

/** Locked size-tier matrix: which package sizes each vehicle type may carry. */
export const COMPATIBLE_PACKAGE_SIZES: Record<
  VehicleType,
  readonly PackageSize[]
> = {
  [VehicleType.bike]: [PackageSize.small],
  [VehicleType.car]: [PackageSize.small, PackageSize.medium],
  [VehicleType.van]: [PackageSize.small, PackageSize.medium, PackageSize.large],
  [VehicleType.truck]: [
    PackageSize.small,
    PackageSize.medium,
    PackageSize.large,
  ],
};
```

- [ ] **Step 5: Run the test — expect PASS (5 tests)**

```powershell
pnpm --filter @logidash/api test -- weights.spec
```

- [ ] **Step 6: Commit**

```powershell
git add apps/api/src/modules/recommendations/engine
git commit -m "feat(recommendations): engine contracts, weights, constants, compat matrix"
```

---

### Task 3: Geo helpers — haversine + degraded route estimate

**Files:**

- Create: `apps/api/src/modules/recommendations/engine/geo.ts`
- Test: `apps/api/src/modules/recommendations/engine/geo.spec.ts`

- [ ] **Step 1: Write the failing test `geo.spec.ts`**

```ts
import { estimateRouteFallback, haversineKm } from './geo';

// Reference points ~5.2 km apart (NYC City Hall ↔ Times Square).
const A = { lat: 40.712776, lng: -74.005974 };
const B = { lat: 40.758, lng: -73.9855 };

describe('haversineKm', () => {
  it('is 0 for identical points', () => {
    expect(haversineKm(A, A)).toBe(0);
  });

  it('matches a known distance within tolerance', () => {
    const km = haversineKm(A, B);
    expect(km).toBeGreaterThan(4.5);
    expect(km).toBeLessThan(5.8);
  });

  it('is symmetric', () => {
    expect(haversineKm(A, B)).toBeCloseTo(haversineKm(B, A), 9);
  });
});

describe('estimateRouteFallback', () => {
  it('applies the road factor and fixed speed', () => {
    const est = estimateRouteFallback(A, B);
    const straight = haversineKm(A, B);
    expect(est.distanceKm).toBeCloseTo(straight * 1.3, 6);
    // duration = distance / 30 km/h, in seconds
    expect(est.durationSeconds).toBe(Math.round((est.distanceKm / 30) * 3600));
  });
});
```

- [ ] **Step 2: Run — expect FAIL (geo not found)**

```powershell
pnpm --filter @logidash/api test -- geo.spec
```

- [ ] **Step 3: Write `geo.ts`**

```ts
import type { GeoPoint } from '../../maps/maps-provider.interface';
import { SCORING_CONSTANTS } from './weights';

const EARTH_RADIUS_KM = 6371;

/** Great-circle distance in km. */
export function haversineKm(a: GeoPoint, b: GeoPoint): number {
  const toRad = (deg: number): number => (deg * Math.PI) / 180;
  const dLat = toRad(b.lat - a.lat);
  const dLng = toRad(b.lng - a.lng);
  const sinLat = Math.sin(dLat / 2);
  const sinLng = Math.sin(dLng / 2);
  const h =
    sinLat * sinLat +
    Math.cos(toRad(a.lat)) * Math.cos(toRad(b.lat)) * sinLng * sinLng;
  return 2 * EARTH_RADIUS_KM * Math.asin(Math.sqrt(h));
}

/**
 * Degraded travel estimate for when ORS is unavailable (spec §7): straight
 * line × road factor at a fixed speed. Mirrors the MockMapsProvider's model
 * on purpose — both are documented approximations, not shared code.
 */
export function estimateRouteFallback(
  a: GeoPoint,
  b: GeoPoint,
): { distanceKm: number; durationSeconds: number } {
  const distanceKm = haversineKm(a, b) * SCORING_CONSTANTS.roadFactor;
  return {
    distanceKm,
    durationSeconds: Math.round(
      (distanceKm / SCORING_CONSTANTS.fallbackSpeedKmh) * 3600,
    ),
  };
}
```

- [ ] **Step 4: Run — expect PASS (4 tests)**

```powershell
pnpm --filter @logidash/api test -- geo.spec
```

- [ ] **Step 5: Commit**

```powershell
git add apps/api/src/modules/recommendations/engine
git commit -m "feat(recommendations): haversine and degraded route-estimate helpers"
```

---

### Task 4: Eligibility — spec §7 stage 1 hard filters

**Files:**

- Create: `apps/api/src/modules/recommendations/engine/eligibility.ts`
- Test: `apps/api/src/modules/recommendations/engine/eligibility.spec.ts`

- [ ] **Step 1: Write the failing test `eligibility.spec.ts`**

```ts
import {
  DeliveryStatus,
  DriverAvailability,
  PackageSize,
  Priority,
  VehicleStatus,
  VehicleType,
} from '../../../generated/prisma/enums';
import { checkEligibility } from './eligibility';
import type { DeliveryContext, DriverContext } from './types';

function makeDriver(overrides: Partial<DriverContext> = {}): DriverContext {
  return {
    driverId: 'drv1',
    availability: DriverAvailability.available,
    activeJobCount: 0,
    maxConcurrentJobs: 3,
    activeLoadKg: 0,
    baseZoneId: 'z1',
    baseZoneCode: 'DOWNTOWN',
    baseZoneCenter: { lat: 40.71, lng: -74.0 },
    vehicle: {
      id: 'veh1',
      type: VehicleType.van,
      status: VehicleStatus.active,
      capacityWeightKg: 500,
    },
    ...overrides,
  };
}

function makeDelivery(
  overrides: Partial<DeliveryContext> = {},
): DeliveryContext {
  return {
    id: 'del1',
    zoneId: 'z1',
    zoneCode: 'DOWNTOWN',
    pickup: { lat: 40.712, lng: -74.005 },
    packageSize: PackageSize.medium,
    packageWeightKg: 20,
    priority: Priority.normal,
    deadlineAt: new Date('2026-06-10T18:00:00Z'),
    status: DeliveryStatus.ready,
  };
}

describe('checkEligibility', () => {
  it('passes a fully-eligible driver with no reasons', () => {
    const result = checkEligibility(makeDriver(), makeDelivery());
    expect(result).toEqual({ eligible: true, reasons: [] });
  });

  it('rejects a non-available driver with the availability reason', () => {
    const result = checkEligibility(
      makeDriver({ availability: DriverAvailability.busy }),
      makeDelivery(),
    );
    expect(result.eligible).toBe(false);
    expect(result.reasons).toContain(
      'Availability is busy (must be available).',
    );
  });

  it('rejects a driver with no linked vehicle', () => {
    const result = checkEligibility(
      makeDriver({ vehicle: null }),
      makeDelivery(),
    );
    expect(result.reasons).toContain('No vehicle linked to this driver.');
  });

  it('rejects an inactive vehicle', () => {
    const driver = makeDriver();
    driver.vehicle = { ...driver.vehicle!, status: VehicleStatus.inactive };
    const result = checkEligibility(driver, makeDelivery());
    expect(result.reasons).toContain('Linked vehicle is inactive.');
  });

  it('rejects an incompatible vehicle type (bike vs medium)', () => {
    const driver = makeDriver();
    driver.vehicle = { ...driver.vehicle!, type: VehicleType.bike };
    const result = checkEligibility(driver, makeDelivery());
    expect(result.reasons).toContain('A bike cannot carry medium packages.');
  });

  it('rejects insufficient remaining capacity, reporting the free kg', () => {
    const result = checkEligibility(
      makeDriver({ activeLoadKg: 490 }), // 500 cap − 490 load = 10 free < 20 needed
      makeDelivery(),
    );
    expect(result.reasons).toContain(
      'Insufficient remaining capacity — needs 20 kg, has 10 kg free.',
    );
  });

  it('accepts remaining capacity exactly equal to the package weight', () => {
    const result = checkEligibility(
      makeDriver({ activeLoadKg: 480 }), // 20 free == 20 needed
      makeDelivery(),
    );
    expect(result.eligible).toBe(true);
  });

  it('rejects a driver at max concurrent jobs', () => {
    const result = checkEligibility(
      makeDriver({ activeJobCount: 3, maxConcurrentJobs: 3 }),
      makeDelivery(),
    );
    expect(result.reasons).toContain(
      'Workload at maximum — 3 of 3 active jobs.',
    );
  });

  it('accumulates multiple reasons (busy + at max)', () => {
    const result = checkEligibility(
      makeDriver({
        availability: DriverAvailability.offline,
        activeJobCount: 3,
      }),
      makeDelivery(),
    );
    expect(result.eligible).toBe(false);
    expect(result.reasons).toHaveLength(2);
  });
});
```

Note: the `driver.vehicle!` non-null assertions above are inside test factories
where the base object literally defines `vehicle` — if ESLint's
`no-non-null-assertion` complains, restructure as
`vehicle: { ...makeDriver().vehicle as VehicleContext, status: … }` or build the
vehicle object inline; do not disable the rule.

- [ ] **Step 2: Run — expect FAIL**

```powershell
pnpm --filter @logidash/api test -- eligibility.spec
```

- [ ] **Step 3: Write `eligibility.ts`**

```ts
import {
  DriverAvailability,
  VehicleStatus,
} from '../../../generated/prisma/enums';
import type { DeliveryContext, DriverContext } from './types';
import { COMPATIBLE_PACKAGE_SIZES } from './weights';

export type EligibilityResult = { eligible: boolean; reasons: string[] };

/**
 * Spec §7 stage 1 — hard filters. Pure: collects every failing rule so the UI
 * can explain "why not" (ineligible drivers are returned, never dropped).
 * The delivery-must-be-`ready` precondition is an endpoint-level rule, not a
 * per-driver one — it is enforced in the services, not here.
 */
export function checkEligibility(
  driver: DriverContext,
  delivery: DeliveryContext,
): EligibilityResult {
  const reasons: string[] = [];

  if (driver.availability !== DriverAvailability.available) {
    reasons.push(`Availability is ${driver.availability} (must be available).`);
  }

  if (!driver.vehicle) {
    reasons.push('No vehicle linked to this driver.');
  } else {
    if (driver.vehicle.status !== VehicleStatus.active) {
      reasons.push('Linked vehicle is inactive.');
    }
    if (
      !COMPATIBLE_PACKAGE_SIZES[driver.vehicle.type].includes(
        delivery.packageSize,
      )
    ) {
      reasons.push(
        `A ${driver.vehicle.type} cannot carry ${delivery.packageSize} packages.`,
      );
    }
    const remainingKg = driver.vehicle.capacityWeightKg - driver.activeLoadKg;
    if (remainingKg < delivery.packageWeightKg) {
      reasons.push(
        `Insufficient remaining capacity — needs ${delivery.packageWeightKg} kg, has ${Math.max(0, remainingKg)} kg free.`,
      );
    }
  }

  if (driver.activeJobCount >= driver.maxConcurrentJobs) {
    reasons.push(
      `Workload at maximum — ${driver.activeJobCount} of ${driver.maxConcurrentJobs} active jobs.`,
    );
  }

  return { eligible: reasons.length === 0, reasons };
}
```

- [ ] **Step 4: Run — expect PASS (9 tests)**

```powershell
pnpm --filter @logidash/api test -- eligibility.spec
```

- [ ] **Step 5: Commit**

```powershell
git add apps/api/src/modules/recommendations/engine
git commit -m "feat(recommendations): eligibility hard filters with explainable reasons"
```

---

### Task 5: The six scoring factors

**Files:**

- Create: `apps/api/src/modules/recommendations/engine/factors.ts`
- Test: `apps/api/src/modules/recommendations/engine/factors.spec.ts`

All factors are pure `(…) => FactorResult` with `value ∈ [0,1]` and a
human-readable `reason`. `routeProximity`/`deadlineFit` accept
`route: RouteResult | null` — `null` triggers the degraded path (spec §7).

- [ ] **Step 1: Write the failing test `factors.spec.ts`**

Reuse the same `makeDriver`/`makeDelivery` factories as `eligibility.spec.ts`
(copy them in — specs stay self-contained; they're 30 lines).

```ts
import {
  DeliveryStatus,
  DriverAvailability,
  PackageSize,
  Priority,
  VehicleStatus,
  VehicleType,
} from '../../../generated/prisma/enums';
import {
  deadlineFit,
  priorityFit,
  remainingCapacity,
  routeProximity,
  workloadBalance,
  zoneFit,
} from './factors';
import { haversineKm } from './geo';
import type { DeliveryContext, DriverContext } from './types';

// ── factories (same shapes as eligibility.spec.ts) ──────────────────────────
function makeDriver(overrides: Partial<DriverContext> = {}): DriverContext {
  return {
    driverId: 'drv1',
    availability: DriverAvailability.available,
    activeJobCount: 0,
    maxConcurrentJobs: 3,
    activeLoadKg: 0,
    baseZoneId: 'z1',
    baseZoneCode: 'DOWNTOWN',
    baseZoneCenter: { lat: 40.712776, lng: -74.005974 },
    vehicle: {
      id: 'veh1',
      type: VehicleType.van,
      status: VehicleStatus.active,
      capacityWeightKg: 500,
    },
    ...overrides,
  };
}
function makeDelivery(
  overrides: Partial<DeliveryContext> = {},
): DeliveryContext {
  return {
    id: 'del1',
    zoneId: 'z1',
    zoneCode: 'DOWNTOWN',
    pickup: { lat: 40.7126, lng: -74.0089 },
    packageSize: PackageSize.medium,
    packageWeightKg: 20,
    priority: Priority.normal,
    deadlineAt: new Date('2026-06-10T18:00:00Z'),
    status: DeliveryStatus.ready,
  };
}
const NOW = new Date('2026-06-10T12:00:00Z'); // 6h window to the deadline

describe('zoneFit', () => {
  it('scores 1.0 for the same zone', () => {
    const r = zoneFit(makeDriver(), makeDelivery());
    expect(r.value).toBe(1);
    expect(r.reason).toContain('same zone');
  });

  it('scores a cross-zone driver by zone-center→pickup distance, capped at 0.8', () => {
    const driver = makeDriver({
      baseZoneId: 'z2',
      baseZoneCode: 'MIDTOWN',
      baseZoneCenter: { lat: 40.754932, lng: -73.984016 },
    });
    const delivery = makeDelivery();
    const km = haversineKm(driver.baseZoneCenter!, delivery.pickup!);
    const r = zoneFit(driver, delivery);
    const expected = Math.round(0.8 * Math.max(0, 1 - km / 15) * 100) / 100;
    expect(r.value).toBe(expected);
    expect(r.value).toBeLessThan(0.8);
    expect(r.reason).toContain('MIDTOWN');
  });

  it('falls back to a neutral cross-zone value when coordinates are missing', () => {
    const r = zoneFit(
      makeDriver({
        baseZoneId: 'z2',
        baseZoneCode: 'MIDTOWN',
        baseZoneCenter: null,
      }),
      makeDelivery(),
    );
    expect(r.value).toBe(0.4); // neutral 0.5 × crossZoneCap 0.8
    expect(r.reason).toContain('distance unknown');
  });
});

describe('routeProximity', () => {
  it('normalizes ORS distance against the 15 km limit', () => {
    const r = routeProximity(makeDriver(), makeDelivery(), {
      distanceMeters: 3000,
      durationSeconds: 600,
    });
    expect(r.value).toBe(0.8); // 1 − 3/15
    expect(r.degraded).toBeUndefined();
    expect(r.reason).toContain('3.0 km');
  });

  it('clamps to 0 beyond the limit', () => {
    const r = routeProximity(makeDriver(), makeDelivery(), {
      distanceMeters: 40000,
      durationSeconds: 3600,
    });
    expect(r.value).toBe(0);
  });

  it('degrades to the straight-line estimate when the route is null', () => {
    const r = routeProximity(makeDriver(), makeDelivery(), null);
    expect(r.degraded).toBe(true);
    expect(r.value).toBeGreaterThan(0.9); // base center ≈ pickup in the fixture
    expect(r.reason).toContain('estimated');
  });

  it('is neutral when no coordinates exist at all', () => {
    const r = routeProximity(
      makeDriver({ baseZoneCenter: null }),
      makeDelivery({ pickup: null }),
      null,
    );
    expect(r).toEqual({
      value: 0.5,
      reason: 'Route data unavailable — neutral score.',
      degraded: true,
    });
  });
});

describe('remainingCapacity', () => {
  it('scores post-assignment headroom as a share of total capacity', () => {
    // (500 free − 20 pkg) / 500 = 0.96
    const r = remainingCapacity(makeDriver(), makeDelivery());
    expect(r.value).toBe(0.96);
    expect(r.reason).toContain('500 kg free');
  });

  it('accounts for the active load', () => {
    // free = 500 − 400 = 100; (100 − 20) / 500 = 0.16
    const r = remainingCapacity(
      makeDriver({ activeLoadKg: 400 }),
      makeDelivery(),
    );
    expect(r.value).toBe(0.16);
  });

  it('is 0 with no vehicle', () => {
    expect(
      remainingCapacity(makeDriver({ vehicle: null }), makeDelivery()).value,
    ).toBe(0);
  });
});

describe('workloadBalance', () => {
  it('is 1 with no active jobs', () => {
    expect(workloadBalance(makeDriver()).value).toBe(1);
  });

  it('decreases linearly with load', () => {
    const r = workloadBalance(
      makeDriver({ activeJobCount: 2, maxConcurrentJobs: 3 }),
    );
    expect(r.value).toBe(0.33);
    expect(r.reason).toBe('2 of 3 active jobs.');
  });
});

describe('deadlineFit', () => {
  it('scores 0 when the deadline has passed', () => {
    const r = deadlineFit(
      makeDriver(),
      makeDelivery({ deadlineAt: new Date('2026-06-10T11:00:00Z') }),
      { distanceMeters: 3000, durationSeconds: 600 },
      NOW,
    );
    expect(r.value).toBe(0);
    expect(r.reason).toBe('Deadline has already passed.');
  });

  it('scores the travel-time share of the window with ORS duration', () => {
    // 60 min travel vs 360 min window → 1 − 1/6 ≈ 0.83
    const r = deadlineFit(
      makeDriver(),
      makeDelivery(),
      { distanceMeters: 30000, durationSeconds: 3600 },
      NOW,
    );
    expect(r.value).toBe(0.83);
    expect(r.degraded).toBeUndefined();
  });

  it('degrades to the estimated duration when the route is null', () => {
    const r = deadlineFit(makeDriver(), makeDelivery(), null, NOW);
    expect(r.degraded).toBe(true);
    expect(r.reason).toContain('(estimated)');
  });

  it('is neutral when no coordinates exist', () => {
    const r = deadlineFit(
      makeDriver({ baseZoneCenter: null }),
      makeDelivery({ pickup: null }),
      null,
      NOW,
    );
    expect(r).toEqual({
      value: 0.5,
      reason: 'Travel time unknown — neutral score.',
      degraded: true,
    });
  });
});

describe('priorityFit', () => {
  it('is 1.0 for low priority regardless of load', () => {
    const r = priorityFit(
      makeDriver({ activeJobCount: 3 }),
      makeDelivery({ priority: Priority.low }),
    );
    expect(r.value).toBe(1);
    expect(r.reason).toBe('Low priority — any available driver fits.');
  });

  it('penalizes loaded drivers in proportion to priority pressure', () => {
    const driver = makeDriver({ activeJobCount: 2, maxConcurrentJobs: 3 });
    expect(
      priorityFit(driver, makeDelivery({ priority: Priority.urgent })).value,
    ).toBe(0.33); // 1 − 1.0×(2/3)
    expect(
      priorityFit(driver, makeDelivery({ priority: Priority.high })).value,
    ).toBe(0.67); // 1 − 0.5×(2/3)
    expect(
      priorityFit(driver, makeDelivery({ priority: Priority.normal })).value,
    ).toBe(0.83); // 1 − 0.25×(2/3)
  });

  it('names the free slots in the reason', () => {
    const r = priorityFit(
      makeDriver({ activeJobCount: 1, maxConcurrentJobs: 3 }),
      makeDelivery({ priority: Priority.urgent }),
    );
    expect(r.reason).toBe(
      'Urgent priority — driver has 2 of 3 job slots free.',
    );
  });
});
```

- [ ] **Step 2: Run — expect FAIL**

```powershell
pnpm --filter @logidash/api test -- factors.spec
```

- [ ] **Step 3: Write `factors.ts`**

```ts
import { Priority } from '../../../generated/prisma/enums';
import type { RouteResult } from '../../maps/maps-provider.interface';
import { estimateRouteFallback, haversineKm } from './geo';
import type { DeliveryContext, DriverContext, FactorResult } from './types';
import { SCORING_CONSTANTS } from './weights';

const clamp01 = (n: number): number => Math.min(1, Math.max(0, n));
const round2 = (n: number): number => Math.round(n * 100) / 100;

/** Same zone → 1.0; otherwise normalized by zone-center→pickup distance. */
export function zoneFit(
  driver: DriverContext,
  delivery: DeliveryContext,
): FactorResult {
  if (driver.baseZoneId === delivery.zoneId) {
    return {
      value: 1,
      reason: `Based in ${delivery.zoneCode} — same zone as the delivery.`,
    };
  }
  if (driver.baseZoneCenter && delivery.pickup) {
    const km = haversineKm(driver.baseZoneCenter, delivery.pickup);
    const value = round2(
      SCORING_CONSTANTS.crossZoneCap *
        clamp01(1 - km / SCORING_CONSTANTS.zoneDistanceLimitKm),
    );
    return {
      value,
      reason: `Based in ${driver.baseZoneCode} — ${km.toFixed(1)} km from the pickup.`,
    };
  }
  return {
    value: round2(
      SCORING_CONSTANTS.neutralValue * SCORING_CONSTANTS.crossZoneCap,
    ),
    reason: `Based in ${driver.baseZoneCode} — different zone, distance unknown.`,
  };
}

/** ORS driving distance normalized against the 15 km limit; degrades to the
 * straight-line estimate, then to neutral, when data is missing (spec §7). */
export function routeProximity(
  driver: DriverContext,
  delivery: DeliveryContext,
  route: RouteResult | null,
): FactorResult {
  if (route) {
    const km = route.distanceMeters / 1000;
    const minutes = Math.round(route.durationSeconds / 60);
    return {
      value: round2(clamp01(1 - km / SCORING_CONSTANTS.routeDistanceLimitKm)),
      reason: `${km.toFixed(1)} km / ~${minutes} min from base zone to pickup.`,
    };
  }
  if (driver.baseZoneCenter && delivery.pickup) {
    const est = estimateRouteFallback(driver.baseZoneCenter, delivery.pickup);
    return {
      value: round2(
        clamp01(1 - est.distanceKm / SCORING_CONSTANTS.routeDistanceLimitKm),
      ),
      reason: `~${est.distanceKm.toFixed(1)} km from base zone to pickup — estimated, route data unavailable.`,
      degraded: true,
    };
  }
  return {
    value: SCORING_CONSTANTS.neutralValue,
    reason: 'Route data unavailable — neutral score.',
    degraded: true,
  };
}

/** Headroom after taking this package, as a share of total capacity. */
export function remainingCapacity(
  driver: DriverContext,
  delivery: DeliveryContext,
): FactorResult {
  if (!driver.vehicle) {
    return { value: 0, reason: 'No vehicle linked to this driver.' };
  }
  const freeKg = driver.vehicle.capacityWeightKg - driver.activeLoadKg;
  const value = round2(
    clamp01(
      (freeKg - delivery.packageWeightKg) / driver.vehicle.capacityWeightKg,
    ),
  );
  return {
    value,
    reason: `${driver.vehicle.type} with ${freeKg.toFixed(0)} kg free for a ${delivery.packageWeightKg} kg package.`,
  };
}

/** Fewer active jobs scores higher (fairness). */
export function workloadBalance(driver: DriverContext): FactorResult {
  const value =
    driver.maxConcurrentJobs > 0
      ? round2(clamp01(1 - driver.activeJobCount / driver.maxConcurrentJobs))
      : 0;
  return {
    value,
    reason: `${driver.activeJobCount} of ${driver.maxConcurrentJobs} active jobs.`,
  };
}

/** Travel time as a share of the remaining deadline window. */
export function deadlineFit(
  driver: DriverContext,
  delivery: DeliveryContext,
  route: RouteResult | null,
  now: Date,
): FactorResult {
  const windowMinutes =
    (delivery.deadlineAt.getTime() - now.getTime()) / 60_000;
  if (windowMinutes <= 0) {
    return { value: 0, reason: 'Deadline has already passed.' };
  }

  let travelSeconds: number | null = null;
  let degraded = false;
  if (route) {
    travelSeconds = route.durationSeconds;
  } else if (driver.baseZoneCenter && delivery.pickup) {
    travelSeconds = estimateRouteFallback(
      driver.baseZoneCenter,
      delivery.pickup,
    ).durationSeconds;
    degraded = true;
  }
  if (travelSeconds === null) {
    return {
      value: SCORING_CONSTANTS.neutralValue,
      reason: 'Travel time unknown — neutral score.',
      degraded: true,
    };
  }

  const travelMinutes = travelSeconds / 60;
  const value = round2(clamp01(1 - travelMinutes / windowMinutes));
  const base =
    value === 0
      ? `~${Math.round(travelMinutes)} min to pickup exceeds the ${Math.round(windowMinutes)} min window.`
      : `~${Math.round(travelMinutes)} min to pickup against a ${Math.round(windowMinutes)} min window.`;
  return degraded
    ? { value, reason: `${base} (estimated)`, degraded: true }
    : { value, reason: base };
}

/** Urgent work prefers drivers with free slots; low priority is indifferent. */
export function priorityFit(
  driver: DriverContext,
  delivery: DeliveryContext,
): FactorResult {
  const pressure = SCORING_CONSTANTS.priorityPressure[delivery.priority];
  const load =
    driver.maxConcurrentJobs > 0
      ? driver.activeJobCount / driver.maxConcurrentJobs
      : 1;
  const value = round2(clamp01(1 - pressure * load));
  if (delivery.priority === Priority.low) {
    return { value, reason: 'Low priority — any available driver fits.' };
  }
  const freeSlots = Math.max(
    0,
    driver.maxConcurrentJobs - driver.activeJobCount,
  );
  const label =
    delivery.priority.charAt(0).toUpperCase() + delivery.priority.slice(1);
  return {
    value,
    reason: `${label} priority — driver has ${freeSlots} of ${driver.maxConcurrentJobs} job slots free.`,
  };
}
```

- [ ] **Step 4: Run — expect PASS (19 tests)**

```powershell
pnpm --filter @logidash/api test -- factors.spec
```

- [ ] **Step 5: Commit**

```powershell
git add apps/api/src/modules/recommendations/engine
git commit -m "feat(recommendations): six scoring factors with graceful ORS degradation"
```

---

### Task 6: Score combiner + deterministic ranking

**Files:**

- Create: `apps/api/src/modules/recommendations/engine/score.ts`
- Test: `apps/api/src/modules/recommendations/engine/score.spec.ts`

- [ ] **Step 1: Write the failing test `score.spec.ts`**

Reuse the `makeDriver`/`makeDelivery` factories from `factors.spec.ts` (copy in).

```ts
import {
  DeliveryStatus,
  DriverAvailability,
  PackageSize,
  Priority,
  VehicleStatus,
  VehicleType,
} from '../../../generated/prisma/enums';
import { rankCandidates, scoreCandidate } from './score';
import type { DeliveryContext, DriverContext } from './types';
import { DEFAULT_WEIGHTS } from './weights';

function makeDriver(overrides: Partial<DriverContext> = {}): DriverContext {
  return {
    driverId: 'drv1',
    availability: DriverAvailability.available,
    activeJobCount: 0,
    maxConcurrentJobs: 3,
    activeLoadKg: 0,
    baseZoneId: 'z1',
    baseZoneCode: 'DOWNTOWN',
    baseZoneCenter: { lat: 40.712776, lng: -74.005974 },
    vehicle: {
      id: 'veh1',
      type: VehicleType.van,
      status: VehicleStatus.active,
      capacityWeightKg: 500,
    },
    ...overrides,
  };
}
function makeDelivery(
  overrides: Partial<DeliveryContext> = {},
): DeliveryContext {
  return {
    id: 'del1',
    zoneId: 'z1',
    zoneCode: 'DOWNTOWN',
    pickup: { lat: 40.7126, lng: -74.0089 },
    packageSize: PackageSize.medium,
    packageWeightKg: 20,
    priority: Priority.normal,
    deadlineAt: new Date('2026-06-10T18:00:00Z'),
    status: DeliveryStatus.ready,
  };
}
const NOW = new Date('2026-06-10T12:00:00Z');
const ROUTE = { distanceMeters: 3000, durationSeconds: 600 };

describe('scoreCandidate', () => {
  it('produces one contribution per factor, in declaration order', () => {
    const { explanation } = scoreCandidate(
      makeDriver(),
      makeDelivery(),
      ROUTE,
      NOW,
      DEFAULT_WEIGHTS,
    );
    expect(explanation.map((f) => f.factor)).toEqual([
      'zoneFit',
      'routeProximity',
      'remainingCapacity',
      'workloadBalance',
      'deadlineFit',
      'priorityFit',
    ]);
  });

  it('weighted = rawValue × weight × 100 (1 dp) and score = Σ weighted (2 dp)', () => {
    const { score, explanation } = scoreCandidate(
      makeDriver(),
      makeDelivery(),
      ROUTE,
      NOW,
      DEFAULT_WEIGHTS,
    );
    for (const f of explanation) {
      expect(f.weighted).toBeCloseTo(
        Math.round(f.rawValue * f.weight * 100 * 10) / 10,
        10,
      );
    }
    const sum = explanation.reduce((s, f) => s + f.weighted, 0);
    expect(score).toBeCloseTo(Math.round(sum * 100) / 100, 10);
    expect(score).toBeGreaterThan(0);
    expect(score).toBeLessThanOrEqual(100);
  });

  it('is deterministic: identical inputs → deep-equal output', () => {
    const a = scoreCandidate(
      makeDriver(),
      makeDelivery(),
      ROUTE,
      NOW,
      DEFAULT_WEIGHTS,
    );
    const b = scoreCandidate(
      makeDriver(),
      makeDelivery(),
      ROUTE,
      NOW,
      DEFAULT_WEIGHTS,
    );
    expect(a).toEqual(b);
  });

  it('marks degraded contributions when the route is null', () => {
    const { explanation } = scoreCandidate(
      makeDriver(),
      makeDelivery(),
      null,
      NOW,
      DEFAULT_WEIGHTS,
    );
    const route = explanation.find((f) => f.factor === 'routeProximity');
    expect(route?.degraded).toBe(true);
  });
});

describe('rankCandidates', () => {
  it('ranks by score desc and breaks ties by driverId asc', () => {
    const ranked = rankCandidates([
      { driverId: 'b', score: 80, explanation: [] },
      { driverId: 'a', score: 80, explanation: [] },
      { driverId: 'c', score: 91.5, explanation: [] },
    ]);
    expect(ranked.map((r) => [r.driverId, r.rank])).toEqual([
      ['c', 1],
      ['a', 2],
      ['b', 3],
    ]);
  });

  it('does not mutate its input', () => {
    const input = [
      { driverId: 'b', score: 1, explanation: [] },
      { driverId: 'a', score: 2, explanation: [] },
    ];
    rankCandidates(input);
    expect(input.map((c) => c.driverId)).toEqual(['b', 'a']);
  });
});
```

- [ ] **Step 2: Run — expect FAIL**

```powershell
pnpm --filter @logidash/api test -- score.spec
```

- [ ] **Step 3: Write `score.ts`**

```ts
import type { RouteResult } from '../../maps/maps-provider.interface';
import {
  deadlineFit,
  priorityFit,
  remainingCapacity,
  routeProximity,
  workloadBalance,
  zoneFit,
} from './factors';
import type {
  DeliveryContext,
  DriverContext,
  FactorContribution,
  FactorName,
  FactorResult,
  ScoringWeights,
} from './types';

const round1 = (n: number): number => Math.round(n * 10) / 10;
const round2 = (n: number): number => Math.round(n * 100) / 100;

export type ScoredCandidate = {
  driverId: string;
  score: number;
  explanation: FactorContribution[];
};

/**
 * Spec §7 stage 2. weighted = rawValue × weight × 100 (1 dp) so the UI's
 * per-factor table sums exactly to the stored score (2 dp, fits Decimal(5,2)).
 */
export function scoreCandidate(
  driver: DriverContext,
  delivery: DeliveryContext,
  route: RouteResult | null,
  now: Date,
  weights: ScoringWeights,
): ScoredCandidate {
  const results: Record<FactorName, FactorResult> = {
    zoneFit: zoneFit(driver, delivery),
    routeProximity: routeProximity(driver, delivery, route),
    remainingCapacity: remainingCapacity(driver, delivery),
    workloadBalance: workloadBalance(driver),
    deadlineFit: deadlineFit(driver, delivery, route, now),
    priorityFit: priorityFit(driver, delivery),
  };
  const explanation = (Object.keys(results) as FactorName[]).map(
    (factor): FactorContribution => {
      const { value, reason, degraded } = results[factor];
      return {
        factor,
        weight: weights[factor],
        rawValue: value,
        weighted: round1(value * weights[factor] * 100),
        reason,
        ...(degraded ? { degraded } : {}),
      };
    },
  );
  const score = round2(explanation.reduce((sum, f) => sum + f.weighted, 0));
  return { driverId: driver.driverId, score, explanation };
}

/** Score desc, then driverId asc — a total order keeps runs deterministic. */
export function rankCandidates(
  candidates: ScoredCandidate[],
): (ScoredCandidate & { rank: number })[] {
  return [...candidates]
    .sort((a, b) => b.score - a.score || a.driverId.localeCompare(b.driverId))
    .map((candidate, index) => ({ ...candidate, rank: index + 1 }));
}
```

- [ ] **Step 4: Run — expect PASS (6 tests)**

```powershell
pnpm --filter @logidash/api test -- score.spec
```

- [ ] **Step 5: Commit**

```powershell
git add apps/api/src/modules/recommendations/engine
git commit -m "feat(recommendations): deterministic candidate scoring and ranking"
```

---

### Task 7: Context builders + active-load aggregation

**Files:**

- Create: `apps/api/src/modules/recommendations/engine/context.ts`
- Create: `apps/api/src/modules/recommendations/engine/active-load.ts`
- Test: `apps/api/src/modules/recommendations/engine/context.spec.ts`

These bridge Prisma rows → plain-number contexts (Decimal → `Number()` with
null guards) and are shared by **both** `RecommendationsService` and
`AssignmentsService` — one source of truth for "what the rules see".

- [ ] **Step 1: Write the failing test `context.spec.ts`**

```ts
import { Prisma } from '../../../generated/prisma/client';
import {
  DeliveryStatus,
  DriverAvailability,
  PackageSize,
  Priority,
  VehicleStatus,
  VehicleType,
} from '../../../generated/prisma/enums';
import { toDeliveryContext, toDriverContext } from './context';

const decimal = (v: string | number): Prisma.Decimal => new Prisma.Decimal(v);

const zoneRow = {
  id: 'z1',
  name: 'Downtown',
  code: 'DOWNTOWN',
  centerLat: decimal('40.712776'),
  centerLng: decimal('-74.005974'),
  bounds: null,
  createdAt: new Date(),
  updatedAt: new Date(),
};

const driverRow = {
  id: 'drv1',
  userId: 'u1',
  availability: DriverAvailability.available,
  baseZoneId: 'z1',
  activeJobCount: 1,
  maxConcurrentJobs: 3,
  createdAt: new Date(),
  updatedAt: new Date(),
  baseZone: zoneRow,
  vehicle: {
    id: 'veh1',
    driverId: 'drv1',
    type: VehicleType.van,
    capacityWeight: decimal('500.00'),
    capacityVolume: decimal('12.00'),
    status: VehicleStatus.active,
    createdAt: new Date(),
    updatedAt: new Date(),
  },
};

const deliveryRow = {
  id: 'del1',
  reference: 'DEL-1',
  pickupAddress: '1 A St',
  pickupLat: decimal('40.7126'),
  pickupLng: decimal('-74.0089'),
  dropoffAddress: '2 B St',
  dropoffLat: null,
  dropoffLng: null,
  zoneId: 'z1',
  packageSize: PackageSize.medium,
  packageWeight: decimal('18.50'),
  packageType: 'retail',
  priority: Priority.normal,
  deadlineAt: new Date('2026-06-10T18:00:00Z'),
  status: DeliveryStatus.ready,
  cancellationReason: null,
  createdAt: new Date(),
  updatedAt: new Date(),
  zone: zoneRow,
};

describe('toDriverContext', () => {
  it('converts Decimals to numbers and carries the active load through', () => {
    const ctx = toDriverContext(driverRow, 42.5);
    expect(ctx).toEqual({
      driverId: 'drv1',
      availability: DriverAvailability.available,
      activeJobCount: 1,
      maxConcurrentJobs: 3,
      activeLoadKg: 42.5,
      baseZoneId: 'z1',
      baseZoneCode: 'DOWNTOWN',
      baseZoneCenter: { lat: 40.712776, lng: -74.005974 },
      vehicle: {
        id: 'veh1',
        type: VehicleType.van,
        status: VehicleStatus.active,
        capacityWeightKg: 500,
      },
    });
  });

  it('maps a missing vehicle and a center-less zone to null (not 0,0)', () => {
    const ctx = toDriverContext(
      {
        ...driverRow,
        vehicle: null,
        baseZone: { ...zoneRow, centerLat: null, centerLng: null },
      },
      0,
    );
    expect(ctx.vehicle).toBeNull();
    expect(ctx.baseZoneCenter).toBeNull();
  });
});

describe('toDeliveryContext', () => {
  it('converts pickup Decimals and packageWeight to numbers', () => {
    const ctx = toDeliveryContext(deliveryRow);
    expect(ctx.pickup).toEqual({ lat: 40.7126, lng: -74.0089 });
    expect(ctx.packageWeightKg).toBe(18.5);
    expect(ctx.zoneCode).toBe('DOWNTOWN');
    expect(ctx.status).toBe(DeliveryStatus.ready);
  });

  it('maps ungeocoded pickup coordinates to null', () => {
    const ctx = toDeliveryContext({
      ...deliveryRow,
      pickupLat: null,
      pickupLng: null,
    });
    expect(ctx.pickup).toBeNull();
  });
});
```

- [ ] **Step 2: Run — expect FAIL**

```powershell
pnpm --filter @logidash/api test -- context.spec
```

- [ ] **Step 3: Write `context.ts`**

```ts
import type { DeliveryModel } from '../../../generated/prisma/models/Delivery';
import type { DriverProfileModel } from '../../../generated/prisma/models/DriverProfile';
import type { VehicleModel } from '../../../generated/prisma/models/Vehicle';
import type { ZoneModel } from '../../../generated/prisma/models/Zone';
import type { DeliveryContext, DriverContext } from './types';

/** Row shapes the builders need (Prisma include results are supersets). */
export type DriverRowForContext = DriverProfileModel & {
  vehicle: VehicleModel | null;
  baseZone: ZoneModel;
};
export type DeliveryRowForContext = DeliveryModel & { zone: ZoneModel };

export function toDriverContext(
  row: DriverRowForContext,
  activeLoadKg: number,
): DriverContext {
  return {
    driverId: row.id,
    availability: row.availability,
    activeJobCount: row.activeJobCount,
    maxConcurrentJobs: row.maxConcurrentJobs,
    activeLoadKg,
    baseZoneId: row.baseZoneId,
    baseZoneCode: row.baseZone.code,
    baseZoneCenter:
      row.baseZone.centerLat !== null && row.baseZone.centerLng !== null
        ? {
            lat: Number(row.baseZone.centerLat),
            lng: Number(row.baseZone.centerLng),
          }
        : null,
    vehicle: row.vehicle
      ? {
          id: row.vehicle.id,
          type: row.vehicle.type,
          status: row.vehicle.status,
          capacityWeightKg: Number(row.vehicle.capacityWeight),
        }
      : null,
  };
}

export function toDeliveryContext(row: DeliveryRowForContext): DeliveryContext {
  return {
    id: row.id,
    zoneId: row.zoneId,
    zoneCode: row.zone.code,
    pickup:
      row.pickupLat !== null && row.pickupLng !== null
        ? { lat: Number(row.pickupLat), lng: Number(row.pickupLng) }
        : null,
    packageSize: row.packageSize,
    packageWeightKg: Number(row.packageWeight),
    priority: row.priority,
    deadlineAt: row.deadlineAt,
    status: row.status,
  };
}
```

- [ ] **Step 4: Write `active-load.ts`** (covered by the service specs + e2e —
      no dedicated spec file; it is one query + one fold)

```ts
import { Prisma } from '../../../generated/prisma/client';
import { AssignmentStatus } from '../../../generated/prisma/enums';

/**
 * Σ packageWeight (kg) of each driver's active assignments — the "current
 * load" input to the capacity rules. Accepts a transaction client or the
 * PrismaService (same pattern as AuditService.record).
 */
export async function activeLoadsByDriver(
  client: Prisma.TransactionClient,
  driverIds: string[],
): Promise<Map<string, number>> {
  if (driverIds.length === 0) {
    return new Map();
  }
  const rows = await client.assignment.findMany({
    where: { driverId: { in: driverIds }, status: AssignmentStatus.active },
    select: {
      driverId: true,
      delivery: { select: { packageWeight: true } },
    },
  });
  const loads = new Map<string, number>();
  for (const row of rows) {
    loads.set(
      row.driverId,
      (loads.get(row.driverId) ?? 0) + Number(row.delivery.packageWeight),
    );
  }
  return loads;
}
```

- [ ] **Step 5: Run — expect PASS (4 tests) and a clean build**

```powershell
pnpm --filter @logidash/api test -- context.spec
pnpm --filter @logidash/api build
```

- [ ] **Step 6: Commit**

```powershell
git add apps/api/src/modules/recommendations/engine
git commit -m "feat(recommendations): row-to-context builders and active-load aggregation"
```

---

### Task 8: DTOs + RecommendationsService (compute, persist, read-latest)

**Files:**

- Create: `apps/api/src/modules/recommendations/dto/recommendation.dto.ts`
- Create: `apps/api/src/modules/recommendations/dto/recommendation-query.dto.ts`
- Create: `apps/api/src/modules/recommendations/recommendations.service.ts`
- Test: `apps/api/src/modules/recommendations/recommendations.service.spec.ts`

- [ ] **Step 1: Write `dto/recommendation.dto.ts`**

```ts
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  DriverAvailability,
  VehicleStatus,
  VehicleType,
} from '../../../generated/prisma/enums';

export class FactorContributionDto {
  @ApiProperty({
    enum: [
      'zoneFit',
      'routeProximity',
      'remainingCapacity',
      'workloadBalance',
      'deadlineFit',
      'priorityFit',
    ],
  })
  factor!: string;

  @ApiProperty() weight!: number;
  @ApiProperty({ description: 'Normalized 0–1 factor value' })
  rawValue!: number;
  @ApiProperty({ description: 'rawValue × weight × 100 (1 dp)' })
  weighted!: number;
  @ApiProperty() reason!: string;
  @ApiPropertyOptional({
    description: 'True when route data was estimated/unavailable',
  })
  degraded?: boolean;
}

export class CandidateVehicleDto {
  @ApiProperty() id!: string;
  @ApiProperty({ enum: VehicleType }) type!: VehicleType;
  @ApiProperty({ enum: VehicleStatus }) status!: VehicleStatus;
  @ApiProperty() capacityWeight!: number;
}

export class CandidateDriverDto {
  @ApiProperty() id!: string;
  @ApiProperty() name!: string;
  @ApiProperty({ enum: DriverAvailability })
  availability!: DriverAvailability;
  @ApiProperty() baseZoneId!: string;
  @ApiProperty() activeJobCount!: number;
  @ApiProperty() maxConcurrentJobs!: number;
  @ApiPropertyOptional({ type: CandidateVehicleDto, nullable: true })
  vehicle!: CandidateVehicleDto | null;
}

export class RecommendationCandidateDto {
  @ApiProperty() id!: string;
  @ApiProperty() driverId!: string;
  @ApiProperty({ type: CandidateDriverDto }) driver!: CandidateDriverDto;
  @ApiProperty() eligible!: boolean;
  @ApiProperty({ description: '0–100 weighted score (0 when ineligible)' })
  score!: number;
  @ApiPropertyOptional({ type: Number, nullable: true }) rank!: number | null;
  @ApiProperty({ type: [FactorContributionDto] })
  explanation!: FactorContributionDto[];
  @ApiPropertyOptional({ type: [String], nullable: true })
  ineligibleReasons!: string[] | null;
}

export class ScoringWeightsDto {
  @ApiProperty() zoneFit!: number;
  @ApiProperty() routeProximity!: number;
  @ApiProperty() remainingCapacity!: number;
  @ApiProperty() workloadBalance!: number;
  @ApiProperty() deadlineFit!: number;
  @ApiProperty() priorityFit!: number;
}

export class RecommendationRunDto {
  @ApiProperty() id!: string;
  @ApiProperty() deliveryId!: string;
  @ApiProperty() requestedByUserId!: string;
  @ApiProperty({ type: ScoringWeightsDto }) weights!: ScoringWeightsDto;
  @ApiProperty({
    type: [RecommendationCandidateDto],
    description: 'Eligible first (by rank asc), then ineligible',
  })
  candidates!: RecommendationCandidateDto[];
  @ApiProperty() createdAt!: Date;
}
```

- [ ] **Step 2: Write `dto/recommendation-query.dto.ts`**

```ts
import { ApiPropertyOptional } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import { IsBoolean, IsOptional } from 'class-validator';

export class RecommendationQueryDto {
  @ApiPropertyOptional({
    description:
      'Force a fresh run (admin/dispatcher only; delivery must be ready)',
    default: false,
  })
  @IsOptional()
  @Transform(
    ({ value }: { value: unknown }) => value === 'true' || value === true,
  )
  @IsBoolean()
  refresh: boolean = false;
}
```

(The typed `{ value }: { value: unknown }` destructure keeps the strict
`no-unsafe-*` rules quiet — `value` is `any` by default.)

- [ ] **Step 3: Write the failing test `recommendations.service.spec.ts`**

```ts
import {
  ConflictException,
  ForbiddenException,
  NotFoundException,
} from '@nestjs/common';
import { AuthUser } from '../../common/types/auth-user';
import { Prisma } from '../../generated/prisma/client';
import {
  DeliveryStatus,
  DriverAvailability,
  PackageSize,
  Priority,
  Role,
  UserStatus,
  VehicleStatus,
  VehicleType,
} from '../../generated/prisma/enums';
import { DEFAULT_WEIGHTS } from './engine/weights';
import { RecommendationsService } from './recommendations.service';

const decimal = (v: string | number): Prisma.Decimal => new Prisma.Decimal(v);

function makePrismaMock() {
  const prisma = {
    delivery: { findUnique: jest.fn() },
    driverProfile: { findMany: jest.fn() },
    assignment: { findMany: jest.fn() },
    recommendationRun: { findFirst: jest.fn(), create: jest.fn() },
    $transaction: jest.fn(),
  };
  prisma.$transaction.mockImplementation((arg: unknown) =>
    Array.isArray(arg)
      ? Promise.all(arg as Promise<unknown>[])
      : (arg as (c: unknown) => unknown)(prisma),
  );
  return prisma;
}

function makeMapsMock() {
  return {
    geocode: jest.fn(),
    getRouteEstimate: jest
      .fn()
      .mockResolvedValue({ distanceMeters: 3000, durationSeconds: 600 }),
  };
}

const zone = {
  id: 'z1',
  name: 'Downtown',
  code: 'DOWNTOWN',
  centerLat: decimal('40.712776'),
  centerLng: decimal('-74.005974'),
  bounds: null,
  createdAt: new Date(),
  updatedAt: new Date(),
};

const readyDelivery = {
  id: 'del1',
  reference: 'DEL-1',
  pickupAddress: '1 A St',
  pickupLat: decimal('40.7126'),
  pickupLng: decimal('-74.0089'),
  dropoffAddress: '2 B St',
  dropoffLat: null,
  dropoffLng: null,
  zoneId: 'z1',
  packageSize: PackageSize.medium,
  packageWeight: decimal('18.50'),
  packageType: 'retail',
  priority: Priority.high,
  deadlineAt: new Date(Date.now() + 6 * 3_600_000),
  status: DeliveryStatus.ready,
  cancellationReason: null,
  createdAt: new Date(),
  updatedAt: new Date(),
  zone,
};

const eligibleDriver = {
  id: 'drvA',
  userId: 'uA',
  availability: DriverAvailability.available,
  baseZoneId: 'z1',
  activeJobCount: 0,
  maxConcurrentJobs: 3,
  createdAt: new Date(),
  updatedAt: new Date(),
  baseZone: zone,
  user: { name: 'Alex' },
  vehicle: {
    id: 'vehA',
    driverId: 'drvA',
    type: VehicleType.van,
    capacityWeight: decimal('500.00'),
    capacityVolume: decimal('12.00'),
    status: VehicleStatus.active,
    createdAt: new Date(),
    updatedAt: new Date(),
  },
};

const busyDriver = {
  ...eligibleDriver,
  id: 'drvB',
  userId: 'uB',
  user: { name: 'Bo' },
  availability: DriverAvailability.busy,
  vehicle: { ...eligibleDriver.vehicle, id: 'vehB', driverId: 'drvB' },
};

const dispatcher: AuthUser = {
  id: 'disp1',
  email: 'dispatcher@logidash.dev',
  role: Role.dispatcher,
  status: UserStatus.active,
};
const viewer: AuthUser = { ...dispatcher, id: 'view1', role: Role.viewer };

// Echo back a row shaped like the include the service requests.
function stubCreateEcho(prisma: ReturnType<typeof makePrismaMock>) {
  prisma.recommendationRun.create.mockImplementation(
    (args: {
      data: {
        deliveryId: string;
        requestedByUserId: string;
        inputSnapshot: unknown;
        candidates: { create: Record<string, unknown>[] };
      };
    }) =>
      Promise.resolve({
        id: 'run1',
        deliveryId: args.data.deliveryId,
        requestedByUserId: args.data.requestedByUserId,
        inputSnapshot: args.data.inputSnapshot,
        createdAt: new Date(),
        candidates: args.data.candidates.create.map((c, i) => ({
          id: `cand${i}`,
          runId: 'run1',
          ...c,
          driver: c.driverId === 'drvA' ? eligibleDriver : busyDriver,
        })),
      }),
  );
}

describe('RecommendationsService', () => {
  let prisma: ReturnType<typeof makePrismaMock>;
  let maps: ReturnType<typeof makeMapsMock>;
  let audit: { record: jest.Mock };
  let service: RecommendationsService;

  beforeEach(() => {
    prisma = makePrismaMock();
    maps = makeMapsMock();
    audit = { record: jest.fn() };
    service = new RecommendationsService(
      prisma as never,
      audit as never,
      maps as never,
      DEFAULT_WEIGHTS,
    );
    prisma.driverProfile.findMany.mockResolvedValue([
      eligibleDriver,
      busyDriver,
    ]);
    prisma.assignment.findMany.mockResolvedValue([]);
    stubCreateEcho(prisma);
  });

  it('404s for an unknown delivery', async () => {
    prisma.delivery.findUnique.mockResolvedValue(null);
    await expect(
      service.getForDelivery('nope', { refresh: false }, dispatcher),
    ).rejects.toBeInstanceOf(NotFoundException);
  });

  it('returns the latest run without computing when one exists', async () => {
    prisma.delivery.findUnique.mockResolvedValue(readyDelivery);
    prisma.recommendationRun.findFirst.mockResolvedValue({
      id: 'old1',
      deliveryId: 'del1',
      requestedByUserId: 'disp1',
      inputSnapshot: { weights: DEFAULT_WEIGHTS },
      createdAt: new Date(),
      candidates: [],
    });
    const dto = await service.getForDelivery(
      'del1',
      { refresh: false },
      viewer,
    );
    expect(dto.id).toBe('old1');
    expect(dto.weights).toEqual(DEFAULT_WEIGHTS);
    expect(prisma.recommendationRun.create).not.toHaveBeenCalled();
  });

  it('404s for a viewer when no run exists (read-only roles never compute)', async () => {
    prisma.delivery.findUnique.mockResolvedValue(readyDelivery);
    prisma.recommendationRun.findFirst.mockResolvedValue(null);
    await expect(
      service.getForDelivery('del1', { refresh: false }, viewer),
    ).rejects.toBeInstanceOf(NotFoundException);
  });

  it('403s a viewer asking for refresh', async () => {
    prisma.delivery.findUnique.mockResolvedValue(readyDelivery);
    await expect(
      service.getForDelivery('del1', { refresh: true }, viewer),
    ).rejects.toBeInstanceOf(ForbiddenException);
  });

  it('409s a refresh on a non-ready delivery', async () => {
    prisma.delivery.findUnique.mockResolvedValue({
      ...readyDelivery,
      status: DeliveryStatus.assigned,
    });
    await expect(
      service.getForDelivery('del1', { refresh: true }, dispatcher),
    ).rejects.toBeInstanceOf(ConflictException);
  });

  it('computes lazily for a dispatcher when no run exists: ranks eligible, keeps ineligible with reasons', async () => {
    prisma.delivery.findUnique.mockResolvedValue(readyDelivery);
    prisma.recommendationRun.findFirst.mockResolvedValue(null);

    const dto = await service.getForDelivery(
      'del1',
      { refresh: false },
      dispatcher,
    );

    expect(prisma.recommendationRun.create).toHaveBeenCalledTimes(1);
    const createArgs = prisma.recommendationRun.create.mock.calls as Array<
      [
        {
          data: {
            inputSnapshot: { weights: unknown };
            candidates: { create: Array<Record<string, unknown>> };
          };
        },
      ]
    >;
    const created = createArgs[0][0].data.candidates.create;

    const drvA = created.find((c) => c.driverId === 'drvA');
    const drvB = created.find((c) => c.driverId === 'drvB');
    expect(drvA).toMatchObject({ eligible: true, rank: 1 });
    expect(typeof drvA?.score).toBe('number');
    expect(drvB).toMatchObject({ eligible: false, rank: null, score: 0 });
    expect(drvB?.ineligibleReasons).toEqual([
      'Availability is busy (must be available).',
    ]);
    expect(createArgs[0][0].data.inputSnapshot.weights).toEqual(
      DEFAULT_WEIGHTS,
    );

    // audit row in the same transaction
    expect(audit.record).toHaveBeenCalledWith(
      expect.objectContaining({
        action: 'recommendation.run_created',
        entityType: 'Delivery',
        entityId: 'del1',
      }),
      prisma,
    );

    // DTO maps eligible first with driver summary attached
    expect(dto.candidates[0].driver.name).toBe('Alex');
    expect(dto.candidates[0].eligible).toBe(true);
  });

  it('flags degraded factors when the maps service returns null', async () => {
    maps.getRouteEstimate.mockResolvedValue(null);
    prisma.delivery.findUnique.mockResolvedValue(readyDelivery);
    prisma.recommendationRun.findFirst.mockResolvedValue(null);

    await service.getForDelivery('del1', { refresh: false }, dispatcher);

    const createArgs = prisma.recommendationRun.create.mock.calls as Array<
      [
        {
          data: {
            candidates: {
              create: Array<{
                driverId: string;
                explanation: Array<{ factor: string; degraded?: boolean }>;
              }>;
            };
          };
        },
      ]
    >;
    const drvA = createArgs[0][0].data.candidates.create.find(
      (c) => c.driverId === 'drvA',
    );
    const route = drvA?.explanation.find((f) => f.factor === 'routeProximity');
    expect(route?.degraded).toBe(true);
  });

  it('forces a fresh run on refresh even when an older run exists', async () => {
    prisma.delivery.findUnique.mockResolvedValue(readyDelivery);
    prisma.recommendationRun.findFirst.mockResolvedValue({ id: 'old1' });
    await service.getForDelivery('del1', { refresh: true }, dispatcher);
    expect(prisma.recommendationRun.create).toHaveBeenCalledTimes(1);
  });
});
```

(Check `common/types/auth-user.ts` for the exact `AuthUser` fields before
writing the fixtures — if it has no `status` field, drop it from the fixture.)

- [ ] **Step 4: Run — expect FAIL**

```powershell
pnpm --filter @logidash/api test -- recommendations.service.spec
```

- [ ] **Step 5: Write `recommendations.service.ts`**

```ts
import {
  ConflictException,
  ForbiddenException,
  Inject,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { AuthUser } from '../../common/types/auth-user';
import { Prisma } from '../../generated/prisma/client';
import { DeliveryStatus, Role } from '../../generated/prisma/enums';
import { PrismaService } from '../../prisma/prisma.service';
import { AuditService } from '../audit/audit.service';
import { MapsService } from '../maps/maps.service';
import { activeLoadsByDriver } from './engine/active-load';
import {
  toDeliveryContext,
  toDriverContext,
  type DeliveryRowForContext,
} from './engine/context';
import { checkEligibility } from './engine/eligibility';
import { rankCandidates, scoreCandidate } from './engine/score';
import type {
  DriverContext,
  FactorContribution,
  ScoringWeights,
} from './engine/types';
import { RECOMMENDATION_WEIGHTS, SCORING_CONSTANTS } from './engine/weights';
import { RecommendationQueryDto } from './dto/recommendation-query.dto';
import {
  RecommendationCandidateDto,
  RecommendationRunDto,
} from './dto/recommendation.dto';

/** Everything a run row needs for the DTO (candidates + driver summaries). */
const runInclude = {
  candidates: {
    include: {
      driver: {
        include: { user: { select: { name: true } }, vehicle: true },
      },
    },
    orderBy: [{ rank: { sort: 'asc', nulls: 'last' } }, { driverId: 'asc' }],
  },
} satisfies Prisma.RecommendationRunInclude;

type RunRow = Prisma.RecommendationRunGetPayload<{
  include: typeof runInclude;
}>;

/** Recorded per run so every score is reproducible from the snapshot. */
type RunInputSnapshot = {
  now: string;
  weights: ScoringWeights;
  constants: typeof SCORING_CONSTANTS;
  delivery: {
    id: string;
    status: string;
    zoneId: string;
    priority: string;
    packageSize: string;
    packageWeightKg: number;
    deadlineAt: string;
    pickup: { lat: number; lng: number } | null;
  };
  driverIds: string[];
};

type Evaluated =
  | {
      eligible: true;
      ctx: DriverContext;
      score: number;
      rank: number;
      explanation: FactorContribution[];
    }
  | { eligible: false; ctx: DriverContext; reasons: string[] };

@Injectable()
export class RecommendationsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly maps: MapsService,
    @Inject(RECOMMENDATION_WEIGHTS) private readonly weights: ScoringWeights,
  ) {}

  /**
   * Spec §7 + Phase 6 clarifications: return the latest persisted run; compute
   * lazily when none exists (admin/dispatcher + delivery ready); ?refresh=true
   * forces a new run (403 otherwise, 409 when not ready); 404 when no run
   * exists and none can be computed.
   */
  async getForDelivery(
    deliveryId: string,
    query: RecommendationQueryDto,
    user: AuthUser,
  ): Promise<RecommendationRunDto> {
    const delivery = await this.prisma.delivery.findUnique({
      where: { id: deliveryId },
      include: { zone: true },
    });
    if (!delivery) {
      throw new NotFoundException('Delivery not found');
    }

    const canCompute =
      user.role === Role.admin || user.role === Role.dispatcher;

    if (query.refresh) {
      if (!canCompute) {
        throw new ForbiddenException(
          'Only admin or dispatcher may run recommendations',
        );
      }
      if (delivery.status !== DeliveryStatus.ready) {
        throw new ConflictException(
          'Recommendations can only be computed for a ready delivery',
        );
      }
      return this.toRunDto(await this.compute(delivery, user));
    }

    const latest = await this.prisma.recommendationRun.findFirst({
      where: { deliveryId },
      orderBy: { createdAt: 'desc' },
      include: runInclude,
    });
    if (latest) {
      return this.toRunDto(latest);
    }

    if (canCompute && delivery.status === DeliveryStatus.ready) {
      return this.toRunDto(await this.compute(delivery, user));
    }
    throw new NotFoundException(
      'No recommendation run exists for this delivery',
    );
  }

  /** Evaluate every driver, persist the run + candidates + audit atomically. */
  private async compute(
    delivery: DeliveryRowForContext,
    user: AuthUser,
  ): Promise<RunRow> {
    const drivers = await this.prisma.driverProfile.findMany({
      include: {
        user: { select: { name: true } },
        vehicle: true,
        baseZone: true,
      },
      orderBy: { createdAt: 'asc' },
    });
    const loads = await activeLoadsByDriver(
      this.prisma,
      drivers.map((d) => d.id),
    );
    const deliveryCtx = toDeliveryContext(delivery);
    const now = new Date();

    // Eligibility first (no I/O); route lookups only for eligible drivers.
    const contexts = drivers.map((row) =>
      toDriverContext(row, loads.get(row.id) ?? 0),
    );
    const scored = await Promise.all(
      contexts.map(async (ctx): Promise<Evaluated> => {
        const eligibility = checkEligibility(ctx, deliveryCtx);
        if (!eligibility.eligible) {
          return { eligible: false, ctx, reasons: eligibility.reasons };
        }
        const route =
          ctx.baseZoneCenter && deliveryCtx.pickup
            ? await this.maps.getRouteEstimate(
                ctx.baseZoneCenter,
                deliveryCtx.pickup,
              )
            : null;
        const result = scoreCandidate(
          ctx,
          deliveryCtx,
          route,
          now,
          this.weights,
        );
        // rank assigned after all drivers are scored
        return { eligible: true, ctx, rank: 0, ...result };
      }),
    );

    const eligible = scored.filter(
      (e): e is Extract<Evaluated, { eligible: true }> => e.eligible,
    );
    const ineligible = scored.filter(
      (e): e is Extract<Evaluated, { eligible: false }> => !e.eligible,
    );
    const ranked = rankCandidates(eligible);

    const snapshot: RunInputSnapshot = {
      now: now.toISOString(),
      weights: this.weights,
      constants: SCORING_CONSTANTS,
      delivery: {
        id: deliveryCtx.id,
        status: deliveryCtx.status,
        zoneId: deliveryCtx.zoneId,
        priority: deliveryCtx.priority,
        packageSize: deliveryCtx.packageSize,
        packageWeightKg: deliveryCtx.packageWeightKg,
        deadlineAt: deliveryCtx.deadlineAt.toISOString(),
        pickup: deliveryCtx.pickup,
      },
      driverIds: contexts.map((c) => c.driverId),
    };

    return this.prisma.$transaction(async (tx) => {
      const run = await tx.recommendationRun.create({
        data: {
          deliveryId: delivery.id,
          requestedByUserId: user.id,
          inputSnapshot: snapshot,
          candidates: {
            create: [
              ...ranked.map((r) => ({
                driverId: r.driverId,
                eligible: true,
                score: r.score,
                rank: r.rank,
                explanation: r.explanation,
              })),
              ...ineligible.map((e) => ({
                driverId: e.ctx.driverId,
                eligible: false,
                score: 0,
                rank: null,
                explanation: [] as FactorContribution[],
                ineligibleReasons: e.reasons,
              })),
            ],
          },
        },
        include: runInclude,
      });
      await this.audit.record(
        {
          actorUserId: user.id,
          action: 'recommendation.run_created',
          entityType: 'Delivery',
          entityId: delivery.id,
          after: {
            runId: run.id,
            eligible: ranked.length,
            total: contexts.length,
          },
        },
        tx,
      );
      return run;
    });
  }

  private toRunDto(run: RunRow): RecommendationRunDto {
    const snapshot = run.inputSnapshot as unknown as Partial<RunInputSnapshot>;
    return {
      id: run.id,
      deliveryId: run.deliveryId,
      requestedByUserId: run.requestedByUserId,
      weights: snapshot.weights ?? this.weights,
      createdAt: run.createdAt,
      candidates: run.candidates.map(
        (c): RecommendationCandidateDto => ({
          id: c.id,
          driverId: c.driverId,
          driver: {
            id: c.driver.id,
            name: c.driver.user.name,
            availability: c.driver.availability,
            baseZoneId: c.driver.baseZoneId,
            activeJobCount: c.driver.activeJobCount,
            maxConcurrentJobs: c.driver.maxConcurrentJobs,
            vehicle: c.driver.vehicle
              ? {
                  id: c.driver.vehicle.id,
                  type: c.driver.vehicle.type,
                  status: c.driver.vehicle.status,
                  capacityWeight: Number(c.driver.vehicle.capacityWeight),
                }
              : null,
          },
          eligible: c.eligible,
          score: Number(c.score),
          rank: c.rank,
          explanation:
            c.explanation as unknown as RecommendationCandidateDto['explanation'],
          ineligibleReasons: c.ineligibleReasons as string[] | null,
        }),
      ),
    };
  }
}
```

**Type notes for the executor (likely friction points):**

- `snapshot` / `explanation` / `ineligibleReasons` are type aliases built from
  JSON-safe primitives, so they should assign to Prisma's JSON inputs directly.
  If `tsc` rejects one (Prisma's `InputJsonValue` vs `Date`/optional quirks),
  cast that argument `as unknown as Prisma.InputJsonValue` — never loosen the
  source types.
- If `orderBy` inside `runInclude` breaks the `satisfies
Prisma.RecommendationRunInclude` check or `GetPayload` inference, drop the
  `satisfies` and type the constant as a plain `const` — `GetPayload<{ include:
typeof runInclude }>` only reads the `include`/`select` shape.
- `nulls: 'last'` requires the field to be nullable (rank is) — supported in
  Prisma 7 for Postgres.

- [ ] **Step 6: Run — expect PASS (8 tests)**

```powershell
pnpm --filter @logidash/api test -- recommendations.service.spec
```

- [ ] **Step 7: Commit**

```powershell
git add apps/api/src/modules/recommendations
git commit -m "feat(recommendations): service computes, persists, and serves scored runs"
```

---

### Task 9: Recommendations controller + module + AppModule wiring

**Files:**

- Create: `apps/api/src/modules/recommendations/recommendations.controller.ts`
- Create: `apps/api/src/modules/recommendations/recommendations.module.ts`
- Modify: `apps/api/src/app.module.ts`

- [ ] **Step 1: Write `recommendations.controller.ts`**

Read access is open to any authenticated role (no `@Roles` — Phase 4
precedent); the compute/refresh gating happens in the service (like the Phase 4
driver-ownership rule). Controller stays thin.

```ts
import { Controller, Get, Param, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiOkResponse, ApiTags } from '@nestjs/swagger';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import type { AuthUser } from '../../common/types/auth-user';
import { RecommendationQueryDto } from './dto/recommendation-query.dto';
import { RecommendationRunDto } from './dto/recommendation.dto';
import { RecommendationsService } from './recommendations.service';

@ApiTags('recommendations')
@ApiBearerAuth()
@Controller('deliveries/:deliveryId/recommendations')
export class RecommendationsController {
  constructor(private readonly recommendations: RecommendationsService) {}

  @Get()
  @ApiOkResponse({ type: RecommendationRunDto })
  getForDelivery(
    @Param('deliveryId') deliveryId: string,
    @Query() query: RecommendationQueryDto,
    @CurrentUser() user: AuthUser,
  ): Promise<RecommendationRunDto> {
    return this.recommendations.getForDelivery(deliveryId, query, user);
  }
}
```

- [ ] **Step 2: Write `recommendations.module.ts`**

```ts
import { Module } from '@nestjs/common';
import { AuditModule } from '../audit/audit.module';
import { MapsModule } from '../maps/maps.module';
import { DEFAULT_WEIGHTS, RECOMMENDATION_WEIGHTS } from './engine/weights';
import { RecommendationsController } from './recommendations.controller';
import { RecommendationsService } from './recommendations.service';

@Module({
  imports: [AuditModule, MapsModule],
  controllers: [RecommendationsController],
  providers: [
    { provide: RECOMMENDATION_WEIGHTS, useValue: DEFAULT_WEIGHTS },
    RecommendationsService,
  ],
})
export class RecommendationsModule {}
```

- [ ] **Step 3: Register in `app.module.ts`**

Add the import and place it alphabetically in the `imports` array (after
`MapsModule`, before `UsersModule`):

```ts
import { RecommendationsModule } from './modules/recommendations/recommendations.module';
// …
    MapsModule,
    RecommendationsModule,
    UsersModule,
```

- [ ] **Step 4: Build + full unit suite — expect green**

```powershell
pnpm --filter @logidash/api build
pnpm --filter @logidash/api test
pnpm --filter @logidash/api lint
```

- [ ] **Step 5: Commit**

```powershell
git add apps/api/src/modules/recommendations apps/api/src/app.module.ts
git commit -m "feat(recommendations): GET /v1/deliveries/:id/recommendations endpoint + module wiring"
```

---

### Task 10: AssignmentsService — transactional create + history reads

**Files:**

- Create: `apps/api/src/modules/assignments/dto/create-assignment.dto.ts`
- Create: `apps/api/src/modules/assignments/dto/assignment.dto.ts`
- Create: `apps/api/src/modules/assignments/assignments.service.ts`
- Test: `apps/api/src/modules/assignments/assignments.service.spec.ts`

- [ ] **Step 1: Write the DTOs**

`dto/create-assignment.dto.ts`:

```ts
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsNotEmpty, IsOptional, IsString, MaxLength } from 'class-validator';

export class CreateAssignmentDto {
  @ApiProperty({ description: 'DriverProfile id to assign' })
  @IsString()
  @IsNotEmpty()
  driverId!: string;

  @ApiPropertyOptional({ description: 'Recorded in the audit trail' })
  @IsOptional()
  @IsString()
  @MaxLength(500)
  reason?: string;
}
```

`dto/assignment.dto.ts`:

```ts
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { AssignmentStatus } from '../../../generated/prisma/enums';

export class AssignmentDto {
  @ApiProperty() id!: string;
  @ApiProperty() deliveryId!: string;
  @ApiProperty() driverId!: string;
  @ApiProperty() vehicleId!: string;
  @ApiProperty({ enum: AssignmentStatus }) status!: AssignmentStatus;
  @ApiProperty() assignedByUserId!: string;
  @ApiProperty() assignedAt!: Date;
  @ApiPropertyOptional({ type: Date, nullable: true })
  unassignedAt!: Date | null;
  @ApiPropertyOptional({ type: String, nullable: true }) unassignReason!:
    | string
    | null;
  @ApiProperty() createdAt!: Date;
  @ApiProperty() updatedAt!: Date;
}
```

- [ ] **Step 2: Write the failing test `assignments.service.spec.ts`**

```ts
import { ConflictException, NotFoundException } from '@nestjs/common';
import { AuthUser } from '../../common/types/auth-user';
import { Prisma } from '../../generated/prisma/client';
import {
  AssignmentStatus,
  DeliveryStatus,
  DriverAvailability,
  PackageSize,
  Priority,
  Role,
  UserStatus,
  VehicleStatus,
  VehicleType,
} from '../../generated/prisma/enums';
import { AssignmentsService } from './assignments.service';

const decimal = (v: string | number): Prisma.Decimal => new Prisma.Decimal(v);

function makePrismaMock() {
  const prisma = {
    delivery: { findUnique: jest.fn(), updateMany: jest.fn() },
    driverProfile: { findUnique: jest.fn(), update: jest.fn() },
    assignment: { findMany: jest.fn(), count: jest.fn(), create: jest.fn() },
    $transaction: jest.fn(),
  };
  prisma.$transaction.mockImplementation((arg: unknown) =>
    Array.isArray(arg)
      ? Promise.all(arg as Promise<unknown>[])
      : (arg as (c: unknown) => unknown)(prisma),
  );
  return prisma;
}

const zone = {
  id: 'z1',
  name: 'Downtown',
  code: 'DOWNTOWN',
  centerLat: decimal('40.712776'),
  centerLng: decimal('-74.005974'),
  bounds: null,
  createdAt: new Date(),
  updatedAt: new Date(),
};

const readyDelivery = {
  id: 'del1',
  reference: 'DEL-1',
  pickupAddress: '1 A St',
  pickupLat: decimal('40.7126'),
  pickupLng: decimal('-74.0089'),
  dropoffAddress: '2 B St',
  dropoffLat: null,
  dropoffLng: null,
  zoneId: 'z1',
  packageSize: PackageSize.medium,
  packageWeight: decimal('18.50'),
  packageType: 'retail',
  priority: Priority.normal,
  deadlineAt: new Date(Date.now() + 6 * 3_600_000),
  status: DeliveryStatus.ready,
  cancellationReason: null,
  createdAt: new Date(),
  updatedAt: new Date(),
  zone,
};

const driverRow = {
  id: 'drvA',
  userId: 'uA',
  availability: DriverAvailability.available,
  baseZoneId: 'z1',
  activeJobCount: 0,
  maxConcurrentJobs: 3,
  createdAt: new Date(),
  updatedAt: new Date(),
  baseZone: zone,
  vehicle: {
    id: 'vehA',
    driverId: 'drvA',
    type: VehicleType.van,
    capacityWeight: decimal('500.00'),
    capacityVolume: decimal('12.00'),
    status: VehicleStatus.active,
    createdAt: new Date(),
    updatedAt: new Date(),
  },
};

const createdAssignment = {
  id: 'asg1',
  deliveryId: 'del1',
  driverId: 'drvA',
  vehicleId: 'vehA',
  status: AssignmentStatus.active,
  assignedByUserId: 'disp1',
  assignedAt: new Date(),
  unassignedAt: null,
  unassignReason: null,
  createdAt: new Date(),
  updatedAt: new Date(),
};

const dispatcher: AuthUser = {
  id: 'disp1',
  email: 'dispatcher@logidash.dev',
  role: Role.dispatcher,
  status: UserStatus.active,
};

describe('AssignmentsService.create', () => {
  let prisma: ReturnType<typeof makePrismaMock>;
  let audit: { record: jest.Mock };
  let service: AssignmentsService;

  beforeEach(() => {
    prisma = makePrismaMock();
    audit = { record: jest.fn() };
    service = new AssignmentsService(prisma as never, audit as never);
    prisma.delivery.findUnique.mockResolvedValue(readyDelivery);
    prisma.driverProfile.findUnique.mockResolvedValue(driverRow);
    prisma.assignment.findMany.mockResolvedValue([]); // no active load
    prisma.delivery.updateMany.mockResolvedValue({ count: 1 });
    prisma.assignment.create.mockResolvedValue(createdAssignment);
  });

  it('404s for an unknown delivery', async () => {
    prisma.delivery.findUnique.mockResolvedValue(null);
    await expect(
      service.create('nope', { driverId: 'drvA' }, dispatcher),
    ).rejects.toBeInstanceOf(NotFoundException);
  });

  it('409s when the delivery is not ready', async () => {
    prisma.delivery.findUnique.mockResolvedValue({
      ...readyDelivery,
      status: DeliveryStatus.assigned,
    });
    await expect(
      service.create('del1', { driverId: 'drvA' }, dispatcher),
    ).rejects.toBeInstanceOf(ConflictException);
  });

  it('404s for an unknown driver', async () => {
    prisma.driverProfile.findUnique.mockResolvedValue(null);
    await expect(
      service.create('del1', { driverId: 'nope' }, dispatcher),
    ).rejects.toBeInstanceOf(NotFoundException);
  });

  it('409s an ineligible driver with the reasons in the message', async () => {
    prisma.driverProfile.findUnique.mockResolvedValue({
      ...driverRow,
      availability: DriverAvailability.busy,
    });
    await expect(
      service.create('del1', { driverId: 'drvA' }, dispatcher),
    ).rejects.toThrow(/not eligible.*Availability is busy/);
  });

  it('creates the assignment, flips status, bumps workload, audits twice — in one tx', async () => {
    const dto = await service.create(
      'del1',
      { driverId: 'drvA', reason: 'top pick' },
      dispatcher,
    );

    expect(prisma.$transaction).toHaveBeenCalledTimes(1);
    // status-guarded flip
    expect(prisma.delivery.updateMany).toHaveBeenCalledWith({
      where: { id: 'del1', status: DeliveryStatus.ready },
      data: { status: DeliveryStatus.assigned },
    });
    // assignment row binds the driver's linked vehicle
    const createCalls = prisma.assignment.create.mock.calls as Array<
      [{ data: Record<string, unknown> }]
    >;
    expect(createCalls[0][0].data).toMatchObject({
      deliveryId: 'del1',
      driverId: 'drvA',
      vehicleId: 'vehA',
      assignedByUserId: 'disp1',
      status: AssignmentStatus.active,
    });
    // workload increment
    expect(prisma.driverProfile.update).toHaveBeenCalledWith({
      where: { id: 'drvA' },
      data: { activeJobCount: { increment: 1 } },
    });
    // two audit rows, both inside the tx (the mock tx IS the prisma mock)
    expect(audit.record).toHaveBeenCalledTimes(2);
    const actions = (audit.record.mock.calls as Array<[{ action: string }]>)
      .map((c) => c[0].action)
      .sort();
    expect(actions).toEqual(['assignment.created', 'delivery.status_changed']);

    expect(dto.id).toBe('asg1');
    expect(dto.vehicleId).toBe('vehA');
  });

  it('409s when the guarded status flip loses a race (count 0)', async () => {
    prisma.delivery.updateMany.mockResolvedValue({ count: 0 });
    await expect(
      service.create('del1', { driverId: 'drvA' }, dispatcher),
    ).rejects.toBeInstanceOf(ConflictException);
  });
});

describe('AssignmentsService lists', () => {
  let prisma: ReturnType<typeof makePrismaMock>;
  let service: AssignmentsService;

  beforeEach(() => {
    prisma = makePrismaMock();
    service = new AssignmentsService(
      prisma as never,
      {
        record: jest.fn(),
      } as never,
    );
  });

  it('listByDelivery 404s for an unknown delivery', async () => {
    prisma.delivery.findUnique.mockResolvedValue(null);
    await expect(
      service.listByDelivery('nope', { page: 1, limit: 20 }),
    ).rejects.toBeInstanceOf(NotFoundException);
  });

  it('listByDelivery returns a paginated envelope, newest first', async () => {
    prisma.delivery.findUnique.mockResolvedValue(readyDelivery);
    prisma.assignment.findMany.mockResolvedValue([createdAssignment]);
    prisma.assignment.count.mockResolvedValue(1);
    const result = await service.listByDelivery('del1', { page: 1, limit: 20 });
    expect(result.meta).toEqual({
      page: 1,
      limit: 20,
      total: 1,
      totalPages: 1,
    });
    expect(result.data[0].id).toBe('asg1');
    const findCalls = prisma.assignment.findMany.mock.calls as Array<
      [{ orderBy: Record<string, string> }]
    >;
    expect(findCalls[0][0].orderBy).toEqual({ assignedAt: 'desc' });
  });

  it('listByDriver 404s for an unknown driver', async () => {
    prisma.driverProfile.findUnique.mockResolvedValue(null);
    await expect(
      service.listByDriver('nope', { page: 1, limit: 20 }),
    ).rejects.toBeInstanceOf(NotFoundException);
  });
});
```

- [ ] **Step 3: Run — expect FAIL**

```powershell
pnpm --filter @logidash/api test -- assignments.service.spec
```

- [ ] **Step 4: Write `assignments.service.ts`**

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
import { AuthUser } from '../../common/types/auth-user';
import { AssignmentStatus, DeliveryStatus } from '../../generated/prisma/enums';
import type { AssignmentModel } from '../../generated/prisma/models/Assignment';
import { PrismaService } from '../../prisma/prisma.service';
import { AuditService } from '../audit/audit.service';
import { activeLoadsByDriver } from '../recommendations/engine/active-load';
import {
  toDeliveryContext,
  toDriverContext,
} from '../recommendations/engine/context';
import { checkEligibility } from '../recommendations/engine/eligibility';
import { AssignmentDto } from './dto/assignment.dto';
import { CreateAssignmentDto } from './dto/create-assignment.dto';

function toAssignmentDto(a: AssignmentModel): AssignmentDto {
  return {
    id: a.id,
    deliveryId: a.deliveryId,
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

@Injectable()
export class AssignmentsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  /**
   * The deferred `ready → assigned` edge (spec §7/§8). Re-validates the same
   * eligibility rules the engine scored with, then — in one transaction —
   * status-guard-flips the delivery, creates the active Assignment with the
   * driver's linked vehicle, bumps the driver's workload, and writes both
   * audit rows. A concurrent assign of the same delivery loses the guarded
   * updateMany (count 0) and 409s instead of double-assigning.
   */
  async create(
    deliveryId: string,
    dto: CreateAssignmentDto,
    user: AuthUser,
  ): Promise<AssignmentDto> {
    const delivery = await this.prisma.delivery.findUnique({
      where: { id: deliveryId },
      include: { zone: true },
    });
    if (!delivery) {
      throw new NotFoundException('Delivery not found');
    }
    if (delivery.status !== DeliveryStatus.ready) {
      throw new ConflictException(
        `Only ready deliveries can be assigned (status is ${delivery.status})`,
      );
    }

    const driver = await this.prisma.driverProfile.findUnique({
      where: { id: dto.driverId },
      include: { vehicle: true, baseZone: true },
    });
    if (!driver) {
      throw new NotFoundException('Driver not found');
    }

    const loads = await activeLoadsByDriver(this.prisma, [driver.id]);
    const eligibility = checkEligibility(
      toDriverContext(driver, loads.get(driver.id) ?? 0),
      toDeliveryContext(delivery),
    );
    if (!eligibility.eligible) {
      throw new ConflictException(
        `Driver is not eligible for this delivery: ${eligibility.reasons.join(' ')}`,
      );
    }
    // checkEligibility guarantees a linked vehicle; re-narrow for the compiler.
    const vehicle = driver.vehicle;
    if (!vehicle) {
      throw new ConflictException('Driver has no linked vehicle');
    }

    const assignment = await this.prisma.$transaction(async (tx) => {
      const flipped = await tx.delivery.updateMany({
        where: { id: deliveryId, status: DeliveryStatus.ready },
        data: { status: DeliveryStatus.assigned },
      });
      if (flipped.count === 0) {
        throw new ConflictException('Delivery is no longer ready to assign');
      }

      const created = await tx.assignment.create({
        data: {
          deliveryId,
          driverId: driver.id,
          vehicleId: vehicle.id,
          assignedByUserId: user.id,
          status: AssignmentStatus.active,
        },
      });

      await tx.driverProfile.update({
        where: { id: driver.id },
        data: { activeJobCount: { increment: 1 } },
      });

      await this.audit.record(
        {
          actorUserId: user.id,
          action: 'assignment.created',
          entityType: 'Assignment',
          entityId: created.id,
          after: {
            deliveryId,
            driverId: driver.id,
            vehicleId: vehicle.id,
          },
          reason: dto.reason,
        },
        tx,
      );
      await this.audit.record(
        {
          actorUserId: user.id,
          action: 'delivery.status_changed',
          entityType: 'Delivery',
          entityId: deliveryId,
          before: { status: DeliveryStatus.ready },
          after: { status: DeliveryStatus.assigned },
          reason: dto.reason,
        },
        tx,
      );

      return created;
    });

    return toAssignmentDto(assignment);
  }

  async listByDelivery(
    deliveryId: string,
    query: PaginationQueryDto,
  ): Promise<Paginated<AssignmentDto>> {
    const delivery = await this.prisma.delivery.findUnique({
      where: { id: deliveryId },
    });
    if (!delivery) {
      throw new NotFoundException('Delivery not found');
    }
    return this.list({ deliveryId }, query);
  }

  async listByDriver(
    driverId: string,
    query: PaginationQueryDto,
  ): Promise<Paginated<AssignmentDto>> {
    const driver = await this.prisma.driverProfile.findUnique({
      where: { id: driverId },
    });
    if (!driver) {
      throw new NotFoundException('Driver not found');
    }
    return this.list({ driverId }, query);
  }

  private async list(
    where: { deliveryId: string } | { driverId: string },
    query: PaginationQueryDto,
  ): Promise<Paginated<AssignmentDto>> {
    const { skip, take } = toSkipTake(query.page, query.limit);
    const [rows, total] = await this.prisma.$transaction([
      this.prisma.assignment.findMany({
        where,
        skip,
        take,
        orderBy: { assignedAt: 'desc' },
      }),
      this.prisma.assignment.count({ where }),
    ]);
    return paginate(rows.map(toAssignmentDto), total, query.page, query.limit);
  }
}
```

- [ ] **Step 5: Run — expect PASS (9 tests)**

```powershell
pnpm --filter @logidash/api test -- assignments.service.spec
```

- [ ] **Step 6: Commit**

```powershell
git add apps/api/src/modules/assignments
git commit -m "feat(assignments): transactional assignment creation with eligibility re-check"
```

---

### Task 11: Assignments controller + module + AppModule wiring

**Files:**

- Create: `apps/api/src/modules/assignments/assignments.controller.ts`
- Create: `apps/api/src/modules/assignments/assignments.module.ts`
- Modify: `apps/api/src/app.module.ts`

- [ ] **Step 1: Write `assignments.controller.ts`**

One controller, no prefix — the three routes span two URL families
(delivery-scoped create/history + driver-scoped history). Global `/v1`
versioning still applies.

```ts
import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Post,
  Query,
} from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { ApiPaginatedResponse } from '../../common/decorators/api-paginated-response.decorator';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { Roles } from '../../common/decorators/roles.decorator';
import { PaginationQueryDto } from '../../common/dto/pagination-query.dto';
import type { Paginated } from '../../common/pagination/paginate';
import type { AuthUser } from '../../common/types/auth-user';
import { Role } from '../../generated/prisma/enums';
import { AssignmentDto } from './dto/assignment.dto';
import { CreateAssignmentDto } from './dto/create-assignment.dto';
import { AssignmentsService } from './assignments.service';

@ApiTags('assignments')
@ApiBearerAuth()
@Controller()
export class AssignmentsController {
  constructor(private readonly assignments: AssignmentsService) {}

  @Post('deliveries/:deliveryId/assignments')
  @HttpCode(HttpStatus.CREATED)
  @Roles(Role.admin, Role.dispatcher)
  create(
    @Param('deliveryId') deliveryId: string,
    @Body() dto: CreateAssignmentDto,
    @CurrentUser() user: AuthUser,
  ): Promise<AssignmentDto> {
    return this.assignments.create(deliveryId, dto, user);
  }

  @Get('deliveries/:deliveryId/assignments')
  @ApiPaginatedResponse(AssignmentDto)
  listByDelivery(
    @Param('deliveryId') deliveryId: string,
    @Query() query: PaginationQueryDto,
  ): Promise<Paginated<AssignmentDto>> {
    return this.assignments.listByDelivery(deliveryId, query);
  }

  @Get('drivers/:driverId/assignments')
  @ApiPaginatedResponse(AssignmentDto)
  listByDriver(
    @Param('driverId') driverId: string,
    @Query() query: PaginationQueryDto,
  ): Promise<Paginated<AssignmentDto>> {
    return this.assignments.listByDriver(driverId, query);
  }
}
```

(POST already defaults to 201; the explicit `@HttpCode` documents intent.
Reads carry no `@Roles` — same any-authenticated convention as every other
list/read in the API.)

- [ ] **Step 2: Write `assignments.module.ts`**

```ts
import { Module } from '@nestjs/common';
import { AuditModule } from '../audit/audit.module';
import { AssignmentsController } from './assignments.controller';
import { AssignmentsService } from './assignments.service';

@Module({
  imports: [AuditModule],
  controllers: [AssignmentsController],
  providers: [AssignmentsService],
})
export class AssignmentsModule {}
```

- [ ] **Step 3: Register in `app.module.ts`** (alphabetical: after
      `AuditModule`/`AuthModule`, before `DeliveriesModule`)

```ts
import { AssignmentsModule } from './modules/assignments/assignments.module';
// …
    AuthModule,
    AssignmentsModule,
    DeliveriesModule,
```

- [ ] **Step 4: Build, unit suite, lint — expect green**

```powershell
pnpm --filter @logidash/api build
pnpm --filter @logidash/api test
pnpm --filter @logidash/api lint
```

- [ ] **Step 5: Commit**

```powershell
git add apps/api/src/modules/assignments apps/api/src/app.module.ts
git commit -m "feat(assignments): assignment endpoints (create + history) + module wiring"
```

---

### Task 12: e2e — recommend → assign flow

**Files:**

- Create: `apps/api/test/recommendations-assignments.e2e-spec.ts`

**Prereq:** Docker Postgres on host port 5433 (`docker compose up -d`).
`test/setup-e2e.ts` already forces `MAPS_PROVIDER=mock` — no real network.

**Harness rules (from the existing suites):** the test builds its own Nest app,
so `beforeAll` must mirror `main.ts` config (ValidationPipe + URI versioning);
the `login` helper must NOT be `async`; data is PREFIX-namespaced; assertions
cast `res.body` to a type (never `expect.any`). The local dev DB may contain
**seed drivers**, so candidate assertions are subset-based (find our drivers by
id), never exact-count, and ranking is asserted _relatively_ (our same-zone
driver outranks our cross-zone driver).

- [ ] **Step 1: Write the spec**

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
  DeliveryStatus,
  DriverAvailability,
  PackageSize,
  Priority,
  Role,
  UserStatus,
  VehicleType,
} from './../src/generated/prisma/enums';
import { PrismaService } from './../src/prisma/prisma.service';

const PASSWORD = 'Demo123!';
const PREFIX = 'E2ERA-';
const EMAILS = {
  dispatcher: 'e2e.ra.dispatcher@logidash.test',
  viewer: 'e2e.ra.viewer@logidash.test',
  driverA: 'e2e.ra.driver.a@logidash.test',
  driverB: 'e2e.ra.driver.b@logidash.test',
  driverC: 'e2e.ra.driver.c@logidash.test',
};

type FactorRow = {
  factor: string;
  weight: number;
  rawValue: number;
  weighted: number;
  reason: string;
  degraded?: boolean;
};
type CandidateBody = {
  id: string;
  driverId: string;
  eligible: boolean;
  score: number;
  rank: number | null;
  explanation: FactorRow[];
  ineligibleReasons: string[] | null;
  driver: { id: string; name: string; vehicle: { id: string } | null };
};
type RunBody = {
  id: string;
  deliveryId: string;
  requestedByUserId: string;
  weights: Record<string, number>;
  candidates: CandidateBody[];
};
type ErrorBody = { statusCode: number; error: string; message: string };
type AssignmentBody = {
  id: string;
  deliveryId: string;
  driverId: string;
  vehicleId: string;
  status: string;
};
type PageBody<T> = { data: T[]; meta: { total: number } };

describe('Recommendations & Assignments (e2e)', () => {
  let app: INestApplication<App>;
  let prisma: PrismaService;
  const tokens: Record<string, string> = {};
  const userIds: Record<string, string> = {};
  let zoneAId = '';
  let zoneBId = '';
  let drvA = ''; // available van driver in zone A   → eligible, best
  let drvB = ''; // available car driver in zone B   → eligible, worse
  let drvC = ''; // busy bike driver in zone A       → ineligible ×3
  let vehA = '';
  let deliveryId = '';
  let firstRun: RunBody;

  const login = (email: string, password = PASSWORD) =>
    request(app.getHttpServer())
      .post('/v1/auth/login')
      .send({ email, password });
  const auth = (who: string) => ({ Authorization: `Bearer ${tokens[who]}` });
  const recsUrl = () => `/v1/deliveries/${deliveryId}/recommendations`;

  const cleanup = async () => {
    await prisma.auditLog.deleteMany({
      where: { actor: { email: { in: Object.values(EMAILS) } } },
    });
    // Deliveries cascade their runs, candidates, and assignments.
    await prisma.delivery.deleteMany({
      where: { reference: { startsWith: PREFIX } },
    });
    // Vehicles before profiles: deleting a profile nulls vehicle.driverId,
    // which would orphan the filter below.
    await prisma.vehicle.deleteMany({
      where: { driver: { user: { email: { in: Object.values(EMAILS) } } } },
    });
    await prisma.driverProfile.deleteMany({
      where: { user: { email: { in: Object.values(EMAILS) } } },
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
    const roleOf = (who: string): Role =>
      who === 'dispatcher'
        ? Role.dispatcher
        : who === 'viewer'
          ? Role.viewer
          : Role.driver;
    for (const [who, email] of Object.entries(EMAILS)) {
      const u = await prisma.user.create({
        data: {
          email,
          name: who,
          role: roleOf(who),
          status: UserStatus.active,
          passwordHash,
        },
      });
      userIds[who] = u.id;
    }

    // Two zones with centers ~7 km apart (well inside the 15 km limits).
    const zoneA = await prisma.zone.create({
      data: {
        name: 'RA Zone A',
        code: `${PREFIX}A`,
        centerLat: 13.7563,
        centerLng: 100.5018,
      },
    });
    const zoneB = await prisma.zone.create({
      data: {
        name: 'RA Zone B',
        code: `${PREFIX}B`,
        centerLat: 13.8,
        centerLng: 100.55,
      },
    });
    zoneAId = zoneA.id;
    zoneBId = zoneB.id;

    const profA = await prisma.driverProfile.create({
      data: {
        userId: userIds.driverA,
        baseZoneId: zoneAId,
        availability: DriverAvailability.available,
        maxConcurrentJobs: 3,
      },
    });
    const profB = await prisma.driverProfile.create({
      data: {
        userId: userIds.driverB,
        baseZoneId: zoneBId,
        availability: DriverAvailability.available,
        maxConcurrentJobs: 3,
      },
    });
    const profC = await prisma.driverProfile.create({
      data: {
        userId: userIds.driverC,
        baseZoneId: zoneAId,
        availability: DriverAvailability.busy,
        maxConcurrentJobs: 2,
      },
    });
    drvA = profA.id;
    drvB = profB.id;
    drvC = profC.id;

    const vanA = await prisma.vehicle.create({
      data: {
        driverId: drvA,
        type: VehicleType.van,
        capacityWeight: 500,
        capacityVolume: 12,
      },
    });
    vehA = vanA.id;
    await prisma.vehicle.create({
      data: {
        driverId: drvB,
        type: VehicleType.car,
        capacityWeight: 150,
        capacityVolume: 4,
      },
    });
    await prisma.vehicle.create({
      data: {
        driverId: drvC,
        type: VehicleType.bike,
        capacityWeight: 15,
        capacityVolume: 0.5,
      },
    });

    // A ready, geocoded delivery in zone A: medium 18.5 kg, high priority.
    const delivery = await prisma.delivery.create({
      data: {
        reference: `${PREFIX}DEL-1`,
        pickupAddress: 'RA Pickup',
        pickupLat: 13.757,
        pickupLng: 100.503,
        dropoffAddress: 'RA Dropoff',
        dropoffLat: 13.76,
        dropoffLng: 100.51,
        zoneId: zoneAId,
        packageSize: PackageSize.medium,
        packageWeight: 18.5,
        packageType: 'retail',
        priority: Priority.high,
        deadlineAt: new Date(Date.now() + 6 * 3_600_000),
        status: DeliveryStatus.ready,
      },
    });
    deliveryId = delivery.id;

    for (const who of ['dispatcher', 'viewer', 'driverA'] as const) {
      const res = await login(EMAILS[who]).expect(200);
      tokens[who] = (res.body as { accessToken: string }).accessToken;
    }
  });

  afterAll(async () => {
    await cleanup();
    await app.close();
  });

  const findCandidate = (run: RunBody, driverId: string): CandidateBody => {
    const found = run.candidates.find((c) => c.driverId === driverId);
    if (!found) {
      throw new Error(`candidate ${driverId} missing from run ${run.id}`);
    }
    return found;
  };

  describe('recommendations — guards and empty states', () => {
    it('401s without a token', async () => {
      await request(app.getHttpServer()).get(recsUrl()).expect(401);
    });

    it('404s an unknown delivery', async () => {
      await request(app.getHttpServer())
        .get('/v1/deliveries/does-not-exist/recommendations')
        .set(auth('dispatcher'))
        .expect(404);
    });

    it('404s a viewer when no run exists yet (viewers never compute)', async () => {
      await request(app.getHttpServer())
        .get(recsUrl())
        .set(auth('viewer'))
        .expect(404);
    });

    it('403s refresh for viewer and driver roles', async () => {
      await request(app.getHttpServer())
        .get(`${recsUrl()}?refresh=true`)
        .set(auth('viewer'))
        .expect(403);
      await request(app.getHttpServer())
        .get(`${recsUrl()}?refresh=true`)
        .set(auth('driverA'))
        .expect(403);
    });
  });

  describe('recommendations — compute', () => {
    it('computes and persists a run for the dispatcher: ranked, explained, ineligible kept', async () => {
      const res = await request(app.getHttpServer())
        .get(recsUrl())
        .set(auth('dispatcher'))
        .expect(200);
      firstRun = res.body as RunBody;

      expect(firstRun.deliveryId).toBe(deliveryId);
      expect(firstRun.requestedByUserId).toBe(userIds.dispatcher);
      expect(firstRun.weights.zoneFit).toBe(0.3);

      const a = findCandidate(firstRun, drvA);
      const b = findCandidate(firstRun, drvB);
      const c = findCandidate(firstRun, drvC);

      // Eligible drivers are scored and ranked; same-zone van beats cross-zone car.
      expect(a.eligible).toBe(true);
      expect(b.eligible).toBe(true);
      expect(a.rank).not.toBeNull();
      expect(b.rank).not.toBeNull();
      expect(a.rank as number).toBeLessThan(b.rank as number);
      expect(a.score).toBeGreaterThan(b.score);
      expect(a.score).toBeGreaterThan(0);
      expect(a.score).toBeLessThanOrEqual(100);

      // Six factors, each with weight/rawValue/weighted/reason; sum = score.
      expect(a.explanation).toHaveLength(6);
      const factors = a.explanation.map((f) => f.factor);
      expect(factors).toEqual([
        'zoneFit',
        'routeProximity',
        'remainingCapacity',
        'workloadBalance',
        'deadlineFit',
        'priorityFit',
      ]);
      const sum = a.explanation.reduce((s, f) => s + f.weighted, 0);
      expect(Math.abs(sum - a.score)).toBeLessThan(0.01);
      const zone = a.explanation[0];
      expect(zone.rawValue).toBe(1); // same zone
      expect(typeof zone.reason).toBe('string');

      // Ineligible driver kept with every failing reason.
      expect(c.eligible).toBe(false);
      expect(c.rank).toBeNull();
      expect(c.score).toBe(0);
      const reasons = c.ineligibleReasons ?? [];
      expect(reasons).toContain('Availability is busy (must be available).');
      expect(reasons).toContain('A bike cannot carry medium packages.');
      expect(
        reasons.some((r) => r.startsWith('Insufficient remaining capacity')),
      ).toBe(true);

      // Driver summary is embedded for the UI cards.
      expect(a.driver.name).toBe('driverA');
      expect(a.driver.vehicle?.id).toBe(vehA);
    });

    it('serves the persisted run to a viewer without recomputing', async () => {
      const res = await request(app.getHttpServer())
        .get(recsUrl())
        .set(auth('viewer'))
        .expect(200);
      const body = res.body as RunBody;
      expect(body.id).toBe(firstRun.id);
    });

    it('refresh creates a new run with identical time-independent factor values', async () => {
      const res = await request(app.getHttpServer())
        .get(`${recsUrl()}?refresh=true`)
        .set(auth('dispatcher'))
        .expect(200);
      const second = res.body as RunBody;
      expect(second.id).not.toBe(firstRun.id);

      for (const driverId of [drvA, drvB]) {
        const before = findCandidate(firstRun, driverId);
        const after = findCandidate(second, driverId);
        // deadlineFit depends on wall-clock `now`; everything else must match.
        const timeless = (rows: FactorRow[]) =>
          rows
            .filter((f) => f.factor !== 'deadlineFit')
            .map((f) => [f.factor, f.rawValue, f.weighted, f.reason]);
        expect(timeless(after.explanation)).toEqual(
          timeless(before.explanation),
        );
        expect(Math.abs(after.score - before.score)).toBeLessThan(1);
      }
    });

    it('wrote a recommendation.run_created audit row for the delivery', async () => {
      const rows = await prisma.auditLog.findMany({
        where: {
          action: 'recommendation.run_created',
          entityType: 'Delivery',
          entityId: deliveryId,
          actorUserId: userIds.dispatcher,
        },
      });
      expect(rows.length).toBeGreaterThanOrEqual(2); // initial + refresh
    });
  });

  describe('assignments', () => {
    const assignUrl = () => `/v1/deliveries/${deliveryId}/assignments`;

    it('403s viewer and driver on create (roles guard)', async () => {
      await request(app.getHttpServer())
        .post(assignUrl())
        .set(auth('viewer'))
        .send({ driverId: drvA })
        .expect(403);
      await request(app.getHttpServer())
        .post(assignUrl())
        .set(auth('driverA'))
        .send({ driverId: drvA })
        .expect(403);
    });

    it('400s a body without driverId (validation details)', async () => {
      const res = await request(app.getHttpServer())
        .post(assignUrl())
        .set(auth('dispatcher'))
        .send({})
        .expect(400);
      const body = res.body as ErrorBody & { details?: string[] };
      expect(body.message).toBe('Validation failed');
      expect(Array.isArray(body.details)).toBe(true);
    });

    it('404s an unknown delivery and an unknown driver', async () => {
      await request(app.getHttpServer())
        .post('/v1/deliveries/does-not-exist/assignments')
        .set(auth('dispatcher'))
        .send({ driverId: drvA })
        .expect(404);
      await request(app.getHttpServer())
        .post(assignUrl())
        .set(auth('dispatcher'))
        .send({ driverId: 'does-not-exist' })
        .expect(404);
    });

    it('409s an ineligible driver with the reasons in the message', async () => {
      const res = await request(app.getHttpServer())
        .post(assignUrl())
        .set(auth('dispatcher'))
        .send({ driverId: drvC })
        .expect(409);
      const body = res.body as ErrorBody;
      expect(body.message).toContain('not eligible');
      expect(body.message).toContain('Availability is busy');
    });

    it('assigns the top driver: 201, delivery → assigned, workload bumped, audited twice', async () => {
      const res = await request(app.getHttpServer())
        .post(assignUrl())
        .set(auth('dispatcher'))
        .send({ driverId: drvA, reason: 'top pick' })
        .expect(201);
      const body = res.body as AssignmentBody;
      expect(body.deliveryId).toBe(deliveryId);
      expect(body.driverId).toBe(drvA);
      expect(body.vehicleId).toBe(vehA);
      expect(body.status).toBe('active');

      const del = await request(app.getHttpServer())
        .get(`/v1/deliveries/${deliveryId}`)
        .set(auth('dispatcher'))
        .expect(200);
      expect((del.body as { status: string }).status).toBe('assigned');

      const drv = await request(app.getHttpServer())
        .get(`/v1/drivers/${drvA}`)
        .set(auth('dispatcher'))
        .expect(200);
      expect((drv.body as { activeJobCount: number }).activeJobCount).toBe(1);

      const created = await prisma.auditLog.findMany({
        where: { action: 'assignment.created', entityId: body.id },
      });
      expect(created).toHaveLength(1);
      const statusRows = await prisma.auditLog.findMany({
        where: {
          action: 'delivery.status_changed',
          entityId: deliveryId,
          actorUserId: userIds.dispatcher,
        },
      });
      expect(statusRows.length).toBeGreaterThanOrEqual(1);
    });

    it('409s a second assignment (delivery no longer ready)', async () => {
      await request(app.getHttpServer())
        .post(assignUrl())
        .set(auth('dispatcher'))
        .send({ driverId: drvB })
        .expect(409);
    });

    it('409s refresh on the now-assigned delivery but still serves the latest run', async () => {
      await request(app.getHttpServer())
        .get(`${recsUrl()}?refresh=true`)
        .set(auth('dispatcher'))
        .expect(409);
      await request(app.getHttpServer())
        .get(recsUrl())
        .set(auth('viewer'))
        .expect(200);
    });

    it('lists assignment history per delivery and per driver (paginated)', async () => {
      const byDelivery = await request(app.getHttpServer())
        .get(assignUrl())
        .set(auth('viewer'))
        .expect(200);
      const delPage = byDelivery.body as PageBody<AssignmentBody>;
      expect(delPage.meta.total).toBe(1);
      expect(delPage.data[0].driverId).toBe(drvA);

      const byDriver = await request(app.getHttpServer())
        .get(`/v1/drivers/${drvA}/assignments`)
        .set(auth('driverA'))
        .expect(200);
      const drvPage = byDriver.body as PageBody<AssignmentBody>;
      expect(drvPage.meta.total).toBeGreaterThanOrEqual(1);
      expect(drvPage.data.some((a) => a.deliveryId === deliveryId)).toBe(true);
    });
  });
});
```

- [ ] **Step 2: Run the e2e suite — expect all suites green (~14 new tests)**

```powershell
docker compose up -d
pnpm --filter @logidash/api test:e2e
```

Expected: 6 suites pass (5 existing + this one), ~43 e2e total (27 existing +
~16 new). The e2e jest config already serializes suites (`maxWorkers: 1`) and
allows 30 s hooks.

- [ ] **Step 3: Commit**

```powershell
git add apps/api/test/recommendations-assignments.e2e-spec.ts
git commit -m "test(api): e2e recommend-to-assign flow with ineligible and race 409s"
```

---

### Task 13: Docs sync

**Files:**

- Modify: `docs/context/progress-tracker.md`
- Modify: `docs/implementation-plan.md`

- [ ] **Step 1: Update `docs/implementation-plan.md` Phase 6**

Flip the five Phase 6 task boxes `☐ → ☑` and append a status block after the
"Done when" line, following the Phase 5 pattern:

```markdown
> **Status:** Done (date) — `modules/recommendations/` ships a pure engine core
> (`engine/`: eligibility, six factors, score/rank, contexts — all unit-tested)
> orchestrated by `RecommendationsService`; `GET /v1/deliveries/:id/recommendations`
> returns latest-or-computes (`?refresh=true` forces; admin/dispatcher only,
> delivery must be `ready`) and persists `RecommendationRun` +
> `RecommendationCandidate` (ineligible kept with reasons) + an audit row in one
> transaction. `modules/assignments/` drives the deferred `ready → assigned`
> edge: `POST /v1/deliveries/:id/assignments` `{ driverId, reason? }` re-runs
> `checkEligibility`, status-guard-flips the delivery (409 on races), binds the
> driver's linked vehicle, increments workload, and writes `assignment.created`
>
> - `delivery.status_changed` audit rows atomically; history at
>   `GET /v1/deliveries/:id/assignments` and `GET /v1/drivers/:id/assignments`.
>   ORS degradation: route-dependent factors fall back to zone-distance estimates
>   flagged `degraded` in the explanation. Verified green: build, lint, N unit
>   (M suites), K e2e (6 suites).
```

(Fill N/M/K with the real counts from the final runs.)

- [ ] **Step 2: Update `docs/context/progress-tracker.md`**

- "Current Phase": mark Phase 6 **COMPLETE** with a summary like the Phase 5
  entry (engine shape, endpoints, decisions: size-tier matrix, priorityFit
  formula, `{ driverId }` body, GET-latest/refresh semantics, score 0 + rank
  null for ineligible). Set **Next: Phase 7 — Contract Emit & Frontend Client
  Generation.**
- "Current Goal": Phase 7.
- "Completed": add a Phase 6 block listing the 13 tasks' outcomes (mirror the
  Phase 5 block's grain), including the verified test counts.
- "Next Up": replace the Phase 6 paragraph with Phase 7 (per
  `docs/implementation-plan.md` Phase 7: `gen:openapi` emit, Orval config,
  axios mutator, `gen:client`, README workflow).
- "Session Notes": one dated entry noting branch
  `phase-6-recommendations-assignments`, one commit per task, and any
  deviations hit during execution.

No `architecture.md` change is needed — it already lists `assignments/` and
`recommendations/` under the module boundaries and invariants 3/5/6/7 describe
exactly what was built. (If execution deviated from any invariant, update it
instead and say so in the tracker.)

- [ ] **Step 3: Commit**

```powershell
git add docs/context/progress-tracker.md docs/implementation-plan.md
git commit -m "docs: sync tracker and implementation plan for phase 6"
```

---

## Verification (definition of done)

All from the repo root, with Docker Postgres up on 5433:

```powershell
pnpm --filter @logidash/api build        # tsc + nest build clean
pnpm --filter @logidash/api lint         # eslint clean (run BEFORE committing)
pnpm --filter @logidash/api test         # ~160 unit tests green (96 existing + ~64 new)
pnpm --filter @logidash/api test:e2e     # ~43 e2e green (27 existing + ~16 new)
pnpm lint:check; pnpm format:check       # what CI runs
```

**Live smoke (optional but recommended once, mirrors the demo script):**

1. `docker compose up -d`, then `pnpm --filter @logidash/api db:seed`
   (recreates DEL-1001 `ready` + 3 drivers; password `Demo123!`).
2. `pnpm --filter @logidash/api build` then
   `pnpm --filter @logidash/api start:prod` (needs the ≥32-char `JWT_SECRET`
   in `apps/api/.env`; mock maps provider engages automatically without an
   `ORS_API_KEY`).
3. Login: `POST /v1/auth/login` as `dispatcher@logidash.dev` (mind the 5/min
   login throttle in dev).
4. `GET /v1/deliveries?status=ready` → take DEL-1001's id.
5. `GET /v1/deliveries/{id}/recommendations` → expect ranked candidates: Alex
   (Downtown van, same zone) above Sam (Midtown car), Jordan ineligible
   ("Availability is busy …").
6. `POST /v1/deliveries/{id}/assignments` `{ "driverId": "<alexProfileId>" }`
   → 201; repeat → 409; `GET /v1/deliveries/{id}` → `assigned`.
7. Swagger spot-check at `/docs`: `recommendations` and `assignments` tags
   present with typed schemas.

**Success criteria traceability (spec §13):** #2 create→recommend with
score+explanation (Tasks 8/9/12), #3 ineligible assignment → clear 409
(Tasks 10/12), #4 assignment + status changes audited (Tasks 8/10/12), #6
suite green (every task). #1/#5 were satisfied in earlier phases; Phase 7 wires
the generated client.

## Execution handoff

Plan saved to `docs/superpowers/plans/2026-06-10-phase-6-recommendations-assignments.md`
by Task 1. Execution options (per house convention):

1. **Auto (subagent-driven or inline)** — agent implements task-by-task, one
   commit per task, exactly as Phases 4–5 were run.
2. **Teach-and-build** — user types the engine code with guidance (the pure
   `engine/` core is the highest-learning-value part); agent just-executes the
   mechanical steps (wiring, test runs, commits) per established preference.

Either way: re-read `docs/context/progress-tracker.md` "Session Notes" for the
ESLint/Jest gotchas before writing test code, and run
`pnpm --filter @logidash/api lint` before every commit (the pre-commit hook
reverts commits on non-fixable errors).
