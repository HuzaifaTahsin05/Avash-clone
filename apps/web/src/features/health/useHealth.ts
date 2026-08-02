import { useQuery } from '@tanstack/react-query';
import { healthResponseSchema, type HealthResponse } from '@avash/types';
import { fetchApi } from '../../lib/apiClient';

export function useHealth() {
  return useQuery<HealthResponse, Error>({
    queryKey: ['health'],
    queryFn: async () => {
      const result = await fetchApi('/health', healthResponseSchema);
      if (!result.ok) {
        throw new Error(result.error);
      }
      return result.data;
    },
  });
}
