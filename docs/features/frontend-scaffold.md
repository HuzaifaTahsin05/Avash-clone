# Frontend Scaffold

Follows the mandatory template from `docs/PROJECT_PLAN.md` §12.

**Gist:** `apps/web` is now an installable, buildable, lintable, and
typechecked React 18 + Vite single-page app. It serves exactly one route
(`/`) rendering a title, tagline, description, and a placeholder API
status panel, plus a client-side 404 for any unknown path. There is no
map, no auth, no Supabase, and no PWA behavior yet — those arrive with
their own vertical slices (`docs/PROJECT_PLAN.md` §13), not in this
scaffold.

**Technical Detail:**
- Toolchain: TypeScript 5 (`strict`, `noUncheckedIndexedAccess`,
  `noUnusedLocals`/`noUnusedParameters` — `packages/config/tsconfig.base.json`),
  ESLint 9 flat config (`packages/config/eslint-config`), Vite 5 +
  `@vitejs/plugin-react`, Turborepo (`turbo.json`, `tasks` schema).
- Routing: `react-router-dom` `createBrowserRouter` with two routes — `/`
  (`src/pages/Home.tsx`) and a catch-all `*` (`src/pages/NotFound.tsx`).
  Both routes carry an `errorElement` (`src/components/RouteError.tsx`),
  because React Router's data router intercepts render errors **before**
  they reach a parent React error boundary — a plain `<ErrorBoundary>`
  wrapping `<RouterProvider>` alone does not catch in-route render errors.
  `src/components/ErrorBoundary.tsx` still wraps `<RouterProvider>` in
  `App.tsx` as a second layer for errors outside the router's render tree.
  Both share `src/components/ErrorFallback.tsx` — a generic, user-safe
  message with no stack trace (R10).
- Styling: plain CSS in `src/styles/global.css` — a reset, a small
  design-token set (`--color-*`, `--space-*`, `--font-sans` with a
  Bengali-capable stack), and the page layout. No Tailwind in this
  scaffold, per the frontend standards doc's scope limit for this slice.
- PWA-adjacent static assets: `public/manifest.webmanifest`,
  `public/offline.html` (self-contained, no external requests),
  `public/_redirects` (SPA fallback so Cloudflare Pages deep links don't
  404), `public/_headers` (CSP/HSTS/frame/referrer/permissions headers per
  §7.4 — `connect-src`'s API origin is a placeholder until the
  frontend/backend integration work wires it up), and two generated PNG
  icons under `public/icons/`.
- Two stub files pre-existing in the repo — `src/lib/queryClient.ts`
  (`@tanstack/react-query`) and `src/lib/supabaseClient.ts`
  (`@supabase/supabase-js`) — reference packages that are not installed
  until the work that wires them in (frontend/backend integration and a
  later data-layer slice, respectively). They are excluded from
  `apps/web/tsconfig.json`'s type-checked set so the typecheck gate is a
  real zero-error pass rather than one weakened to tolerate future stubs;
  nothing currently imports them, so the production build is unaffected.
  This mirrors leaving the existing page stubs (`RiskMap`/`Report`/
  `Weather`/`Resources`/`SymptomChecker`) untouched.
- Testing: Playwright (`@playwright/test`) runs against the **production
  preview** (`pnpm preview`), not the dev server — `apps/web/playwright.config.ts`.
  `e2e/smoke.spec.ts` covers title/description rendering, the status
  panel, the client-side 404 route, and a zero-console-errors assertion
  (collected via a `page.on('console'/'pageerror')` listener). The shell
  itself has no Vitest layer and does not need one: everything it does is
  routing and rendering, which is exactly what `docs/standards/testing.md`
  scopes *out* of the jsdom project. Vitest arrives for this app when the
  first custom hook or pure client module does — not for component trees.

**Critical Constants:**

| Constant | Value | Defined in | Status |
|---|---|---|---|
| `FRONTEND_BUNDLE_BUDGET_KB` | < 180 KB gzip (shell) | `apps/web/vite.config.ts` (`rollup-plugin-visualizer` report) | implemented — measured ≈ 67.6 KB gzip (JS 67.02 KB + CSS 0.60 KB), well under budget |

**Security Considerations:**
- R2 (secrets never reach the client): `packages/config/eslint-config`
  ships a `no-restricted-syntax` rule that fails lint on any
  `import.meta.env.X` / `process.env.X` access under `apps/web/src` where
  `X` does not start with `VITE_PUBLIC_`. Proven with a temporary file
  reading `import.meta.env.SUPABASE_SERVICE_ROLE_KEY` — `pnpm --filter web
  lint` failed as designed, then the file was deleted.
- R10 (generic user-facing errors): both the component-level
  `ErrorBoundary` and the router-level `RouteError` render only
  `ErrorFallback`'s fixed, generic copy — never the thrown error's message
  or stack. Proven by temporarily throwing inside `Home`, rebuilding, and
  rendering the preview: the DOM showed only "কিছু ভুল হয়েছে / Something
  went wrong..." with no stack trace, then the throw was reverted.
- CSP/HSTS/frame/referrer/permissions headers are set repo-wide via
  `public/_headers` (§7.4); `connect-src`'s API origin is a documented
  placeholder, not a real value, until the frontend/backend integration
  work lands.
- No secret values of any kind exist anywhere under `apps/web`.

**Manual Test Log:** formal three-pass protocol run against
`pnpm --filter web preview` (`docs/standards/testing.md`).

- **Pass 1 (assume not implemented):** degraded states driven via
  `apps/web/e2e/health-integration.spec.ts` and `resilience.spec.ts` —
  offline, API 500, non-JSON body, schema-invalid payload, and a hung
  request past the client timeout — all render the correct fallback UI.
- **Pass 2 (assume implemented correctly):** `apps/web/e2e/*.spec.ts` (19
  specs) run against chromium and firefox, 3 consecutive runs, 38/38
  green, zero flakes, zero `waitForTimeout`.
- **Pass 3 (assume full of bugs):** `apps/web/e2e/security.spec.ts`
  confirms a script-bearing value in a health payload renders as inert
  text (no dialog, no injected `<script>` element) and that the rendered
  page never contains a server-secret or internal-URL marker;
  `apps/web/e2e/accessibility.spec.ts` confirms exactly one `h1`, a
  labeled status region, and no focus trap.
- Lighthouse (`pnpm --filter web preview`, headless Chrome, mobile
  emulation defaults): Performance 99, Accessibility 100, Best Practices
  96, SEO 82. The two sub-100 categories are pre-existing scaffold gaps
  outside this pass's scope, not regressions: no `<meta name="description">`
  yet, `public/robots.txt` is still the 0-byte placeholder tracked since
  the initial scaffold, and the two logged console errors are the
  expected `ERR_CONNECTION_REFUSED` from `apps/api` not running during a
  frontend-only Lighthouse pass (the app already renders its documented
  error state for that case — see `docs/features/health-endpoint.md`) and
  a 404 for the not-yet-added `favicon.ico`. None require a fix here.

Last pass test date: 2026-08-14.
