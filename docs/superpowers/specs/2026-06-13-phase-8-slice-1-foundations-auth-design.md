# Phase 8 — Frontend Command Center, Slice 1: Foundations + Auth — Design Spec

**Date:** 2026-06-13
**Status:** Approved (brainstorm complete; pending implementation plan)
**Scope:** Stand up the web app's foundation — design tokens + Tailwind 4
wiring, the hand-built UI primitive library, app providers (TanStack Query +
auth), a role-aware router with guards, the command-center app shell
(sidebar + top bar), and the login screen — consuming only the generated
`@logidash/api-client`. Delivers a working, navigable, authenticated skeleton
that every later Phase 8 screen slots into. **Frontend only**; no backend or
contract changes.

---

## 1. Context & motivation

Phases 1–7 delivered a contract-first backend and a generated TanStack Query
client (`@logidash/api-client`). Phase 7 deliberately stopped at "web
type-checks against generated types"; the web app (`apps/web`) is still the
Vite starter (`App.tsx` renders a placeholder). Phase 8 is the first real UI
consumption of the hooks.

Per the approved Phase 8 plan, the work is split into **3 vertical slices**:

1. **Foundations + Auth** (this spec) — tokens, primitives, providers,
   router + guards, app shell, login.
2. **Critical flow** — Deliveries queue → Delivery detail + recommendation
   panel + assign + status (the phase's "Done when" path).
3. **Secondary** — Dashboard, Drivers list/detail, Admin.

This slice owns everything every later screen depends on, so it is built
first. The design reference is `design_handoff_command_center/` (README is
authoritative for layout/UX; `prototype/` is a faithful but non-production
HTML/React reference). Where the prototype and `docs/context/ui-context.md`
disagree, **`ui-context.md` wins**.

## 2. Goal & non-goals

**Goal:** A user can sign in against the real `/v1/auth/login` (including
one-click seeded demo accounts), land in an authenticated, role-aware
command-center shell, navigate between routed areas, and sign out. A failed
silent refresh redirects cleanly to login. The shell, primitives, tokens,
router, and auth context are production-shaped so Slices 2–3 only add screen
bodies.

**Non-goals (deferred to later slices / phases):**

- The real Dashboard, Deliveries, Delivery detail, Drivers, and Admin screens
  (Slices 2–3). This slice renders **routed stubs** for them.
- Nav **count badges** (open deliveries / available drivers) — deferred to the
  slices that own those screens, to keep list-querying out of the foundation.
- Any backend or OpenAPI/Orval change. Gaps between the prototype and the API
  contract are **trimmed on the frontend** and logged (§9), not closed in the
  backend.

## 3. Approach decisions (locked)

These were confirmed during brainstorming:

- **Delivery strategy:** vertical slices; this is Slice 1, its own
  spec → plan → execute, with a checkpoint at the slice boundary.
- **API-gap policy:** frontend-only — render exactly what the contract
  supports; gracefully omit/trim un-backed elements and log them as future
  backend work.
- **Styling stack:** **Tailwind 4** + CSS-custom-property tokens; **hand-built
  primitives** (no shadcn/ui). This diverges from the implementation-plan's
  literal "Tailwind + shadcn/ui" text; the divergence is intentional (the
  prototype's primitives are small and bespoke, and the handoff warns
  components must consume the tokens, not a library theme).
- **Execution:** auto-implement, per-task commits, verify each task, pause at
  the slice boundary for review.

Additional decisions made in this spec (defaults, not blockers):

- **Router:** React Router v7 (`createBrowserRouter`, route objects), matching
  the `routes/` boundary in `architecture.md`.
- **Auth/role source:** the authenticated JWT. An `AuthProvider` resolves the
  current user via `GET /v1/auth/me`; `role` drives nav visibility + route
  guards. The frontend gating is **UX only** — the server remains the
  authorization boundary (invariant 1).
- **Demo role switcher → read-only role display.** The prototype's top-bar
  switcher swaps a _mock_ identity, which cannot work against real JWTs. It is
  replaced by a read-only "Viewing as: {Role}" chip. Demo role-switching
  happens by signing in as a different seeded account on the login page.
- **State:** server state via TanStack Query + generated hooks; auth/session
  via React context; UI-only state via `useState`. **No Zustand** in this
  slice.

## 4. File layout (`apps/web/src/`)

```
main.tsx                     mount <AppProviders><RouterProvider/></AppProviders>
lib/
  api.ts                     (exists) configureHttpClient — add onSessionExpired
  queryClient.ts             QueryClient (sane defaults: retry, staleTime)
  format.ts                  pure helpers: fromNow, deadlineState, scoreTone
  tone.ts                    tone maps (delivery/availability/priority/SLA → tone)
app/
  AppProviders.tsx           QueryClientProvider + AuthProvider
  auth/
    AuthContext.tsx          context type + provider + useAuth() hook
    useLogin.ts              wraps useAuthLogin: setTokens → prime /me → navigate
components/
  ui/                        Chip, StatusChip, AvailabilityChip, PriorityChip,
                             SlaChip, ScoreChip, Button, Card, Avatar, Skeleton,
                             EmptyState, ErrorState, Field, Input, Select, Meter,
                             Toast, Menu, MenuItem  (one file each or grouped)
  ui/icons.ts                lucide-react re-export map (name → component)
  shell/
    Sidebar.tsx  TopBar.tsx  AppShell.tsx
features/
  auth/LoginPage.tsx         login screen + demo accounts
routes/
  router.tsx                 createBrowserRouter: /login (public) + protected shell
  ProtectedRoute.tsx         redirect to /login if unauthenticated; role gate
  RouteStub.tsx              EmptyState "Coming soon" placeholder for §7
styles/
  tailwind.css               @import "tailwindcss" + @theme color tokens
  base.css                   tints/shadows/radii/fonts + util styles (.tnum,
                             focus-ring, .skeleton, .animate-fade, reduced-motion)
```

Existing `App.tsx` and the placeholder `index.css` are removed/absorbed.

## 5. Styling: Tailwind 4 + tokens

- Install `tailwindcss@^4` and `@tailwindcss/vite`; add the plugin to
  `vite.config.ts`. No `tailwind.config.js` is required for v4.
- **Color tokens live inside Tailwind's `@theme`.** Tailwind v4's color theme
  variables share the exact `--color-*` namespace the handoff already uses, so
  defining the palette in `@theme` does double duty: it generates the
  `bg-*`/`text-*`/`border-*` utilities **and** emits each as a real CSS custom
  property usable inline via `var(--color-x)`. Net effect: `bg-surface`,
  `bg-surface-alt`, `border`, `text-primary`, `hover:bg-surface-alt` etc.
  resolve as in the prototype, and inline `var(--color-primary)` still works.

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
    /* …success/warning/danger/info/neutral, focus-ring */
  }
  ```

- The **non-utility tokens** (status `--tint-*`, `--shadow-card`/`--shadow-pop`,
  `--radius-*`, `--font-*`) and the base/util styles (`.tnum`, focus-ring
  helpers, `.skeleton` shimmer, `.animate-fade`, the `prefers-reduced-motion`
  guard) are defined as plain CSS — carried over verbatim from
  `design_handoff_command_center/prototype/tokens.css` into a `styles/base.css`
  imported alongside.
- **Dynamic tones** (status/SLA/score tints, which vary per row) keep the
  prototype's inline `style={{ color: var(--color-x), background:
var(--tint-x) }}` pattern, fed by the tone maps in `lib/tone.ts`.
- **No raw hex** in components (code-standards §Styling). The only hex lives in
  `tokens.css` and the `Avatar` deterministic palette (carried over from the
  prototype as a documented exception, since it is a hashing palette, not a
  theme color).

## 6. UI primitives & helpers

Recreated 1:1 from `prototype/ui.jsx`, with three changes: typed props (no
`any`), `lucide-react` icons via a name map (replacing the hand-rolled
`icons.jsx`), and tokens via Tailwind/CSS-vars. Visual spec (sizes, radii,
focus rings, skeleton shimmer, reduced-motion) is matched.

| Primitive                                                                     | Notes                                                                                            |
| ----------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------ |
| `Chip` + `StatusChip`/`AvailabilityChip`/`PriorityChip`/`SlaChip`/`ScoreChip` | tone-driven; `StatusChip` keyed on `DeliveryDtoStatus`; `SlaChip`/`fromNow` consume `deadlineAt` |
| `Button`                                                                      | variants primary/secondary/ghost/danger; sizes sm/md/lg; icon/iconRight; disabled                |
| `Card`, `Avatar`, `Skeleton`, `Meter`                                         | as prototype                                                                                     |
| `EmptyState`, `ErrorState`                                                    | ErrorState takes `onRetry`                                                                       |
| `Field`, `Input`, `Select`                                                    | label-above, inline error slot (mapped from API `400 details` later)                             |
| `Toast`, `Menu`, `MenuItem`                                                   | Menu closes on outside-click + Escape (a11y)                                                     |

Helpers in `lib/format.ts` / `lib/tone.ts`: `fromNow(iso)`,
`deadlineState(iso)` → `on-track|at-risk|breached`, `scoreTone(score)`, and the
tone maps. **`fromNow`/`deadlineState` compute against the real current time
(`Date.now()`)**, not the prototype's frozen `DB.now`.

Icons used (lucide-react): LayoutDashboard, Package, Truck, Users, Map,
Settings, Search, Filter, ChevronDown/Right/Left, Check, X, TriangleAlert,
Clock, MapPin, Bell, LogOut, Plus, ArrowRight, ArrowUpRight, Route, Gauge,
Scale, Layers, User, Phone, Calendar, Sparkles, Inbox, RefreshCw,
MoreHorizontal, Eye, ShieldCheck, Activity, Target, Flag, Download, Minus.

## 7. App shell, router & guards

**Router (`routes/router.tsx`):**

- `/login` — public; renders `LoginPage`. If already authenticated, redirect
  to `/`.
- Protected branch — wrapped by `ProtectedRoute`, renders `AppShell` as the
  layout with nested routes:
  - `/` → Dashboard stub
  - `/deliveries` → Deliveries stub
  - `/drivers` → Drivers stub (role-gated: admin/dispatcher/viewer)
  - `/admin` → Admin stub (role-gated: admin only)
- Unknown path → redirect to `/`.

**`ProtectedRoute`:** if no current user (and no token to resolve one),
redirect to `/login`. While `/auth/me` is resolving on a cold load, render a
minimal full-screen splash (logo + spinner) — not the login page (avoids a
flash of login before the session resolves). If a route's `allowedRoles`
excludes the user's role, redirect to `/` (the nav already hides it; this is
defense-in-depth for direct URL entry).

**`AppShell`:** the three-region layout from the handoff — fixed 232px sidebar,
56px top bar, scrollable content (`max-w` per screen). Renders `<Outlet/>`.

- **Sidebar:** brand row, "OPERATIONS" section, nav items filtered by role
  (`NAV` array with a `roles` allow-list), the recommendation-engine footer
  card. **Nav count badges deferred** (§2). Active route highlighted.
- **TopBar:** breadcrumb/title slot (per-route via context or route handle),
  "Staging" env chip (from `import.meta.env`), **read-only role chip**,
  decorative no-op notifications bell (no unread dot — no notifications API),
  and the user menu (name/email + Profile/Preferences stubs + **Sign out**).
  Sign out calls `useAuthLogout` (best-effort), clears tokens, redirects to
  `/login`.

**Routed stubs (`RouteStub`):** each protected route renders an `EmptyState`
("Coming soon — lands in Slice 2/3") inside the shell, so nav, guards, role
filtering, and sign-out are fully exercisable now.

## 8. Auth flow

**Token plumbing already exists** in `@logidash/api-client`: the axios mutator
attaches the bearer token and does single-flight silent refresh on 401
(Phase 7). This slice adds the **UI layer** on top.

1. **Startup (`lib/api.ts`):** extend the existing `configureHttpClient` call
   with `onSessionExpired: () => { /* redirect to /login */ }`. Because the
   redirect needs the router, `onSessionExpired` sets a module-level flag /
   uses `window.location` or a small navigation bridge; the `AuthProvider`
   also clears its in-memory user on this event. (Plan will pick the cleanest
   wiring; `window.location.assign('/login')` is acceptable as it guarantees a
   clean state reset.)
2. **`AuthProvider`:** on mount, if `getTokens()` is non-null, run
   `useAuthMe()`. Expose `{ user, status: 'loading'|'authenticated'|
'unauthenticated', login, logout }`. A 401 that survives refresh →
   `onSessionExpired` → `unauthenticated`.
3. **Login (`useLogin`):** `useAuthLogin()` → on success `setTokens({
accessToken, refreshToken })` from `AuthTokensDto` → seed the `/auth/me`
   query (or invalidate so the provider refetches) → `navigate('/')`. On error,
   map by status: **401 → "Invalid email or password"**, **403 → "This account
   is disabled"**, network/5xx → a generic "Something went wrong, try again"
   message — surfaced inline above the form.
4. **Demo accounts:** the 2×2 grid one-click signs in with seeded creds
   (password `Demo123!`, the four role emails from the seed). These call the
   **real** `/v1/auth/login`.

**Login validation (client-side, pre-submit only):** email regex + password
≥ 6 chars, shown after blur/submit. This is UX nicety; the server is
authoritative.

## 9. Prototype-vs-contract gaps trimmed in this slice

Logged here as future backend work (frontend-only policy):

| Prototype element                       | Contract reality                 | Slice 1 handling                           |
| --------------------------------------- | -------------------------------- | ------------------------------------------ |
| Top-bar notifications bell + unread dot | No notifications endpoint        | Render bell as static, no-op; drop the dot |
| Nav count badges (open / available)     | Needs list queries               | Deferred to Slices 2–3                     |
| Top-bar role **switcher**               | Role is server-issued in the JWT | Read-only role chip; switch via login      |
| "Staging" env badge                     | Cosmetic                         | Kept; sourced from `import.meta.env`       |

(Other gaps — audit timeline, driver names for dispatchers, assigned-driver
column, route-estimate strip, driver-detail stats — belong to Slices 2–3 and
will be logged there.)

## 10. Testing

Establish the web test harness here: add `vitest`, `@testing-library/react`,
`@testing-library/jest-dom`, `jsdom`, and a `test` script to `apps/web`.

- **Pure helpers:** `fromNow`, `deadlineState`, `scoreTone`, tone maps —
  table-driven unit tests (deterministic; inject a fixed "now" where needed).
- **Guard logic:** `ProtectedRoute` redirects when unauthenticated and when
  role is disallowed; renders children when permitted (mocked auth context).
- **Login:** renders, shows validation after submit, calls the mutation with
  trimmed credentials, and surfaces a 401 as the friendly message (mocked
  `useAuthLogin`).

No real network in any test (consistent with backend testing rules).

## 11. Verification & "done when"

**Done when:**

- A user can sign in via the form **and** via each demo-account button against
  the running API, landing on the shell with the correct role-filtered nav.
- Direct navigation to a disallowed route (e.g. a viewer hitting `/admin`)
  redirects away; an unauthenticated hit on any protected route redirects to
  `/login`.
- Sign out clears the session and returns to `/login`; a forced session
  expiry (refresh failure) does the same.
- `pnpm --filter @logidash/web build`, `lint:check`, `tsc -b`, and the new
  Vitest suite are all green.

**Verification commands:** `pnpm --filter @logidash/web lint:check`,
`pnpm --filter @logidash/web build`, `pnpm --filter @logidash/web test`, plus a
manual smoke against a locally booted API (Postgres on 5433, seeded). API run
recipe per the local-run notes.

## 12. Commits & docs

- Branch `phase-8-slice-1-foundations-auth` from `main`; one commit per task.
- On completion, update `docs/context/progress-tracker.md` and — because this
  slice introduces frontend conventions (Tailwind 4 wiring, primitive library
  location, auth context, router/guards) — note them in
  `architecture.md`/`ui-context.md` if they refine what those docs say.

## 13. Out of scope / open questions

- Persisting the "Remember me" choice and a real "Forgot password" flow are
  out of scope (no endpoints). The checkbox + link render but are inert
  (logged as future work).
- Breadcrumb/title wiring mechanism (route `handle` vs. context) is an
  implementation detail for the plan; both satisfy the design.
