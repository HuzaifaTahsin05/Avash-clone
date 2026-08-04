# CI/CD — Workflows, Secrets & Runbook

**Gist:** every workflow under `.github/workflows/` plus `.github/dependabot.yml`,
what triggers each one, what secret or repository variable it needs, how it
fails, and how to debug a red run. `docs/docker.md` owns the *local* half of
the container story (building and running images on your own machine);
this document owns the *CI* half — the same images built, scanned, and run
inside GitHub Actions.

## Workflow index

| Workflow | Triggers | Purpose |
|---|---|---|
| `ci.yml` | PR, push to `main` | Lint → typecheck → test → build → `apps/web` end-to-end; the `api-container-parity` and `postgis-service` jobs (§11) |
| `codeql.yml` | PR, push to `main`, weekly, manual | SAST across `javascript-typescript` and `python` |
| `docker-image-scan.yml` | PR touching `docker/**`/`compose.yaml`/`ml/requirements.txt`, push to `main`, weekly, manual | hadolint + Trivy on the ML image (ADR-011) |
| `build-images.yml` | PR touching app/package/docker paths, push to `main`, weekly, manual | hadolint + build + Trivy + smoke test + publish for `apps/web`/`apps/api` images (ADR-012) |
| `deploy-web.yml` | PR (preview), push to `main` (production) | Cloudflare Pages deploy for `apps/web` |
| `deploy-api.yml` | push to `main`, manual | `wrangler deploy` for `apps/api` + post-deploy smoke test |
| `cron-weather-ingest.yml` | schedule (every 3h), manual | Runs `scripts/jobs/weather-ingest.ts` directly against Supabase (ADR-007) |
| `cron-batch-predict.yml` | schedule (every 24h), manual | Runs `ml/serving/predict.py` directly against Supabase (ADR-002, ADR-007) |
| `cron-news-scan.yml` | schedule (every 6h), manual | Runs `scripts/jobs/news-scan.ts` directly against Supabase (ADR-007) |
| `dependabot.yml` | scheduled by GitHub | Weekly dependency PRs: npm (11 workspaces), pip (`ml/`), github-actions, docker (`docker/`, `apps/web`, `apps/api`) |

None of the three cron workflows exposes an HTTP trigger (R7/ADR-007), and
all three currently no-op with a `::notice::` because their target job
scripts (`scripts/jobs/*.ts`, `ml/serving/predict.py`) are still empty
stubs and the database schema does not exist yet. Each one starts doing
real work when its owning vertical slice ships (`docs/PROJECT_PLAN.md`
§13).

## Required secrets and repository variables

Configure under **Settings → Secrets and variables → Actions**. Every
deploy workflow is guarded on the relevant credential's presence and no-ops
cleanly when it is absent — an unconfigured repository never fails CI for
lacking a credential it was never given.

| Name | Kind | Used by | Required for |
|---|---|---|---|
| `CLOUDFLARE_API_TOKEN` | secret | `deploy-web.yml`, `deploy-api.yml` | Any deploy |
| `CLOUDFLARE_ACCOUNT_ID` | secret | `deploy-web.yml`, `deploy-api.yml` | Any deploy |
| `SUPABASE_SERVICE_ROLE_KEY` | secret | `deploy-api.yml`, `cron-weather-ingest.yml`, `cron-batch-predict.yml`, `cron-news-scan.yml` | API deploy, all three cron jobs once implemented |
| `SUPABASE_JWT_SECRET` | secret | `deploy-api.yml` | API deploy |
| `GEMINI_API_KEY` | secret | `deploy-api.yml`, `cron-news-scan.yml` | API deploy, news-scan job |
| `UPSTASH_REDIS_REST_URL` | secret | `deploy-api.yml` | API deploy |
| `UPSTASH_REDIS_REST_TOKEN` | secret | `deploy-api.yml` | API deploy |
| `TURNSTILE_SECRET_KEY` | secret | `deploy-api.yml` | API deploy |
| `SUPABASE_URL` | secret | `cron-weather-ingest.yml`, `cron-batch-predict.yml`, `cron-news-scan.yml` | Cron jobs once implemented |
| `VAPID_PUBLIC_KEY` / `VAPID_PRIVATE_KEY` | secret | `cron-batch-predict.yml` | Web Push delivery from the batch predict job |
| `GITHUB_TOKEN` | built-in | `build-images.yml` | Publishing images to GHCR (no manual setup) |
| `VITE_PUBLIC_API_BASE_URL` | repository **variable** | `deploy-web.yml` | Building `apps/web` for Pages — the deployed Worker's origin |
| `VITE_PUBLIC_SUPABASE_URL` | repository **variable** | `deploy-web.yml` | Building `apps/web` for Pages |
| `VITE_PUBLIC_SUPABASE_ANON_KEY` | repository **variable** | `deploy-web.yml` | Building `apps/web` for Pages |
| `VITE_PUBLIC_TURNSTILE_SITE_KEY` | repository **variable** | `deploy-web.yml` | Building `apps/web` for Pages |
| `VITE_PUBLIC_VAPID_PUBLIC_KEY` | repository **variable** | `deploy-web.yml` | Building `apps/web` for Pages |
| `PRODUCTION_API_ORIGIN` | repository **variable** | `deploy-api.yml` | Post-deploy smoke test target |
| `PUBLIC_API_BASE_URL` | repository **variable** | `build-images.yml` | Build arg for the *published* web image — see the gap noted below |

