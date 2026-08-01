# ADR-007: GitHub Actions `schedule` cron replaces QStash; Upstash scoped to rate limiting only

**Date:** 2026-08-01
**Status:** Accepted

## Context

Three background jobs need to run on a schedule with no user-facing
trigger: weather ingestion (every 3h), batch risk prediction (every 24h),
and news scanning. A common pattern for this on Cloudflare-adjacent stacks
is Upstash QStash (HTTP-triggered scheduled/queued jobs hitting a Worker
endpoint). That pattern means the job logic must live behind an
**invokable HTTP endpoint** on `apps/api` — which is itself a new,
unauthenticated-by-default attack surface (a forged trigger could re-run
an expensive job, or run it out of cadence).

**Rejected alternative:** Upstash QStash scheduling an `/api/jobs/*`
endpoint on `apps/api` that performs the ingestion/prediction/scan logic.
Rejected because (a) it requires securing an entirely new class of
endpoint against forged invocation, and (b) `ml/serving/predict.py` needs a
real Python runtime with `onnxruntime` — not something a Cloudflare Worker
can execute at all, forcing an awkward split where the Worker would only
proxy to something else anyway.

## Decision

All three jobs run as GitHub Actions `schedule`-triggered workflows
(`cron-weather-ingest.yml`, `cron-batch-predict.yml`, `cron-news-scan.yml`),
executing real Node/TypeScript (`scripts/jobs/*.ts`) or Python
(`ml/serving/predict.py`) runtimes and connecting **directly** to Supabase
using the service-role key stored as a GitHub Actions secret. **No
background job is ever exposed as an HTTP endpoint on `apps/api`.** Upstash
Redis is retained in the stack, but scoped strictly to rate limiting inside
`apps/api` request handling — a genuinely edge-appropriate use of a fast KV
counter.

## Consequences

**Easier:** GitHub Actions is free at this project's scale, has no
CPU-time ceiling relevant to batch inference, natively runs both Node and
Python, and needs no additional infrastructure account beyond what CI
already uses. There is no forged-HTTP-trigger attack class to defend
against for background jobs at all — it is removed by construction.

**Harder:** job execution is coupled to GitHub Actions' scheduling
reliability and minute quotas; jobs cannot be triggered by an external
event outside GitHub (e.g., a webhook) without an additional
`workflow_dispatch`/`repository_dispatch` bridge. Debugging a failed job
means reading Actions logs rather than a Worker's `wrangler tail` output.
