---
name: react
description: Use when writing or reviewing React 18 code under apps/web — component structure, routing, data fetching, or state management for this SPA. Invoke whenever a task touches apps/web/src (pages, features, components, hooks).
---

# React 18 SPA Patterns for Avash

`apps/web` is a client-rendered SPA (ADR-008) — no SSR, no Next.js
patterns. Follow `docs/standards/frontend.md` as the authoritative
reference; this skill is a condensed, task-time checklist.

## Routing

- Every route in `apps/web/src/router.tsx` is lazy-loaded via
  `React.lazy` + `Suspense`. Never import a page component eagerly.
- `pages/*` are thin — they compose `features/*` slices, they don't
  contain feature logic themselves.

## Data fetching — TanStack Query only

- Every server-state read/write goes through a `useQuery`/`useMutation`
  hook. **Never** write a `useEffect` that calls `fetch`/`apiClient`
  directly — this is a hard rule, not a style preference
  (`docs/PROJECT_PLAN.md` §9).
- Queries live colocated with their feature in `features/<domain>/`, e.g.
  `features/health/useHealth.ts`.

## Error boundaries

- The root `ErrorBoundary` wraps the router in `App.tsx`. It renders a
  generic, user-safe message — **never** a raw error or stack trace (R10).
- Data-fetching errors from TanStack Query render through the same
  generic-message + toast pattern.

## Optional-chaining checklist (R4) — check every one before finishing a task

`fetch()`/`apiClient` JSON, `localStorage.getItem`, `navigator.geolocation`,
`navigator.serviceWorker`/Push API, `Notification` API, Leaflet/Mapbox event
payloads, Gemini responses (already validated by `apps/api`, but treat as
untrusted at the boundary), `useParams()`/`useSearchParams()`. Grep for raw
`.property` access on each before calling a task done — find every
instance, don't stop at the first.

## Feature-sliced layout

`apps/web/src/features/<domain>/` owns its hooks, components, and query
definitions for one domain (`map`, `reports`, `resources`,
`symptom-checker`, `alerts`). Don't scatter one feature's logic across
`pages/` and `components/` — keep it in its feature slice.

## The R2 no-secrets rule

`apps/web/src` may only reference `import.meta.env.VITE_PUBLIC_*`. Any
other env access here is a bug, full stop — if a task seems to need a
non-public secret in `apps/web`, the logic belongs in `apps/api` instead;
stop and re-scope rather than reaching for the variable anyway.
