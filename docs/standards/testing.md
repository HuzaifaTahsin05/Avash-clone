# Testing Standards

Avash uses a **two-layer** testing strategy (`docs/PROJECT_PLAN.md` §10,
§11, R5). No layer substitutes for another — both are required for a
slice to be considered done.

| Layer | Tool | Covers | Runs where |
|---|---|---|---|
| Automated (logic, API, end-to-end) | **Playwright** | `packages/*` logic, `apps/api` routes/middleware, `apps/web` end-to-end | CI on every PR |
| Manual, three-pass | none — human | every feature; **mandatory** for write-path and LLM-touching changes | before every PR, logged in the description |

**Playwright is the single automated test framework for the entire
repository** — there is no Vitest anywhere. One test runner, one assertion
library (`test`/`expect` from `@playwright/test`), three different fixture
profiles depending on what's being tested:

| Target | Fixture used | What actually runs |
|---|---|---|
| `packages/*` logic | none — plain `test`/`expect` | In-process function calls. No server, no browser. |
| `apps/api` routes/middleware | `request` (`APIRequestContext`) | Real HTTP requests against a live `wrangler dev` (Miniflare) instance the spec's own `playwright.config.ts` starts via `webServer`. |
| `apps/web` end-to-end | `page` (real browser) | A real browser driving the **production build** (`pnpm preview`), never the dev server. |

**Scope limit (unchanged):** for `apps/web`, Playwright end-to-end specs
are the only automated layer — no jsdom/React-Testing-Library
component-unit suite. The same principle now extends repo-wide: no second
test framework is introduced for `apps/api` or `packages/*` either,
however small the logic under test — a package with no HTTP surface still
uses `@playwright/test`'s bare `test`/`expect`, not a separate unit-test
tool, so the whole repo has exactly one test runner to learn, configure,
and run in CI.

## Automated layer specifics

- **`packages/*`** — pure logic, tested in-process with no server or
  browser fixture (e.g. `packages/logger/test/logger.spec.ts` covers
  redaction, `handleError`, `buildGenericErrorBody`). Each package that
  has tests declares its own minimal `playwright.config.ts`
  (`testDir: './test'`, no `webServer`, no browser `projects`) and a
  `"test": "playwright test"` script. Run via `pnpm test`.
- **`apps/api`** — route handlers, middleware, and error-boundary
  behavior, tested as real HTTP requests via the `request` fixture
  against `wrangler dev` (not an in-process call to the Hono app) — the
  same "test the real runtime" philosophy as `apps/web`'s
  production-preview requirement. The one exception is the error-boundary
  spec, which builds a throwaway Hono instance in-process rather than
  adding a debug-only route that deliberately throws to the real,
  deployed app. Specs live in a top-level `apps/api/test/` directory
  mirroring `src/` (e.g. `test/routes/health.spec.ts` for
  `src/routes/health.ts`) — a dedicated test tree, not colocated
  `*.spec.ts` files beside source, consistent with how `apps/web/e2e/`
  is kept separate from `apps/web/src/`. Run via `pnpm --filter api test`.
  `apps/api`'s TypeScript is split across two `tsconfig`s
  (`docs/standards/backend.md`) specifically so Node's ambient `process`
  global — needed by `playwright.config.ts`'s `process.env.CI` check —
  never becomes visible to the actual Worker source, which must only ever
  read config through the typed `Bindings` interface.
- **`apps/web`** — end-to-end: routing, resilience (API
  errors/timeouts/offline), integration with `apps/api`, and
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
