# Handoff: logidash Command Center UI

## Overview

This package is the design specification for the **logidash dispatcher command
center** — the React + TypeScript frontend described in
`docs/context/ui-context.md` and the API design spec. It covers all primary
screens: Login, the app shell, Dashboard, Deliveries queue, Delivery detail
(with the signature **driver recommendation panel**), Drivers list + detail,
and Admin.

The signature feature is the **explainable, scoring-based driver
recommendation engine**: for a delivery, eligible drivers are ranked 0–100
with a per-factor breakdown (zone fit, route proximity, remaining capacity,
workload balance, deadline fit, priority fit), and ineligible drivers are
shown with reasons.

---

## About the Design Files

The files in `prototype/` are **design references built in HTML/React+Babel/
Tailwind (via CDN) with hardcoded mock data**. They are a faithful, interactive
prototype of the intended look and behavior — **not production code to copy
verbatim**.

**Your task:** recreate these designs inside the existing `frontend/` app
(React + TypeScript + Vite), using its established patterns:

- Server state via **TanStack Query** using the **Orval-generated client and
  types** (`docs/implementation-tools.md` / spec §9–10). Do **not** hand-write
  API interfaces or duplicate the mock data in `prototype/data.js` — that mock
  shape exists only to drive the prototype. Map each screen to the real
  generated hooks/DTOs.
- The token contract in `docs/context/ui-context.md` (reproduced below). Define
  these as CSS custom properties once (e.g. in `index.css` / a `tokens.css`)
  and reference them — never hardcode hex in components.
- A headless/utility UI approach (the prototype uses plain Tailwind utility
  classes + inline `var(--token)` styles; in the app, prefer Tailwind config
  that maps to the tokens, see "Design Tokens → Tailwind wiring" below).
- Minimal **line icons** — the prototype hand-rolls a small lucide-style set in
  `icons.jsx`; in the app, install **`lucide-react`** and use the named icons
  listed per component instead.

Role-aware navigation and route guards are **UX-only** in this prototype (a
role switcher in the top bar swaps the mock identity). In the app, drive role
from the authenticated JWT and gate nav/actions accordingly; the server remains
the source of truth for authorization.

---

## Fidelity

**High-fidelity (hifi).** Final colors, typography scale, spacing, radii,
status semantics, and interaction states are all specified and should be
matched closely. Recreate the UI pixel-faithfully using the codebase's
libraries. Where the prototype and `docs/context/ui-context.md` ever disagree,
**`ui-context.md` wins** (the prototype was built from it).

---

## Global Layout — App Shell

Three regions, full viewport height, no body scroll (only the content region
scrolls):

```
┌──────────┬─────────────────────────────────────────────┐
│ Sidebar  │ Top bar (h: 56px / h-14)                     │
│ (w:232px)├─────────────────────────────────────────────┤
│ fixed    │ Main content (scrollable, scroll-y auto)     │
│          │   most screens: max-width 1200–1280px,       │
│          │   centered (mx-auto), padding 24px (p-6)     │
└──────────┴─────────────────────────────────────────────┘
```

### Sidebar (`shell.jsx` → `Sidebar`)
- Width **232px**, `background: --color-surface`, right border `1px --color-border`.
- **Brand row** (h 56px, bottom border): 28×28 rounded-md square filled
  `--color-primary` containing a white `route` icon (size 17), then wordmark
  "logidash" — 15px, font-weight 600, `tracking-tight`, color `--color-text`.
