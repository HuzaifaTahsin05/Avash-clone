# ADR-011: Docker for local infrastructure and ML reproducibility, never for the two apps

**Date:** 2026-08-02
**Status:** Accepted, **superseded in part by [ADR-012](ADR-012-app-container-images.md)** (2026-08-02) — the
"`apps/web` and `apps/api` are never containerized" boundary below is
reversed; both apps now ship container images. Everything else in this
ADR (the local PostGIS database, the ML runtime, CI service containers,
and the pin-maintenance obligations) stands unchanged and is still the
operative decision. The original text is left intact per §2's rule that
superseded ADRs are marked, not edited.

## Context

Two parts of this stack are genuinely hard to reproduce per-machine, and
both were previously left to a "install it yourself" instruction that
appears nowhere in the repository:

1. **Postgres 15 + PostGIS 3.** Every migration, every `ST_DWithin`
   query, and every RLS policy targets Supabase's managed Postgres.
   Verifying them requires either a live Supabase project (credentials
   that may not exist, and a shared remote nobody wants to run a
   destructive `db:reset` against) or a local database whose extension set
   matches. `docs/PROJECT_PLAN.md`'s database build-out already assumed
   "a local Postgres 15 + PostGIS container" existed — nothing in the repo
   provided one.
2. **The Python ML pipeline.** `ml/` trains a LightGBM model and exports
   ONNX. LightGBM needs an OpenMP runtime, ONNX export is version-sensitive
   across `skl2onnx`/`onnxmltools`/`onnxruntime`, and a model artifact
   produced against a different dependency tree than the scheduled job
   uses is a silent correctness problem, not a build error.

The other two runtime contexts have the opposite property. `apps/web` is
a static bundle served by a CDN (ADR-008) and `apps/api` is a Cloudflare
Worker running on workerd, not Node. Neither has a container in its
production path, and neither _can_ have one: `wrangler dev`'s local
runtime is the only faithful reproduction of the Worker environment, so a
Node-based container running `wrangler dev` would be strictly less
accurate than running it on the host — plus a second, drift-prone way to
start the same two dev servers.

**Rejected alternative — full `docker compose up` dev stack** (Node
containers running `vite dev` and `wrangler dev` alongside the database).
Rejected because it creates two supported paths to run the same apps that
must be kept in sync forever, adds a bind-mount/HMR/file-watcher failure
class on Windows and macOS that the host path doesn't have, and buys
nothing: `pnpm install && pnpm dev` already works from a clean clone.

**Rejected alternative — Supabase CLI's local stack instead of a plain
PostGIS container.** Not rejected outright, and it remains the right tool
once Auth/Storage/Realtime need local exercising. It is not the default
here because it starts a dozen containers to provide one thing the schema
work actually needs (a PostGIS database), and it pins its own Postgres
version independently of ours.

## Decision

Docker is used for exactly three things, and is a supported-but-optional
convenience in all of them:

1. **`compose.yaml` service `db`** — Postgres 15 + PostGIS 3.4, bound to
   `127.0.0.1`, for running migrations, RLS policies, seed data, and
   spatial queries locally.
2. **`docker/ml.Dockerfile` (compose service `ml`, behind the `ml`
   profile)** — the pinned Python 3.11 runtime for `ml/`, installing from
   `ml/requirements.txt`, the same file the scheduled Actions jobs install
   from.
3. **CI service containers and image gates** — the same PostGIS image runs
   as a GitHub Actions `services:` container for schema/migration jobs, and
   the Dockerfile is linted (hadolint) and image-scanned (Trivy) as CI
   gates like any other artifact.

`.devcontainer/devcontainer.json` exists as an optional workspace for
contributors who want the toolchain preinstalled. It runs `pnpm dev` and
`wrangler dev` **directly**, and reaches the database as a sibling
container.

**`apps/web` and `apps/api` are never containerized** — not for
development, not for deployment. There is no `apps/web/Dockerfile`, no
`apps/api/Dockerfile`, and no `web`/`api` service in `compose.yaml`.
Adding one requires superseding this ADR.

Nothing in the project _requires_ Docker. `pnpm install && pnpm dev` runs
the full app scaffold with no daemon installed; a hosted Supabase project
and a host Python install remain equally valid substitutes for services 1
and 2.

## Consequences

**Easier:** the database build-out can be verified against a real
PostGIS instance on any machine instead of being parse-validated and
hoped over, and against a disposable one — `pnpm docker:db:nuke` and a
restart give a guaranteed-clean database, which is what makes migration
and RLS testing trustworthy. ML runs become reproducible: the local
image and the cron job install identical pins, so a locally exported
`model.onnx` is the artifact the schedule would have produced. CI gets
the same database without a hosted dependency.

**Harder:** the pinned versions are now something to maintain —
`postgis/postgis:15-3.4` must track whatever Postgres/PostGIS version
Supabase actually runs, and `python:3.11-slim-bookworm` must track the
`python-version` in the cron workflows. Both are registered in
`docs/PROJECT_PLAN.md` §14 so a bump is a deliberate, reviewable change
rather than a silently drifting string, but a mismatch between the local
container and Supabase is now a real failure mode that did not exist
before — a migration can pass locally and fail on deploy. `docs/docker.md`
carries the parity check.

**Boundary to hold:** the moment a `Dockerfile` appears under `apps/`,
the deployment story has quietly forked from ADR-001/ADR-008 — the
container will not be what Cloudflare runs, so it can only ever be a
second environment to debug. Review rejects it; a genuine change of
direction supersedes this ADR first.

## Superseded in part — 2026-08-02

That last paragraph is now the superseded one. A direct project decision
reversed it: both apps ship container images, built and published per app.
See [ADR-012](ADR-012-app-container-images.md), which takes the concern
above seriously rather than discarding it — the dual-runtime risk for
`apps/api` is real, and ADR-012 answers it with a parity obligation
(the same test suite runs against the container in CI) rather than by
pretending the risk is gone.

Nothing else here is superseded. `compose.yaml`'s `db` and `ml` services,
`docker/ml.Dockerfile`, the CI service container, the exact-pin rule, and
the Supabase parity checklist all remain in force exactly as written.
