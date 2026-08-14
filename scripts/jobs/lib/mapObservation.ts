/**
 * Pure OpenWeatherMap payload -> weather_observations row mapper
 * (docs/PROJECT_PLAN.md §4, docs/standards/backend.md optional-chaining
 * rule). The upstream payload is untrusted network JSON: every field is
 * read with `?.` and validated with `typeof` before use so this function
 * can never throw, regardless of what shape (or non-shape) comes back.
 *
 * `rain` is absent entirely from the payload when it is not raining — the
 * field most likely to throw if accessed directly — hence the optional
 * chain through `rain?.['1h']` and the `?? 0` fallback (never `null`,
 * unlike the other numeric fields, since "no rain" is a real zero).
 */

export interface OpenWeatherMapResponse {
  main?: {
    temp?: number;
    temp_min?: number;
    temp_max?: number;
    humidity?: number;
  };
  rain?: Record<string, number>;
  dt?: number;
  [key: string]: unknown;
}

export interface WeatherObservationInsert {
  region_id: string;
  observed_at: string; // ISO 8601
  temp_mean_c: number | null;
  temp_min_c: number | null;
  temp_max_c: number | null;
  humidity_pct: number | null;
  precipitation_mm: number;
  source: 'openweathermap';
  raw_payload: unknown;
}

function numberOrNull(value: unknown): number | null {
  return typeof value === 'number' && Number.isFinite(value) ? value : null;
}

export function mapObservation(regionId: string, payload: unknown, now: () => Date = () => new Date()): WeatherObservationInsert {
  const body = (payload ?? undefined) as OpenWeatherMapResponse | undefined;
  const main = body?.main;
  const rain = body?.rain;
  const dtSeconds = body?.dt;

  const observedAt = typeof dtSeconds === 'number' && Number.isFinite(dtSeconds) ? new Date(dtSeconds * 1000).toISOString() : now().toISOString();

  const rainOneHour = rain?.['1h'];

  return {
    region_id: regionId,
    observed_at: observedAt,
    temp_mean_c: numberOrNull(main?.temp),
    temp_min_c: numberOrNull(main?.temp_min),
    temp_max_c: numberOrNull(main?.temp_max),
    humidity_pct: numberOrNull(main?.humidity),
    precipitation_mm: typeof rainOneHour === 'number' && Number.isFinite(rainOneHour) ? rainOneHour : 0,
    source: 'openweathermap',
    raw_payload: payload ?? null,
  };
}
