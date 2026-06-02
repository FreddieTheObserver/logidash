# UI Context

The frontend is a dispatcher **command center**: dense, operational, and
calm. It should read as a real internal logistics tool, not a marketing
site. This file defines the visual contract; components consume tokens, not
hardcoded values.

## Design reference (command center)

Screen-level layout, component structure, and interaction behavior are
specified in:

- `design_handoff_command_center/README.md` — authoritative for screens,
  shell, and UX (read before building UI)
- `design_handoff_command_center/prototype/` — interactive HTML/React
  prototype with mock data (reference only; open `prototype/logidash.html`
  in a browser)

**Precedence:** color tokens and typography in *this file* win over the
handoff if they disagree. Screen layout, spacing rhythm, and interactions in
the handoff README win over informal guesses. Implement in `frontend/` with
TanStack Query + Orval-generated types — do not copy `prototype/data.js` or
ship the prototype’s CDN Tailwind setup.

## Design Principles

- Operations-first: information density over whitespace drama; fast
  scanning of queues and statuses.
- Calm neutral surface with a single accent for primary actions and a small
  set of semantic status colors.
- Every async surface has explicit loading, empty, and error states.
- Keyboard- and screen-reader-friendly: visible focus, labeled controls,
  sufficient contrast (WCAG AA).
- Layout is a persistent left nav + top bar + scrollable content region.

## Layout

- App shell: fixed left sidebar (nav, role-aware), top bar (title, user
  menu, environment badge), main content area.
- Content max-width is fluid for tables/queues; detail pages use a two-column
  layout (primary content + side panel for metadata/audit).
- Primary screens: Dashboard, Deliveries (queue), Delivery detail, Drivers,
  Driver detail, Recommendations panel (within delivery detail), Admin.

## Color Tokens (CSS custom properties)

Defined as CSS variables (light theme baseline; dark theme is a stretch).
Never use raw hex in components — reference these tokens.

```
--color-bg            #f7f8fa   /* app background */
--color-surface       #ffffff   /* cards, panels, table surface */
--color-surface-alt   #f1f3f5   /* zebra rows, subtle fills */
--color-border        #e2e6ea
--color-text          #1f2933   /* primary text */
--color-text-muted    #66707a   /* secondary text */
--color-primary       #2563eb   /* primary action / accent */
--color-primary-hover #1d4ed8
--color-focus-ring    #93c5fd

/* Semantic / status */
--color-success       #16a34a   /* delivered, available */
--color-warning       #d97706   /* SLA risk, stale */
--color-danger        #dc2626   /* failed, error, over-capacity */
--color-info          #0891b2   /* in transit, informational */
--color-neutral       #6b7280   /* draft, inactive */
```

## Status Color Mapping

- Delivery status: `draft` → neutral, `ready` → info, `assigned` → primary,
  `picked_up` / `in_transit` → info, `delivered` → success,
  `failed` → danger, `cancelled` → neutral.
- Driver availability: `available` → success, `busy` → warning,
  `offline`/`inactive` → neutral.
- SLA: on-track → success, at-risk (near deadline) → warning,
  breached → danger.
- Recommendation score chips: high (≥80) → success, medium (50–79) →
  warning, low (<50) → neutral; ineligible candidates → danger outline.

## Typography

- System UI font stack (no web-font dependency for an internal tool).
- Scale: `--text-xs 12px`, `--text-sm 13px`, `--text-base 14px`,
  `--text-lg 16px`, `--text-xl 20px`, `--text-2xl 28px`.
- Base body is 14px (dense operational UI). Numeric/tabular data uses
  `font-variant-numeric: tabular-nums`.

## Spacing & Radius

- Spacing scale (4px base): `--space-1 4px`, `--space-2 8px`,
  `--space-3 12px`, `--space-4 16px`, `--space-6 24px`, `--space-8 32px`.
- Radius scale: `--radius-sm 4px`, `--radius-md 8px`, `--radius-lg 12px`,
  `--radius-full 9999px` (chips/badges). Use `--radius-md` for cards/inputs,
  `--radius-full` for status chips.
- Elevation: rely on borders + a single subtle shadow token
  `--shadow-card: 0 1px 2px rgba(16,24,40,.06)`.

## Component Conventions

- **Tables/queues**: sticky header, zebra rows (`--color-surface-alt`),
  row hover, status as a chip, right-aligned numeric columns, per-row
  actions in a trailing column. Always show empty + loading (skeleton)
  states.
- **Status chip**: `--radius-full`, semantic bg tint + readable text.
- **Buttons**: primary (filled accent), secondary (bordered), danger
  (filled danger) for destructive actions; disabled states are visible.
- **Recommendation card**: driver name + score chip + rank, then an
  expandable per-factor breakdown (distance, capacity, availability,
  workload, priority/deadline fit) with each factor's contribution.
- **Forms**: labels above inputs, inline field-level validation messages
  (mapped from the API `400 details`), disabled submit while pending.
- **Detail side panel**: metadata + audit timeline (actor, action, time,
  reason).

## Library Direction

UI primitives use a headless/utility approach (decided in
`docs/implementation-tools.md`). Whatever library is chosen, components must
still consume the tokens above rather than the library's hardcoded theme
defaults.
