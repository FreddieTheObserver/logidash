# Phase 8 Slice 1 — Foundations + Auth Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans (inline, chosen by the user) or superpowers:subagent-driven-development to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Stand up the `apps/web` foundation — Tailwind 4 + design tokens, a hand-built typed primitive library, TanStack Query + auth providers, a role-aware router with guards, the command-center shell, and a real login screen — so a user can sign in against `/v1/auth/login`, land in a role-filtered authenticated shell, navigate, and sign out.

**Architecture:** React 19 + Vite SPA. Server state via the generated `@logidash/api-client` (TanStack Query hooks + the existing axios mutator that already does bearer-attach + silent refresh). Auth/session state in a React context fed by `GET /v1/auth/me`; role drives nav + route guards (UX only — the server is the authorization boundary). Styling via Tailwind 4 with the `--color-*` palette defined in `@theme` and the remaining tokens as plain CSS. Components ported 1:1 from `design_handoff_command_center/prototype/` (cited per task) with typed props, `lucide-react` icons, and token classes.

**Tech Stack:** React 19, TypeScript 6 (strict, `verbatimModuleSyntax`, `erasableSyntaxOnly`), Vite 8, Tailwind 4 (`@tailwindcss/vite`), React Router v7, TanStack Query 5, lucide-react, Vitest + React Testing Library + jsdom.

**Spec:** `docs/superpowers/specs/2026-06-13-phase-8-slice-1-foundations-auth-design.md`

**Conventions for every task:**

- All type-only imports MUST use `import type { … }` (`verbatimModuleSyntax`).
- There is no implicit `React` namespace (automatic JSX runtime). A file that uses `React.ReactNode`/`React.ButtonHTMLAttributes`/etc. must `import type React from 'react'`; alternatively use named type imports (`import type { ReactNode } from 'react'`). The code samples below assume the `import type React from 'react'` form where they write `React.*`.
- The prototype files cited per task (`design_handoff_command_center/prototype/*.jsx`) are complete, in-repo reference code — "port lines X–Y" means transcribe that exact structure with the typed-prop / `ICONS` / token-class changes named in the step. They are references, not placeholders.
- No enums / parameter-properties / namespaces (`erasableSyntaxOnly`); use string-literal unions + plain objects.
- No unused locals/params (`noUnusedLocals`/`noUnusedParameters`).
- No raw hex in components — only token classes (`bg-surface`, `text-primary`, …) or inline `var(--token)`. Hex lives only in `styles/` and the `Avatar` hash palette.
- Per-task commit. Verify with `pnpm --filter @logidash/web lint:check` and (where types changed) `pnpm --filter @logidash/web build` before committing.
- Prototype reference files are in `design_handoff_command_center/prototype/`: `tokens.css`, `ui.jsx`, `shell.jsx`, `login.jsx`, `icons.jsx`. They are the visual source of truth; port their structure, do not copy their CDN/`window.*` plumbing.

---

## Task 1: Dependencies, Tailwind 4, and design tokens

**Files:**

- Modify: `apps/web/package.json` (deps)
- Modify: `apps/web/vite.config.ts`
- Create: `apps/web/src/styles/tailwind.css`
- Create: `apps/web/src/styles/base.css`

- [ ] **Step 1: Install runtime + styling deps**

Run:

```bash
pnpm --filter @logidash/web add react-router-dom@^7 lucide-react@^0.x
pnpm --filter @logidash/web add -D tailwindcss@^4 @tailwindcss/vite@^4
```

(Use the latest published `lucide-react` `^0` minor.)

- [ ] **Step 2: Add the Tailwind Vite plugin**

`apps/web/vite.config.ts`:

```ts
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';

// https://vite.dev/config/
export default defineConfig({
  plugins: [react(), tailwindcss()],
});
```

- [ ] **Step 3: Tailwind entry + `@theme` color tokens**

Create `apps/web/src/styles/tailwind.css`:

```css
@import 'tailwindcss';

@theme {
  --color-bg: #f7f8fa;
  --color-surface: #ffffff;
  --color-surface-alt: #f1f3f5;
  --color-border: #e2e6ea;
  --color-text: #1f2933;
  --color-text-muted: #66707a;
  --color-primary: #2563eb;
  --color-primary-hover: #1d4ed8;
  --color-focus-ring: #93c5fd;
  --color-success: #16a34a;
  --color-warning: #d97706;
  --color-danger: #dc2626;
  --color-info: #0891b2;
  --color-neutral: #6b7280;
}
```

- [ ] **Step 4: Non-utility tokens + base/util styles**

Create `apps/web/src/styles/base.css` — port verbatim from `prototype/tokens.css` lines 21–97 (the status `--tint-*`, `--shadow-*`, `--radius-*`, `--font-*` on `:root`; `html/body/#root` height; `body` reset; `* { box-sizing }`; `.tnum`; `.scroll-thin`; `:focus-visible` + `.ring-focus`; `.skeleton` shimmer; `.animate-fade`; `prefers-reduced-motion`). Do **not** redeclare the `--color-*` vars here (they come from `@theme`). Set `body { background: var(--color-bg); color: var(--color-text); font-family: var(--font-ui); font-size: 14px; }`.

- [ ] **Step 5: Verify the build picks up Tailwind**

(Wiring of these CSS files into `main.tsx` happens in Task 15; for now just confirm install + config typecheck.)
Run: `pnpm --filter @logidash/web build`
Expected: PASS (the existing placeholder app still builds; Tailwind plugin loads).

- [ ] **Step 6: Commit**

```bash
git add apps/web/package.json apps/web/vite.config.ts apps/web/src/styles pnpm-lock.yaml
git commit -m "build(web): add Tailwind 4, router, lucide deps + design tokens"
```

---

## Task 2: Vitest + React Testing Library harness

**Files:**

- Modify: `apps/web/package.json` (devDeps + `test` script)
- Create: `apps/web/vitest.config.ts`
- Create: `apps/web/vitest.setup.ts`
- Modify: `apps/web/tsconfig.app.json` (exclude tests from the build typecheck)

- [ ] **Step 1: Install test deps**

