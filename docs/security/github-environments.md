# GitHub Environments — Per-Environment Secrets, Step by Step

**Read when:** splitting deploy credentials by environment, or configuring GitHub Environments.

**Decides:** The full cutover procedure: environments, branch policies, reviewers, per-env secrets.

This document is the complete procedure for splitting Avash's deploy
credentials into two isolated GitHub **Environments** (`preview` and
`production`), so that a push to `dev` can never hold a credential that
can touch production. It is written to be followed top to bottom by
someone who has never opened the Environments page before.

Related: `docs/security/secrets-matrix.md` (what each credential *is* and
where to obtain it), `docs/ci-cd.md` (which workflow consumes what),
`docs/manual-deploy.md` (deploying by hand, without CI).

## The problem this solves

`pipeline.yml` currently passes `secrets: inherit` to both deploy
workflows. `secrets: inherit` hands a called workflow **every repository
secret**, with no filtering. Combined with repository-scoped secrets, that
means:

- A push to `dev` runs `deploy-api.yml` holding the **production**
  `CLOUDFLARE_API_TOKEN`, the production `SUPABASE_SERVICE_ROLE_KEY`, and
  the production `GEMINI_API_KEY` — even though it only deploys to the
  preview Worker.
- Anyone who can merge to `dev` can, via a workflow-file change, exfiltrate
  or misuse a production credential.
- A compromised or buggy dependency in the preview deploy path has
  production-level reach.

The blast radius is the whole product, and the only thing standing between
`dev` and production is the correctness of a `wrangler_env` string.

## The target model

Two environments, each holding its own copy of every credential, each
scoped at the provider to its own resources.

| | `preview` | `production` |
|---|---|---|
| Deploys from | `dev` | `main` |
| Cloudflare Pages branch | `dev` | `main` |
| `wrangler` environment | `preview` | `production` |
| Worker name | `avash-api-preview` | `avash-api` |
| Cloudflare API token | its own, Pages+Workers Edit, **preview resources only** | its own, Pages+Workers Edit |
| Supabase project | a separate preview project | the production project |
| Upstash Redis database | a separate preview database | the production database |
| Turnstile site | preview/dev domains | the production domain |
| Gemini API key | a separate key with its own quota | the production key |
| Required reviewers | none | **at least one**, not the person who opened the PR |
| Deployment branch rule | `dev` only | `main` only |

Two rules make this worth the setup effort, and both are lost if you take
shortcuts:

1. **Separate credentials, not the same credential stored twice.** Storing
   the production token under both environment names reduces nothing. Each
   environment gets a credential the provider itself scopes to that
   environment's resources.
2. **The branch rule is enforced by GitHub, not by the workflow.** A
   deployment branch policy means GitHub refuses to inject `production`
   secrets into a job running on any ref but `main` — even if someone edits
   the workflow's `if:` condition.

## Prerequisites

- Admin access to the repository (Environments are an admin-level setting).
- `gh` CLI authenticated: `gh auth login`, then `gh auth status` to confirm.
- The preview-side provider resources actually created — a second Supabase
  project, a second Upstash database, a second Gemini key, and Turnstile
  configured for the preview domain. Follow
  `docs/security/secrets-matrix.md` § Obtaining each secret for each one;
  it is the same procedure, run a second time.
- The Cloudflare account ID (identical for both environments — one
  account, two sets of resources inside it).

> **Do the provider side first.** Creating the environments before the
> credentials exist leaves half-configured environments that silently skip
> deploys, which reads exactly like a broken pipeline.

---

## Step 1 — Create the two environments

**Web UI:**

1. Repository → **Settings** → **Environments** (left sidebar, under
   "Code and automation").
2. **New environment** → name it exactly `preview` → **Configure
   environment**.
3. Repeat for `production`.

Names are case-sensitive and must match the string the workflow passes.
Use `preview` and `production` exactly — they already match
`apps/api/wrangler.toml`'s environment names and `pipeline.yml`'s
`wrangler_env` output, so nothing else needs a translation table.

