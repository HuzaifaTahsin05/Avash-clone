// RiskPrediction matches risk_predictions exactly (packages/db/types.ts) —
// the same shape the batch-predict job writes and the map/API read back.
export type {
  RiskPredictionRow as RiskPrediction,
  RegionRiskSummaryRow as RegionRiskSummary,
  RiskLevel,
} from '@avash/db';

/** §14 RISK_MAP_DEFAULT_HORIZON_WEEKS — horizon the map opens on. */
export const RISK_MAP_DEFAULT_HORIZON_WEEKS = 2 as const;
/** §14 STUB_MODEL_VERSION — sentinel for seeded placeholder predictions. */
export const STUB_MODEL_VERSION = 'stub-0.0.0' as const;
