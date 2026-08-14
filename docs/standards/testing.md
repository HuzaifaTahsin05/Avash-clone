# Testing Standards

**Read when:** writing, moving, or deleting any test; choosing a runner; adding coverage; reviewing test evidence.

**Decides:** Which runner owns a case, where specs live, coverage thresholds, and the manual protocol.

Avash uses a **three-layer** testing strategy (`docs/PROJECT_PLAN.md` §10,
§11, R5). No layer substitutes for another — all three are required for a
slice to be considered done.

| Layer | Tool | Covers | Runs where |
|---|---|---|---|
| Unit + integration | **Vitest** | `packages/*` logic, `apps/api` routes/middleware (in workerd), `apps/web` hooks/pure modules | CI on every PR, and in watch mode while you work |
| End-to-end | **Playwright** | `apps/web` in a real browser against the production build; `apps/api` black-box HTTP against a live server (both runtimes) | CI on every PR |
| Manual, three-pass | none — human | every feature; **mandatory** for write-path and LLM-touching changes | before every PR, logged in the description |

**Two automated runners, split on one line: does the test drive a running
process from the outside?** If yes it is end-to-end and belongs to
Playwright. If no it is unit or integration and belongs to Vitest. That
line is the whole rule — everything below is its application.

## Why two runners and not one

The repository previously mandated a single runner (`@playwright/test`)
for everything, on the reasoning that one runner is one thing to learn,
configure, and run. That reasoning is sound and it is not what changed —
what changed is the cost, which grew as the suites did:

- **No module mocking.** Playwright Test has no `vi.mock`/`vi.spyOn`
  equivalent. Stubbing a clock, a `fetch` boundary, a crypto source, or an
  Upstash client means hand-rolling injection seams into production code
  that exist only for the tests.
- **No watch loop worth using.** `vitest --watch` re-runs only the tests
  affected by the file just saved, in milliseconds. Playwright's UI mode is
  built for browser debugging, not for a tight red-green cycle on a pure
  function.
- **Coverage is bolted on.** Vitest ships V8 coverage with per-file
  thresholds as a first-class flag. Playwright's non-browser profile needs
  an external `c8` wrapper and produces a report nothing else in the
  toolchain consumes.
- **Process-per-worker overhead.** A `packages/geo` suite of pure
  functions pays Playwright's fixture and worker machinery for tests that
  are ordinary function calls.

None of this is an argument against Playwright. It is an argument that
Playwright is a browser-and-network automation tool being asked to do a
unit runner's job. Each tool now does the job it was built for, and the
boundary between them is mechanical enough that "which runner?" is never a
judgment call.

## Layer 1 — Vitest (unit + integration)

One Vitest workspace at the repository root (`vitest.workspace.ts`)
enumerates every project, so `pnpm test` runs the whole thing and
`pnpm test --project=<name>` narrows it. Three project profiles:

### `packages/*` — pure logic, `node` environment

Plain in-process function calls. No server, no browser, no DOM. This is
where the geospatial math, the rate-limit key derivation, the zod
validators, the log redaction, and the ONNX wrapper are tested.

```ts
// packages/geo/test/bbox.test.ts
import { describe, expect, it } from "vitest";
import { clampRadius } from "../src/bbox";

describe("clampRadius", () => {
  it("caps at the registry ceiling", () => {
    expect(clampRadius(99_000)).toBe(20_000);
  });
});
```

Every package with logic declares `"test": "vitest run"` and inherits the
shared config. Do not give a package its own bespoke environment or
globals — if a test needs a DOM, it is in the wrong project.

### `apps/api` — routes and middleware, **inside workerd**