```bash
pnpm --filter @logidash/web add -D vitest@^3 jsdom @testing-library/react @testing-library/jest-dom @testing-library/user-event
```

- [ ] **Step 2: Vitest config**

Create `apps/web/vitest.config.ts`:

```ts
import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  test: {
    globals: true,
    environment: 'jsdom',
    setupFiles: ['./vitest.setup.ts'],
    css: false,
    include: ['src/**/*.test.{ts,tsx}'],
  },
});
```

- [ ] **Step 3: Setup file**

Create `apps/web/vitest.setup.ts`:

```ts
import '@testing-library/jest-dom/vitest';
```

- [ ] **Step 4: Keep tests out of the production typecheck**

In `apps/web/tsconfig.app.json` add (sibling to `"include"`):

```json
"exclude": ["src/**/*.test.ts", "src/**/*.test.tsx"]
```

- [ ] **Step 5: Add the `test` script**

In `apps/web/package.json` `scripts`, add:

```json
"test": "vitest run",
"test:watch": "vitest"
```

- [ ] **Step 6: Smoke the harness with a trivial test**

Create `apps/web/src/_harness.test.ts`:

```ts
it('runs vitest', () => {
  expect(1 + 1).toBe(2);
});
```

Run: `pnpm --filter @logidash/web test`
Expected: 1 passing. Then delete `src/_harness.test.ts`.

- [ ] **Step 7: Commit**

```bash
git add apps/web/package.json apps/web/vitest.config.ts apps/web/vitest.setup.ts apps/web/tsconfig.app.json pnpm-lock.yaml
git commit -m "test(web): add vitest + RTL harness"
```

---

## Task 3: Time/SLA helpers (`lib/format.ts`)

**Files:**

- Create: `apps/web/src/lib/format.ts`
- Test: `apps/web/src/lib/format.test.ts`

Port from `prototype/ui.jsx` lines 34–58, but compute against a caller-supplied `now` (default `Date.now()`) instead of the frozen `DB.now`.

- [ ] **Step 1: Write the failing test**

`apps/web/src/lib/format.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { fromNow, deadlineState } from './format';

const NOW = new Date('2026-06-13T12:00:00Z').getTime();
const at = (minFromNow: number) =>
  new Date(NOW + minFromNow * 60_000).toISOString();

describe('fromNow', () => {
  it('formats past and future', () => {
    expect(fromNow(at(0), NOW)).toBe('now');
    expect(fromNow(at(-5), NOW)).toBe('5m ago');
    expect(fromNow(at(-150), NOW)).toBe('2h 30m ago');
    expect(fromNow(at(90), NOW)).toBe('in 1h 30m');
    expect(fromNow(at(60 * 24 * 2), NOW)).toBe('in 2d');
  });
});

describe('deadlineState', () => {
  it('classifies breached / at-risk / on-track', () => {
    expect(deadlineState(at(-1), NOW)).toBe('breached');
    expect(deadlineState(at(30), NOW)).toBe('at-risk');
    expect(deadlineState(at(200), NOW)).toBe('on-track');
  });
});
```

- [ ] **Step 2: Run → fail**

Run: `pnpm --filter @logidash/web test`
Expected: FAIL (module not found).

- [ ] **Step 3: Implement**

`apps/web/src/lib/format.ts`:

```ts
export type DeadlineState = 'on-track' | 'at-risk' | 'breached';

export function fromNow(iso: string, now: number = Date.now()): string {
  const diff = new Date(iso).getTime() - now;
  const abs = Math.abs(diff);
  const m = Math.round(abs / 60_000);
  if (m < 1) return 'now';
  const h = Math.floor(m / 60);
  const mm = m % 60;
  let s: string;
  if (h < 1) s = `${m}m`;
  else if (h < 24) s = mm ? `${h}h ${mm}m` : `${h}h`;
  else s = `${Math.floor(h / 24)}d`;
  return diff < 0 ? `${s} ago` : `in ${s}`;
}

export function deadlineState(
  iso: string,
  now: number = Date.now(),
): DeadlineState {
  const diff = new Date(iso).getTime() - now;
  if (diff < 0) return 'breached';
  if (diff < 90 * 60_000) return 'at-risk';
  return 'on-track';
}
```

- [ ] **Step 4: Run → pass**

Run: `pnpm --filter @logidash/web test`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add apps/web/src/lib/format.ts apps/web/src/lib/format.test.ts
git commit -m "feat(web): time/SLA formatting helpers"
```

---

## Task 4: Tone maps + score tone (`lib/tone.ts`)

**Files:**

- Create: `apps/web/src/lib/tone.ts`
- Test: `apps/web/src/lib/tone.test.ts`

Port the maps from `prototype/ui.jsx` lines 8–32 + 57–58. Key the maps to the generated DTO unions where they exist.

- [ ] **Step 1: Write the failing test**

`apps/web/src/lib/tone.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { DELIVERY_TONE, DELIVERY_LABEL, scoreTone, SLA_TONE } from './tone';

describe('tone maps', () => {
  it('maps delivery status to tone + label', () => {
    expect(DELIVERY_TONE.assigned).toBe('primary');
    expect(DELIVERY_TONE.delivered).toBe('success');
    expect(DELIVERY_LABEL.in_transit).toBe('In transit');
  });
  it('maps score to tone', () => {
    expect(scoreTone(85)).toBe('success');
    expect(scoreTone(60)).toBe('warning');
    expect(scoreTone(20)).toBe('neutral');
  });
  it('maps SLA state to tone', () => {
    expect(SLA_TONE.breached).toBe('danger');
  });
});
```

- [ ] **Step 2: Run → fail**

Run: `pnpm --filter @logidash/web test`
Expected: FAIL.

- [ ] **Step 3: Implement**

`apps/web/src/lib/tone.ts`:

```ts
import type {
  DeliveryDtoStatus,
  DriverDtoAvailability,
  DeliveryDtoPriority,
} from '@logidash/api-client';
import type { DeadlineState } from './format';

export type Tone =
  | 'success'
  | 'warning'
  | 'danger'
  | 'info'
  | 'neutral'
  | 'primary';

