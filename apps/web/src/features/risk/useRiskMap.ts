import { useQuery } from '@tanstack/react-query';
import { riskMapResponseSchema, type RiskMapResponse } from '@avash/types';
import { fetchApi } from '../../lib/apiClient';

/** Exported separately so the query logic is testable without rendering a component tree. */
export async function fetchRiskMap(horizonWeeks: 2 | 4): Promise<RiskMapResponse> {
  const params = new URLSearchParams({ horizon: String(horizonWeeks) });
  const result = await fetchApi(`/api/risk-map?${params.toString()}`, riskMapResponseSchema);
  if (!result.ok) {
    throw new Error(result.error);
  }
  return result.data;
}

/**
 * `bbox` is optional on `GET /api/risk-map` (omitting it returns the full
 * country). The map page renders the whole risk-map FeatureCollection at
 * once rather than refetching per viewport, so `bbox` is left unset here;
 * `horizonWeeks` is the only parameter that changes what is requested.
 */
export function useRiskMap(horizonWeeks: 2 | 4) {
  return useQuery<RiskMapResponse, Error>({
    queryKey: ['risk', 'map', horizonWeeks],
    queryFn: () => fetchRiskMap(horizonWeeks),
  });
}
