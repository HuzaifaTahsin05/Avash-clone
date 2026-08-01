# ADR-002: Batch inference (Python, GitHub Actions), not per-request edge inference

**Date:** 2026-08-01
**Status:** Accepted

## Context

The original brief wanted "zero-cost, edge, near-0ms perceived latency" AI
inference — read naively, that suggests running ONNX model inference
inside the Cloudflare Worker on every request. That is not realistic on
the free tier: the ~10ms CPU-time cap applies to actual **compute**, not
I/O-wait, and WASM tensor math for a LightGBM-derived model across many
regions per request is compute-bound. It will blow the cap unpredictably
depending on region count and Worker cold-state, producing an unreliable
production path for a health-safety-relevant feature.

**Rejected alternative:** run `onnxruntime-web` inside `apps/api` on every
`/api/risk-map` request. Rejected for the CPU-time reason above, and
because it would recompute identical predictions on every request instead
of once per model run — wasteful even if it fit the time budget.

**Rejected alternative:** move inference to a third-party GPU/CPU
inference host (e.g., a managed inference API). Rejected as unnecessary
cost and infrastructure for a LightGBM-scale model that runs comfortably
on a standard GitHub Actions runner.

## Decision

Two distinct inference paths, per `docs/PROJECT_PLAN.md` §5.3:

- **Batch (source of truth):** `ml/serving/predict.py`, plain Python +
  `onnxruntime`, executed inside a GitHub Actions runner every 24h
  (`cron-batch-predict.yml`). Writes `risk_predictions` for every region;
  powers the map, dashboards, and alerts. No Cloudflare CPU-time
  constraint applies here at all.
- **On-device (bonus UX):** `onnxruntime-web` (WASM) inside the installed
  `apps/web` PWA, for on-demand, fully offline re-scoring of the user's own
  last-synced feature snapshot. This is where "0ms cold start / edge AI" is
  an honest claim, because compute happens on the user's device, not a
  shared Worker with a CPU-time ceiling.

Both paths load the same checksum-pinned `.onnx` artifact — one model
file, versioned once, consumed twice.

## Consequences

**Easier:** the production risk-prediction path has no CPU-time risk and
runs on infrastructure (GitHub Actions) already used for other jobs
(ADR-007), with no new hosting cost. The on-device path can be built and
tested independently, since it consumes a static artifact rather than a
live inference endpoint.

**Harder:** risk predictions are only as fresh as the last batch run (24h
cadence, `BATCH_PREDICT_CADENCE`, §14) — this is not truly real-time.
Consumers of `risk_predictions` must treat `generated_at` as the freshness
signal. If Cloudflare's paid-tier CPU-time limits are ever raised enough to
change this trade-off, that is tracked as a new `ADR-002-followup.md`, not
a silent behavior change.