Every server-only value here matches `docs/security/secrets-matrix.md`
exactly — this table is "where each one is configured in CI," that
document is "what it is and why it exists," including the *only* place
the step-by-step provider procedure for each one lives. Once obtained,
set each one per § Setting these in GitHub, below.

### Where to obtain each credential

| Name(s) | Obtain via |
|---|---|
| `CLOUDFLARE_API_TOKEN`, `CLOUDFLARE_ACCOUNT_ID` | § Obtaining `CLOUDFLARE_API_TOKEN` and `CLOUDFLARE_ACCOUNT_ID`, below — CI/CD-specific, not in the matrix's application inventory |
| `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, `SUPABASE_JWT_SECRET`, `VITE_PUBLIC_SUPABASE_URL`, `VITE_PUBLIC_SUPABASE_ANON_KEY` | secrets-matrix.md § 1 Supabase |
| `GEMINI_API_KEY` | secrets-matrix.md § 2 Google Gemini |
| `UPSTASH_REDIS_REST_URL`, `UPSTASH_REDIS_REST_TOKEN` | secrets-matrix.md § 4 Upstash Redis |
| `TURNSTILE_SECRET_KEY`, `VITE_PUBLIC_TURNSTILE_SITE_KEY` | secrets-matrix.md § 5 Cloudflare Turnstile |
| *(map tiles)* | Nothing to obtain — the map uses credential-free OpenStreetMap tiles (secrets-matrix.md § 6, ADR-013). Listed here so its absence reads as deliberate, not as an omission |
| `VAPID_PUBLIC_KEY`, `VAPID_PRIVATE_KEY`, `VITE_PUBLIC_VAPID_PUBLIC_KEY` | secrets-matrix.md § 7 Web Push VAPID keypair |
| `VITE_PUBLIC_API_BASE_URL`, `PRODUCTION_API_ORIGIN`, `PUBLIC_API_BASE_URL` | secrets-matrix.md § 8 — not a third-party credential, it's your own deployed Worker's origin |
| `GITHUB_TOKEN` | Built in; GitHub injects it automatically, nothing to obtain |

`VITE_PUBLIC_*` repository variables need no separate provider trip beyond
what the table above points to — each one is the exact value already
sitting in your local `apps/web/.env`, stored a second time because
`deploy-web.yml` builds inside the runner and has no `.env` file of its
own.

### Obtaining `CLOUDFLARE_API_TOKEN` and `CLOUDFLARE_ACCOUNT_ID`

**`CLOUDFLARE_ACCOUNT_ID`:**

1. Log into the [Cloudflare dashboard](https://dash.cloudflare.com).
2. Select any domain, or go to the **Compute → Workers & Pages** if you
   have no domain yet.
3. The **Account ID** is shown in the right-hand sidebar of the Workers &
   Pages overview page. It is not secret in the sense of granting access
   by itself, but is still stored as a secret here for consistency with
   the token it's paired with.

**`CLOUDFLARE_API_TOKEN`:**

1. **My Profile → API Tokens** (top-right avatar menu) →
   **Create Token**.
2. Use **Create Custom Token**, not one of the broad templates — this
   project's deploy workflows need exactly two permission scopes, and a
   token that can do more than deploy is a wider blast radius than
   necessary if the token ever leaks:
   - **Account → Cloudflare Pages → Edit** (for `deploy-web.yml`)
   - **Account → Workers Scripts → Edit** (for `deploy-api.yml`)
3. Under **Account Resources**, scope it to the one Cloudflare account
   this project deploys to — not "All accounts."
4. Skip **Zone Resources** entirely; neither deploy workflow touches DNS
   or zone-level settings.
5. **Continue to summary → Create Token**, then copy it immediately —
   Cloudflare shows it exactly once and cannot display it again.
6. Store it as the `CLOUDFLARE_API_TOKEN` GitHub Actions secret
   immediately; do not paste it into a file, a chat message, or a note
   app first.

If a deploy workflow later needs a capability outside these two scopes,
widen the existing token's permissions rather than creating a second,
broader one — one auditable token beats several with overlapping access.

### Setting these in GitHub

Two independent choices when adding one of these: **secret vs. variable**
is already answered by the Kind column in the table above — secret for
anything that grants access, repository variable for anything that's
already public once `apps/web` ships it. **Repository vs. environment
scope** is not: GitHub also lets you scope a secret to a named
*environment* (`Settings → Environments`) rather than the whole
repository, gated on required reviewers or a wait timer. None of this
project's workflows declare an `environment:` key, so an environment-scoped
secret would simply never be injected — **use repository scope for
everything in the table above.** Revisit this only if a future workflow
adds a deployment gate that needs one (e.g. manual approval before a
production `wrangler deploy`), and document that workflow's `environment:`
value here at the same time.

Via the web UI: **Settings → Secrets and variables → Actions**, then
**New repository secret** (for `secret`-kind rows in the table above) or
switch to the **Variables** tab and **New repository variable** (for
`repository variable`-kind rows).

Via the `gh` CLI (requires `gh auth login` first):

```bash
# Secrets — value is never echoed back or stored in shell history if
# piped in rather than passed as a literal argument
gh secret set CLOUDFLARE_API_TOKEN
gh secret set CLOUDFLARE_ACCOUNT_ID
gh secret set SUPABASE_SERVICE_ROLE_KEY
gh secret set SUPABASE_JWT_SECRET
gh secret set GEMINI_API_KEY
gh secret set UPSTASH_REDIS_REST_URL
gh secret set UPSTASH_REDIS_REST_TOKEN
gh secret set TURNSTILE_SECRET_KEY
gh secret set SUPABASE_URL
gh secret set VAPID_PUBLIC_KEY
gh secret set VAPID_PRIVATE_KEY

