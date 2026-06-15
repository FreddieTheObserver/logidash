# Phase 8 — Frontend Command Center, Slice 2: Critical Flow — Design Spec

**Date:** 2026-06-15
**Status:** Approved (brainstorm complete; pending implementation plan)
**Scope:** Deliver the phase's signature **create → recommend → assign → status**
arc across two screens — the **Deliveries queue** and the **Delivery detail +
recommendation panel** — plus a **New delivery** create flow. Unlike Slice 1
(frontend-only), this slice **also adds three read-only API capabilities** so the
detail screen is fully real: a delivery audit timeline, a pickup→dropoff route
estimate, and the active driver summary on deliveries. Full-stack slice:
backend additions → contract re-emit + client regen → frontend.

---

## 1. Context & motivation

Slice 1 stood up the `apps/web` foundation — Tailwind 4 + tokens, the typed
primitive library (`components/ui/`), `AppProviders` (TanStack Query + auth),
the role-aware router/guards, the command-center shell, and login. `/deliveries`
and the rest currently render `RouteStub` placeholders.

Slice 2 builds the first real data screens and the centerpiece of the product:
the **explainable, scoring-based driver recommendation panel**. The design
reference is `design_handoff_command_center/` (README authoritative for
layout/UX; `prototype/` a faithful non-production reference). Where the prototype
and `docs/context/ui-context.md` disagree, **`ui-context.md` wins**.