export const DELIVERY_TONE: Record<DeliveryDtoStatus, Tone> = {
  draft: 'neutral',
  ready: 'info',
  assigned: 'primary',
  picked_up: 'info',
  in_transit: 'info',
  delivered: 'success',
  failed: 'danger',
  cancelled: 'neutral',
};

export const DELIVERY_LABEL: Record<DeliveryDtoStatus, string> = {
  draft: 'Draft',
  ready: 'Ready',
  assigned: 'Assigned',
  picked_up: 'Picked up',
  in_transit: 'In transit',
  delivered: 'Delivered',
  failed: 'Failed',
  cancelled: 'Cancelled',
};

export const AVAIL_TONE: Record<DriverDtoAvailability, Tone> = {
  available: 'success',
  busy: 'warning',
  offline: 'neutral',
};

export const PRIORITY_TONE: Record<DeliveryDtoPriority, Tone> = {
  low: 'neutral',
  normal: 'info',
  high: 'warning',
  urgent: 'danger',
};

export const SLA_TONE: Record<DeadlineState, Tone> = {
  'on-track': 'success',
  'at-risk': 'warning',
  breached: 'danger',
};

export const SLA_LABEL: Record<DeadlineState, string> = {
  'on-track': 'On track',
  'at-risk': 'At risk',
  breached: 'Breached',
};

export function scoreTone(score: number): Tone {
  if (score >= 80) return 'success';
  if (score >= 50) return 'warning';
  return 'neutral';
}
```

> NOTE: verify the exact members of `DriverDtoAvailability` / `DeliveryDtoPriority` against `packages/api-client/src/generated/model/` before committing; adjust the `Record` keys to match (the union must be exhaustive or `Record` will error — a good thing).

- [ ] **Step 4: Run → pass**

Run: `pnpm --filter @logidash/web test`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add apps/web/src/lib/tone.ts apps/web/src/lib/tone.test.ts
git commit -m "feat(web): status/SLA/score tone maps"
```

---

## Task 5: Icon map (`components/ui/icons.ts`)

**Files:**

- Create: `apps/web/src/components/ui/icons.ts`

A typed name→component map so the rest of the app references stable names (mirrors how the prototype used `icons.jsx`). Names come from spec §6.

- [ ] **Step 1: Implement**

`apps/web/src/components/ui/icons.ts`:

```ts
import {
  LayoutDashboard,
  Package,
  Truck,
  Users,
  Map,
  Settings,
  Search,
  Filter,
  ChevronDown,
  ChevronRight,
  ChevronLeft,
  Check,
  X,
  TriangleAlert,
  Clock,
  MapPin,
  Bell,
  LogOut,
  Plus,
  ArrowRight,
  ArrowUpRight,
  Route,
  Gauge,
  Scale,
  Layers,
  User,
  Phone,
  Calendar,
  Sparkles,
  Inbox,
  RefreshCw,
  MoreHorizontal,
  Eye,
  ShieldCheck,
  Activity,
  Target,
  Flag,
  Download,
  Minus,
  type LucideIcon,
} from 'lucide-react';

export const ICONS = {
  dashboard: LayoutDashboard,
  package: Package,
  truck: Truck,
  users: Users,
  map: Map,
  settings: Settings,
  search: Search,
  filter: Filter,
  chevronDown: ChevronDown,
  chevronRight: ChevronRight,
  chevronLeft: ChevronLeft,
  check: Check,
  x: X,
  alert: TriangleAlert,
  clock: Clock,
  mapPin: MapPin,
  bell: Bell,
  logout: LogOut,
  plus: Plus,
  arrowRight: ArrowRight,
  arrowUpRight: ArrowUpRight,
  route: Route,
  gauge: Gauge,
  scale: Scale,
  layers: Layers,
  user: User,
  phone: Phone,
  calendar: Calendar,
  sparkles: Sparkles,
  inbox: Inbox,
  refresh: RefreshCw,
  more: MoreHorizontal,
  eye: Eye,
  shield: ShieldCheck,
  activity: Activity,
  target: Target,
  flag: Flag,
  download: Download,
  minus: Minus,
} satisfies Record<string, LucideIcon>;

export type IconName = keyof typeof ICONS;
```

- [ ] **Step 2: Verify lint/build**

Run: `pnpm --filter @logidash/web lint:check`
Expected: PASS (no unused — every import is used in the map).

- [ ] **Step 3: Commit**

```bash
git add apps/web/src/components/ui/icons.ts
git commit -m "feat(web): lucide icon name map"
```

---

## Task 6: Primitives A — Chip family, ScoreChip, Avatar

**Files:**

- Create: `apps/web/src/components/ui/Chip.tsx` (Chip + Status/Availability/Priority/Sla/Score chips)
- Create: `apps/web/src/components/ui/Avatar.tsx`

Port from `prototype/ui.jsx` lines 60–111 (chips) and 160–172 (Avatar). Replace `window.UI.TONE`/`Icon` with `lib/tone.ts` + `ICONS`. The `TONE` lookup uses inline `var(--color-*)` / `var(--tint-*)`.

- [ ] **Step 1: Implement Chip.tsx**

Define a local `TONE` map `Record<Tone, { fg: string; bg: string }>` using `var(--color-x)` / `var(--tint-x)` strings (port from `ui.jsx` 8–15). Then:

- `Chip({ tone='neutral', dot?, outline?, size?, className?, children })` — port lines 61–75 to typed props (`tone: Tone`, `size: 'sm' | 'md'`).
- `StatusChip({ status }: { status: DeliveryDtoStatus })` → `<Chip tone={DELIVERY_TONE[status]} dot>{DELIVERY_LABEL[status]}</Chip>`.
- `AvailabilityChip({ value }: { value: DriverDtoAvailability })` → capitalize label, `AVAIL_TONE`.
- `PriorityChip({ value }: { value: DeliveryDtoPriority })` → capitalize, `PRIORITY_TONE`.
- `SlaChip({ iso, now? }: { iso: string; now?: number })` → `deadlineState(iso, now)` → `SLA_TONE` + `SLA_LABEL`.
- `ScoreChip({ score, eligible=true, size='md' }: { score: number; eligible?: boolean; size?: 'md' | 'lg' })` — port lines 93–111 (ineligible → danger outline "Ineligible").

