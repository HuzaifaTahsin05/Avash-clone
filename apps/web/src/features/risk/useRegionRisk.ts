import { useQuery } from '@tanstack/react-query';
import { riskDetailResponseSchema, type RiskDetailResponse } from '@avash/types';
import { fetchApi } from '../../lib/apiClient';

/** Exported separately so the query logic is testable without rendering a component tree. */
export async function fetchRegionRisk(
  regionId: string | null,
  horizonWeeks: 2 | 4,
): Promise<RiskDetailResponse> {
  const params = new URLSearchParams({ horizon: String(horizonWeeks) });
  const result = await fetchApi(
    `/api/risk/${regionId ?? ''}?${params.toString()}`,
    riskDetailResponseSchema,
  );
  if (!result.ok) {
    throw new Error(result.error);
  }
  return result.data;
}

export function useRegionRisk(regionId: string | null, horizonWeeks: 2 | 4) {
  return useQuery<RiskDetailResponse, Error>({
    queryKey: ['risk', 'region', regionId, horizonWeeks],
    enabled: Boolean(regionId),
    queryFn: () => fetchRegionRisk(regionId, horizonWeeks),
  });
}
