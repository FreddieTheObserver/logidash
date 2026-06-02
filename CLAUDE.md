## Application Building Context

Read the following files in order before implementing
or making any architectural decision:

1. `docs/context/project-overview.md` — product definition,
   goals, features, and scope
2. `docs/context/architecture.md` — system structure,
   boundaries, storage model, and invariants
3. `docs/context/ui-context.md` — theme, colors, typography,
   and component conventions
4. `design_handoff_command_center/README.md` — high-fidelity command
   center screens, layout, and interactions (see `prototype/` for an
   interactive reference; not production code)
5. `docs/context/code-standards.md` — implementation rules
   and conventions
6. `docs/context/ai-workflow-rules.md` — development workflow,
   scoping rules, and delivery approach
7. `docs/context/progress-tracker.md` — current phase,
   completed work, open questions, and next steps

Then consult, as needed for the work at hand:

- `docs/superpowers/specs/2026-06-02-logistics-dispatch-api-design.md` —
  the approved design spec (data model, recommendation engine, lifecycle,
  API and contract conventions)
- `docs/implementation-tools.md` — concrete tooling decisions and rationale
- `docs/implementation-plan.md` — the phased build plan and dependency order

Update `docs/context/progress-tracker.md` after each
meaningful implementation change.

If implementation changes the architecture, scope, or
standards documented in the context files, update the
relevant file before continuing.