Use `import type` for all DTO/tone types. Use `ICONS` only where the prototype rendered an icon inside a chip (chips themselves take icon children from callers, so no internal icon needed here).

- [ ] **Step 2: Implement Avatar.tsx**

Port lines 160–172: deterministic palette (the `AV_COLORS` hex array is an allowed exception), `Avatar({ initials, name?, id?, size=32 })`, `aria-hidden`.

- [ ] **Step 3: Test the conditional logic**

Create `apps/web/src/components/ui/Chip.test.tsx`:

```tsx
import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { ScoreChip, StatusChip } from './Chip';

describe('chips', () => {
  it('shows Ineligible when not eligible', () => {
    render(<ScoreChip score={0} eligible={false} />);
    expect(screen.getByText('Ineligible')).toBeInTheDocument();
  });
  it('labels delivery status', () => {
    render(<StatusChip status="in_transit" />);
    expect(screen.getByText('In transit')).toBeInTheDocument();
  });
});
```

Run: `pnpm --filter @logidash/web test` → PASS.

- [ ] **Step 4: Lint + commit**

```bash
git add apps/web/src/components/ui/Chip.tsx apps/web/src/components/ui/Chip.test.tsx apps/web/src/components/ui/Avatar.tsx
git commit -m "feat(web): chip family + avatar primitives"
```

---

## Task 7: Primitives B — Button, Card, Skeleton, Meter, EmptyState, ErrorState

**Files:**

- Create: `apps/web/src/components/ui/Button.tsx`
- Create: `apps/web/src/components/ui/Card.tsx`
- Create: `apps/web/src/components/ui/Skeleton.tsx`
- Create: `apps/web/src/components/ui/Meter.tsx`
- Create: `apps/web/src/components/ui/EmptyState.tsx`
- Create: `apps/web/src/components/ui/ErrorState.tsx`

Port from `prototype/ui.jsx`: Button 113–148, Card 150–158, Skeleton 174–177, Meter 250–258, EmptyState 179–192, ErrorState 194–207.

- [ ] **Step 1: Button.tsx**

`Button({ variant='secondary', size='md', icon?, iconRight?, children, className?, disabled?, ...rest }: ButtonProps)`. `ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement>` plus `variant: 'primary'|'secondary'|'ghost'|'danger'`, `size: 'sm'|'md'|'lg'`, `icon?: IconName`, `iconRight?: IconName`. Render icons via `ICONS[icon]`. Keep the prototype's primary hover via `onMouseEnter/Leave` setting `var(--color-primary-hover)`. Tailwind classes (`bg-surface`, `hover:bg-surface-alt`, `border`) resolve from `@theme`.

- [ ] **Step 2: Card / Skeleton / Meter**

- `Card({ children, className?, style?, ...rest })` — `bg-surface border rounded-lg`, `boxShadow: var(--shadow-card)`.
- `Skeleton({ w='100%', h=12, className?, style? })` — `.skeleton` class.
- `Meter({ value, tone='primary', height=6 }: { value: number; tone?: Tone; height?: number })` — track `var(--color-surface-alt)`, fill `TONE[tone].fg`, `width: max(2, value*100)%`. (Export the shared `TONE` from `Chip.tsx` or a small `lib/tone.ts` addition to avoid duplication — DRY: move the `TONE` object into `lib/tone.ts` and import it in both `Chip.tsx` and `Meter.tsx`.)

> DRY note: put the `TONE: Record<Tone,{fg:string;bg:string}>` map in `lib/tone.ts` (alongside the other maps) and import it wherever needed. Update Task 6 Chip.tsx to import it rather than redefining.

- [ ] **Step 3: EmptyState / ErrorState**

- `EmptyState({ icon='inbox', title, body?, action? }: { icon?: IconName; title: string; body?: string; action?: React.ReactNode })`.
- `ErrorState({ title='Couldn't load this view', body?, onRetry? })` — renders a `Button variant="secondary" icon="refresh"` when `onRetry` is set.

- [ ] **Step 4: Lint/build + commit**

Run: `pnpm --filter @logidash/web lint:check`

```bash
git add apps/web/src/components/ui/Button.tsx apps/web/src/components/ui/Card.tsx apps/web/src/components/ui/Skeleton.tsx apps/web/src/components/ui/Meter.tsx apps/web/src/components/ui/EmptyState.tsx apps/web/src/components/ui/ErrorState.tsx apps/web/src/lib/tone.ts apps/web/src/components/ui/Chip.tsx
git commit -m "feat(web): button/card/skeleton/meter/empty/error primitives"
```

---

## Task 8: Primitives C — Field, Input, Select, Toast, Menu

**Files:**

- Create: `apps/web/src/components/ui/Field.tsx` (Field + Input + Select)
- Create: `apps/web/src/components/ui/Toast.tsx`
- Create: `apps/web/src/components/ui/Menu.tsx` (Menu + MenuItem)

Port from `prototype/ui.jsx`: Field 209–222, Input 224–232, Select 234–248, Toast 260–275, Menu 277–298, MenuItem 299–307.

- [ ] **Step 1: Field/Input/Select**

- `Field({ label, hint?, error?, required?, children })` — label above, error slot with `ICONS.alert` in danger.
- `Input(props: React.InputHTMLAttributes<HTMLInputElement> & { invalid?: boolean })` — `.ring-focus`, danger border when `invalid`.
- `Select({ children, ...rest }: React.SelectHTMLAttributes<HTMLSelectElement>)` — chevron overlay via `ICONS.chevronDown`.

- [ ] **Step 2: Toast**

`Toast({ toast }: { toast: ToastData | null })` where `ToastData = { message: string; tone?: Tone; icon?: IconName }`. Fixed bottom-center, `var(--shadow-pop)`.

- [ ] **Step 3: Menu/MenuItem (a11y: outside-click + Escape)**

Port the prototype's outside-click effect AND add Escape-to-close (spec §7 / handoff Interactions). `Menu({ trigger, children, align='right' }: { trigger: React.ReactElement; children: React.ReactNode; align?: 'left'|'right' })`. `MenuItem({ icon?, children, danger?, onClick?, disabled? })`.

