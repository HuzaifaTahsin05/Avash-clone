import { useCallback, useState } from 'react';
import { useGeolocation } from '../../hooks/useGeolocation';

export interface ReportLocationState {
  lat: number | null;
  lng: number | null;
  /** `'device'` came from the browser Geolocation API; `'manual'` from the fallback fields. */
  source: 'device' | 'manual' | null;
  permissionDenied: boolean;
  requesting: boolean;
  requestDeviceLocation: () => void;
  setManualLat: (value: number | null) => void;
  setManualLng: (value: number | null) => void;
}

/**
 * `apps/web/src/hooks/useGeolocation.ts` is a frozen-shape Phase-0 stub
 * (`() => {}`, no return value) — calling it here is forward-compatible
 * with whatever real implementation lands there later, but nothing in
 * this hook depends on its result today. The actual device-location
 * logic lives here, built directly on the browser Geolocation API,
 * because the shared hook does not yet do anything (out of this
 * feature's owned-files scope — `apps/web/src/hooks/**` is not owned by
 * the breeding-reports slice).
 *
 * The browser Geolocation API's result is untrusted/nullable (R7) —
 * every access into `position`/`error` is optional-chained.
 */
export function useReportLocation(): ReportLocationState {
  useGeolocation?.();

  const [lat, setLat] = useState<number | null>(null);
  const [lng, setLng] = useState<number | null>(null);
  const [source, setSource] = useState<'device' | 'manual' | null>(null);
  const [permissionDenied, setPermissionDenied] = useState(false);
  const [requesting, setRequesting] = useState(false);

  const requestDeviceLocation = useCallback(() => {
    const geolocation = typeof navigator !== 'undefined' ? navigator?.geolocation : undefined;
    if (!geolocation?.getCurrentPosition) {
      setPermissionDenied(true);
      return;
    }

    setRequesting(true);
    geolocation.getCurrentPosition(
      (position) => {
        const latitude = position?.coords?.latitude;
        const longitude = position?.coords?.longitude;
        if (typeof latitude === 'number' && typeof longitude === 'number') {
          setLat(latitude);
          setLng(longitude);
          setSource('device');
          setPermissionDenied(false);
        } else {
          setPermissionDenied(true);
        }
        setRequesting(false);
      },
      () => {
        setPermissionDenied(true);
        setRequesting(false);
      },
      { enableHighAccuracy: false, timeout: 10000 }
    );
  }, []);

  const setManualLat = useCallback((value: number | null) => {
    setLat(value);
    setSource('manual');
  }, []);

  const setManualLng = useCallback((value: number | null) => {
    setLng(value);
    setSource('manual');
  }, []);

  return { lat, lng, source, permissionDenied, requesting, requestDeviceLocation, setManualLat, setManualLng };
}