**`gh` CLI:**

```bash
gh api -X PUT "repos/{owner}/{repo}/environments/preview"
gh api -X PUT "repos/{owner}/{repo}/environments/production"
```

Verify:

```bash
gh api "repos/{owner}/{repo}/environments" --jq '.environments[].name'
```

## Step 2 — Restrict each environment to its branch

This is the control that makes the split real. Without it, a workflow run
on any branch can request `production` secrets.

**Web UI**, on the `production` environment's configuration page:

1. Under **Deployment branches and tags**, change the dropdown from
   **All branches** to **Selected branches and tags**.
2. **Add deployment branch or tag rule** → enter `main` → **Add rule**.
3. Confirm the rule list shows exactly `main` and nothing else.

Repeat on `preview` with `dev`.

**`gh` CLI:**

```bash
# Switch production to a selected-branches policy, then add the rule.
gh api -X PUT "repos/{owner}/{repo}/environments/production" \
  -F "deployment_branch_policy[protected_branches]=false" \
  -F "deployment_branch_policy[custom_branch_policies]=true"

gh api -X POST "repos/{owner}/{repo}/environments/production/deployment-branch-policies" \
  -f name='main' -f type='branch'

gh api -X PUT "repos/{owner}/{repo}/environments/preview" \
  -F "deployment_branch_policy[protected_branches]=false" \
  -F "deployment_branch_policy[custom_branch_policies]=true"

gh api -X POST "repos/{owner}/{repo}/environments/preview/deployment-branch-policies" \
  -f name='dev' -f type='branch'
```

Verify both:

```bash
gh api "repos/{owner}/{repo}/environments/production/deployment-branch-policies" \
  --jq '.branch_policies[].name'
```

## Step 3 — Require a reviewer on `production`

A human approval gate before anything reaches production. The run pauses at
the deploy job and waits.

**Web UI**, on `production`:

1. Check **Required reviewers**.
2. Add at least one user or team. Add **two or more people** if the project
   has them — a single required reviewer who is also the only regular
   committer is an approval step that approves itself.
3. Leave **Allow administrators to bypass configured protection rules**
   **unchecked**. A bypass that exists will be used at 2 a.m. during an
   incident, which is exactly when the gate matters most.
4. Optionally set a **Wait timer** (e.g. 5 minutes) — a window to cancel a
   deploy you regret. Skip it if the required reviewer is already a human
   pause; two delays on the same gate mostly train people to ignore both.
5. **Save protection rules.**

**`gh` CLI:**

```bash
# Look up the reviewer's numeric user ID first.
gh api "users/<github-username>" --jq '.id'

gh api -X PUT "repos/{owner}/{repo}/environments/production" \
  -F "wait_timer=0" \
  -F "prevent_self_review=true" \
  -F "reviewers[][type]=User" \
  -F "reviewers[][id]=<numeric-user-id>"
```

`prevent_self_review=true` is the setting that stops the person who
triggered the deploy from approving their own deploy. Set it.

Leave `preview` with no reviewers — gating `dev` on a human approval makes
the integration branch slower than it is useful, and `preview` holds no
credential worth gating.

## Step 4 — Add the secrets, per environment

Every secret goes in **twice**, once per environment, with **different
values**. The names stay identical so the workflow needs no branching.

**Web UI:** environment configuration page → **Environment secrets** →
**Add environment secret**.

**`gh` CLI** — the `--env` flag is what makes it an environment secret
rather than a repository secret:

