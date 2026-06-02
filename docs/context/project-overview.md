# logidash — Logistics Dispatch API Platform

## Overview

logidash is a backend-first logistics dispatch platform. A dispatcher or
admin uses it to manage deliveries, drivers, vehicles, and zones, and to
assign the right driver to each delivery. The signature capability is a
scoring-based **driver recommendation engine**: for a given delivery the
backend ranks eligible drivers using vehicle compatibility, remaining
capacity, availability, current workload, delivery priority, deadline
urgency, zone fit, and OpenRouteService route/distance estimates, and
returns an explanation for every score.

The project is intended as a portfolio piece that demonstrates
production-style NestJS backend engineering: modular domain architecture,
contract-first OpenAPI design, role-based authorization, tested domain
services, a third-party routing integration, and an audit trail. A React +
TypeScript "command center" UI demonstrates the API like a real client,
consuming a type-safe client generated from the OpenAPI contract via Orval.

## Goals

1. Deliver a production-shaped NestJS API with clean module boundaries,
   strong validation, role-based access, and OpenAPI docs that a reviewer
   can read and exercise in minutes.
2. Implement an explainable, scoring-based driver recommendation engine
   with unit-tested scoring/eligibility logic.
3. Demonstrate a contract-first workflow end to end: NestJS → OpenAPI →
   Orval-generated typed frontend client + TanStack Query hooks.
4. Ship a polished React command-center UI that consumes only generated
   types (no hand-duplicated API interfaces).
5. Back the system with backend-heavy automated tests (service unit tests,
   API e2e tests, auth/role tests, mocked maps-adapter tests) and seed data.

## Core User Flow

1. A user signs in and receives a JWT; their role (admin, dispatcher,
   driver, viewer) determines what they can see and do.
2. A dispatcher creates a delivery with pickup/dropoff addresses, package
   requirements (size/weight/type), priority, and a deadline.
3. The dispatcher requests recommendations for that delivery; the backend
   returns ranked candidate drivers, each with a score and explanation.
4. The dispatcher assigns a driver (and vehicle); assignment rules are
   validated and the action is written to the audit log.
5. The delivery moves through its lifecycle (ready → assigned → picked up →
   in transit → delivered / failed / cancelled), with each status change
   audited.
6. Admin/dispatcher views dashboard metrics, delivery queue, driver detail,
   and the audit trail for any entity.

## Features

### Dispatch & Assignment

- Delivery lifecycle management with explicit status workflow.
- Assignment of driver + vehicle with business-rule validation.
- Scoring-based driver recommendations with per-factor explanations.

### Operations Visibility

- Dashboard metrics: pending deliveries, active assignments, SLA risk,
  driver availability.
- Delivery queue with filters by status, priority, zone, deadline, and
  assignment state.
- Driver and vehicle detail views with workload and assignment history.
- Audit trail per entity (who did what, when, and why).

### Platform / Backend

- JWT auth with four roles and role-based authorization.
- Contract-first OpenAPI with generated frontend client (Orval).
- OpenRouteService integration for geocoding and route/distance estimates,
  behind a provider adapter with caching and graceful failure handling.
- Seed data and demo accounts for a reproducible reviewer scenario.

## Scope

### In Scope

- Auth and roles: admin, dispatcher, driver, viewer.
- PostgreSQL + Prisma relational schema.
- Drivers, vehicles, zones, deliveries, assignments, route estimates,
  recommendation runs/candidates, audit logs.
- OpenRouteService integration (geocoding, distance/route), with cached
  `RouteEstimate` records.
- Scoring-based assignment recommendations with explanation output.
- React command-center UI built against Orval-generated types.
- Backend-heavy tests: service unit tests, API e2e tests, auth/role tests,
  mocked maps-adapter tests.
- Seed data, demo accounts, and production-quality README + docs.

### Out of Scope (MVP)

- Live driver GPS tracking.
- WebSockets / SSE real-time updates.
- Customer-facing tracking portal.
- Driver mobile application.
- Payments / billing.
- Full multi-stop route optimization.
- Multi-tenant SaaS account/billing management.
- Machine-learning recommendation models.

### Planned v2 / Stretch

- **Live Driver Operations**: driver location updates, admin live map,
  stale/offline freshness status, location history, and real-time updates
  (WebSocket/SSE). Architecture leaves room for a future
  `DriverLocationsModule` / `RealtimeModule`, and the recommendation engine
  is designed to later consume latest known driver coordinates.
- Deeper analytics: SLA trends, workload heatmaps, failed-delivery analysis.
- Advanced dispatching: multi-stop routes, route batching, assignment
  simulation.

## Success Criteria

1. A signed-in user can authenticate and receives role-appropriate access;
   admin, dispatcher, driver, and viewer have provably different
   capabilities (covered by tests).
2. A dispatcher can create a delivery, request recommendations, and receive
   ranked drivers each with a score and explanation.
3. Assigning an ineligible driver/vehicle (unavailable, inactive,
   incompatible, over-capacity, or against a completed/cancelled delivery)
   is rejected with a clear business-rule error.
4. Every assignment and status change appears in the audit log with actor,
   timestamp, and reason.
5. The OpenAPI spec generates a working Orval client that the React UI uses
   for the full create → recommend → assign → status flow.
6. The backend test suite (unit + e2e) passes, and seed data reproduces the
   demo scenario.
