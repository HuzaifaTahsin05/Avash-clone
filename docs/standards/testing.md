# Testing Standards

Avash uses a **three-layer** testing strategy (`docs/PROJECT_PLAN.md` §10,
§11, R5). No layer substitutes for another — all three are required for a
slice to be considered done.

| Layer | Tool | Covers | Runs where |
|---|---|---|---|
| Unit / logic | Vitest | `packages/*`, `apps/api` route + middleware logic | CI on every PR |
| End-to-end regression | **Playwright** | `apps/web` behavior against a running API | CI on every PR |
| Manual, three-pass | none — human | every feature; **mandatory** for write-path and LLM-touching changes | before every PR, logged in the description |

**Scope limit:** Playwright end-to-end specs are the only automated test
layer for `apps/web`. No jsdom/React-Testing-Library component-unit suite
is added — behavioral coverage for the frontend comes entirely from
Playwright running against a real production build (`pnpm preview`), not
from mocked component renders.

## Automated layer specifics

- **Vitest** covers `packages/*` (business logic — geo query-fragment
  builders, security validators/rate-limit key generation, logger
  redaction, type schema round-trips) and `apps/api` (route handlers,
  middleware, error boundary behavior). Run via `pnpm test`.
- **Playwright** covers `apps/web` end-to-end: routing, resilience
  (API errors/timeouts/offline), integration with `apps/api`, and
  browser-observable security behavior (XSS inertness, no leaked secrets).
  Specs run against `pnpm preview` (the production build), not the dev
  server, so what's tested matches what ships. Run via
  `pnpm --filter web test:e2e`. Deterministic only: network interception
  (`page.route`) over real timing, web-first assertions, no
  `waitForTimeout`.

## Manual, three-pass protocol (§10)

Every feature PR that touches a write path or an LLM-touching feature must
run all three passes by hand and record the results in the PR description,
with reviewer sign-off before merge.

**Pass 1 — Assume not implemented.** Verify the UI degrades gracefully
(loading skeleton, empty state, no console errors) when the feature or its
data is absent — API down, API 500, throttled network, fully offline, cold
load. Confirms no hard dependency crashes the app.

**Pass 2 — Assume implemented correctly.** Walk the full happy path with
real data end to end (e.g., submit a valid breeding report with GPS,
confirm it appears as `pending`, confirm the map pin, confirm the rate
limit resets after its window). Verify across at least two browsers where
the feature is browser-facing.

**Pass 3 — Assume full of bugs and security flaws. Actively attack it.**
Malformed input, oversized payloads, rapid-fire submissions past rate
limits, XSS strings in text fields, invalid/out-of-range coordinates,
expired/forged Turnstile tokens, a direct API call bypassing the UI with
curl/Postman, a cross-origin request from an unlisted domain (confirm CORS
rejects it).

### Worked example — Breeding Report Form

1. Load the form with the network throttled/offline → the form shows a
   clear offline notice, not a crash.
2. Submit a valid report with geolocation granted → it appears in
   "My Reports" as `pending`; a moderator sees it in the verification
   queue.
3. Submit 10 reports in 30 seconds from the same IP → the 6th onward is
   rejected with a generic "Too many requests" toast; submit
   `<script>alert(1)</script>` as the description → stored and rendered as
   inert text, never executed; call
   `POST https://<api-domain>/api/reports/breeding-site` directly with
   `lat: 999` → rejected `400` by the zod schema before it reaches the DB;
   call it from an unregistered `Origin` header → rejected by CORS before
   it reaches the handler.

### Manual test log template

```md
## Manual Test Log — <Feature Name>

**Date:** YYYY-MM-DD
**Tester:** <name>
**Reviewer sign-off:** <reviewer name>

### Pass 1 — Assume not implemented
<scenarios tried, observed behavior>

### Pass 2 — Assume implemented correctly
<happy-path steps, browsers used, observed behavior>

### Pass 3 — Assume full of bugs/security flaws
<attacks attempted, observed behavior, any fixes required and re-tested>
```

Automated tests **never** substitute for these passes and vice versa: a
green Playwright run proves the scripted scenarios pass, but only a human
walking the happy path and actively attacking the feature catches the
class of issue a spec author didn't think to script. The reviewer
sign-off line is mandatory before merge for any write-path or
LLM-touching PR (`docs/PROJECT_PLAN.md` §10).