```bash
# ---- preview ----
gh secret set CLOUDFLARE_API_TOKEN       --env preview
gh secret set CLOUDFLARE_ACCOUNT_ID      --env preview
gh secret set SUPABASE_SERVICE_ROLE_KEY  --env preview
gh secret set SUPABASE_JWT_SECRET        --env preview
gh secret set SUPABASE_URL               --env preview
gh secret set GEMINI_API_KEY             --env preview
gh secret set UPSTASH_REDIS_REST_URL     --env preview
gh secret set UPSTASH_REDIS_REST_TOKEN   --env preview
gh secret set TURNSTILE_SECRET_KEY       --env preview
gh secret set VAPID_PUBLIC_KEY           --env preview
gh secret set VAPID_PRIVATE_KEY          --env preview

# ---- production ----  (same names, different values)
gh secret set CLOUDFLARE_API_TOKEN       --env production
gh secret set CLOUDFLARE_ACCOUNT_ID      --env production
gh secret set SUPABASE_SERVICE_ROLE_KEY  --env production
gh secret set SUPABASE_JWT_SECRET        --env production
gh secret set SUPABASE_URL               --env production
gh secret set GEMINI_API_KEY             --env production
gh secret set UPSTASH_REDIS_REST_URL     --env production
gh secret set UPSTASH_REDIS_REST_TOKEN   --env production
gh secret set TURNSTILE_SECRET_KEY       --env production
gh secret set VAPID_PUBLIC_KEY           --env production
gh secret set VAPID_PRIVATE_KEY          --env production
```

Each command prompts for the value on stdin. **Do not** pass values with
`--body` — that writes the secret into your shell history.

Verify names only (values are never retrievable, by design):

```bash
gh secret list --env preview
gh secret list --env production
```

## Step 5 — Add the variables, per environment

The `VITE_PUBLIC_*` values and the smoke-test origins are not secret, but
they *are* per-environment, so they move too. Keeping them alongside the
secrets means one page shows an environment's entire configuration.

```bash
# ---- preview ----
gh variable set VITE_PUBLIC_API_BASE_URL     --env preview \
  --body "https://avash-api-preview.<subdomain>.workers.dev"
gh variable set API_ORIGIN                   --env preview \
  --body "https://avash-api-preview.<subdomain>.workers.dev"
gh variable set VITE_PUBLIC_SUPABASE_URL     --env preview --body "https://<preview-ref>.supabase.co"
gh variable set VITE_PUBLIC_SUPABASE_ANON_KEY --env preview --body "<preview-anon-key>"
gh variable set VITE_PUBLIC_TURNSTILE_SITE_KEY --env preview --body "<preview-site-key>"
gh variable set VITE_PUBLIC_VAPID_PUBLIC_KEY --env preview --body "<preview-vapid-public>"

# ---- production ----
gh variable set VITE_PUBLIC_API_BASE_URL     --env production --body "https://<production-api-origin>"
gh variable set API_ORIGIN                   --env production --body "https://<production-api-origin>"
gh variable set VITE_PUBLIC_SUPABASE_URL     --env production --body "https://<prod-ref>.supabase.co"
gh variable set VITE_PUBLIC_SUPABASE_ANON_KEY --env production --body "<prod-anon-key>"
gh variable set VITE_PUBLIC_TURNSTILE_SITE_KEY --env production --body "<prod-site-key>"
gh variable set VITE_PUBLIC_VAPID_PUBLIC_KEY --env production --body "<prod-vapid-public>"
```

**One naming change worth making now.** The repository variables
`PRODUCTION_API_ORIGIN` and `PREVIEW_API_ORIGIN` exist only because a
single repository scope had to encode the environment in the variable
*name*, which is why `deploy-api.yml` takes a `smoke_test_origin_var`
input and dereferences it as `vars[inputs.smoke_test_origin_var]`. With
environment scope, both collapse into one `API_ORIGIN` per environment,
and that indirection disappears — the workflow just reads
`vars.API_ORIGIN` and gets the right one. Delete the two old repository
variables once the workflows are cut over.

## Step 6 — Wire the workflows

