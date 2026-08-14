import type { WeatherObservationDto } from '@avash/types';
import { toNumberOrNull } from './numeric';

/**
 * Maps a `region_weather_observations` / `region_latest_weather` row
 * (both views share the same columns) to the frozen
 * `weatherObservationDtoSchema` shape. Takes `unknown` — the row comes
 * back from PostgREST as untyped JSON (R7 untrusted-input rule) — and
 * every numeric column is coerced defensively since PostgREST may return
 * a `numeric` column as a string.
 */
export function toWeatherObservationDto(row: Record<string, unknown>): WeatherObservationDto {
  return {
    regionId: String(row.region_id),
    regionCode: String(row.region_code),
    regionName: String(row.region_name),
    observedAt: String(row.observed_at),
    tempMeanC: toNumberOrNull(row.temp_mean_c),
    tempMinC: toNumberOrNull(row.temp_min_c),
    tempMaxC: toNumberOrNull(row.temp_max_c),
    humidityPct: toNumberOrNull(row.humidity_pct),
    precipitationMm: toNumberOrNull(row.precipitation_mm),
    source: row.source === null || row.source === undefined ? null : String(row.source),
  };
}
