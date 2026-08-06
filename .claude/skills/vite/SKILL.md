---
name: vite
description: Use when editing apps/web/vite.config.ts, PWA/service-worker behavior, bundle splitting, or environment variable handling for the frontend build. Invoke for any Vite config change or bundle-budget concern.
---

# Vite Configuration for Avash

`apps/web/vite.config.ts` is the single place that controls the frontend
build, PWA caching, bundle analysis, and env handling. Changes here affect
every page — verify against the bundle budget before finishing.

## PWA / Workbox strategy (`vite-plugin-pwa`, §8)

| Asset class | Strategy | Detail |
|---|---|---|
| `apps/api` data responses | `NetworkFirst` | Falls back to cache when offline |
| Map tiles | `CacheFirst` | 7-day expiry, max 200 entries |
| Static assets/fonts | `StaleWhileRevalidate` | Serve cached immediately, refresh in background |

Configure these as explicit Workbox runtime-caching rules in
`vite-plugin-pwa`'s config block — don't rely on defaults for anything
beyond static-asset precaching.

## Bundle budget enforcement

The shell bundle budget is **< 180 KB gzip**
(`FRONTEND_BUNDLE_BUDGET_KB`, §14). `rollup-plugin-visualizer` is wired
into the build to report gzipped size on every build. When a change grows
the shell bundle, check the visualizer report before assuming it's fine —
a budget-exceeding PR should not merge without either trimming the
addition or moving it into a lazy-loaded chunk.

## Chunk splitting for the map route

Leaflet (and anything else only the map route needs) must be
chunk-split so users who never open `/map`-equivalent routes never
download that code. This is done via the route's own `React.lazy` import
plus Vite's automatic code-splitting on dynamic `import()` — don't
statically import a map library from a shared module that non-map pages
also import.

## `VITE_PUBLIC_` env handling

- Only variables prefixed `VITE_PUBLIC_` are inlined into the client
  bundle by Vite's default behavior — this is one half of the R2 double
  lock (the other half is the ESLint boundary rule in
  `packages/config/eslint-config`).
- Add a `resolve.alias` entry for `@/*` → `src/*` matching
  `apps/web/tsconfig.json`'s path mapping — keep the two in sync whenever
  either changes.
- Fail fast on a missing required public var (a startup check in
  `src/lib/env.ts` or equivalent) rather than letting `undefined` flow
  silently into a fetch URL or SDK init call.

## No SSR

Never introduce an SSR plugin, adapter, or build target here — `apps/web`
is a static SPA (ADR-008). If a task seems to need server-side rendering,
stop and flag it rather than reaching for a Vite SSR plugin.
