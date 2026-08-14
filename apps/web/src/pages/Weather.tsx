import { useMemo, useState } from 'react';
import { useOnlineStatus } from '../hooks/useOnlineStatus';
import { useLatestWeather } from '../features/weather/useLatestWeather';
import { useWeatherHistory } from '../features/weather/useWeatherHistory';
import { Sparkline } from '../features/weather/Sparkline';

function formatStat(value: number | null | undefined, unit: string): string {
  return typeof value === 'number' ? `${value.toFixed(1)}${unit}` : '—';
}

export default function Weather() {
  const isOnline = useOnlineStatus();
  const latest = useLatestWeather();
  const [selectedRegionCode, setSelectedRegionCode] = useState<string | null>(null);

  const observations = latest.data?.observations ?? [];
  const sortedRegions = useMemo(
    () =>
      [...observations].sort((a, b) => (a?.regionName ?? '').localeCompare(b?.regionName ?? '')),
    [observations],
  );

  const activeRegionCode = selectedRegionCode ?? sortedRegions[0]?.regionCode ?? null;
  const activeObservation = observations.find((o) => o?.regionCode === activeRegionCode) ?? null;

  const history = useWeatherHistory(activeRegionCode);
  const historyPoints = history.data?.points ?? [];
  const sparklinePoints = historyPoints.map((point, index) => ({
    x: index,
    y: point?.tempMeanC ?? null,
  }));

  const lastObservedLabel = activeObservation?.observedAt
    ? new Date(activeObservation.observedAt).toLocaleString()
    : '—';

  return (
    <main className="page">
      <h1 className="page__title">Weather</h1>
      <p className="page__description">
        Latest weather observations feeding the dengue risk model.
      </p>

      {!isOnline ? (
        <p className="status-panel__item" data-testid="status-offline">
          You are offline
        </p>
      ) : latest.isLoading ? (
        <p className="status-panel__item" data-testid="status-loading">
          <span className="status-panel__skeleton" aria-hidden="true" />
        </p>
      ) : latest.isError ? (
        <p className="status-panel__item" data-testid="status-error">
          API: unavailable right now. Please try again later.
        </p>
      ) : sortedRegions.length === 0 ? (
        <p className="status-panel__item" data-testid="status-empty">
          No observations yet — the ingest job has not run.
        </p>
      ) : (
        <section className="weather" data-testid="status-success">
          <div className="weather__region-picker">
            <label htmlFor="weather-region-select" className="weather__label">
              Region
            </label>
            <select
              id="weather-region-select"
              className="weather__select"
              value={activeRegionCode ?? ''}
              onChange={(event) => setSelectedRegionCode(event?.target?.value ?? null)}
            >
              {sortedRegions.map((region) => (
                <option key={region.regionCode} value={region.regionCode}>
                  {region.regionName}
                </option>
              ))}
            </select>
          </div>

          <div className="weather__tiles">
            <div className="weather__tile">
              <span className="weather__tile-label">Mean temp</span>
              <span className="weather__tile-value">
                {formatStat(activeObservation?.tempMeanC ?? null, '°C')}
              </span>
            </div>
            <div className="weather__tile">
              <span className="weather__tile-label">Min temp</span>
              <span className="weather__tile-value">
                {formatStat(activeObservation?.tempMinC ?? null, '°C')}
              </span>
            </div>
            <div className="weather__tile">
              <span className="weather__tile-label">Max temp</span>
              <span className="weather__tile-value">
                {formatStat(activeObservation?.tempMaxC ?? null, '°C')}
              </span>
            </div>
            <div className="weather__tile">
              <span className="weather__tile-label">Humidity</span>
              <span className="weather__tile-value">
                {formatStat(activeObservation?.humidityPct ?? null, '%')}
              </span>
            </div>
            <div className="weather__tile">
              <span className="weather__tile-label">Precipitation</span>
              <span className="weather__tile-value">
                {formatStat(activeObservation?.precipitationMm ?? null, 'mm')}
              </span>
            </div>
          </div>

          <p className="weather__meta">
            Last observed: {lastObservedLabel} &middot; Source:{' '}
            {activeObservation?.source ?? 'unknown'}
          </p>

          <Sparkline points={sparklinePoints} label="14-day mean temperature" />
        </section>
      )}
    </main>
  );
}