> The trigger is cloned with `onClick`/`aria-expanded`. Type it as `React.ReactElement<React.HTMLAttributes<HTMLElement>>` so `cloneElement` typechecks.

- [ ] **Step 4: Test Menu Escape-close**

`apps/web/src/components/ui/Menu.test.tsx`:

```tsx
import { it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { Menu, MenuItem } from './Menu';

it('opens on trigger and closes on Escape', async () => {
  const user = userEvent.setup();
  render(
    <Menu trigger={<button>Open</button>}>
      <MenuItem>Item</MenuItem>
    </Menu>,
  );
  await user.click(screen.getByText('Open'));
  expect(screen.getByText('Item')).toBeInTheDocument();
  await user.keyboard('{Escape}');
  expect(screen.queryByText('Item')).not.toBeInTheDocument();
});
```

Run: `pnpm --filter @logidash/web test` → PASS.

- [ ] **Step 5: Lint + commit**

```bash
git add apps/web/src/components/ui/Field.tsx apps/web/src/components/ui/Toast.tsx apps/web/src/components/ui/Menu.tsx apps/web/src/components/ui/Menu.test.tsx
git commit -m "feat(web): field/input/select/toast/menu primitives"
```

---

## Task 9: Query client + session-expiry wiring

**Files:**

- Create: `apps/web/src/lib/queryClient.ts`
- Modify: `apps/web/src/lib/api.ts`

- [ ] **Step 1: Query client**

`apps/web/src/lib/queryClient.ts`:

```ts
import { QueryClient } from '@tanstack/react-query';

export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 30_000,
      retry: 1,
      refetchOnWindowFocus: false,
    },
  },
});
```

- [ ] **Step 2: Wire `onSessionExpired` → hard redirect to /login**

Replace `apps/web/src/lib/api.ts` body with:

```ts
import { configureHttpClient } from '@logidash/api-client';

// Configure the shared API client once, at module load, before any
// generated hook can fire.
configureHttpClient({
  baseURL: import.meta.env.VITE_API_URL ?? 'http://localhost:3000',
  // Fired only after a silent refresh fails (tokens already cleared by the
  // client). A hard navigation guarantees a clean state reset and shows the
  // login route. /auth/* requests are excluded from retry, so this never
  // loops on the login page itself.
  onSessionExpired: () => {
    if (window.location.pathname !== '/login') {
      window.location.assign('/login');
    }
  },
});

// Compile-time proof the app consumes generated contract types only.
export type { DeliveryDto, ZoneDto } from '@logidash/api-client';
```

- [ ] **Step 3: Verify build**

Run: `pnpm --filter @logidash/web build`
Expected: PASS.

- [ ] **Step 4: Commit**

```bash
git add apps/web/src/lib/queryClient.ts apps/web/src/lib/api.ts
git commit -m "feat(web): query client + session-expiry redirect"
```

---

## Task 10: Auth context + provider

**Files:**

- Create: `apps/web/src/app/auth/auth-context.ts` (context object + `useAuth` hook — no component, to satisfy `react-refresh/only-export-components`)
- Create: `apps/web/src/app/auth/AuthProvider.tsx` (the provider component)

- [ ] **Step 1: Context + hook**

`apps/web/src/app/auth/auth-context.ts`:

```ts
import { createContext, useContext } from 'react';
import type { AuthUserDto } from '@logidash/api-client';

export type AuthStatus = 'loading' | 'authenticated' | 'unauthenticated';

export interface AuthContextValue {
  user: AuthUserDto | null;
  status: AuthStatus;
  /** Re-resolve /auth/me after a successful login. */
  refresh: () => Promise<void>;
  /** Best-effort logout + token clear + redirect handled by caller. */
  signOut: () => void;
}

export const AuthContext = createContext<AuthContextValue | null>(null);

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within <AuthProvider>');
  return ctx;
}
```

- [ ] **Step 2: Provider**

`apps/web/src/app/auth/AuthProvider.tsx`:

```tsx
import { useCallback } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import {
  useAuthMe,
  getAuthMeQueryKey,
  authLogout,
  getTokens,
  clearTokens,
} from '@logidash/api-client';
import { AuthContext, type AuthStatus } from './auth-context';

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const qc = useQueryClient();
  const hasToken = getTokens() !== null;

  const me = useAuthMe({
    query: { enabled: hasToken, retry: false, staleTime: 5 * 60_000 },
  });

  const status: AuthStatus = !hasToken
    ? 'unauthenticated'
    : me.isPending
      ? 'loading'
      : me.isSuccess
        ? 'authenticated'
        : 'unauthenticated';

  const refresh = useCallback(async () => {
    await qc.invalidateQueries({ queryKey: getAuthMeQueryKey() });
  }, [qc]);

  const signOut = useCallback(() => {
    const tokens = getTokens();
    if (tokens) {
      void authLogout({ refreshToken: tokens.refreshToken }).catch(() => {});
    }
    clearTokens();
    qc.clear();
    window.location.assign('/login');
  }, [qc]);

  return (
    <AuthContext.Provider
      value={{ user: me.data ?? null, status, refresh, signOut }}
    >
      {children}
    </AuthContext.Provider>
  );
}
```

> NOTE: confirm `LogoutDto` is `{ refreshToken: string }` from the generated model; adjust the `authLogout` arg if the field name differs.

- [ ] **Step 3: Verify build**

Run: `pnpm --filter @logidash/web build`
Expected: PASS.

- [ ] **Step 4: Commit**

```bash
git add apps/web/src/app/auth/auth-context.ts apps/web/src/app/auth/AuthProvider.tsx
git commit -m "feat(web): auth context + provider (/auth/me)"
```

---

## Task 11: `useLogin` hook

**Files:**

- Create: `apps/web/src/app/auth/useLogin.ts`
- Test: `apps/web/src/app/auth/useLogin.test.tsx`

- [ ] **Step 1: Write the failing test**

`apps/web/src/app/auth/useLogin.test.tsx`:

