import { useMemo, useState } from 'react';
import { bloodGroupSchema, type BloodGroup } from '@avash/types';
import { useOnlineStatus } from '../hooks/useOnlineStatus';
import { useBloodAvailability } from '../features/resources/useBloodAvailability';
import { useBloodInventoryRealtime } from '../features/resources/useBloodInventoryRealtime';

const BLOOD_GROUPS = bloodGroupSchema.options;

// No on-page geolocation prompt for this slice — a fixed Dhaka-centered
// search origin mirrors MAP_DEFAULT_CENTER
// (apps/web/src/features/map/tileLayer.ts). A future slice can wire this
// to apps/web/src/hooks/useGeolocation.ts once that hook ships.
const DEFAULT_SEARCH_CENTER = { lat: 23.78, lng: 90.4 };

interface LiveOverride {
  unitsAvailable: number;
  plateletUnits: number;
  updatedAt: string;
}

function formatDistance(distanceM: number | null | undefined): string {
  return typeof distanceM === 'number' ? `${(distanceM / 1000).toFixed(1)} km` : '—';
}

function formatUpdatedAt(updatedAt: string | null | undefined): string {
  return updatedAt ? new Date(updatedAt).toLocaleTimeString() : '—';
}

export default function Resources() {
  const isOnline = useOnlineStatus();
  const [bloodGroup, setBloodGroup] = useState<BloodGroup>('O+');
  const search = useBloodAvailability({ bloodGroup, ...DEFAULT_SEARCH_CENTER });

  const [liveOverrides, setLiveOverrides] = useState<Record<number, LiveOverride>>({});

  const realtimeStatus = useBloodInventoryRealtime((payload) => {
    if (payload?.inventoryId === null || payload?.inventoryId === undefined) {
      return;
    }
    // A change to a different blood group than the one currently shown
    // still updates the ticker's internal state — it just won't be
    // visible until the caller switches groups, avoiding a stale
    // override lingering if they switch back.
    setLiveOverrides((prev) => ({
      ...prev,
      [payload.inventoryId as number]: {
        unitsAvailable: payload?.unitsAvailable ?? 0,
        plateletUnits: payload?.plateletUnits ?? 0,
        updatedAt: payload?.updatedAt ?? new Date().toISOString(),
      },
    }));
  });

  const results = useMemo(() => {
    const base = search.data?.results ?? [];
    return base.map((row) => {
      const inventoryId = row?.inventoryId;
      const override = typeof inventoryId === 'number' ? liveOverrides[inventoryId] : undefined;
      if (!override) {
        return row;
      }
      return {
        ...row,
        unitsAvailable: override.unitsAvailable,
        plateletUnits: override.plateletUnits,
        updatedAt: override.updatedAt,
      };
    });
  }, [search.data, liveOverrides]);

  return (
    <main className="page">
      <h1 className="page__title">Blood &amp; Hospital Resources</h1>
      <p className="page__description">
        Live blood-unit availability at nearby hospitals, updated in real time as hospital staff
        report changes.
      </p>

      <div className="field">
        <label htmlFor="blood-group-select" className="field__label">
          Blood group
        </label>
        <select
          id="blood-group-select"
          data-testid="blood-group-select"
          value={bloodGroup}
          onChange={(event) => setBloodGroup((event?.target?.value as BloodGroup) ?? 'O+')}
        >
          {BLOOD_GROUPS.map((group) => (
            <option key={group} value={group}>
              {group}
            </option>
          ))}
        </select>
      </div>

      {realtimeStatus === 'unavailable' ? (
        <p className="alert alert--error" data-testid="realtime-unavailable">
          Live updates unavailable — showing the last fetched availability.
        </p>
      ) : null}

      {!isOnline ? (
        <p className="status-panel__item" data-testid="status-offline">
          You are offline
        </p>
      ) : search.isLoading ? (
        <p className="status-panel__item" data-testid="status-loading">
          <span className="status-panel__skeleton" aria-hidden="true" />
        </p>
      ) : search.isError ? (
        <p className="status-panel__item" data-testid="resources-error">
          API: unavailable right now. Please try again later.
        </p>
      ) : results.length === 0 ? (
        <p className="status-panel__item" data-testid="status-empty">
          No hospitals reporting {bloodGroup} availability nearby.
        </p>
      ) : (
        <table className="table" data-testid="status-success">
          <thead>
            <tr>
              <th>Hospital</th>
              <th>Units</th>
              <th>Platelets</th>
              <th>Distance</th>
              <th>Updated</th>
            </tr>
          </thead>
          <tbody>
            {results.map((row) => (
              <tr key={row?.inventoryId} data-testid="hospital-row">
                <td>
                  {row?.hospital?.name ?? '—'}
                  {row?.hospital?.verified ? ' (verified)' : ''}
                </td>
                <td>{row?.unitsAvailable ?? '—'}</td>
                <td>{row?.plateletUnits ?? '—'}</td>
                <td>{formatDistance(row?.distanceM)}</td>
                <td>{formatUpdatedAt(row?.updatedAt)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </main>
  );
}
