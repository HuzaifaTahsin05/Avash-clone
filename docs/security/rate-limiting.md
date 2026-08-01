# Rate Limiting & Quota Guards

All rate limiting and quota-guard logic runs inside `apps/api`, backed by
**Upstash Redis** using a sliding-window algorithm (`docs/PROJECT_PLAN.md`
§7.3). Upstash is scoped strictly to this purpose in this project — it is
not used for job scheduling (ADR-007) or general caching.

## Guard table

| Guard | Limit | Enforcement point |
|---|---|---|
| Public read routes | 60 req/min/IP | `apps/api` middleware (applied to `/api/risk-map`, `/api/risk/:regionId`, `/api/resources/*` GET routes) |
| Breeding report submit | 5/min/IP, 20/day/IP | `apps/api` route middleware on `POST /api/reports/breeding-site` |
| Blood inventory update | 10/min/authenticated user | `apps/api` route middleware on `PATCH /api/resources/blood/:id` |
| Symptom checker | 10/min/IP, 50/day/IP | `apps/api` route middleware on `POST /api/symptom-check` |
| Gemini global daily quota guard | 1500 req/day (shared counter across all Gemini-calling routes/jobs) | `packages/security/quotaGuard.ts` |

Constant values above mirror `docs/PROJECT_PLAN.md` §14 exactly
(`BREEDING_REPORT_RATE_LIMIT`, `BLOOD_UPDATE_RATE_LIMIT`,
`SYMPTOM_CHECK_RATE_LIMIT`, `GEMINI_DAILY_QUOTA_GUARD`) — if a limit ever
needs to change, §14 and `docs/constants-registry.md` are updated in the
same PR as the code.

## Upstash sliding-window approach

Each guard uses a Redis-backed sliding-window counter keyed by a
combination of route + identity (IP for anonymous routes, user ID for
authenticated ones). A sliding window (as opposed to a fixed window) avoids
the burst-at-boundary problem where a fixed-window counter would allow
2× the intended limit right at a window edge (e.g., the last second of one
minute and the first second of the next). `packages/security` owns the
key-generation logic — it knows only generic rate-limit keys and
validators, never domain models (per the SOLID guidance in
`docs/PROJECT_PLAN.md` §9).

When a limit is exceeded, the route returns a generic `429` with a
user-safe "Too many requests" message — never internal detail about the
current count or window state.

## Gemini quota circuit breaker — fallback behavior

The Gemini daily quota guard (`packages/security/quotaGuard.ts`) trips a
circuit breaker once the global daily counter reaches
`GEMINI_DAILY_QUOTA_GUARD` (1500 req/day). Distinct, feature-specific
fallback behavior applies once tripped:

- **Symptom checker:** degrades to the deterministic WHO-warning-signs
  rule engine directly — the free-text-to-checklist structuring step is
  skipped, and the UI shows an explicit **"AI assist temporarily
  unavailable"** notice. The triage decision itself is unaffected, since
  the rule engine (ADR-004) is the actual decision-maker regardless of
  whether Gemini structured the input.
- **Report submission:** breeding reports are **still accepted** even when
  the quota guard is tripped — submission is not blocked by an LLM outage
  or quota exhaustion. The report is inserted with `ai_validation` left
  null/unset and is **flagged for manual review** instead of being
  AI-validated, so moderator throughput becomes the fallback control
  instead of the spam-likelihood filter.

Both fallbacks exist so that a third-party API's quota state never
produces a hard failure on a citizen-facing feature — the system degrades,
it does not go down.
