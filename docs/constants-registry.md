# Constants Registry

Single source of truth for every static threshold used anywhere in this
codebase, mirroring `docs/PROJECT_PLAN.md` §14 exactly. **If you hardcode
a number anywhere else, it must appear here first** — add the row (and the
corresponding §14 row) in the same PR that introduces the value.

`Status` starts `documented` for every row as of Milestone 1 (docs-only).
A row flips to `implemented` only once the constant is actually wired into
the code location listed, in the milestone that builds that code.

| Constant | Value | Defined in | Purpose | Status |
|---|---|---|---|---|
| `DENGUE_FAVORABLE_TEMP_MEAN_C` | 27 | `ml/training/config.py`, `packages/types/ml.ts` | breeding-favorability feature flag | documented |
| `DENGUE_FAVORABLE_TEMP_MIN_C` | 22 | `ml/training/config.py`, `packages/types/ml.ts` | breeding-favorability feature flag | documented |
| `DENGUE_FAVORABLE_HUMIDITY_PCT` | 80 | `ml/training/config.py`, `packages/types/ml.ts` | breeding-favorability feature flag | documented |
| `PREDICTION_HORIZONS_WEEKS` | [2, 4] | `ml/training/config.py` | forecast horizons | documented |
| `SURGE_TARGET_THRESHOLD` | +30% WoW case growth | `ml/training/config.py` | classification label definition | documented |
| `RISK_LEVEL_BANDS` | low < .25, moderate < .50, high < .75, severe ≥ .75 | `packages/types/ml.ts`, SQL generated column | UI color coding, alerts | documented |
| `MIN_RECALL_TARGET` / `MIN_PRECISION_TARGET` | 0.85 / 0.60 | `ml/evaluation/backtest.py` | model promotion gate | documented |
| `ONNX_MODEL_SIZE_BUDGET` | < 2 MB | `ml/training/export_onnx.py` | PWA offline cache feasibility | documented |
| `MODEL_RETRAIN_CADENCE` | monthly, manual promotion | `docs/ml/model-card.md` | drift mitigation | documented |
| `BATCH_PREDICT_CADENCE` | every 24h | `.github/workflows/cron-batch-predict.yml` | freshness of `risk_predictions` | documented |
| `WEATHER_INGEST_CADENCE` | every 3h | `.github/workflows/cron-weather-ingest.yml` | freshness of weather features | documented |
| `RISK_MAP_CACHE_TTL_S` | s-maxage=300, swr=600 | `apps/api/src/routes/risk-map.ts` | edge cache behavior | documented |
| `MV_REFRESH_INTERVAL` | triggered post-batch-predict | `ml/serving/predict.py` | map read freshness | documented |
| `BREEDING_REPORT_RATE_LIMIT` | 5/min, 20/day per IP | `packages/security` | abuse prevention | documented |
| `SYMPTOM_CHECK_RATE_LIMIT` | 10/min, 50/day per IP | `packages/security` | Gemini cost control | documented |
| `BLOOD_UPDATE_RATE_LIMIT` | 10/min per verified user | `packages/security` | write abuse prevention | documented |
| `GEMINI_DAILY_QUOTA_GUARD` | 1500 req/day (global) | `packages/security/quotaGuard.ts` | free-tier cost circuit breaker | documented |
| `ALERT_PROXIMITY_RADIUS_DEFAULT_M` | 2000 (bounds: 100–20,000) | `packages/geo`, `alert_subscriptions` check constraint | `ST_DWithin` default/ceiling | documented |
| `DB_STATEMENT_TIMEOUT_S` | 5 | Supabase API role config | prevents runaway spatial queries | documented |
| `FRONTEND_BUNDLE_BUDGET_KB` | < 180 KB gzip (shell) | `apps/web/vite.config.ts` bundle analyzer CI check | performance | documented |
| `CORS_ALLOWED_ORIGINS` | production Pages domain + PR preview pattern | `apps/api/src/middleware/cors.ts` | cross-origin write protection | documented |

That is 20 named rows covering all 22 individual constants from §14
(`MIN_RECALL_TARGET`/`MIN_PRECISION_TARGET` and
`BREEDING_REPORT_RATE_LIMIT`/etc.'s per-window limits are each two values
sharing one row, matching how §14 itself pairs them).

## The rule

A number hardcoded anywhere in the codebase (a route handler, a migration,
a config file, a test) must appear in this table **and**
`docs/PROJECT_PLAN.md` §14 before it is used. If a task needs a new
constant that isn't here, add the row to both places in the same change —
do not introduce a bare literal and document it "later."

## Flipping a row to `implemented`

A later milestone flips a row's `Status` to `implemented` once the
constant is actually read from its documented location in shipped code
(not just referenced in a comment or a doc). The milestone that does the
flipping records it in that milestone's Completion Report. Expected
flip points per the execution schedule:

- `FRONTEND_BUNDLE_BUDGET_KB` — M2 (frontend scaffold, M2-T14).
- `RISK_LEVEL_BANDS`, `ALERT_PROXIMITY_RADIUS_DEFAULT_M`,
  `DB_STATEMENT_TIMEOUT_S`, `MV_REFRESH_INTERVAL` — M6 (database schema,
  M6-T15).
- `CORS_ALLOWED_ORIGINS` — M3 (backend scaffold).
- The remaining ML, rate-limit, and cadence constants flip as their owning
  vertical slice ships (`docs/PROJECT_PLAN.md` §13, slices 3, 4, 5, 7).
