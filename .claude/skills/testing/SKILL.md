---
name: testing
description: Use when writing, moving, renaming, or deleting any test, choosing which runner a test belongs to, adding coverage, or reviewing test evidence on a PR. Invoke before creating a *.test.ts or *.spec.ts file anywhere in the repo.
---

# Which runner, and where

**The whole rule: does the test drive a running process from the outside?**
No → Vitest (`*.test.ts`). Yes → Playwright (`*.spec.ts`). The extension
is load-bearing — each runner's `include` glob matches only its own.

| Layer | Runner | Env | Location |
|---|---|---|---|
| `packages/*` pure logic | Vitest | `node` | `packages/<n>/test/*.test.ts` |
| `apps/api` routes/middleware | Vitest | **workerd** (`@cloudflare/vitest-pool-workers`) | `apps/api/test/**/*.test.ts` |
| `apps/web` hooks, pure modules | Vitest | `jsdom` | `apps/web/src/**/*.test.ts` |
| `apps/web` browser behavior | Playwright | real browser, production preview | `apps/web/e2e/*.spec.ts` |
| `apps/api` cross-runtime contract | Playwright | live server, both runtimes | `apps/api/e2e/*.spec.ts` |

**`apps/api` Vitest runs inside workerd, not Node.** That is the condition
on which two runners are acceptable — a plain-Node environment would test
an app that is not the one that ships. Never "simplify" it to `node`.

## Routing a specific case

- returns a value / rejects a payload → Vitest `node`
- route returns 400, middleware order, CORS decision, rate limit, auth,
  error boundary → Vitest **workerd**
- hook with a mocked `fetch` → Vitest `jsdom`
- clicks, URLs, XSS inertness, offline states → Playwright `apps/web`
- "do workerd and Node agree?" → Playwright `apps/api` contract suite

**Fits two rows?** Exhaustive version in Vitest, exactly one
representative case in the contract suite. Never mirror a matrix.

## Scope limits

- **No React-Testing-Library component suite.** jsdom gets hooks and pure
  modules only. Reaching for `render()` on a route component means you
  want a Playwright spec.
- **Contract suite stays thin** (≤6 specs): health, CORS allow + deny,
  preflight, error shape, one representative write path per route family.
  It is ADR-012's parity obligation, not a second copy of the integration
  tests, and it is not optional.
- **No test may need a real credential.** Bindings come from `env` in the
  test config.

## Gates

Coverage thresholds (`@vitest/coverage-v8`) are a merge gate. No uncovered
branch in CORS, rate-limit, auth, validation, or error-boundary code —
regardless of the aggregate percentage. `apps/web` reports spec count and
covered routes/states, not a line-coverage number.

Automated tests never substitute for the three-pass manual protocol, which
is mandatory for any write-path or LLM-touching change and needs reviewer
sign-off.

Full architecture, thresholds table, worked manual-test example, and the
migration status: **`docs/standards/testing.md`**.