```tsx
import { describe, it, expect, vi, beforeEach } from 'vitest';

const setTokens = vi.fn();
const authLogin = vi.fn();
vi.mock('@logidash/api-client', () => ({
  authLogin: (...a: unknown[]) => authLogin(...a),
  setTokens: (...a: unknown[]) => setTokens(...a),
}));

import { errorMessageFor } from './useLogin';

describe('errorMessageFor', () => {
  beforeEach(() => vi.clearAllMocks());
  it('maps statuses to friendly copy', () => {
    expect(errorMessageFor(401)).toMatch(/invalid email or password/i);
    expect(errorMessageFor(403)).toMatch(/disabled/i);
    expect(errorMessageFor(500)).toMatch(/something went wrong/i);
    expect(errorMessageFor(undefined)).toMatch(/something went wrong/i);
  });
});
```

- [ ] **Step 2: Run → fail**

Run: `pnpm --filter @logidash/web test`
Expected: FAIL.

- [ ] **Step 3: Implement**

`apps/web/src/app/auth/useLogin.ts`:

```ts
import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { authLogin, setTokens } from '@logidash/api-client';
import type { LoginDto } from '@logidash/api-client';
import { useAuth } from './auth-context';

export function errorMessageFor(status: number | undefined): string {
  if (status === 401) return 'Invalid email or password.';
  if (status === 403) return 'This account is disabled.';
  return 'Something went wrong. Please try again.';
}

interface AxiosLikeError {
  response?: { status?: number };
}

export function useLogin() {
  const navigate = useNavigate();
  const { refresh } = useAuth();
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function login(credentials: LoginDto) {
    setPending(true);
    setError(null);
    try {
      const tokens = await authLogin(credentials);
      setTokens({
        accessToken: tokens.accessToken,
        refreshToken: tokens.refreshToken,
      });
      await refresh();
      navigate('/', { replace: true });
    } catch (err) {
      const status = (err as AxiosLikeError).response?.status;
      setError(errorMessageFor(status));
      setPending(false);
    }
  }

  return { login, pending, error };
}
```

- [ ] **Step 4: Run → pass**

Run: `pnpm --filter @logidash/web test`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add apps/web/src/app/auth/useLogin.ts apps/web/src/app/auth/useLogin.test.tsx
git commit -m "feat(web): useLogin hook + error mapping"
```

---

## Task 12: Login page

**Files:**

- Create: `apps/web/src/features/auth/LoginPage.tsx`
- Create: `apps/web/src/features/auth/demo-accounts.ts`
- Test: `apps/web/src/features/auth/LoginPage.test.tsx`

Port the layout from `prototype/login.jsx` (two-column form + brand panel, demo grid, mini scorecard). Swap the mock `DB.demoAccounts`/`onLogin` for `useLogin` calling the real API, and replace hand-rolled icons with `ICONS`.

- [ ] **Step 1: Demo accounts (real seeded creds)**

`apps/web/src/features/auth/demo-accounts.ts`:

```ts
import type { IconName } from '../../components/ui/icons';

export interface DemoAccount {
  role: 'admin' | 'dispatcher' | 'driver' | 'viewer';
  name: string;
  email: string;
  icon: IconName;
}

export const DEMO_PASSWORD = 'Demo123!';