# Repository variables — these are not secret and are visible to anyone
# with read access to the repository, matching their VITE_PUBLIC_/deploy-
# config nature.
gh variable set VITE_PUBLIC_API_BASE_URL --body "https://your-api.example.workers.dev"
gh variable set VITE_PUBLIC_SUPABASE_URL --body "https://<project-ref>.supabase.co"
gh variable set VITE_PUBLIC_SUPABASE_ANON_KEY --body "<anon-key-from-supabase-settings-api>"
gh variable set VITE_PUBLIC_TURNSTILE_SITE_KEY --body "<site-key-from-cloudflare-turnstile>"
gh variable set VITE_PUBLIC_VAPID_PUBLIC_KEY --body "<public-half-of-the-vapid-keypair>"
gh variable set PRODUCTION_API_ORIGIN --body "https://your-api.example.workers.dev"
gh variable set PUBLIC_API_BASE_URL --body "https://your-api.example.workers.dev"
```

**Security note — widen the domain restriction before copying.**
`VITE_PUBLIC_TURNSTILE_SITE_KEY` is domain-restricted at the provider to
`localhost` (`docs/security/secrets-matrix.md` § 5). Add the real
Cloudflare Pages production domain as an allowed domain on the Turnstile
site *before* setting this variable — a value that only works on
`localhost` will silently fail the widget in production, and widening the
restriction after the fact is the safer order than shipping an
unrestricted key to unblock a broken deploy.

The map needs no equivalent step: OpenStreetMap tiles carry no key to
restrict (ADR-013). What the map *does* need before a production deploy
is the CSP `img-src` tile-host entry in `apps/web/public/_headers` —
without it the basemap is blocked in production while working fine in a
dev server that serves no CSP.

Confirm what's actually configured without exposing any value:

```bash
gh secret list
gh variable list
```

Neither command prints secret values — GitHub does not return them once
set, by design. To verify a secret was set to the *intended* value, the
only reliable check is behavioral: trigger the workflow that consumes it
(`workflow_dispatch` on the relevant job) and confirm it behaves as
expected, rather than trying to inspect the value directly.

### `PUBLIC_API_BASE_URL` — a known configuration gap

`build-images.yml` builds the published `avash-web` image against
`vars.PUBLIC_API_BASE_URL`, falling back to `http://localhost:8787` when
unset. **This repository variable has not been set yet** — no Cloudflare
Pages project domain exists (the same gap noted in
`docs/constants-registry.md` for `CORS_ALLOWED_ORIGINS`). Until it is set,
the image published to `ghcr.io/<owner>/avash-web` is compiled against
`localhost` and is useful for local verification only, not as a
deployable artifact. Set it once the real API origin is known, in the same
change that updates `wrangler.toml`'s `CORS_ALLOWED_ORIGINS` placeholder.

