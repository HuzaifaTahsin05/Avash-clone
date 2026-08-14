import { useQuery } from '@tanstack/react-query';
import { latestWeatherResponseSchema, type LatestWeatherResponse } from '@avash/types';
import { fetchApi } from '../../lib/apiClient';

/** Exported separately so the query logic is testable without rendering a component tree. */
export async function fetchLatestWeather(): Promise<LatestWeatherResponse> {
  const result = await fetchApi('/api/weather/latest', latestWeatherResponseSchema);
  if (!result.ok) {
    throw new Error(result.error);
  }
  return result.data;
}

export function useLatestWeather() {
  return useQuery<LatestWeatherResponse, Error>({
    queryKey: ['weather', 'latest'],
    queryFn: fetchLatestWeather,
  });
}