export const DEMO_ACCOUNTS: DemoAccount[] = [
  { role: 'admin', name: 'Admin', email: 'admin@logidash.dev', icon: 'shield' },
  {
    role: 'dispatcher',
    name: 'Dispatcher',
    email: 'dispatcher@logidash.dev',
    icon: 'route',
  },
  {
    role: 'driver',
    name: 'Alex (driver)',
    email: 'driver.alex@logidash.dev',
    icon: 'truck',
  },
  { role: 'viewer', name: 'Viewer', email: 'viewer@logidash.dev', icon: 'eye' },
];
```

- [ ] **Step 2: LoginPage**

Port `prototype/login.jsx` structure. Use local `useState` for `email`/`password`/`touched`. Validation: `emailErr` (regex `/^[^@\s]+@[^@\s]+\.[^@\s]+$/`), `pwErr` (`length < 6`), shown after `touched`. On submit → `login({ email, password })`. Demo buttons → `login({ email: acct.email, password: DEMO_PASSWORD })`. Show `error` from `useLogin` inline above the form (danger text + `ICONS.alert`). Submit button shows "Signing in…" while `pending`. Brand panel: env chip, "Explainable dispatch" chip, the 22px statement, and the static mini-scorecard (the four factor rows — illustrative, hardcoded as in the prototype). Inert "Remember me" + "Forgot?" (logged as future work in the spec).

- [ ] **Step 3: Test (mock useLogin)**

`apps/web/src/features/auth/LoginPage.test.tsx`:

```tsx
import { it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

const login = vi.fn();
vi.mock('../../app/auth/useLogin', () => ({
  useLogin: () => ({ login, pending: false, error: null }),
}));

import { LoginPage } from './LoginPage';

it('validates then submits credentials', async () => {
  const user = userEvent.setup();
  render(<LoginPage />);
  await user.click(screen.getByRole('button', { name: /sign in/i }));
  expect(screen.getByText(/valid work email/i)).toBeInTheDocument();
  await user.type(screen.getByLabelText(/work email/i), 'admin@logidash.dev');
  await user.type(screen.getByLabelText(/password/i), 'Demo123!');
  await user.click(screen.getByRole('button', { name: /sign in/i }));
  expect(login).toHaveBeenCalledWith({
    email: 'admin@logidash.dev',
    password: 'Demo123!',
  });
});
```

> The `Field` label must be associated with its input (the prototype wraps the input in the `<label>`), so `getByLabelText` resolves. Confirm `Field` renders a real `<label>` wrapping `children` (it does, per the port).

Run: `pnpm --filter @logidash/web test` → PASS.

- [ ] **Step 4: Lint + commit**

```bash
git add apps/web/src/features/auth/LoginPage.tsx apps/web/src/features/auth/demo-accounts.ts apps/web/src/features/auth/LoginPage.test.tsx
git commit -m "feat(web): login page + demo accounts (real auth)"
```

---

## Task 13: App shell — Sidebar, TopBar, AppShell

**Files:**

- Create: `apps/web/src/components/shell/nav.ts` (NAV config + role labels)
- Create: `apps/web/src/components/shell/Sidebar.tsx`
- Create: `apps/web/src/components/shell/TopBar.tsx`
- Create: `apps/web/src/components/shell/AppShell.tsx`

Port from `prototype/shell.jsx`. Drive the active item from the router location (`useLocation`/`NavLink`), role from `useAuth().user.role`. **No count badges** (spec §2). Replace the role **switcher** with a read-only role chip. Notifications bell is a static no-op (no dot). (Built before the router because `router.tsx` imports `AppShell`; the shell only depends on react-router-dom primitives + `useAuth`, both already in place.)

- [ ] **Step 1: nav.ts**

```ts
import type { Role } from '@logidash/api-client';
import type { IconName } from '../ui/icons';

export interface NavItem {
  to: string;
  label: string;
  icon: IconName;
  roles: Role[];
}

export const NAV: NavItem[] = [
  {
    to: '/',
    label: 'Dashboard',
    icon: 'dashboard',
    roles: ['admin', 'dispatcher', 'driver', 'viewer'],
  },
  {
    to: '/deliveries',
    label: 'Deliveries',
    icon: 'package',
    roles: ['admin', 'dispatcher', 'driver', 'viewer'],
  },
  {
    to: '/drivers',
    label: 'Drivers',
    icon: 'users',
    roles: ['admin', 'dispatcher', 'viewer'],
  },
  { to: '/admin', label: 'Admin', icon: 'settings', roles: ['admin'] },
];

export const ROLE_LABEL: Record<Role, string> = {
  admin: 'Admin',
  dispatcher: 'Dispatcher',
  driver: 'Driver',
  viewer: 'Viewer',
};
```

- [ ] **Step 2: Sidebar**

Port `shell.jsx` 43–79: 232px aside, brand row (`ICONS.route` square + wordmark), "OPERATIONS" label, nav items filtered by `role`, recommendation-engine footer card. Use `NavLink` with `aria-current`; active style = `text-primary` + `bg-[color:var(--tint-primary)]`. **Omit the count badge** prop entirely.

- [ ] **Step 3: TopBar**

Port `shell.jsx` 81–141 minus the switcher menu: title/subtitle/breadcrumb (props), "Staging" env `Chip tone="warning"` (gate on `import.meta.env.VITE_ENV ?? 'Staging'`), a **read-only** role chip (`ICONS.shield` + "Viewing as: {ROLE_LABEL[role]}", no menu), a static notifications bell button (no dot), and the user `Menu` (name/email header + Profile/Preferences `MenuItem` stubs + a divider + `Sign out` danger item calling `useAuth().signOut`). Title/breadcrumb come from props (the shell can derive a default title from the route for now).

- [ ] **Step 4: AppShell**

Port `shell.jsx` overall layout: full-viewport flex, `Sidebar` + a right column of `TopBar` over a `<main className="flex-1 overflow-y-auto scroll-thin">` rendering `<Outlet/>`. Derive `role` + `user` from `useAuth()`; map the current path to a default title (e.g. via the `NAV` label) for the TopBar.

- [ ] **Step 5: Lint/build + commit**

Run: `pnpm --filter @logidash/web lint:check` && `pnpm --filter @logidash/web build`

```bash
git add apps/web/src/components/shell
git commit -m "feat(web): command-center app shell (sidebar + top bar)"
```

---

## Task 14: Router, guards, providers

**Files:**

- Create: `apps/web/src/routes/RouteStub.tsx`
- Create: `apps/web/src/routes/ProtectedRoute.tsx`
- Test: `apps/web/src/routes/ProtectedRoute.test.tsx`
- Create: `apps/web/src/routes/router.tsx`
- Create: `apps/web/src/app/AppProviders.tsx`

- [ ] **Step 1: RouteStub**

`apps/web/src/routes/RouteStub.tsx` — a screen placeholder using `EmptyState`:

```tsx
import { EmptyState } from '../components/ui/EmptyState';

export function RouteStub({ title, slice }: { title: string; slice: string }) {
  return (
    <div className="mx-auto max-w-[1200px] p-6">
      <EmptyState
        icon="sparkles"
        title={title}
        body={`Coming soon — lands in Phase 8 ${slice}.`}
      />
    </div>
  );
}
```

- [ ] **Step 2: ProtectedRoute (auth + role gate + splash)**

`apps/web/src/routes/ProtectedRoute.tsx`:

```tsx
import { Navigate, Outlet } from 'react-router-dom';
import type { Role } from '@logidash/api-client';
import { useAuth } from '../app/auth/auth-context';

export function ProtectedRoute({ allowedRoles }: { allowedRoles?: Role[] }) {
  const { status, user } = useAuth();

  if (status === 'loading') {
    return (
      <div className="flex min-h-screen items-center justify-center text-[13px] text-[color:var(--color-text-muted)]">
        Loading…
      </div>
    );
  }
  if (status === 'unauthenticated' || !user) {
    return <Navigate to="/login" replace />;
  }
  if (allowedRoles && !allowedRoles.includes(user.role)) {
    return <Navigate to="/" replace />;
  }
  return <Outlet />;
}
```

> Confirm `Role` is exported and is the union `'admin'|'dispatcher'|'driver'|'viewer'` (from `model/role.ts`).

- [ ] **Step 3: Guard test**

`apps/web/src/routes/ProtectedRoute.test.tsx`:

```tsx
import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MemoryRouter, Routes, Route } from 'react-router-dom';
import type { AuthContextValue } from '../app/auth/auth-context';

let mockAuth: AuthContextValue;
vi.mock('../app/auth/auth-context', () => ({
  useAuth: () => mockAuth,
}));

import { ProtectedRoute } from './ProtectedRoute';

function setup(auth: Partial<AuthContextValue>, path = '/admin') {
  mockAuth = {
    user: null,
    status: 'authenticated',
    refresh: vi.fn(),
    signOut: vi.fn(),
    ...auth,
  } as AuthContextValue;
  return render(
    <MemoryRouter initialEntries={[path]}>
      <Routes>
        <Route element={<ProtectedRoute allowedRoles={['admin']} />}>
          <Route path="/admin" element={<div>Admin area</div>} />
        </Route>
        <Route path="/login" element={<div>Login</div>} />
        <Route path="/" element={<div>Home</div>} />
      </Routes>
    </MemoryRouter>,
  );
}

