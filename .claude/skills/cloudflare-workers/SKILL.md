---
name: cloudflare-workers
description: Use when touching apps/api/wrangler.toml, deployment configuration, secrets management via wrangler, or reasoning about Workers runtime limits (CPU time, memory). Invoke for wrangler.toml edits or any question about what's feasible inside a Worker.
---

# Cloudflare Workers Runtime for Avash

## The CPU-time reality (behind ADR-002)

The free-tier CPU-time cap (~10ms) applies to **compute**, not I/O-wait. A
Worker can wait on a slow Supabase query or a Gemini API call within
budget — waiting isn't compute. But anything CPU-bound (ONNX tensor math,
heavy synchronous JSON processing over a large payload, cryptographic work
beyond what `jose`/Web Crypto already optimize) can blow the cap
unpredictably. This is why per-request ML inference is never implemented
inside `apps/api` — see ADR-002 and `docs/ml/inference-architecture.md`.
When in doubt about whether new logic is "too heavy" for a Worker, ask
whether it's I/O-bound (safe) or CPU-bound (risky) before writing it here.

## `wrangler.toml` structure

- `compatibility_flags = ["nodejs_compat"]` for Node API compatibility
  (`jose`, etc.).
- `[observability] enabled = true` for request logging/tracing.
- `[env.production]` / `[env.preview]` sections split config per
  deployment target — never hardcode a single environment's values at the
  top level if they differ between production and preview.
- `[vars]` lists every required secret **name** as a commented inventory
  only. Never put a real secret value in this file — it's committed to
  git.

## Secrets via `wrangler secret`

Real secret values are injected via `wrangler secret put <NAME>` per
environment (local dev uses a gitignored `.dev.vars` file instead) or via
GitHub Actions secrets for CI/deploy workflows. See
`docs/security/secrets-matrix.md` for the full per-environment procedure
and the rotation steps.

## Pages vs Workers deployment split

- `apps/web` → Cloudflare **Pages** (static asset hosting, `deploy-web.yml`).
- `apps/api` → Cloudflare **Workers** (`wrangler deploy`, `deploy-api.yml`).

These are two separate deploy pipelines with two separate secret scopes —
`apps/web`'s Pages environment variables are always public
(`VITE_PUBLIC_*`, baked into the static build), while `apps/api`'s Workers
secrets are genuinely server-only and never appear in any build output.
Do not conflate the two when reasoning about where a config value belongs.