## Finding and sharing the live deployment link

Once `CLOUDFLARE_API_TOKEN`/`CLOUDFLARE_ACCOUNT_ID` are set (§ Required
secrets above) and `deploy-web.yml` or `deploy-api.yml` has actually run on
GitHub, the deployed URL is never something you construct by hand — read it
back from Cloudflare:

- **`apps/web` production:** the Cloudflare Pages project's default domain,
  `https://avash.pages.dev` (or the custom domain if one is attached under
  **Pages → avash → Custom domains**). Confirm the current production
  deployment in **Pages → avash → Deployments**.
- **`apps/web` PR preview:** `deploy-web.yml`'s "Deploy preview (PR)" step
  prints the preview URL in its GitHub Actions job log
  (`https://<branch-slug>.avash.pages.dev` or a deployment-hash subdomain).
  If the Cloudflare Pages GitHub App is installed on this repository, it
  also comments the same URL directly on the PR — check there first.
- **`apps/api`:** the Worker's `*.workers.dev` subdomain, or the custom
  domain in `wrangler.toml`'s `[env.production] routes`. `wrangler
  deployments list --env production` (run locally, or as a
  `workflow_dispatch` step) shows the live deployment and its URL.

Every one of these is a normal public HTTPS URL — there is no tunnel, VPN,
or extra step needed to share one with someone else. Copy it and send it.
The one thing to check before sharing a **preview** link: Cloudflare Pages
preview deployments are public by default unless Cloudflare Access has been
configured on the project, so treat a preview URL as visible to anyone who
has it, the same as production.

## Pausing and resuming scheduled runs

Scheduled workflows consume the repository's Actions allowance whether or
not they do useful work. This section is the procedure for turning them
off and back on.

### What actually costs minutes

Actions minutes are billed **only for private repositories**. A public
repository gets unlimited minutes on GitHub-hosted standard runners, so if
this repository is public, nothing below is a cost decision — it is only a
noise decision. On a private repository, the GitHub Free plan includes
2,000 minutes per month.

Two billing details matter when estimating:

- **Each job's duration is rounded up to the whole minute.** A job that
  runs for four seconds is billed as one minute. This makes run *frequency*
  matter far more than run *duration* for short jobs.
- **Runner OS carries a multiplier** — Linux ×1, Windows ×2, macOS ×10.
  Every job in this repository uses `ubuntu-latest`, so the multiplier is
  ×1 throughout.

Current scheduled load, assuming a 30-day month:

| Workflow | Cadence | Runs/month | Notes |
|---|---|---|---|
| `cron-weather-ingest.yml` | every 3h | ~240 | The dominant cost by run count |
| `cron-news-scan.yml` | every 6h | ~120 | |
| `cron-batch-predict.yml` | daily | ~30 | |
| `codeql.yml` | weekly (+ every PR) | ~4 scheduled | Two-language matrix, so two jobs per run |
| `docker-image-scan.yml` | weekly (+ path-filtered PRs) | ~4 scheduled | |
| `build-images.yml` | weekly (+ PRs touching app paths) | ~4 scheduled | Two-app matrix, so two jobs per run |

All three cron jobs currently exit at their stub guard without doing any
work. That guard is deliberately placed **before** toolchain setup and
dependency installation, so a no-op run bills roughly one minute rather
than the three-to-five it would cost if it installed first. Do not reorder
those steps: at ~390 no-op runs per month across the three, the ordering is
the difference between roughly 400 and roughly 1,600 billed minutes.

### Pausing a workflow — GitHub web UI

This is the recommended method. It requires no commit, takes effect
immediately, and is trivially reversible.

1. **Actions** tab → select the workflow in the left sidebar.
2. **`···`** (top right of the workflow's run list) → **Disable workflow**.

The workflow moves to a disabled state and stops firing. To resume:
same menu → **Enable workflow**.

**Disabling stops every trigger for that workflow, including
`workflow_dispatch`.** To run a paused job once by hand, enable it, dispatch
the run, then disable it again.

### Pausing a workflow — `gh` CLI

Requires the GitHub CLI (`gh`), which is not currently installed on this
machine — install from <https://cli.github.com/> and run `gh auth login`
first.

```bash
gh workflow list --all                      # names, IDs, and current state

