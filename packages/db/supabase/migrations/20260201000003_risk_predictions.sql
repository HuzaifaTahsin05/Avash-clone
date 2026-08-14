-- docs/PROJECT_PLAN.md §4 — model output. risk_level bands mirror
-- RISK_LEVEL_BANDS (§14) exactly; if that constant ever changes, this
-- generated column must change with it in the same migration.
create table risk_predictions (
  id bigint generated always as identity primary key,
  region_id uuid references regions(id) on delete cascade on update cascade,
  prediction_date date not null,
  horizon_weeks smallint not null check (horizon_weeks in (2, 4)),
  risk_score numeric(4,3) not null check (risk_score between 0 and 1),
  risk_level text generated always as (
    case when risk_score < 0.25 then 'low'
         when risk_score < 0.50 then 'moderate'
         when risk_score < 0.75 then 'high'
         else 'severe' end
  ) stored,
  top_factors jsonb,                    -- SHAP top-3 contributing features, for explainability UI
  model_version text not null,
  generated_at timestamptz default now(),
  unique (region_id, horizon_weeks, prediction_date)
);
create index idx_predictions_region_date on risk_predictions (region_id, prediction_date desc);