**This is the step people skip, and skipping it silently breaks every
deploy.** An environment secret is injected **only** into a job that
declares `environment:`. A job without that key sees no environment
secrets at all — `secrets.CLOUDFLARE_API_TOKEN` evaluates to an empty
string, and both deploy workflows' credential guards then take their
"not configured, skip cleanly" path. The pipeline goes green while
deploying nothing.

Three coordinated edits:

**a. `deploy-web.yml` and `deploy-api.yml`** — take the environment name
as an input and declare it on the job:

```yaml
on:
  workflow_call:
    inputs:
      environment:
        description: GitHub Environment to draw secrets and variables from.
        type: string
        required: true
      # ... existing inputs

jobs:
  build-and-deploy:
    # This line is what makes the environment's secrets exist for this job.
    environment: ${{ inputs.environment }}
    runs-on: ubuntu-latest
```

**b. `pipeline.yml`** — resolve the environment name in the existing
`context` job (it already resolves `channel`, so this is one more output
on a switch that is already there), and pass it down. Replace
`secrets: inherit` with an explicit list:

```yaml
  deploy-api:
    needs: [context, images, ml-image]
    if: needs.context.outputs.deploy_api == 'true'
    uses: ./.github/workflows/deploy-api.yml
    with:
      environment: ${{ needs.context.outputs.environment }}
      wrangler_env: ${{ needs.context.outputs.wrangler_env }}
    secrets:
      CLOUDFLARE_API_TOKEN: ${{ secrets.CLOUDFLARE_API_TOKEN }}
      CLOUDFLARE_ACCOUNT_ID: ${{ secrets.CLOUDFLARE_ACCOUNT_ID }}
      SUPABASE_SERVICE_ROLE_KEY: ${{ secrets.SUPABASE_SERVICE_ROLE_KEY }}
      # ... one line per secret the workflow actually uses
```

Naming each secret is the point. `secrets: inherit` is a standing grant of
everything to everyone downstream; an explicit list is an audit trail you
can read in one screen, and adding a secret to it is a reviewable diff.

> **Ordering caveat.** With `environment:` declared on the *called*
> workflow's job, the caller's `secrets:` block passes **repository**-scope
> secrets, which is not what you want. Two workable shapes: either declare
> `environment:` on the calling job in `pipeline.yml` and keep passing
> secrets down explicitly, or move the whole deploy job body into
> `pipeline.yml`. Pick one, write down which, and verify with the dry run in
> Step 8 rather than assuming — this is the single most common way a
> per-environment split ends up injecting nothing.

**c. Delete the repository-scoped copies** — but only after Step 8's
verification passes on both branches:

```bash
gh secret delete CLOUDFLARE_API_TOKEN
gh secret delete CLOUDFLARE_ACCOUNT_ID
# ... and each of the others
gh variable delete PRODUCTION_API_ORIGIN
gh variable delete PREVIEW_API_ORIGIN
```

Leaving them in place is not harmless: a repository secret is a silent
fallback that makes a misconfigured environment look like it works, which
is precisely the failure this whole exercise exists to remove.

## Step 7 — Scope the credentials at the provider

Environment isolation in GitHub is worth nothing if both environments hold
a token that can reach everything.

**Cloudflare — create a second, narrower API token.** Follow
`docs/ci-cd.md` § Obtaining `CLOUDFLARE_API_TOKEN`, then:

- Create **two** custom tokens rather than one, named so their purpose is
  obvious in the Cloudflare audit log (`avash-deploy-preview`,
  `avash-deploy-production`).
- Both need **Account → Cloudflare Pages → Edit** and **Account → Workers
  Scripts → Edit**, scoped to the one account.
- Cloudflare's token scoping is account-level, not per-Worker, so the two
  tokens have the same nominal permissions. The isolation you gain is
  **revocability and attribution**: a leaked preview token is revoked
  without touching production deploys, and the audit log says which one
  did what. Do not let the imperfection talk you out of it.
- Set a **TTL** on both, and put the expiry date in the team calendar.

