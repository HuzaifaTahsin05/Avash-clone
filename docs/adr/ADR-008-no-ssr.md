# ADR-008: No SSR — `apps/web` is a pure client-rendered SPA

**Date:** 2026-08-01
**Status:** Accepted

## Context

The original brief's framing (implicitly Next.js-shaped) suggested
server-side rendering was available "for free." Once the frontend was
corrected to React 18 + Vite (`docs/PROJECT_PLAN.md`'s correction log),
there is no built-in SSR story — React alone has no server. Building one
piecemeal (a custom Express/Hono SSR layer, or reaching for a meta-framework
mid-project) would reintroduce the exact server-coupling this project's
two-app split (ADR-001) was designed to avoid, and would require solving
hydration, streaming, and caching problems that are out of scope for this
project's timeline.

**Rejected alternative:** bolt on SSR later via a custom render-to-string
endpoint in `apps/api` for the risk-map route only, to get partial SEO
benefit. Rejected for now — explicitly not built pre-emptively (YAGNI);
if SEO becomes a real priority, it gets its own ADR and migration plan
rather than an ad-hoc addition.

## Decision

`apps/web` is a pure client-rendered SPA, shipped as a static bundle to
Cloudflare Pages. No server-rendering, no file-based API routes, no
hydration mismatch class of bugs. The trade-off — the public risk map is
not search-engine-crawlable at launch — is accepted deliberately.

## Consequences

**Easier:** the entire frontend deploy story is "build static files,
upload to a CDN" — no server process to run, scale, or secure for the UI
layer itself. Every secret-touching concern is unambiguously `apps/api`'s
job (ADR-001), with no SSR-time secret-access edge case to reason about.

**Harder:** the risk map and other public content are not indexed by
search engines at launch — a real trade-off for a public-health tool where
discoverability matters. This is tracked as an accepted, revisitable
decision: if it becomes a priority, a follow-up ADR (e.g., prerendering
just the landing route) is required before any SSR-shaped code is added.
