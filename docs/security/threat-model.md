# Threat Model

Full STRIDE (Spoofing, Tampering, Repudiation, Information Disclosure,
Denial of Service, Elevation of Privilege) analysis, organized by feature,
mirroring `docs/PROJECT_PLAN.md` §7.2. Every threat below states its
vector and where the mitigation is actually enforced in code — not just a
general principle.

## Risk Map / Resource Reads (public, unauthenticated)

| Threat | Vector | Mitigation | Enforcement point |
|---|---|---|---|
| Denial of Service | Unbounded bbox queries against the spatial index, or a flood of requests | Clamp max bbox area server-side; reads served from `region_risk_summary` MV + covering GiST index, never a live spatial join on the request path | `apps/api/src/routes/risk-map.ts`, `apps/api/src/routes/resources.ts` |
| Information Disclosure | Exact hospital blood stock scraped in bulk across all hospitals | Rate limit (60/min/IP); no bulk-export endpoint; Realtime channel only exposes rows already covered by public `select` RLS | `apps/api` route rate-limit middleware; RLS on `blood_inventory` |
| Information Disclosure | Basemap tile requests go from the user's browser straight to a third-party host (ADR-013), disclosing the viewport — and therefore the user's approximate area of interest — to OpenStreetMap's servers | Accepted and bounded, not eliminated: tiles carry no identifier of ours, `Referrer-Policy: strict-origin-when-cross-origin` limits what the tile host learns about the page, and the `CacheFirst` service-worker policy means a revisited area produces no new request. No user identifier, report content, or API response ever transits the tile request | `apps/web/public/_headers` (referrer policy + `img-src` allow-list); Workbox tile caching rule (§8) |
| Tampering | A compromised or hijacked tile host serves misleading basemap imagery under our origin | Tiles are `<img>` content, not script: CSP grants the tile host `img-src` only, never `script-src` or `connect-src`, so a hostile response cannot execute or read anything. Every authoritative element — risk shading, markers, labels the user acts on — is our own overlay from `apps/api`, never basemap imagery | `apps/web/public/_headers`, `apps/web/docker/security-headers.conf.template` |

## Breeding Report Submission (anonymous-friendly write)

| Threat | Vector | Mitigation | Enforcement point |
|---|---|---|---|
| Spoofing / Spam | Bot floods the endpoint with fake reports | Turnstile mandatory + IP rate limit (5/min, 20/day) + Gemini spam-likelihood filter, all enforced server-side — unreachable directly from a static frontend bundle | `apps/api/src/middleware/turnstile.ts`, `apps/api/src/middleware/rate-limit.ts`, `apps/api/src/routes/reports.ts` |
| Tampering | Geom injected outside valid coordinate bounds | Server-side `ST_IsValid` check + lat/lng range validation before insert | `apps/api/src/routes/reports.ts`, zod schema in `packages/types` |
| Repudiation | No audit trail for who submitted what | `created_at`, `reporter_id` (nullable), immutable insert — no client-side update/delete path; RLS forbids it | `breeding_reports` schema + RLS policy |
| Elevation of Privilege | A citizen tries to self-verify their own report | `status` update path restricted to `moderator`/`admin` via RLS **and** re-checked in the Hono route handler (defense in depth) | RLS `update` policy on `breeding_reports`; `apps/api/src/routes/reports.ts` role check |

## Blood Inventory Update (privileged write)

| Threat | Vector | Mitigation | Enforcement point |
|---|---|---|---|
| Spoofing | Impersonating hospital staff to alter stock numbers | `verified_hospital_staff` join table, populated only by admin, checked in RLS *and* in `apps/api` middleware (defense in depth) | RLS `update` policy on `blood_inventory`; `apps/api/src/middleware/auth.ts` |
| Tampering | Wildly implausible values submitted (e.g., 99999 units) | `check` constraints (`units_available >= 0`, `platelet_units >= 0`) + a sane upper-bound validation in the zod schema | `blood_inventory` table constraints; `packages/types` zod schema |

## Symptom Checker (LLM-touching)

| Threat | Vector | Mitigation | Enforcement point |
|---|---|---|---|
| Tampering / Prompt Injection | User submits `"ignore previous instructions..."` or similar to steer the model | Fixed system prompt (never user-modifiable), `responseSchema`-constrained output, input sanitization/length caps (§5.4) — all server-side | `apps/api/src/routes/symptom-check.ts`, `apps/api/src/lib/geminiClient.ts` |
| Information Disclosure | Symptom text (potentially sensitive) persisted or leaked | No PII sent to Gemini beyond the structuring call; no conversation persisted beyond the request lifecycle | `apps/api/src/routes/symptom-check.ts` |
| Denial of Service / Cost Abuse | Gemini free-tier quota drained by repeated calls | Per-IP + global daily counter circuit breaker (§7.3); falls back to the deterministic rule engine with an "AI assist temporarily unavailable" notice when tripped | `packages/security/quotaGuard.ts` |

## News Aggregator Agent