Slice 1 deliberately deferred a set of detail-screen gaps ("audit timeline,
assigned-driver column, route-estimate strip") as future backend work. This
slice **closes them at the contract level** rather than trimming them on the
frontend — see §3 and §11.

## 2. Goal & non-goals

**Goal:** A dispatcher/admin can find and filter deliveries in a paginated
queue; open a delivery; create a new delivery; run/inspect ranked driver
recommendations with the per-factor explanation; assign the top (or any
eligible) driver with server-side eligibility re-validation; advance the
delivery along the allowed status graph; and review a real audit timeline and
route estimate — all against the running API via generated hooks. Drivers and
viewers get the correct read-only / own-assignment behavior.

**Non-goals (deferred to Slice 3 / later):**

- Dashboard, Drivers list/detail, Admin (Slice 3). They keep their `RouteStub`s.
- Nav **count badges** (open deliveries / available drivers) — still deferred
  (the slices that own those screens add them).
- Kebab **Export** and **Reassign** row actions; **Remember-me / live tracking**.
- A general-purpose audit browser. The new audit endpoint is **delivery-scoped**
  only.

## 3. Approach decisions (locked)

Confirmed during brainstorming (the four gap calls all chose the thorough,
contract-first path):

- **API-gap policy for this slice: solve at the contract, not trim.** The three
  detail-screen gaps become real, additive, read-only API surface.
- **Audit timeline →** new `GET /v1/deliveries/:id/audit` (the `AuditLog` data
  already exists; only an HTTP surface was missing).
- **Route-estimate strip →** new `GET /v1/deliveries/:id/route-estimate`
  (real pickup→dropoff estimate via the maps adapter, cached).
- **Queue Driver column →** add an `assignedDriver` summary to `DeliveryDto`
  (no N+1; one query with an `include`).
- **Create flow →** included this slice (a New delivery modal), completing the
  end-to-end "Done when".
- **Execution:** auto-implement (not teach-and-build), per-task commits, verify
  each task, pause at the slice boundary. Commit messages omit the
  `Co-Authored-By` trailer.

All additions are **additive** — no existing endpoint changes behavior except a
richer `DeliveryDto` and a new `delivery.created` audit row on create.

## 4. Backend additions (`apps/api`)

### 4.1 Active driver summary on `DeliveryDto`

- Add `assignedDriver: DeliverySummaryDriverDto | null` where
  `DeliverySummaryDriverDto = { id: string; name: string }` (driver name comes
  from the linked `User`, via `DriverProfile.user.name`).
- **Semantics:** the driver of the **active** assignment
  (`Assignment.status = active`); `null` otherwise. A delivery has at most one
  active assignment (the assign flow guards it). Terminal `delivered`/`failed`
  rows show `null` (their assignment is `completed`/`cancelled`, not active) —
  the column means "currently assigned to", which is the operationally useful
  reading.
- **Implementation:** `DeliveriesService.list` and `getById` add
  `include: { assignments: { where: { status: active }, take: 1, include: {
driver: { include: { user: true } } } } }`; `toDeliveryDto` maps the included
  relation. Type the mapper input with a Prisma payload type so the build stays
  strict.

### 4.2 Route-estimate endpoint

- `GET /v1/deliveries/:id/route-estimate` — any authenticated role (same access
  as `GET /v1/deliveries/:id`). 404 if the delivery is missing.
- New `MapsService.getRouteEstimateDetailed(origin, dest)` returning
  `{ distanceMeters; durationSeconds; provider; cached } | null` — sibling to
  the existing `getRouteEstimate` (left untouched so the Phase 6 engine and its
  tests are unaffected). Logic: cache `findUnique` by `buildCacheKey` → hit
  returns `{ …, cached: true, provider }`; miss → `provider.route` → `upsert` →
  `{ …, cached: false, provider: this.provider.name }`; `MapsProviderError` →
  `null`.
- `DeliveriesService.getRouteEstimate(id)`: load delivery; if any of
  pickup/dropoff lat/lng is `null` → return `{ available: false, degraded: true }`;
  else call the maps method → `null` → `{ available: false, degraded: true }`,
  result → `{ available: true, degraded: false, distanceMeters, durationSeconds,
provider, cached }`.
- DTO `RouteEstimateDto { available: boolean; degraded: boolean;
distanceMeters?: number; durationSeconds?: number; provider?: string;
cached?: boolean }`.
- Under `MAPS_PROVIDER=mock` (local without an ORS key, and all e2e) the mock
  provider always resolves deterministically, so `available:true,
provider:'mock'` — the strip renders in tests.

### 4.3 Delivery audit timeline

- `GET /v1/deliveries/:id/audit` — paginated (standard `PaginationQueryDto` +
  `Paginated` envelope, `@ApiPaginatedResponse(AuditEntryDto)`), newest-first,
  any authenticated role. 404 if the delivery is missing.
- New `AuditService.listForDelivery(deliveryId, query)`: select the delivery's
  assignment ids, then query
  `AuditLog where OR:[{ entityType:'Delivery', entityId: deliveryId },
{ entityType:'Assignment', entityId: { in: assignmentIds } }]`,
  `include: { actor: true }`, `orderBy: { createdAt: 'desc' }`, paginated. This
  captures all the timeline's events because `delivery.status_changed` and
  `recommendation.run_created` are keyed `entityType:'Delivery'/entityId=deliveryId`
  and `assignment.created` is keyed to the assignment id (confirmed in the
  Phase 4/6 services).
- DTO `AuditEntryDto { id; action; entityType; actorUserId; actorName;
actorRole; before?; after?; reason?; createdAt }` (`before`/`after` typed as
  optional `Record<string, unknown>`-ish JSON so the FE can render e.g.
  "ready → assigned"). `actorName`/`actorRole` come from the joined `User`.
- **Add a `delivery.created` audit row** in `DeliveriesService.create` so the
  timeline has a creation anchor. Wrap create + audit in one `$transaction`; the
  controller's `create` gains `@CurrentUser() user` and passes it through.
  Audit: `action:'delivery.created'`, `entityType:'Delivery'`,
  `entityId:delivery.id`, `after:{ reference, status:'draft', zoneId, priority,
packageSize }`.
- **`geocoded` events are not emitted** (Phase 5 geocoding is best-effort and
  noisy). The FE maps unknown/extra actions to a generic icon; the timeline
  shows created / status_changed / run_created / assignment.created.

### 4.4 Routing / module placement

The two new GET routes hang off `DeliveriesController` (delivery-scoped URLs),
delegating to `DeliveriesService`, which already injects `AuditService` and
`MapsService`. The read logic lives in the owning services
(`AuditService.listForDelivery`, `MapsService.getRouteEstimateDetailed`) for
cohesion. Operation ids (Phase 7 `operationIdFactory`,
`Controller.method → camelCase`): `deliveriesGetRouteEstimate`,
`deliveriesGetAudit` → hooks `useDeliveriesGetRouteEstimate`,
`useDeliveriesGetAudit`.

### 4.5 Cleanup

Delete the stray, dead `apps/api/src/modules/recommendations/dto/create-assignment.dto.ts`
(an untracked duplicate of the assignments module's DTO; not imported anywhere).

## 5. Contract re-emit + client regen

After the backend lands: `pnpm gen:openapi` → `pnpm gen:client`, producing the
new hooks/DTOs (`useDeliveriesGetRouteEstimate`, `useDeliveriesGetAudit`,
`RouteEstimateDto`, `AuditEntryDto`, the `assignedDriver` field +
`DeliverySummaryDriverDto`). Both committed artifacts (`apps/api/openapi.json`,
`packages/api-client/src/generated/**`) are regenerated and committed; the CI
`quality` job's `git diff --exit-code` drift check stays green.

## 6. Frontend file layout (`apps/web/src/`)

```
routes/router.tsx            replace /deliveries RouteStub → DeliveriesPage;
                             add /deliveries/:id → DeliveryDetailPage
components/ui/
  Modal.tsx                  NEW primitive: dialog (focus trap, Escape +
                             outside-click close, --shadow-pop, backdrop)
lib/
  sla.ts                     deriveSla(status, deadlineAt) → on-track|at-risk|breached
  delivery-transitions.ts    DELIVERY_TRANSITIONS graph + allowedTransitions()
hooks/
  useZoneMap.ts              zonesList → Map<id, ZoneDto> (shared)
features/deliveries/
  DeliveriesPage.tsx         queue: toolbar + filters + table + pagination + 4 states
  DeliveryDetailPage.tsx     detail orchestrator (queries + layout)
  components/
    DeliveryTable.tsx        table (sticky header, zebra, hover, row → detail)
    DeliveryToolbar.tsx      search + Status/Priority/Zone/SLA/Assignment + Clear
    StatusTransitionBar.tsx  status control bar + transition buttons + reason prompt
    DeliveryInfoCard.tsx     2-col info grid
    RouteEstimateStrip.tsx   distance/duration + provider/cached | estimated chip
    RecommendationPanel.tsx  header + WeightsLegend + candidate list + no-run state
    WeightsLegend.tsx        six factors + weights (from run.weights)
    CandidateCard.tsx        rank/avatar/meta/score/Assign/expand + collapsed strip
    FactorBreakdown.tsx      expanded per-factor table + weighted total
    IneligibleList.tsx       collapsible ineligible drivers + reasons
    AuditTimeline.tsx        vertical timeline from useDeliveriesGetAudit
    AssignModal.tsx          confirm assign (driver+vehicle+score) + inline 409
    NewDeliveryModal.tsx     create form (zone select, enums, addresses, deadline)
```

New primitives/helpers are reused from Slice 1 where they exist (Chip family,
ScoreChip, Button, Card, Avatar, Skeleton, Meter, EmptyState, ErrorState,
Field/Input/Select, Toast, Menu, `lib/format.ts`, `lib/tone.ts`, `ICONS`). Note
Slice 1 already shipped `format.deadlineState` + `tone.SLA_TONE/SLA_LABEL`;
`lib/sla.ts` wraps `deadlineState` with the status-awareness (terminal statuses
have no SLA) and is the single source the queue + chips consume.

## 7. Screens

### 7.1 Deliveries queue (`DeliveriesPage`) — handoff §3

- Layout `max-w-[1280px] p-6`: toolbar row, then the table card. (The prototype's
  preview-state segmented control is **omitted** — it was prototype-only.)
- **Toolbar (`DeliveryToolbar`):** search input; **Status / Priority / Zone**
  selects (wired to server params); **SLA** + **Assignment** selects (client-side,
  see §8); a "Clear (n)" ghost button when any filter is active; right-aligned
  primary **New delivery** button (dispatcher/admin only) → `NewDeliveryModal`.
  Active (non-"all") selects flip border + text to `--color-primary`.
- **Table (`DeliveryTable`):** sticky header, zebra rows, row hover, horizontal
  scroll under ~920px. Columns: **Reference** (tabular) · **Status** chip ·
  **Priority** chip · **Zone** (code via `useZoneMap`) · **Route**
  (`{pickup} → {dropoff}`, truncates) · **Package** (`{size} · {weight}kg`) ·
  **SLA** chip ("—" for terminal) · **Deadline** (right-aligned tabular relative;
  danger when breached & non-terminal) · **Driver** (`assignedDriver` →
  Avatar + first name, else "Unassigned") · trailing **kebab** (on row hover):
  Open detail / Recommend drivers (if `ready`) / Cancel (danger, hidden/disabled
  for terminal). Whole row clickable + Enter-activatable → `/deliveries/:id`.
- **Pagination:** footer "Showing X–Y of N" + Prev / page x of y / Next; page
  size **8** (`limit: 8`).
- **Four states (all required):** Loading (8 skeleton rows), Empty (`inbox`
  EmptyState + "Clear filters"), Error (`ErrorState` with Retry), Data.

### 7.2 Delivery detail + recommendation panel (`DeliveryDetailPage`) — handoff §4 ⭐

- Layout `max-w-[1280px] p-6`. Breadcrumb "Deliveries" → back to the queue.
- **Status control bar (`StatusTransitionBar`):** `package` square + reference +
  `StatusChip` + `PriorityChip`, "{zoneCode} · created {relative}" subline. Right
  side: SLA block (clock + "Deadline" + relative + `SlaChip`) for non-terminal;
  **transition buttons** (admin/dispatcher) one per allowed transition (§8) —
  forward = primary, `cancelled`/`failed` = danger, `ready` (unassign) =
  secondary; `cancelled`/`failed` open a small reason prompt (the `reason` body
  field). Driver sees only their own-assignment operational transitions; viewer
  sees a "Read-only" chip. `→assigned` is never a button (assign flow only).
- **Main grid (`xl`: 2fr / 1fr):** left = `DeliveryInfoCard` (+
  `RouteEstimateStrip`) then `RecommendationPanel`; right = `AuditTimeline`
  (sticky on `xl`).
- **`DeliveryInfoCard`:** 2-col info grid — Pickup, Dropoff, Zone (code) |
  Package, Priority, Deadline. **`RouteEstimateStrip`:** `route` icon + Distance +
  Est. duration (tabular) + a success `{provider}` (· cached) chip when
  `available && !degraded`; a warning "estimated / unavailable" chip otherwise.
- **`RecommendationPanel`** (from `useRecommendationsGetForDelivery`):
  - Header: `sparkles` + "Driver recommendations" + neutral chip
    "{eligible} eligible · {n} not". **Re-run** (admin/dispatcher) refetches with
    `?refresh=true`.
  - **`WeightsLegend`:** six factors + weights read from `run.weights`
    (`ScoringWeightsDto`), not hardcoded.
  - **`CandidateCard`** per eligible candidate (sorted by `rank`): rank square
    (primary fill for rank 1), Avatar, name + chips ("Top pick" for rank 1,
    "Assigned" when this driver matches the active assignment), meta line
    `{vehicleType} · {zoneCode} · {activeJobCount}/{maxConcurrentJobs} jobs`
    (**no license plate** — not in `CandidateVehicleDto`), a `ScoreChip` with
    "SCORE" caption, an **Assign** button (primary; only when delivery is `ready`
    and role can act; "Assigned"/disabled once chosen), and an expand chevron.
    Collapsed = the 6-mini-bar factor strip (one per `explanation` factor, height
    by `rawValue`). Expanded = **`FactorBreakdown`**: a table Factor / Normalized
    (bar + `rawValue` 2dp) / Weight (×`weight`) / Points (+`weighted` 1dp), one
    row per `FactorContributionDto` with its `reason` beneath, footer "Weighted
    total = {score} / 100". `degraded` factors get a subtle "estimated" marker.
  - **`IneligibleList`:** collapsible; each ineligible candidate (a
    `--color-surface-alt` card) shows Avatar, name, vehicle, an "Ineligible"
    danger-outline `ScoreChip`, and the bulleted `ineligibleReasons`.
  - **No-run state:** when the query 404s (no run and not `ready`, or a
    viewer/driver who can't compute) → `EmptyState` (`sparkles`) with a CTA
    ("Run recommendations" for admin/dispatcher on `ready`; otherwise an
    explanatory message).
- **`AuditTimeline`** (from `useDeliveriesGetAudit`): vertical connector line;
  each entry = tinted round icon by `action` + action label + reason +
  "{actorName} · {actorRole} · {relative}". Status entries render
  "{before.status} → {after.status}" from the JSON. Newest first. Loading =
  skeleton rows; empty (shouldn't happen post-create) = small empty state.

### 7.3 Assign flow (`AssignModal`)

Clicking **Assign** on a candidate opens a confirm `Modal` showing driver +
vehicle + reference + the candidate's score/rank, and a note that eligibility is
re-validated server-side and the action is audited. Confirm →
`useAssignmentsCreate({ deliveryId, data: { driverId } })`. On success: close,
success **Toast**, invalidate (delivery detail + list + recommendations + audit);
the candidate shows "Assigned" and the status bar reflects `assigned`. On
**409** (eligibility lost / lost race): show the server `ErrorResponseDto.message`
**inline in the modal** (do not close).

### 7.4 New delivery (`NewDeliveryModal`)

Dispatcher/admin only. A `Modal` form via `useDeliveriesCreate`: reference,
pickup/dropoff addresses, **zone** select (`useZoneMap` → options), **package
size** + **priority** selects (generated enums), package weight (positive),
package type, **deadline** (`datetime-local` → ISO). Client-side required/format
checks; on submit map a **400** `details` to inline `Field` errors, **409**
(duplicate reference) to a form-level message. On success: close, Toast,
invalidate the list, and navigate to the new delivery's detail.

## 8. Client-derived logic

- **`lib/sla.ts`** — `deriveSla(status, deadlineAt, now?) → 'on-track' |
'at-risk' | 'breached' | null`. Terminal statuses (`delivered`/`failed`/
  `cancelled`) → `null` ("—"). Otherwise delegates to Slice 1's
  `deadlineState` (breached = past; at-risk < 90 min; else on-track). The SLA
  chip + the queue's SLA filter both consume this.
- **`lib/delivery-transitions.ts`** — `DELIVERY_TRANSITIONS:
Record<DeliveryDtoStatus, DeliveryDtoStatus[]>` mirroring the handoff lifecycle
  graph, and `allowedTransitions(status, role, isOwnActiveAssignment)` returning
  the buttons to show: admin/dispatcher get all allowed edges **except**
  `→assigned`; driver gets only `assigned→picked_up→in_transit→delivered|failed`
  on their own active assignment; viewer gets none. The server remains
  authoritative (it 409s illegal edges / 403s role violations); this is UX only.
- **`hooks/useZoneMap.ts`** — wraps `useZonesList({ limit: 100 })` and returns
  `{ zoneMap: Map<string, ZoneDto>, ...query }`; `zoneCode(id)` falls back to the
  raw id if unknown. Shared by queue, detail, info card, and create form.

## 9. Data flow & cache invalidation

- **Queue:** `useDeliveriesList({ page, limit:8, status?, priority?, zoneId? })`
  (server filters) + `useZoneMap`. Search, SLA, and Assignment filters apply
  **client-side over the loaded page** (explicitly page-scoped; the toolbar notes
  nothing about cross-page search). Page resets to 1 when a server filter
  changes.
- **Detail:** `useDeliveriesGetById(id)` · `useRecommendationsGetForDelivery(id,
{ refresh })` · `useDeliveriesGetAudit(id)` · `useDeliveriesGetRouteEstimate(id)`
  · `useAssignmentsListByDelivery(id)` (to find the active assignment's `driverId`
  for the "Assigned" marker). `useZoneMap` for codes.
- **Mutations:** `useAssignmentsCreate`, `useDeliveriesChangeStatus`,
  `useDeliveriesCreate`. On success each invalidates the affected query keys:
  assign/status → delivery detail + list + recommendations + audit; create →
  list (then navigate). Recommendation **Re-run** uses the same query with
  `refresh:true` (admin/dispatcher; the server 403s others and 409s non-`ready`).

## 10. Error handling

| Surface         | Condition                                    | Handling                                                                          |
| --------------- | -------------------------------------------- | --------------------------------------------------------------------------------- |
| Recommendations | `404` (no run / not `ready` / can't compute) | No-run `EmptyState` + role-aware CTA                                              |
| Assign          | `409` (ineligible / lost race)               | Inline message in `AssignModal` from `ErrorResponseDto.message`; modal stays open |
| Status change   | `409` (illegal / lost race)                  | Inline error on the transition bar                                                |
| Create          | `400` (`details`)                            | Map to per-`Field` errors; `409` dup reference → form-level message               |
| Route estimate  | `available:false` / `degraded`               | Warning "estimated / unavailable" chip (no crash)                                 |
| Any list/detail | network/5xx                                  | `ErrorState` with Retry (refetch)                                                 |

Error status is read from the axios error shape already used in Slice 1's
`useLogin` (`err.response?.status`, `err.response?.data` typed as
`ErrorResponseDto`).

## 11. Prototype-vs-contract gaps — resolution

| Prototype element          | Contract gap                          | Slice 2 resolution                                                |
| -------------------------- | ------------------------------------- | ----------------------------------------------------------------- |
| Audit timeline             | No HTTP surface (service-only)        | **Added** `GET /v1/deliveries/:id/audit` + `delivery.created` row |
| Route-estimate strip       | No pickup→dropoff estimate exposed    | **Added** `GET /v1/deliveries/:id/route-estimate`                 |
| Queue Driver column        | No driver on `DeliveryDto`            | **Added** `assignedDriver` (active assignment)                    |
| Candidate license plate    | Not in `CandidateVehicleDto`          | Trimmed — meta line omits the plate                               |
| Kebab Export / Reassign    | No endpoints / compound flow          | Deferred (kebab = Open / Recommend / Cancel)                      |
| `geocoded` timeline events | Not audited                           | Not emitted; FE renders only real actions                         |
| Delivered row driver       | Assignment is `completed`, not active | Shows "Unassigned"/"—" (column = currently assigned)              |

## 12. Testing

- **Backend unit:** `AuditService.listForDelivery` (OR-query across
  Delivery+Assignment ids, actor join, ordering); `MapsService.getRouteEstimateDetailed`
  (cache hit → `cached:true`; miss → upsert + `cached:false`; `MapsProviderError`
  → `null`); `DeliveriesService` route-estimate (coords-missing → unavailable),
  `assignedDriver` mapping, and the `delivery.created` audit-in-transaction.
- **Backend e2e** (extend the deliveries/recommendations suites): `GET
/deliveries/:id/audit` returns the timeline newest-first with actor fields and
  a `delivery.created` anchor; `GET /deliveries/:id/route-estimate` returns
  `available:true` under the mock provider; `assignedDriver` is populated after
  an assign and `null` before; 404 on a bad id; role/read access.
- **Frontend (Vitest + RTL):** `sla.ts` + `delivery-transitions.ts` (pure,
  table-driven — highest value); `allowedTransitions` role/status matrix;
  `RecommendationPanel` / `CandidateCard` / `FactorBreakdown` render from a mock
  `RecommendationRunDto`; `IneligibleList` shows reasons; `AssignModal` surfaces a
  409 inline; `DeliveriesPage` renders the four states (mocked `useDeliveriesList`).
- No real network in any test (consistent with the repo's testing rules; e2e
  forces `MAPS_PROVIDER=mock`).

## 13. Verification & "done when"

**Done when:**

- A dispatcher can: open `/deliveries`, filter, paginate; create a new delivery
  via the modal; open its detail; run recommendations and see ranked candidates
  with the per-factor breakdown and ineligible reasons; assign the top driver
  (with a server-revalidated 409 surfaced inline if it fails); watch the status
  flip to `assigned`, the candidate show "Assigned", a toast, and two new audit
  entries appear; then advance status along the allowed graph.
- A driver sees only their own-assignment status controls; a viewer sees
  read-only.
- The route-estimate strip and audit timeline render real API data.
- `pnpm gen:openapi && pnpm gen:client` leaves **zero drift**; CI quality job
  green.
- All green: `pnpm --filter @logidash/api lint:check build test test:e2e`,
  `pnpm --filter @logidash/api-client test`, `pnpm --filter @logidash/web
lint:check build test`.

**Verification commands:** the per-package `lint:check` / `build` / `test`
(+ `test:e2e` for api, against Docker Postgres on 5433, seeded), `pnpm gen`
drift check, and a manual smoke against a booted API per the local-run recipe.

## 14. Commits & docs

- Branch `phase-8-slice-2-critical-flow` from the Slice 1 branch
  (`phase-8-slice-1-foundations-auth`), one commit per task, **no
  `Co-Authored-By` trailer**.
- On completion update `docs/context/progress-tracker.md` (Slice 2 entry,
  verification counts, branch, remaining trimmed gaps) and — because this slice
  adds API surface — note the new endpoints in `architecture.md` /
  `implementation-plan.md` where they describe the deliveries module + contract.

## 15. Out of scope / open questions

- **Audit read authorization:** this slice exposes the timeline to any
  authenticated role (matching `GET /deliveries/:id`). If audit visibility should
  be admin/dispatcher-only, that's a one-line `@Roles` change (flagged, not
  blocking).
- **Cross-page search/SLA filtering:** intentionally page-scoped (the API has no
  search/SLA params). A future backend `search`/`assignment` param would make it
  global — logged, not built.
- **`assignedDriver` for terminal deliveries:** shows the _active_ driver only
  (null when delivered/cancelled). A "last assigned driver" variant would need a
  separate field — out of scope.