describe('ProtectedRoute', () => {
  it('redirects unauthenticated users to login', () => {
    setup({ status: 'unauthenticated', user: null });
    expect(screen.getByText('Login')).toBeInTheDocument();
  });
  it('redirects wrong-role users home', () => {
    setup({
      status: 'authenticated',
      user: { id: '1', email: 'd@x', name: 'D', role: 'dispatcher' },
    });
    expect(screen.getByText('Home')).toBeInTheDocument();
  });
  it('renders the route for an allowed role', () => {
    setup({
      status: 'authenticated',
      user: { id: '1', email: 'a@x', name: 'A', role: 'admin' },
    });
    expect(screen.getByText('Admin area')).toBeInTheDocument();
  });
});
```

Run: `pnpm --filter @logidash/web test` → PASS.

- [ ] **Step 4: Router**

`apps/web/src/routes/router.tsx` — `createBrowserRouter` with `/login` (public; if authenticated redirect to `/`), and a protected branch rendering `AppShell` (Task 13) with nested `index` (Dashboard stub), `deliveries`, `drivers` (allowedRoles admin/dispatcher/viewer), `admin` (allowedRoles admin), and a `*` → `<Navigate to="/" />`. Each stub: `<RouteStub title="Dashboard" slice="Slice 3" />` etc. (deliveries → Slice 2; drivers/admin → Slice 3). For the `/login` "already authenticated" redirect, create a tiny `PublicOnly` wrapper using `useAuth` (authenticated → `<Navigate to="/" replace/>`, else `<LoginPage/>`).

- [ ] **Step 5: AppProviders**

`apps/web/src/app/AppProviders.tsx`:

```tsx
import { QueryClientProvider } from '@tanstack/react-query';
import { queryClient } from '../lib/queryClient';
import { AuthProvider } from './auth/AuthProvider';

export function AppProviders({ children }: { children: React.ReactNode }) {
  return (
    <QueryClientProvider client={queryClient}>
      <AuthProvider>{children}</AuthProvider>
    </QueryClientProvider>
  );
}
```

- [ ] **Step 6: Lint/build + commit**

Run: `pnpm --filter @logidash/web lint:check` (note: `router.tsx` mixing the `PublicOnly` component + route config may trip `react-refresh/only-export-components`; if so, move `PublicOnly` into its own file `routes/PublicOnly.tsx`).

```bash
git add apps/web/src/routes apps/web/src/app/AppProviders.tsx
git commit -m "feat(web): router, role guards, app providers"
```

---

## Task 15: Mount the app + full verification

**Files:**

- Modify: `apps/web/src/main.tsx`
- Delete: `apps/web/src/App.tsx`, `apps/web/src/index.css`

- [ ] **Step 1: main.tsx**

```tsx
import './lib/api';
import './styles/tailwind.css';
import './styles/base.css';
import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { RouterProvider } from 'react-router-dom';
import { AppProviders } from './app/AppProviders';
import { router } from './routes/router';

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <AppProviders>
      <RouterProvider router={router} />
    </AppProviders>
  </StrictMode>,
);
```

- [ ] **Step 2: Remove placeholders**

Delete `apps/web/src/App.tsx` and `apps/web/src/index.css` (their content is superseded by the shell + token styles).

- [ ] **Step 3: Full static verification**

Run, expecting all green:

```bash
pnpm --filter @logidash/web lint:check
pnpm --filter @logidash/web build
pnpm --filter @logidash/web test
```

- [ ] **Step 4: Manual smoke (against a booted API)**

Boot the API + Postgres per the local-run recipe (Postgres on 5433, `pnpm --filter @logidash/api db:seed`, API on :3000, `JWT_SECRET` ≥32 chars). Set `apps/web/.env` `VITE_API_URL=http://localhost:3000`. `pnpm --filter @logidash/web dev`, then:

- Sign in via the **dispatcher** demo button → lands on `/` shell; nav shows Dashboard/Deliveries/Drivers (no Admin).
- Sign in as **admin** → Admin nav present; visiting `/admin` renders the stub.
- As **viewer**, manually visit `/admin` → redirected to `/`.
- Bad password in the form → "Invalid email or password." inline.
- Sign out → back at `/login`; revisiting `/` redirects to `/login`.

- [ ] **Step 5: Commit**

```bash
git add apps/web/src/main.tsx
git rm apps/web/src/App.tsx apps/web/src/index.css
git commit -m "feat(web): mount router + providers; remove scaffold placeholders"
```

---

## Task 16: Docs sync

**Files:**

- Modify: `docs/context/progress-tracker.md`
- Modify (if refined): `docs/context/architecture.md`, `docs/context/ui-context.md`

- [ ] **Step 1: Update the tracker**

Add a Phase 8 Slice 1 entry under "Current Phase"/"Completed" summarizing what shipped (tokens+Tailwind 4, primitives, providers, router/guards, shell, login), the verification results (lint/build/test counts), the branch name, and the trimmed gaps. Move the "Current Goal"/"Next Up" to **Phase 8 Slice 2 — Critical flow**.

- [ ] **Step 2: Sync architecture/ui-context if conventions were refined**

Note the concrete frontend conventions introduced (Tailwind 4 `@theme` token wiring; `components/ui` primitive library; `app/auth` context; `routes/` guard pattern) where `architecture.md`/`ui-context.md` describe the FE structure, if they add detail beyond what's there.

- [ ] **Step 3: Commit**

```bash
git add docs/context/progress-tracker.md docs/context/architecture.md docs/context/ui-context.md
git commit -m "docs(phase-8): sync tracker + context after Slice 1"
```

---

## Acceptance (slice "done when")

- Sign in via the form **and** each demo button works against the running API; role-filtered nav is correct.
- Disallowed direct route → redirect; unauthenticated protected route → `/login`; sign-out + forced expiry both return to `/login`.
- `lint:check`, `build`, and the Vitest suite are all green.
- Per-task commits on `phase-8-slice-1-foundations-auth`; tracker updated.