`apps/api` integration tests run under
[`@cloudflare/vitest-pool-workers`](https://developers.cloudflare.com/workers/testing/vitest-integration/),
which executes each test *inside the same workerd runtime production uses*,
via Miniflare. This is the point of the choice and it must not be traded
away for convenience: a Vitest run in a plain Node environment would test a
Hono app that is not the app that ships — different globals, different
`Request`/`Response` implementations, different CPU-time and API surface.

```ts
// apps/api/test/routes/health.test.ts
import { env, SELF } from "cloudflare:test";
import { expect, it } from "vitest";

it("reports ok without touching the database", async () => {
  const res = await SELF.fetch("https://example.com/health");
  expect(res.status).toBe(200);
  await expect(res.json()).resolves.toMatchObject({ status: "ok" });
});
```

What belongs here: route success and failure paths, zod rejection of
malformed payloads, the middleware chain order, CORS allow and deny
decisions, rate-limit behavior with a mocked Upstash client, auth token
verification, and the `withErrorBoundary()` path — including the
throwaway-Hono-instance error case that previously needed a special
arrangement, which is an ordinary test here.

Bindings and secrets come from `env` in the test environment, declared in
`apps/api/vitest.config.ts`. **Never** point a test at a real Supabase
project, a real Upstash database, or a real Gemini key. A test that needs
a credential to pass is a test that will not run in CI on a fork.

### `apps/web` — hooks and pure modules, `jsdom` environment

Scoped deliberately, and the scope is the important part:

**In scope.** Custom hooks, pure formatting/parsing helpers, zod client
parsers, store reducers, and any module whose behavior is decidable
without layout — the things where a mocked `fetch` and a rendered hook
answer a real question quickly.

**Out of scope.** Full-page component trees, routing, visual state,
anything asserting on how something looks, and anything that duplicates
an assertion an end-to-end spec already makes. jsdom is not a browser: it
has no layout engine, no real network stack, no service worker, and no
CSP. A component test that passes in jsdom and fails in Chromium teaches
the team to distrust the suite.

The old standard banned this layer outright. It is now permitted with the
scope above, because the ban's actual target — a sprawling
React-Testing-Library suite that re-asserts end-to-end behavior against a
fake DOM — is still banned. If you are reaching for `render()` on a route
component, write a Playwright spec instead.

## Layer 2 — Playwright (end-to-end)

Playwright owns everything that drives a running process from the outside.
Two fixture profiles:

### `apps/web` — a real browser against the production build

Specs live in `apps/web/e2e/` and run against `pnpm preview` (the
production build), never the dev server, so what is tested matches what
ships. Covers routing, resilience (API errors, timeouts, offline),
integration with a live `apps/api`, and browser-observable security
behavior (XSS inertness, no leaked secrets in page source or network
payloads).

Deterministic only: network interception (`page.route`) over real timing,
web-first assertions, no `waitForTimeout`. Run via
`pnpm --filter web test:e2e`.

### `apps/api` — black-box HTTP against a live server, on both runtimes

Specs live in `apps/api/e2e/` and use the `request`
(`APIRequestContext`) fixture against a server started outside the test
process — `wrangler dev` by default, the Node container image when
`API_TEST_TARGET=container` is set.

This is a **contract suite, not a second copy of the integration tests.**
It answers one question the Vitest layer cannot: *does the same app behave
identically when served by workerd and by `@hono/node-server`?* Keep it
small and keep it at the boundary — health, CORS preflight and rejection,
error-response shape, auth rejection, and one representative write path
per route family. Anything finer-grained belongs in the workerd Vitest
project, where it runs faster and mocks cleanly.

**This suite is ADR-012's parity obligation and is not optional.** If it is
ever dropped, the API container image is drifting from production and
should be removed rather than trusted. Treat an instruction to skip the
dual run as a conflict to flag, per `AGENTS.md`.

## Which layer does a given test belong to?

| The test… | Layer | Runner |
|---|---|---|
| calls a function and asserts its return value | unit | Vitest (`node`) |
| asserts a zod schema rejects a payload | unit | Vitest (`node`) |
| asserts a route returns 400 for `lat: 999` | integration | Vitest (workerd) |
| asserts the middleware chain runs auth before rate-limit | integration | Vitest (workerd) |
| asserts CORS rejects an unlisted `Origin` | integration **and** contract | Vitest (workerd) + Playwright (`apps/api`, both runtimes) |
| renders a hook with a mocked `fetch` | unit | Vitest (`jsdom`) |
| clicks a button and asserts the URL changed | e2e | Playwright (`apps/web`) |
| asserts an XSS string renders inert in a real browser | e2e | Playwright (`apps/web`) |
| asserts the Node image and the Worker agree on a response | contract | Playwright (`apps/api`, `API_TEST_TARGET=container`) |

When a case genuinely fits two rows — CORS is the standing example — write
the exhaustive version in Vitest and exactly one representative assertion
in the Playwright contract suite. Do not mirror a whole matrix across both.

## Coverage

`@vitest/coverage-v8`, reported per project. Thresholds are enforced in CI
and are a merge gate, not advisory:

| Path | Statements | Branches |
|---|---|---|
| `packages/security/**`, `packages/logger/**` | 90% | 85% |
| `apps/api/src/routes/**`, `apps/api/src/middleware/**` | 85% | 80% |
| everything else under `packages/*` and `apps/api` | 70% | 60% |

Security-relevant branches — CORS decisions, rate-limit boundaries, auth
verification, validation rejection, error-boundary paths — carry no
tolerance: an uncovered branch on any of these fails review regardless of
what the aggregate percentage says.

`apps/web` is **not** measured by line coverage. Its behavioral coverage
comes from the Playwright suite, so it reports spec count plus the
routes and states covered instead. A jsdom coverage percentage for a SPA
measures how much of the code a fake DOM executed, which is not a number
worth defending.

## Commands

```bash
pnpm test                       # Vitest across the whole workspace, once
pnpm test:watch                 # Vitest watch mode
pnpm test:coverage              # Vitest with V8 coverage + threshold gate
pnpm test --project=api         # one project only
pnpm --filter web test:e2e      # Playwright, apps/web, production preview
pnpm --filter api test:e2e      # Playwright, apps/api, against wrangler dev
API_TEST_TARGET=container pnpm --filter api test:e2e   # same specs, Node image
```

The local pre-PR gate (`CONTRIBUTING.md`) runs `pnpm lint && pnpm
typecheck && pnpm test && pnpm build`. The Playwright suites run in CI on
every PR and may be run locally when the change touches their surface.

## File layout

```
packages/<name>/test/*.test.ts        Vitest, node
apps/api/test/**/*.test.ts            Vitest, workerd (mirrors src/)
apps/api/e2e/*.spec.ts                Playwright, live server, both runtimes
apps/web/src/**/*.test.ts             Vitest, jsdom (colocated with source)
apps/web/e2e/*.spec.ts                Playwright, real browser
```

`.test.ts` is Vitest, `.spec.ts` is Playwright, without exception. The
extension is what each runner's `include` glob matches, so the convention
is load-bearing — a Playwright spec named `.test.ts` gets picked up by
Vitest and fails in a confusing way.

`apps/api` keeps its two `tsconfig`s (`docs/standards/backend.md`): Node's
ambient globals stay visible to test and config files and out of Worker
source, which must only ever read config through the typed `Bindings`
interface.

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
green run proves the scripted scenarios pass, but only a human walking the
happy path and actively attacking the feature catches the class of issue a
spec author didn't think to script. The reviewer sign-off line is
mandatory before merge for any write-path or LLM-touching PR
(`docs/PROJECT_PLAN.md` §10).
