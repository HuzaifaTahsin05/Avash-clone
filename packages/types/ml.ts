// RiskPrediction matches risk_predictions exactly (packages/db/types.ts) —
// the same shape the batch-predict job writes and the map/API read back.
export type {
  RiskPredictionRow as RiskPrediction,
  RegionRiskSummaryRow as RegionRiskSummary,
  RiskLevel,
} from '@avash/db';
