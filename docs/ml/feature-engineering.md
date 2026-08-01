# Feature Engineering Specification

Per-feature computation detail for the `model_h2`/`model_h4` classifiers
(`docs/ml/model-card.md` §5.2). Constants are referenced by their
`docs/PROJECT_PLAN.md` §14 registry name — never by a bare number in
training or feature code.

## `temp_mean_roll`

- **Computation:** rolling mean of `weather_observations.temp_mean_c`.
- **Window:** 7 / 14 / 28 day (three separate rolling-window features).
- **Source table:** `weather_observations`.
- **Null/missing handling:** if fewer than the window's expected
  observation count exist for a region (e.g., ingestion gap), the rolling
  mean is computed over whatever observations are available within the
  window rather than producing `NaN`; a region with zero observations in
  the window is excluded from that batch run's feature matrix entirely
  (no synthetic/imputed value is fabricated).
- **Leakage risk:** low — strictly backward-looking from the feature
  computation date; the rolling window never includes observations after
  the prediction's `as-of` date.

## `temp_min_roll`

- **Computation:** rolling mean of `weather_observations.temp_min_c`.
- **Window:** 14 day.
- **Source table:** `weather_observations`.
- **Null/missing handling:** same as `temp_mean_roll`.
- **Leakage risk:** low — same backward-looking guarantee.

## `humidity_roll`

- **Computation:** rolling mean of `weather_observations.humidity_pct`.
- **Window:** 14 day.
- **Source table:** `weather_observations`.
- **Null/missing handling:** same as `temp_mean_roll`.
- **Leakage risk:** low.

## `precip_cum`

- **Computation:** cumulative sum of `weather_observations.precipitation_mm`.
- **Window:** 14 day.
- **Source table:** `weather_observations`.
- **Null/missing handling:** missing readings within the window are
  treated as 0mm contribution rather than excluded — a gap in ingestion
  should not artificially deflate a region's true cumulative precipitation
  by shrinking the summed window, but it does mean this feature can
  understate true rainfall during an ingestion outage; ingestion-gap
  regions are still flagged and excluded from training if the gap exceeds
  the pipeline's tolerance (see `ml/training/feature_engineering.py`).
- **Leakage risk:** low — backward-looking only.

## `case_lag_1/2/3`

- **Computation:** `dengue_cases.case_count` at t-1, t-2, t-3 weeks
  relative to the prediction's `as-of` week (three separate features).
- **Window:** weekly (fixed lag, not a rolling window).
- **Source table:** `dengue_cases`.
- **Null/missing handling:** a region missing any of the three lag weeks
  in `dengue_cases` is excluded from that training/prediction row entirely
  — these are the strongest predictive features (case autocorrelation),
  and imputing a fabricated case count would materially distort the
  signal.
- **Leakage risk:** **highest feature in the set to audit for leakage.**
  The lag weeks must be strictly before the label's target week
  (`SURGE_TARGET_THRESHOLD` compares against the *current* week to define
  the label) — walk-forward CV (§5.2) exists specifically so a fold's
  validation week's lag features can never be drawn from data the model
  wasn't allowed to see yet in a real deployment timeline.

## `favorable_breeding_flag`

- **Computation:** boolean derived feature:
  ```
  temp_mean_roll ≥ DENGUE_FAVORABLE_TEMP_MEAN_C (27)
  AND temp_min_roll ≥ DENGUE_FAVORABLE_TEMP_MIN_C (22)
  AND humidity_roll ≥ DENGUE_FAVORABLE_HUMIDITY_PCT (80)
  ```
  All three threshold constants are defined once in
  `ml/training/config.py` and mirrored in `packages/types/ml.ts` — feature
  code references the named constant, never `27`/`22`/`80` as a bare
  literal.
- **Window:** derived (depends on the already-windowed `temp_mean_roll`,
  `temp_min_roll`, `humidity_roll` features above — no independent window
  of its own).
- **Source table:** derived from `weather_observations`-sourced features,
  not queried directly.
- **Null/missing handling:** if any of the three inputs is unavailable for
  the region/week (per their own missing-data rules above), this flag is
  also unavailable for that row — never defaulted to `false`, since a
  missing-data false would be indistinguishable from a genuine
  "conditions not favorable" signal.
- **Leakage risk:** low — purely a function of already-backward-looking
  inputs.

## `seasonality_sin/cos`

- **Computation:** `sin(2π × week_of_year / 52)` and
  `cos(2π × week_of_year / 52)` — a cyclical encoding of ISO week-of-year
  so the model can learn seasonal effects without a discontinuity between
  week 52 and week 1.
- **Window:** static (a pure function of the calendar date, not a rolling
  computation).
- **Source table:** none — computed from `dengue_cases.reported_week` /
  `risk_predictions.prediction_date`.
- **Null/missing handling:** not applicable — always computable from a
  known date.
- **Leakage risk:** none — calendar-derived, carries no information from
  the future beyond the trivial fact of what week it currently is.

## `population_density`

- **Computation:** `regions.population / area(regions.geom)`.
- **Window:** static (recomputed only when `regions.population` changes,
  which is rare/administrative, not a training-time concern).
- **Source table:** `regions`.
- **Null/missing handling:** a region with `population IS NULL` is
  excluded from training and from batch prediction — there is no default
  population assumption, since silently guessing a density could bias
  predictions for under-instrumented regions in an unreviewable way.
- **Leakage risk:** none — static reference data, not tied to any
  prediction timeframe.
