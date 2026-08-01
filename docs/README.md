# Documentation Index

Every document under `docs/`, one line each, with the milestone that owns
it per `temp/IMPLEMENTATION_INSTRUCTIONS_1.md`. "Existing" means the file
is present in the repository today; "Planned" means it is scoped to a
milestone that has not yet been reached.

## Reading order for new contributors

1. [`docs/PROJECT_PLAN.md`](PROJECT_PLAN.md) — the single source of truth; read this first, in full.
2. [`../AGENTS.md`](../AGENTS.md) — hard rules for AI coding agents.
3. [`../CONTRIBUTING.md`](../CONTRIBUTING.md) — how a change gets merged.
4. `docs/standards/*` — the concrete coding standards the plan's principles compile down to.

## Top-level

| File | Description | Milestone | Status |
|---|---|---|---|
| [`PROJECT_PLAN.md`](PROJECT_PLAN.md) | Single source of truth: architecture, schema, security, constants, testing protocol, governance file source text | M0 (pre-existing) | Existing |
| [`README.md`](README.md) | This index | M1 | Existing |
| [`architecture.md`](architecture.md) | Narrative architecture doc: system diagram, data flow, component boundaries, "what lives where" decision table | M1 | Existing |
| [`constants-registry.md`](constants-registry.md) | Master table of all 22 §14 constants with implementation status | M1 | Existing |
| `ci-cd.md` | Every CI/CD workflow: trigger, steps, required secrets, failure modes, rollback procedure | M5 | Planned |

## `docs/adr/` — Architectural Decision Records

| File | Description | Milestone | Status |
|---|---|---|---|
| [`adr/ADR-000-template.md`](adr/ADR-000-template.md) | Template all ADRs follow | M0 (pre-existing) | Existing |
| [`adr/ADR-001-two-app-split.md`](adr/ADR-001-two-app-split.md) | `apps/web` SPA + `apps/api` Hono/Workers split | M1 | Existing |
| [`adr/ADR-002-batch-inference-not-edge.md`](adr/ADR-002-batch-inference-not-edge.md) | Batch Python inference in Actions, not per-request Worker inference | M1 | Existing |
| [`adr/ADR-003-postgis-over-latlng.md`](adr/ADR-003-postgis-over-latlng.md) | PostGIS over generic lat/lng columns | M1 | Existing |
| [`adr/ADR-004-deterministic-triage.md`](adr/ADR-004-deterministic-triage.md) | Rule engine decides triage; LLM only structures input | M1 | Existing |
| [`adr/ADR-005-anonymous-reports.md`](adr/ADR-005-anonymous-reports.md) | Anonymous reports allowed, gated by Turnstile + rate limit | M1 | Existing |
| [`adr/ADR-006-materialized-view-map-reads.md`](adr/ADR-006-materialized-view-map-reads.md) | `region_risk_summary` MV for map reads | M1 | Existing |
| [`adr/ADR-007-github-actions-cron.md`](adr/ADR-007-github-actions-cron.md) | GH Actions `schedule` replaces QStash; Upstash scoped to rate limiting only | M1 | Existing |
| [`adr/ADR-008-no-ssr.md`](adr/ADR-008-no-ssr.md) | Pure client-rendered SPA; SEO trade-off accepted | M1 | Existing |
| [`adr/ADR-009-local-jwt-verification.md`](adr/ADR-009-local-jwt-verification.md) | Supabase Auth + local HS256 verification via `jose` | M1 | Existing |
| [`adr/ADR-010-realtime-direct-from-browser.md`](adr/ADR-010-realtime-direct-from-browser.md) | Resource ticker subscribes to Supabase Realtime directly | M1 | Existing |

## `docs/standards/` — Engineering Standards

| File | Description | Milestone | Status |
|---|---|---|---|
| [`standards/frontend.md`](standards/frontend.md) | Definitive React/Vite conventions: routing, state, optional-chaining checklist, bundle budget, accessibility | M1 | Existing |
| [`standards/backend.md`](standards/backend.md) | Hono routing conventions, middleware order, error boundary pattern, Supavisor pooling, the R7 jobs-endpoint ban | M1 | Existing |
| [`standards/testing.md`](standards/testing.md) | Three-layer testing strategy: Vitest, Playwright, three-pass manual protocol | M1 | Existing |
| [`standards/git-workflow.md`](standards/git-workflow.md) | Branch naming, commit conventions, vertical-slice-per-PR rule, merge gates | M1 | Existing |

## `docs/data-schema/`

| File | Description | Milestone | Status |
|---|---|---|---|
| [`data-schema/schema.md`](data-schema/schema.md) | Full §4 PostGIS schema reference: every table, index, and the ER diagram (documents the *target* schema; SQL ships in M6) | M1 (drafted), updated M6 | Existing |
| [`data-schema/rls-policies.md`](data-schema/rls-policies.md) | Per-table RLS intent for all four operations, on every table | M1 | Existing |

## `docs/ml/`

| File | Description | Milestone | Status |
|---|---|---|---|
| [`ml/model-card.md`](ml/model-card.md) | Full model card: intended use, features, algorithm, promotion gate, explainability, limitations | M1 | Existing |
| [`ml/inference-architecture.md`](ml/inference-architecture.md) | The batch-vs-on-device two-path inference architecture (ADR-002) | M1 | Existing |
| [`ml/feature-engineering.md`](ml/feature-engineering.md) | Per-feature computation spec, windows, null handling, leakage risk | M1 | Existing |

## `docs/security/`

| File | Description | Milestone | Status |
|---|---|---|---|
| [`security/threat-model.md`](security/threat-model.md) | Full STRIDE model, organized by feature | M1 | Existing |
| [`security/secrets-matrix.md`](security/secrets-matrix.md) | Environment variable inventory, exposure classification, rotation procedure | M1 | Existing |
| [`security/rate-limiting.md`](security/rate-limiting.md) | Rate-limit guard table, Upstash sliding-window approach, Gemini quota fallback behavior | M1 | Existing |

## `docs/features/` — per-feature documentation (§12 template)

Each file follows the mandatory Gist / Technical Detail / Critical
Constants / Security Considerations / Manual Test Log template, written in
the same milestone that builds the feature (`docs/PROJECT_PLAN.md`'s
per-feature docs cannot describe behavior that doesn't exist yet).

| File | Description | Milestone | Status |
|---|---|---|---|
| `features/frontend-scaffold.md` | The M2 single-page scaffold: what it renders, bundle budget, e2e coverage | M2 | Planned |
| `features/health-endpoint.md` | `/health` liveness endpoint; documents the liveness-vs-readiness split ahead of M6's `/health/db` | M3 | Planned |
| `features/integration.md` | Frontend↔backend integration: request lifecycle, CORS matrix, shared-contract rule, UI-state↔spec mapping | M4 | Planned |
| `features/database.md` | Migration workflow, rollback procedure, what shipped vs. what `schema.md` documents | M6 | Planned |

Further feature docs (breeding reports, blood inventory, symptom checker,
alerts, news aggregator) are added as their vertical slices ship, per
`docs/PROJECT_PLAN.md` §13 — not enumerated here in advance since their
scope isn't finalized until the slice starts.

## `docs/testing/`

| File | Description | Milestone | Status |
|---|---|---|---|
| `testing/manual-test-log.md` | Running master log of all three-pass manual test results, with reviewer sign-off | M7 | Planned |
| `testing/verification-report.md` | Final M7 report: what was tested, found, fixed; coverage, Playwright summary, Lighthouse scores, known limitations | M7 | Planned |