gh workflow disable cron-weather-ingest.yml
gh workflow disable cron-news-scan.yml
gh workflow disable cron-batch-predict.yml

gh workflow enable cron-weather-ingest.yml  # resume
```

To pause every scheduled job in one step:

```bash
for wf in cron-weather-ingest cron-news-scan cron-batch-predict \
          codeql docker-image-scan build-images; do
  gh workflow disable "$wf.yml"
done
```

Note that disabling `codeql.yml`, `docker-image-scan.yml`, or
`build-images.yml` also disables their pull-request triggers, not just the
weekly schedule — those are merge gates, so pausing them weakens review
rather than only saving minutes. Prefer pausing only the three `cron-*`
workflows.

### Pausing only the schedule, keeping manual runs

If you want a workflow to stay dispatchable while stopping its automatic
runs, comment out its `schedule:` block and keep `workflow_dispatch:`:

```yaml
on:
  # Paused to conserve Actions minutes — re-enable when the job does real work.
  # schedule:
  #   - cron: "0 */3 * * *"
  workflow_dispatch:
```

This costs a commit and is visible in history, which is a feature when the
pause is meant to be long-lived and explained. The UI/CLI method is better
for a temporary pause.

### Stopping everything at once

**Settings → Actions → General → Actions permissions → Disable actions.**
This halts all workflows in the repository, including pull-request checks.
Use it only when deliberately going dark; it disables the merge gates too.

### Guarding against surprise charges

**Settings → Billing and licensing → Budgets and alerts.** A budget of `$0`
means the repository stops running billable Actions jobs once the included
free minutes are exhausted, rather than billing overage. Verify this is set
before relying on any schedule.

### One behavior to know about

GitHub **automatically disables scheduled workflows after 60 days of
repository inactivity** (no commits). If the cron jobs stop firing after a
quiet period, they were not deleted — re-enable them from the Actions tab.
A run triggered manually does not reset that timer; a commit does.

## Downloading a failed Playwright run's report and traces

1. Open the failed run under the **Actions** tab.
2. `ci.yml`'s `e2e-web` job uploads `playwright-report-web-<sha>` as an
   artifact only `if: failure()` — it will not exist on a green run.
3. Download the artifact zip from the run summary page (bottom of the
   page, **Artifacts** section) or via `gh run download <run-id>`.
4. Unzip it and open `playwright-report/index.html` in a browser — it
   includes the trace viewer for every failed spec, with screenshots and
   the full network/console log at the point of failure.
5. `apps/api` and `packages/*` specs use no browser fixture and produce no
   trace; a failure there is diagnosed from the job log directly.

## The container-touching jobs

- **`postgis-service`** (`ci.yml`) — a job-level `services:` container
  using `postgis/postgis:15-3.4`, health-gated with `pg_isready`
  (`--health-interval 5s --health-retries 10`), identical to
  `compose.yaml`'s `db` image so a migration verified locally is verified
  the same way here. It references no credential — the
  `postgres`/`postgres` values are local-only, throwaway, and never reach
  a deployed environment. GitHub Actions starts service containers before
  any step runs, so the `docker/postgis/initdb/00-extensions.sql` bind
  mount used by `compose.yaml` cannot be reused here; the job's own step
  runs the equivalent `create extension if not exists postgis;` /
  `pgcrypto;` idempotently instead, then asserts both are present.
- **`docker-image-scan.yml`** — hadolint against `docker/ml.Dockerfile`,
  then a build + Trivy scan of the resulting ML image. Triggers on paths
  that can change the image (`docker/**`, `compose.yaml`,
  `ml/requirements.txt`) plus a weekly schedule, since a base image
  accumulates CVEs with no Dockerfile change of its own.
- **`build-images.yml`** — the same two gates (hadolint, Trivy) plus a
  smoke test, applied to `apps/web/Dockerfile` and `apps/api/Dockerfile`.
  Publishing to GHCR only happens after both the scan and the smoke test
  pass, and only on push to `main` — never from a pull request.
- **`api-container-parity`** (`ci.yml`) — builds `apps/api/Dockerfile`,
  starts it, and runs the *identical* `apps/api` Playwright suite against
  it with `API_TEST_TARGET=container`, using the same
  `CORS_ALLOWED_ORIGINS`/`CORS_PREVIEW_ORIGIN_SUFFIX` values `wrangler dev`
  reads locally from `.dev.vars`/`wrangler.toml`. This is ADR-012's parity
  obligation: a spec that passes against `wrangler dev` (workerd) but
  fails against the container (Node) is a real divergence between
  runtimes, not a flake, and nothing may be skipped or marked
  `continue-on-error` to hide one.

### The Trivy-failure procedure

Both `docker-image-scan.yml` and `build-images.yml` run Trivy with
`severity: HIGH,CRITICAL`, `ignore-unfixed: true`, `exit-code: 1`. When a
job fails on a real finding:

1. Read the CVE entry in the job log — package, installed version, fixed
   version (if any).
2. **A fix exists** (`Status: fixed`, a `Fixed Version` is listed): bump
   the dependency or base image tag. For `docker/ml.Dockerfile` this means
   editing `ml/requirements.txt` (exact `==` pin) or the base image tag;
   for the app images, bumping `WEB_IMAGE_BASE`/`API_IMAGE_BASE` in
   `apps/*/Dockerfile` and `docs/constants-registry.md` together (R9).
   Rebuild and rerun the scan locally before pushing.
3. **No fix exists yet** (upstream hasn't shipped one): this is the one
   case `ignore-unfixed: true` already handles automatically — the job
   will not fail on it. If it *is* failing despite no fix being available,
   the finding is not actually unfixed (check the `Status` column again)
   or Trivy's vulnerability DB is stale in the runner cache; do not add
   `continue-on-error` or `|| true` to work around it — that is banned
   everywhere in these workflows (§11).
4. If a genuine no-fix CVE somehow still blocks merge, the only permitted
   escape hatch is a time-boxed, written decision: open an issue naming
   the CVE, the affected image, the date, and a re-check date (30 days
   out), get it acknowledged by a reviewer, and reference the issue in the
   PR description. This is a documented exception, never a silent
   workaround — `docs/security/threat-model.md` is where the accepted-risk
   entry belongs once one exists.

## Merge gates (§11) — where each one lives

| Gate | Enforced in |
|---|---|
| ESLint, zero errors/warnings | `ci.yml` → `verify` job, `pnpm lint` |
| TypeScript, zero errors | `ci.yml` → `verify` job, `pnpm typecheck` |
| Unused exports (`ts-prune`) | `ci.yml` → `verify` job |
| Client bundle env-var scan | `ci.yml` → `verify` job, `scripts/scan-client-env.mjs` against built `apps/web/dist` |
| Bundle budget (180 KB gzip) | `ci.yml` → `verify` job, `scripts/check-bundle-budget.mjs` |
| Failing Playwright spec (any package) | `ci.yml` → `verify`, `e2e-web`, `api-container-parity` jobs |
| CodeQL high/critical | `codeql.yml`, enforced via required status checks (branch protection) — the action itself annotates findings as code scanning alerts rather than exiting non-zero, so the repository's branch protection rule must require the `codeql` check to actually block merge |
| Model checksum mismatch | Not yet applicable — no ML artifact ships until the ML pipeline slice |
| hadolint / Trivy | `docker-image-scan.yml`, `build-images.yml` |

## Rollback procedure

**`apps/web` (Cloudflare Pages):** Pages retains every deployment. In the
Cloudflare dashboard, **Pages → avash → Deployments**, find the last known
good deployment, and use **Rollback to this deployment**. This requires no
new build and takes effect immediately.

**`apps/api` (Cloudflare Workers):** `wrangler deployments list --env
production` shows deployment history; `wrangler rollback --env production
--message "<reason>"` reverts to the previous deployment. Alternatively,
revert the offending commit on `main` and let `deploy-api.yml` redeploy
the reverted code.

**Published container images:** images are tagged both `sha-<short>` and
`latest`. Since `latest` moves on every `main` push, pin any external
consumer to a specific `sha-` tag if rollback matters to it; there is no
in-repo rollback action for GHCR beyond re-tagging a prior `sha-` image as
`latest` manually.
