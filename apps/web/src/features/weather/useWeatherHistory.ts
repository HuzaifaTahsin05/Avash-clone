import { useQuery } from '@tanstack/react-query';
import { weatherHistoryResponseSchema, type WeatherHistoryResponse } from '@avash/types';
import { fetchApi } from '../../lib/apiClient';

/** Matches the backend's `WEATHER_HISTORY_WINDOW_DAYS` (§14) default of 14 days. */
const DEFAULT_HISTORY_WINDOW_DAYS = 14;

/** Exported separately so the query logic is testable without rendering a component tree. */
export async function fetchWeatherHistory(
  regionCode: string | null,
  days: number,
): Promise<WeatherHistoryResponse> {
  const params = new URLSearchParams({ regionCode: regionCode ?? '', days: String(days) });
  const result = await fetchApi(
    `/api/weather/history?${params.toString()}`,
    weatherHistoryResponseSchema,
  );
  if (!result.ok) {
    throw new Error(result.error);
  }
  return result.data;
}

export function useWeatherHistory(regionCode: string | null, days: number = DEFAULT_HISTORY_WINDOW_DAYS) {
  return useQuery<WeatherHistoryResponse, Error>({
    queryKey: ['weather', 'history', regionCode, days],
    enabled: Boolean(regionCode),
    queryFn: () => fetchWeatherHistory(regionCode, days),
  });
}
