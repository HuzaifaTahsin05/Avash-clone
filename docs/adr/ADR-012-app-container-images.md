# ADR-012: Both apps ship container images, built and published per app

**Date:** 2026-08-02
**Status:** Accepted — supersedes the "never containerize the apps"
boundary of [ADR-011](ADR-011-docker-for-infra-not-apps.md); the rest of
ADR-011 stands.

## Context

ADR-011 concluded that `apps/web` and `apps/api` should never be
containerized, because neither has a container in its Cloudflare
production path. That reasoning is sound about _production on Cloudflare_
and says nothing about the other things an image is for:

- **Portability.** A published image is the only artifact that lets this
  project run somewhere other than Cloudflare — a university server, a
  reviewer's laptop, a demo VM, an air-gapped evaluation — without
  reproducing the whole toolchain. For a public-health tool intended to
  be handed over, "here are two images" is a materially better handover
  than "install Node 20, pnpm 9.1.0, and a Cloudflare account."
- **A frozen, inspectable artifact.** `apps/web`'s bundle is currently
  reproducible only by running the build. An image tagged with the commit
  SHA is a durable record of exactly what was served.
- **Deployment optionality.** Cloudflare Pages/Workers is a single
  vendor. Images do not remove that dependency, but they mean changing it
  later is a deployment decision rather than a rewrite.

The counter-argument from ADR-011 remains true and is not being waved
away: the `apps/api` image runs on **Node**, while production runs on
**workerd**. They are different runtimes with different APIs. An image
that diverges silently from the deployed Worker is worse than no image.

## Decision

Both apps ship their own image, built independently, published
independently.

**`apps/web` — `nginxinc/nginx-unprivileged:1.27.2-alpine` serving the
Vite build.** Multi-stage: a Node stage runs the real `pnpm --filter web
build`, and the runtime stage is nginx serving `dist/` with SPA fallback,
the security headers from `apps/web/public/_headers`, and immutable
caching for `/assets/`. Runs as a non-root user on port 8080.

`VITE_PUBLIC_*` values are **build arguments**, because Vite inlines them
at build time — the image is therefore environment-specific, and a
different API base URL means a different image. The CSP `connect-src` is
generated from the same build argument in the same build, so the served
CSP and the compiled API URL cannot drift apart. Only `VITE_PUBLIC_*`
values may be passed as build args: they are public by definition
(§7.1), and build args are readable in image history forever.

**`apps/api` — `node:20.17.0-alpine3.20` running the Hono app through
`@hono/node-server`.** A thin entry (`apps/api/server/node-server.ts`)
serves the _same_ `apps/api/src/index.ts` app object, passing a bindings
object built from `process.env` as the second argument to `app.fetch()`.
The Worker source is not modified, not forked, and not made
runtime-aware — the adapter is additive and lives outside `src/`, typed
by its own `tsconfig.node.json` so Node types never leak into Worker
source (the same split already used for `playwright.config.ts`). Secrets
arrive as runtime environment variables, never as build args, never
baked. esbuild bundles the entry to a single file, so the runtime stage
carries no `node_modules`.

**Cloudflare remains the primary deploy target.** `deploy-web.yml`
(Pages) and `deploy-api.yml` (`wrangler deploy`) are unchanged and remain
the path production takes. Images are a parallel artifact, not a
replacement, and no deploy workflow consumes them.

**Parity obligation — the price of this decision.** Because `apps/api`
now has two runtimes, CI must run `apps/api`'s existing Playwright suite
**twice**: once against `wrangler dev` (workerd, as today) and once
against the running container (Node). A behavioral difference between the
two runtimes is then a red build, discovered in CI, rather than a
surprise for whoever self-hosts. If that dual run is ever removed, this
ADR's premise no longer holds and the image should be dropped rather than
left to drift.

**Rejected alternative — runtime-injected config for `apps/web`**
(entrypoint writes `/config.js`, app reads `window.__AVASH_CONFIG__`),
which would make one image usable in every environment. Rejected for now
because it requires changing `apps/web/src/lib/env.ts` away from static
`import.meta.env.VITE_PUBLIC_*` accesses — and those static accesses are
exactly what the ESLint secrets-boundary rule keys off (§7.1). Weakening
the lock to gain image portability is a bad trade. Revisit only with a
design that keeps the boundary rule enforceable.

**Rejected alternative — running `wrangler dev` inside the API image**
for runtime fidelity. `wrangler dev` is a development server, not a
production process manager, and it would put a Cloudflare account
dependency inside an image whose entire purpose is running without one.

## Consequences

**Easier:** the project can be handed over, demoed, or self-hosted
without a Cloudflare account or a local toolchain. `docker compose
--profile apps up` gives a reviewer the whole stack. Every merge to
`main` leaves a SHA-tagged, scanned image behind.

**Harder:** `apps/api` now has two runtimes to keep honest, and that cost
is permanent and recurring — every future route that reaches for a
Cloudflare-specific API (KV, D1, R2, Durable Objects, `caches.default`)
either needs a Node fallback in the adapter or must be accepted as
Worker-only and skipped in the container test run, explicitly. There is
no version of this decision where the two runtimes stay identical for
free. The dual Playwright run in CI is what converts that from a latent
divergence into a build failure.

`apps/web`'s image is environment-specific, so "the image" is really "the
image for this API origin" — a self-host with a different API URL rebuilds
rather than reconfigures. Four more pinned base images and tags now need
maintaining (§14), and the published images are a new public artifact
surface: they are scanned (Trivy, high/critical fail) and built from
exact-pinned bases, and nothing secret may enter them, by build arg or by
`COPY`.