- **Nav** (padding 12px): a section label "OPERATIONS" (11px, 600, uppercase,
  `tracking-wider`, `--color-text-muted`), then nav items.
  - Nav item: full width, height 36px, padding-x 12px, radius-md, gap 12px,
    13.5px / 500. Icon (lucide, size 18) + label + optional count badge.
  - **Active**: text `--color-primary`, background `--tint-primary` (#e6effe),
    icon stroke-width 2. **Inactive**: text `--color-text-muted`; hover bg
    `--color-surface-alt`.
  - Count badge (Deliveries shows open count, Drivers shows available count):
    tabular-nums, 11.5px/600, pill, min-width 20px, centered. Active badge uses
    `rgba(37,99,235,.15)` bg + primary text; else `--color-surface-alt`.
- **Footer card** (padding 12px, top border): a `--color-surface-alt` rounded-md
  card explaining the recommendation engine — `sparkles` icon (primary) +
  "Recommendation engine" (12.5px/500), then a 11.5px muted description.
- **Role-aware items** (see Roles): nav array with a `roles` allow-list.

### Top bar (`shell.jsx` → `TopBar`)
- Height **56px**, `--color-surface`, bottom border, padding-x 24px, items
  centered, gap 16px.
- **Left**: optional breadcrumb (back chevron + parent name, 12px muted,
  clickable) above the title row. Title = 16px/600 `tracking-tight`; optional
  muted subtitle (12.5px) inline after it.
- **Env badge**: a small warning-tone chip `layers` icon + "Staging".
- **Role switcher** (demo affordance): bordered button "Viewing as: {Role}"
  with `shield` + `chevronDown`; opens a menu to switch role. In production this
  is replaced by read-only role display from the JWT.
- **Notifications**: 34×34 ghost icon button (`bell`) with a danger dot badge.
- **User menu**: avatar (initials) + chevron; dropdown shows name/email, then
  Profile / Preferences / Sign out (danger).

---

## Screens / Views

> Exact mock copy is in `prototype/data.js`. Reproduce structure & styling; pull
> real content from the API.

### 1. Login (`login.jsx`)
- **Purpose**: authenticate; choose a demo role quickly.
- **Layout**: two columns on `lg+`. Left = centered form column (max-width
  360px). Right = 460px brand panel (`--color-surface`, left border), hidden
  below `lg`.
- **Form**: brand lockup (icon square + wordmark), H1 "Sign in to the command
  center" (22px/600 `tracking-tight`), 13px muted subline. Fields stacked
  (gap 16px): **Work email**, **Password** — labels above inputs (12.5px/500),
  inline field-level validation in `--color-danger` with an `alert` icon.
  Row: "Remember me" checkbox (accent = primary) + "Forgot?" link (primary).
  Primary submit button, full width, size lg; shows "Signing in…" while pending.
- **Demo accounts**: 2×2 grid of bordered cards (admin/dispatcher/driver/
  viewer), each with a role icon (shield/route/truck/eye) + role + name; click
  signs in as that role.
- **Brand panel**: env chip + version line at top; a primary-tone "Explainable
  dispatch" chip; a 22px statement line; and a mini "scorecard" card showing 4
  factor rows (label + progress bar + weight) — purely illustrative.
- **Validation rules**: email must match a basic email regex; password ≥ 6
  chars. Validation shows after blur/submit. (Prototype accepts any matching
  input and maps the email to a demo role; real app calls the auth endpoint.)

### 2. Dashboard (`dashboard.jsx`)
- **Purpose**: at-a-glance operational health + a queue of items needing action.
- **Layout**: `max-w-1200`, p-6, vertical stack (gap 24px).
  1. **Metric cards** — responsive grid (2 cols, 4 on `lg+`), gap 16px.
  2. **Two-column region** (`xl`: 2fr / 1fr): left = "Needs attention" card
     (spans 2), right column = "Driver availability" + "Recent activity".
- **Metric card**: 34×34 tinted icon square (tone per metric), optional trend
  chip (top-right; up = danger arrow, down = success), then a **28px/600
  tabular** value, a 12.5px muted label, and an 11.5px sub-line. Four metrics:
  - Pending deliveries (info / `inbox`) = count of `ready` deliveries.
  - Active assignments (primary / `route`) = `assigned|picked_up|in_transit`.
  - SLA risk (warning / `alert`) = open deliveries at-risk or breached.
  - Drivers available (success / `users`) = "{available}/{total}".
  - **Loading**: skeleton bars in place of value/label.
- **Needs attention** card: header (title + count chip + "View queue" ghost
  button). Each row (clickable → delivery detail): leading tinted status square
  (tone by SLA: breached→danger, at-risk→warning, else info), reference (13px/
  500 tabular) + priority chip, second line = "{zone} · {pickup} → {dropoff}"
  (12px muted, truncates), right side = relative deadline (clock icon) + delivery
  **status chip** + chevron. Rows separated by top borders; hover =
  `--color-surface-alt`. Shows skeleton rows while loading. Sorted by deadline.
- **Driver availability** card: three rows (Available/Busy/Offline) each with a
  tone dot, label, a proportional progress bar, and a tabular count.
- **Recent activity** card: list of events — 24px tinted round icon + message
  (12.5px, with bolded refs) + relative time (11.5px muted) stacked below.

### 3. Deliveries queue (`deliveries.jsx`)
- **Purpose**: find, filter, and act on deliveries.
- **Layout**: `max-w-1280`, p-6. Toolbar row, a preview-state segmented control
  (prototype-only — remove in app), then a table card.
- **Toolbar**: search input (with `search` icon, placeholder "Search reference,
  address, package…"), then filter selects — **Status, Priority, Zone, SLA,
  Assignment**. Active (non-"all") selects flip border + text to `--color-primary`.
  A "Clear (n)" ghost button appears when filters are active. Right-aligned
  primary "New delivery" button (dispatcher/admin only).
- **Table** (sticky header, zebra rows, row hover, horizontal scroll under
  920px): columns — **Reference** (13px/500 tabular), **Status** (chip),
  **Priority** (chip), **Zone** (code), **Route** ("{pickup} → {dropoff}",
  truncates, max 200px), **Package** ("{size} · {weight}kg"), **SLA** (chip; "—"
  for terminal statuses), **Deadline** (right-aligned, tabular, relative; danger
  color when breached & not terminal), **Driver** (avatar + first name, or
  "Unassigned"), and a trailing **actions** column (kebab menu, appears on row
  hover) → Open detail / Recommend drivers (if `ready`) / Reassign / Export /
  Cancel (danger, disabled for terminal). Whole row is clickable + keyboard
  focusable (Enter opens detail).
- **Pagination**: footer with "Showing X–Y of N" (tabular) + Prev / page x of y
  / Next.
- **States** (all four must exist):
  - **Loading**: 8 skeleton rows matching the column rhythm.
  - **Empty**: centered `inbox` icon, "No deliveries match these filters" +
    guidance + "Clear filters" secondary button.
  - **Error**: centered `alert` icon (danger tint), message about a 503 +
    "Retry" button.
  - **Data**: the table above. Page size = 8.

### 4. Delivery detail + Recommendation panel (`delivery-detail.jsx`) ⭐
- **Purpose**: inspect a delivery, run/inspect driver recommendations, assign a
  driver, advance status; review the audit trail.
- **Layout**: `max-w-1280`, p-6.
  - **Status control bar** (card, full width): leading 38×38 primary-tint
    `package` square, then reference (18px/600 tabular) + **delivery status
    chip** + **priority chip**, with a "{zone} · created {relative}" subline.
    Right side: an SLA block (`clock` + "Deadline" + relative time + SLA chip)
    for non-terminal deliveries, and **transition buttons** (dispatcher/admin):
    one per allowed transition (see Lifecycle) — forward transitions = primary,
    `cancelled`/`failed` = danger, `ready` (unassign) = secondary; labels like
    "Mark Picked up", "Mark Delivered", "Cancel". Viewers see a "Read-only" chip.
  - **Main grid** (`xl`: 2fr / 1fr): left = Delivery details + Recommendation
    panel; right = Audit timeline (sticky on `xl`).
- **Delivery details card**: 2-col info grid of rows (icon + 28px-wide muted
  label + value): Pickup, Dropoff, Zone | Package, Priority, Deadline. Below, a
  **route estimate** strip: `route` icon (info tint) + Distance + Est. duration
  (both 15px/600 tabular) + a success "ORS · cached" chip. (If the maps adapter
  degrades, show a warning chip "estimated/unavailable" instead — see spec §7.)
- **Recommendation panel** (the centerpiece):
  - Header: `sparkles` (primary) + "Driver recommendations" + a neutral chip
    "{eligible} eligible · {n} not". "Re-run" secondary button (dispatcher/admin)
    re-triggers the loading state.
  - **Weights legend** bar (`--color-surface-alt`): the six factors with their
    weights — Zone fit **0.30**, Route proximity **0.25**, Remaining capacity
    **0.15**, Workload balance **0.15**, Deadline fit **0.10**, Priority fit
    **0.05**. (Weights come from the run's `inputSnapshot` in the real API.)
  - **Eligible candidate cards** (sorted by rank):
    - Border `--color-border`; **top pick (rank 1)** gets a primary border +
      ring and a "Top pick" chip; an assigned card gets a success border +
      "Assigned" chip.
    - Row: rank square (26×26; primary filled for rank 1, else surface-alt),
      avatar (36), name (13.5px/600) + chips, meta line ("{vehicle} · {plate} ·
      {zoneCode} · {active}/{max} jobs"), a large **score chip** (see Score
      chips) with "SCORE" caption, an **Assign** button (primary; only when
      delivery is `ready` and role can act; disabled "Assigned" once chosen),
      and an expand chevron (rotates 180° when open).
    - **Collapsed**: a compact factor strip — 6 mini bars (one per factor,
      colored by the factor's normalized value) with the factor icon.
    - **Expanded** (`FactorBreakdown`): a bordered table with columns
      **Factor / Normalized value (bar + 0.00) / Weight (×0.00) / Points
      (+0.0)**, one row per factor with a human-readable **reason** line beneath,
      and a footer "Weighted total = {score} / 100". Points = `rawValue ×
      weight × 100`; the score = sum of points, rounded.
  - **Ineligible drivers** section: collapsible ("Ineligible drivers (n) — shown
    with reasons"); each is a `--color-surface-alt` card with avatar, name,
    vehicle, an **"Ineligible"** danger-outline chip, and a bulleted reason list
    (each with a danger `x` icon). Reasons map from the API `ineligibleReasons`.
  - **No-run state**: if a delivery has no recommendation run (or isn't `ready`),
    show an empty state with `sparkles` and a CTA.
- **Assign flow**: clicking Assign opens a **confirm modal** (driver + vehicle +
  reference, plus the score/rank), noting eligibility is re-validated server-side
  and the action is audited. Confirming → delivery becomes `assigned`, the
  candidate shows "Assigned", a success **toast** appears, and two audit entries
  are prepended (`assignment.created`, `delivery.status: ready → assigned`).
- **Audit timeline card**: vertical timeline (connector line), each entry =
  tinted round icon (by action) + action label + reason + "{actor} · {role} ·
  {relative time}". Newest first. Actions: created / geocoded / status / run /
  assignment.

### 5. Drivers list (`drivers.jsx` → `DriversScreen`)
- **Purpose**: scan the fleet, availability, workload, capacity.
- **Layout**: `max-w-1200`, p-6. Toolbar (search + availability select) + table.
- **Table** columns: **Driver** (avatar + name + phone), **Availability** (chip),
  **Base zone**, **Vehicle** ("{type} · {plate}"), **Workload** (bar +
  "{active}/{max}"; tone red at max, warning >0.6, else success), **Capacity
  used** (bar + "%"; warning >0.85), trailing chevron. Rows clickable → driver
  detail. Loading = skeleton rows.

### 6. Driver detail (`drivers.jsx` → `DriverDetailScreen`)
- **Layout**: `max-w-1100`, p-6.
  - Top grid (`lg`: 1fr / 2fr): **Profile card** (56px avatar, name, availability
    chip, info rows: phone / base zone / vehicle / joined; "Assign delivery"
    secondary button for dispatcher/admin) + **Workload & capacity card** (4
    stat boxes: Active jobs, Completed, On-time rate, Avg. score; then two
    labeled meters — job slots, vehicle weight capacity).
  - **Assignment history** table: Reference / Status (active=info, completed=
    success) / When (relative) / Note. Rows link to the delivery.

### 7. Admin (`admin.jsx`)
- **Purpose**: manage users/roles, zones, vehicle types (admin only; others see
  a restricted banner and no edit actions).
- **Layout**: `max-w-1100`, p-6. A tabbed card: **Users & roles / Zones /
  Vehicle types** (underline-active tabs with count badges), a description row +
  contextual "add" primary button (admin only), then a table per tab.
  - **Users**: avatar + name / email / role chip (admin=primary, dispatcher=
    info, driver=success, viewer=neutral) / status chip / last active / kebab
    (Edit / Change role / Disable).
  - **Zones**: zone (map-tint icon + name) / code chip / center (lat,lng
    tabular) / deliveries count / based-driver count / kebab.
  - **Vehicle types**: type / weight cap / volume cap / use-case note / in-fleet
    count / kebab.

---

## Interactions & Behavior

- **Navigation**: client-side router. Sidebar nav + row clicks set the route;
  breadcrumbs/back return to the parent list. Content region scrolls to top on
  navigation. (In the app, use the router already in `frontend/`.)
- **Hover**: rows → `--color-surface-alt` (or `--tint-primary` on table rows);
  primary buttons darken to `--color-primary-hover`; kebab actions fade in on
  row hover.
- **Expand/collapse**: candidate factor breakdown (chevron rotates 180°, body
  fades in ~0.18s); ineligible section; admin tabs.
- **Assign**: confirm modal → optimistic status change + toast (auto-dismiss
  ~2.6s) + audit prepend. In the app, call `POST /deliveries/:id/assignments`
  and invalidate the relevant queries; surface the server's `409` business-rule
  error inline if eligibility fails at assignment time.
- **Status transitions**: only allowed transitions are offered (see Lifecycle);
  illegal ones must be rejected (`409`) server-side.
- **Loading / empty / error**: every async surface has all three. Skeletons use
  a shimmer animation; respect `prefers-reduced-motion` (the prototype disables
  animation under it).
- **Keyboard / a11y**: visible focus rings everywhere (`:focus-visible` →
  primary outline; inputs/buttons get a `--color-focus-ring` ring). Table rows
  are focusable and Enter-activatable. Maintain WCAG AA contrast. Menus close on
  outside click / Escape.
- **Animations**: content fade-in 0.18s ease-out; chevrons 0.18s; meters
  width-transition. Nothing flashy or looping.

---

## State Management

Prototype uses local React state with mock data. In the app, replace with
**TanStack Query + Orval hooks**:

- **Auth/role**: from the JWT (login response). Drives nav visibility + action
  gating. (Prototype: a top-bar role switcher; remove or make admin-only/debug.)
- **Route**: `{ name, params }` → use the app router.
- **Lists** (deliveries, drivers, users, zones, vehicle types): query hooks;
  filters/pagination as query params (spec §9 paginated envelope, offset).
- **Delivery detail**: delivery query + `GET /deliveries/:id/recommendations`
  (returns ranked candidates w/ explanation + persists a `RecommendationRun`) +
  audit query.
- **Mutations**: assign (`POST /deliveries/:id/assignments`), status changes;
  invalidate affected queries; map `400 details` to inline field errors and
  `409` to business-rule messages.

---

## Design Tokens

Reproduce exactly (source: `docs/context/ui-context.md`). Define once as CSS
custom properties (see `prototype/tokens.css`).

### Colors
| Token | Hex | Use |
|---|---|---|
| `--color-bg` | `#f7f8fa` | app background |
| `--color-surface` | `#ffffff` | cards, panels, table surface |
| `--color-surface-alt` | `#f1f3f5` | zebra rows, subtle fills |
| `--color-border` | `#e2e6ea` | hairline borders |
| `--color-text` | `#1f2933` | primary text |
| `--color-text-muted` | `#66707a` | secondary text |
| `--color-primary` | `#2563eb` | primary action / accent |
| `--color-primary-hover` | `#1d4ed8` | primary hover |
| `--color-focus-ring` | `#93c5fd` | focus ring |
| `--color-success` | `#16a34a` | delivered, available, on-track |
| `--color-warning` | `#d97706` | SLA at-risk, busy |
| `--color-danger` | `#dc2626` | failed, breached, ineligible |
| `--color-info` | `#0891b2` | ready, in-transit, informational |
| `--color-neutral` | `#6b7280` | draft, inactive |

**Status tints** (chip/fill backgrounds; ~12% tints precomputed in the
prototype): success `#e7f6ec`, warning `#fcefdc`, danger `#fbe7e7`, info
`#def0f3`, neutral `#eef0f2`, primary `#e6effe`. (Or derive at runtime with a
color-mix / alpha.)

### Status → tone mapping
- **Delivery status**: draft→neutral, ready→info, assigned→primary,
  picked_up→info, in_transit→info, delivered→success, failed→danger,
  cancelled→neutral.
- **Driver availability**: available→success, busy→warning,
  offline/inactive→neutral.
- **SLA**: on-track→success, at-risk→warning, breached→danger.
  (Prototype heuristic: breached = past deadline; at-risk = < 90 min to
  deadline; else on-track. Use your real SLA logic.)
- **Score chips**: ≥80→success, 50–79→warning, <50→neutral, ineligible→danger
  **outline**.

### Typography
- System UI font stack (no web font): `-apple-system, BlinkMacSystemFont,
  "Segoe UI", Roboto, Helvetica, Arial, sans-serif`.
- Base body **14px**. Scale: 12 / 13 / 14 / 16 / 20 / 28px.
- Numeric/data uses `font-variant-numeric: tabular-nums` (the prototype's
  `.tnum` class) — references, weights, scores, counts, deadlines, lat/lng.

### Spacing (4px base)
4 / 8 / 12 / 16 / 24 / 32px (Tailwind 1/2/3/4/6/8).

### Radius
sm **4** (chips' inner, small controls) · md **8** (cards, inputs, buttons) ·
lg **12** (cards/panels) · full **9999** (chips/badges/avatars).

### Elevation
Borders + a single subtle shadow: `--shadow-card: 0 1px 2px rgba(16,24,40,.06)`.
A slightly stronger `--shadow-pop` is used for menus/modals/toasts:
`0 4px 16px rgba(16,24,40,.10), 0 1px 2px rgba(16,24,40,.06)`. Avoid heavier
shadows, gradients, skeuomorphism.

### Tailwind wiring (recommended)
Map tokens into `tailwind.config` so utilities resolve to the CSS vars, e.g.:
```js
theme: { extend: {
  colors: {
    bg: 'var(--color-bg)', surface: 'var(--color-surface)',
    'surface-alt': 'var(--color-surface-alt)', border: 'var(--color-border)',
    primary: 'var(--color-primary)', 'primary-hover': 'var(--color-primary-hover)',
    success: 'var(--color-success)', warning: 'var(--color-warning)',
    danger: 'var(--color-danger)', info: 'var(--color-info)', neutral: 'var(--color-neutral)',
  },
  borderColor: { DEFAULT: 'var(--color-border)' },
}}
```
(The prototype loads Tailwind via CDN with this exact config inline in
`logidash.html` — do **not** ship the CDN build; use your installed Tailwind.)

---

## Delivery Lifecycle (transitions — anything else = 409)

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
`assigned` is reached via the assign flow, not a bare button. Who may change
status: admin/dispatcher = any allowed transition; driver = only their own
active assignment along `assigned→picked_up→in_transit→delivered|failed`;
viewer = none.

---

## Recommendation scoring (reference)

Two-stage, deterministic, explainable (spec §7):
- **Eligibility (hard filters)**: driver `available`; has an `active`,
  type-compatible vehicle with remaining capacity ≥ package needs;
  `activeJobCount < maxConcurrentJobs`; delivery is `ready`. Ineligible drivers
  are returned (not dropped) with `ineligibleReasons`.
- **Score (0–100)** = Σ `rawValue_i × weight_i × 100`, factors/weights: zoneFit
  .30, routeProximity .25, remainingCapacity .15, workloadBalance .15,
  deadlineFit .10, priorityFit .05. Each factor returns a normalized 0–1 value +
  a human-readable reason. `routeProximity`/`deadlineFit` use ORS distance/
  duration (base zone → pickup) via the maps adapter, cached as `RouteEstimate`;
  degrade gracefully to zone-based proximity and flag it if ORS is unavailable.

---

## Icons

The prototype hand-rolls a lucide-style set (`icons.jsx`, 24×24, stroke 1.75,
round caps). **In the app, use `lucide-react`.** Names used (lucide
equivalents): layout-dashboard, package, truck, users, map, settings, search,
filter, chevron-down/right/left, check, x, triangle-alert, clock, map-pin, bell,
log-out, plus, arrow-right, arrow-up-right, route, gauge, scale, layers, user,
phone, calendar, sparkles, inbox, refresh-cw, more-horizontal, eye, shield-check,
activity, target, flag, grip-vertical, download, minus.

Factor → icon: zoneFit→map-pin, routeProximity→route, remainingCapacity→scale,
workloadBalance→activity, deadlineFit→clock, priorityFit→flag.

---

## Assets

None external. Avatars are initials on a deterministic color (hash of id/name
→ palette). No logos or images beyond CSS/SVG icons. (The Vite starter's
`hero.png` / `react.svg` / `vite.svg` are unused by this design.)

---

## Files (in `prototype/`)

| File | Contents |
|---|---|
| `logidash.html` | Entry: loads tokens, Tailwind (CDN) + config, React/Babel, and all scripts. |
| `tokens.css` | All design tokens as CSS custom properties + base/util styles. |
| `data.js` | **Mock data only** — shape reference for zones/vehicles/drivers/deliveries/recommendation run/audit/users. Replace with real API/types. |
| `icons.jsx` | Inline line-icon set → replace with `lucide-react`. |
| `ui.jsx` | Primitives: Chip/StatusChip/ScoreChip, Button, Card, Avatar, Skeleton, EmptyState, ErrorState, Field/Input/Select, Meter, Toast, Menu; tone maps + time/SLA helpers. |
| `shell.jsx` | Sidebar + TopBar + nav/role config. |
| `login.jsx` | Login screen. |
| `dashboard.jsx` | Dashboard. |
| `deliveries.jsx` | Deliveries queue (+ all states). |
| `delivery-detail.jsx` | Delivery detail + recommendation panel + assign modal + audit timeline. |
| `drivers.jsx` | Drivers list + driver detail. |
| `admin.jsx` | Admin tabs. |

To run the prototype as-is: open `logidash.html` in a browser (needs network for
the CDN scripts). It logs in with one-click demo accounts.

---

## Implementation suggestions

1. Land the **tokens** + Tailwind wiring + base primitives (Chip/Button/Card/
   Skeleton/EmptyState/Field/Menu/Toast) first — every screen depends on them.
2. Build the **app shell** (sidebar/top bar/router) + role gating.
3. Wire the **Orval client / TanStack Query**, then build screens in order of
   value: Deliveries queue → **Delivery detail + recommendation panel** (the
   signature feature) → Dashboard → Drivers → Admin → Login.
4. For each async surface, implement loading/empty/error from day one.
5. Keep `data.js` only as a shape reference; delete once real types are wired.
