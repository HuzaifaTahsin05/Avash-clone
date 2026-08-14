/** §14 BBOX_MAX_SPAN_DEG — rejects a viewport wide enough to be a full scan. */
export const BBOX_MAX_SPAN_DEG = 10;

export interface Bbox {
  minLon: number;
  minLat: number;
  maxLon: number;
  maxLat: number;
}

export type ParseBboxResult =
  | { ok: true; bbox: Bbox }
  | { ok: false; reason: 'malformed' | 'out-of-range' | 'inverted' | 'too-large' };

/**
 * Parses "minLon,minLat,maxLon,maxLat". Never throws and never returns a
 * partially-valid box — a caller that gets `ok: true` can use all four
 * numbers without further checking. `reason` is for the server log only;
 * the client gets the generic 400 body (R10).
 */
export function parseBbox(raw: string | undefined | null): ParseBboxResult {
  if (raw === undefined || raw === null) {
    return { ok: false, reason: 'malformed' };
  }

  const parts = raw.split(',');
  if (parts.length !== 4) {
    return { ok: false, reason: 'malformed' };
  }

  const numbers = parts.map((part) => Number(part));
  if (!numbers.every((n) => Number.isFinite(n))) {
    return { ok: false, reason: 'malformed' };
  }

  const [minLon, minLat, maxLon, maxLat] = numbers as [number, number, number, number];

  if (minLon < -180 || minLon > 180 || maxLon < -180 || maxLon > 180) {
    return { ok: false, reason: 'out-of-range' };
  }
  if (minLat < -90 || minLat > 90 || maxLat < -90 || maxLat > 90) {
    return { ok: false, reason: 'out-of-range' };
  }

  if (maxLon <= minLon || maxLat <= minLat) {
    return { ok: false, reason: 'inverted' };
  }

  if (maxLon - minLon > BBOX_MAX_SPAN_DEG || maxLat - minLat > BBOX_MAX_SPAN_DEG) {
    return { ok: false, reason: 'too-large' };
  }

  return { ok: true, bbox: { minLon, minLat, maxLon, maxLat } };
}