**Supabase** — the preview environment points at a **separate project**,
not a separate schema in the same project. A service-role key is
project-wide and bypasses RLS entirely; there is no narrower scope to
grant. Different project is the only real boundary.

**Upstash, Gemini, Turnstile** — separate database, separate key,
separate site configuration. Each of these has a free tier, so the cost of
the split is setup time, not money.

## Step 8 — Verify, before deleting anything

Verification is behavioral. GitHub never returns a secret's value, so the
only proof that the right value landed in the right place is a run.

1. **Preview path.** Push a trivial commit to `dev` (a comment in a doc is
   enough). Watch the run:
   - The `deploy-api` job shows a **`preview`** environment badge in the
     Actions UI. No badge means the `environment:` key did not take effect —
     stop and fix Step 6 before going further.
   - The job does **not** pause for approval.
   - The post-deploy smoke test hits the preview origin, not production.
   - The Cloudflare dashboard shows a new deployment on `avash-api-preview`
     and the `dev` Pages branch, and **nothing** new on production.
2. **Production path.** Open and merge a PR from `dev` to `main`. The
   `deploy-api` job should **pause** with "Waiting for review." Confirm the
   named reviewer — and only they — can approve it. Approve, then confirm
   the deploy targets production and the smoke test passes.
3. **The negative test, which is the one that matters.** Push a branch
   named anything else and trigger the pipeline manually
   (`workflow_dispatch`). Confirm the deploy jobs are skipped by the
   `context` job's branch resolution, and that no environment secret was
   available to the run. Then, temporarily, edit a throwaway branch's
   workflow copy to request `environment: production` and confirm **GitHub
   refuses to run it** because of the Step 2 branch policy. Delete the
   throwaway branch. If that refusal does not happen, the branch policy is
   not configured and every other step here is decoration.
4. Only now, delete the repository-scoped secrets (Step 6c).

## Step 9 — Rotation, per environment

The procedure in `docs/security/secrets-matrix.md` § Rotation still
applies, with one change: every step happens **twice, independently**, and
`preview` goes first.

1. Rotate the `preview` credential at the provider.
2. `gh secret set <NAME> --env preview`.
3. `wrangler secret put <NAME> --env preview`.
4. Redeploy `dev`; confirm the preview environment is healthy.
5. Only then repeat 1–4 for `production`.

Rotating preview first turns every rotation into a rehearsal with no
production exposure. A credential suspected of being compromised skips the
ordering — revoke it immediately in whichever environment holds it, and
note that revoking a preview credential does not require a production
deploy.

## Gotchas

- **No `environment:` key, no environment secrets.** Covered in Step 6, and
  worth repeating because the failure is silent: the deploy guard reads an
  empty token and reports "not configured — skipping deploy" as a
  *success*. Once environments are live, that guard should hard-fail on
  `main` rather than skip; a production deploy that quietly ships nothing
  is worse than a red build.
- **Pull requests from forks get nothing.** Environment secrets are never
  injected into a fork PR run, by design. This is correct and is why
  `pipeline.yml` gives pull requests a Pages preview and no Worker deploy.
- **Scheduled runs and required reviewers.** A `schedule`-triggered run
  that requests `production` will sit waiting for an approval nobody is
  watching for. The weekly sweep in `pipeline.yml` deploys nothing, so it
  must never declare an environment.
- **Required reviewers gate the *job*, not the merge.** The commit is
  already on `main` while the deploy waits. Branch protection on `main` is
  a separate control and still worth configuring.
- **Environment protection is not branch protection.** A branch policy
  stops the *secrets* from being injected on the wrong ref; it does not
  stop anyone from pushing to that ref. Set both.
- **The GitHub UI hides environment secrets behind the environment.** They
  do not appear under Settings → Secrets and variables → Actions. Someone
  auditing that page will conclude the repository has no secrets
  configured. Note the split in any handover.
- **`gh secret set` without `--env` writes a repository secret.** A single
  forgotten flag recreates exactly the fallback Step 6c deleted.