| Threat | Vector | Mitigation | Enforcement point |
|---|---|---|---|
| Tampering via untrusted content | Malicious article text attempts to manipulate the LLM into fabricating outbreak data | Content is always wrapped as inert `<article>` data, never role-elevated in the prompt; output requires human `reviewed = true` before it can influence anything public-facing | `scripts/jobs/news-scan.ts`; RLS `select` policy on `news_items` gating unreviewed rows |

## Batch Inference Job

| Threat | Vector | Mitigation | Enforcement point |
|---|---|---|---|
| Tampering | A compromised dependency or supply-chain attack alters the ONNX artifact | Checksum-pinned model file; version recorded in `risk_predictions.model_version`; `predict.py` verifies SHA256 against `ml/training/MODEL_MANIFEST.json` before running, aborts the job on mismatch | `ml/serving/predict.py` |
| Secret Exposure | `VAPID_PRIVATE_KEY` / `SUPABASE_SERVICE_ROLE_KEY` leaked via job logs | Exist only as GitHub Actions encrypted secrets, injected as ephemeral env vars into the runner — never logged; explicit `::add-mask::` on any accidental echo | `.github/workflows/cron-batch-predict.yml` |

## Cross-Origin Surface (new with the two-app split)

| Threat | Vector | Mitigation | Enforcement point |
|---|---|---|---|
| CORS Misconfiguration | An overly permissive `Access-Control-Allow-Origin` lets any site call the API with a user's token | `apps/api`'s CORS middleware allow-lists exact production + PR-preview Cloudflare Pages origins only, never `*`, never a regex wildcard on write routes | `apps/api/src/middleware/cors.ts` |

## Weather Dashboard (public, unauthenticated)

| Threat | Vector | Mitigation | Enforcement point |
|---|---|---|---|
| Tampering | A forged `regionCode`/`days` value reaching a SQL query | zod-schema parsing before any query runs; PostgREST parameterizes every filter it builds from the validated values | `apps/api/src/routes/weather.ts`, zod schemas in `packages/types` |
| Information Disclosure | A PostgREST error body echoed straight back to the client | Generic `buildGenericErrorBody()` response on every error branch; the real error is logged server-side keyed by `requestId` | `apps/api/src/routes/weather.ts` (`@avash/logger`) |
| Information Disclosure | `OPENWEATHERMAP_API_KEY` appearing in a job log via the request URL (the key is a query parameter on that provider's API) | The ingest job logs only the region code and HTTP status per attempt, never the request URL; GitHub Actions independently masks any literal `secrets.*` value in output | `scripts/jobs/weather-ingest.ts` |
| Denial of Service | An oversized `?days=` value, or a flood of requests, forcing a large scan | Server-side clamp to `WEATHER_HISTORY_WINDOW_DAYS` (14); existing 5 s DB statement timeout; reads go through `region_weather_observations`/`region_latest_weather` views | `apps/api/src/routes/weather.ts` |
| Spoofing | None new — both weather routes are unauthenticated public reads with no identity to spoof | Not applicable; stated explicitly rather than left unconsidered | n/a |

## Risk Map (public, unauthenticated)

| Threat | Vector | Mitigation | Enforcement point |
|---|---|---|---|
| Tampering | A forged `bbox`/`horizon` value reaching a SQL query | `horizonWeeksSchema` + `parseBbox()` validation before any query runs; PostgREST parameterizes every filter built from the validated values | `apps/api/src/routes/risk-map.ts`, `packages/geo/bbox.ts` |
| Information Disclosure | A PostgREST error body echoed straight back to the client | Generic `buildGenericErrorBody()` response on every error branch; real error logged server-side keyed by `requestId` | `apps/api/src/routes/risk-map.ts` (`@avash/logger`) |
| Denial of Service | Unbounded `bbox` (or a flood of requests) forcing a full scan | `BBOX_MAX_SPAN_DEG`; existing 5 s DB statement timeout; `region_risk_geojson` reads a materialized view — spatial work already done before the request path | `packages/geo/bbox.ts`, `apps/api/src/routes/risk-map.ts`, `packages/db/supabase/migrations/20260215000009_api_read_views.sql` |
| Denial of Service | Bulk/rapid tile requests against the free, unauthenticated OSM tile service (tile-usage-policy violation) | Partially mitigated: `MAP_TILE_MAX_ZOOM` bounds request volume per viewport, attribution is shown per OSM policy. **Not yet mitigated:** no `CacheFirst` service-worker/Workbox tile-caching policy exists in the repository as of this writing — checked, not found — this is an open gap | `apps/web/src/features/map/tileLayer.ts`; no service-worker config present under `apps/web` |
| Spoofing | None new — both risk-map routes are unauthenticated public reads with no identity to spoof | Not applicable; stated explicitly rather than left unconsidered | n/a |

---

This threat model is re-run against the *actual shipped code* (not just
the plan) as its own vertical slice — `docs/PROJECT_PLAN.md` §13, slice 9
("Security hardening pass"). Any feature added outside these seven groups
must have its own STRIDE row added here **before** merge, per
`AGENTS.md`'s "When securing a feature" section.
