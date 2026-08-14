import { describe, test, expect } from 'vitest';
import { getDistance, parseBbox } from '../index';

/**
 * `packages/geo` is a one-line placeholder (`getDistance = () => 0`) —
 * bbox clamping, `ST_DWithin` fragment construction, and the 20,000 m
 * radius ceiling (docs/PROJECT_PLAN.md §14
 * `ALERT_PROXIMITY_RADIUS_DEFAULT_M`) belong to the geospatial-alerts
 * vertical slice (§13, slice 7), which has not been built yet. This test
 * pins the current stub's contract so a future change to it is
 * deliberate, not an accidental regression picked up mid-slice.
 */
describe('getDistance (placeholder — real implementation ships with the alerts slice)', () => {
  test('exists and returns a number', () => {
    expect(typeof getDistance()).toBe('number');
  });

  test('current placeholder value is 0', () => {
    expect(getDistance()).toBe(0);
  });
});

describe('parseBbox', () => {
  test('accepts a well-formed box', () => {
    const result = parseBbox('89.5,22.0,90.5,24.0');
    expect(result).toEqual({
      ok: true,
      bbox: { minLon: 89.5, minLat: 22.0, maxLon: 90.5, maxLat: 24.0 },
    });
  });

  test('rejects the wrong arity', () => {
    expect(parseBbox('89.5,22.0,90.5')).toEqual({ ok: false, reason: 'malformed' });
    expect(parseBbox('89.5,22.0,90.5,24.0,1')).toEqual({ ok: false, reason: 'malformed' });
  });

  test('rejects a non-numeric component', () => {
    expect(parseBbox('89.5,abc,90.5,24.0')).toEqual({ ok: false, reason: 'malformed' });
    expect(parseBbox('')).toEqual({ ok: false, reason: 'malformed' });
    expect(parseBbox('NaN,22.0,90.5,24.0')).toEqual({ ok: false, reason: 'malformed' });
    expect(parseBbox('Infinity,22.0,90.5,24.0')).toEqual({ ok: false, reason: 'malformed' });
    expect(parseBbox(undefined)).toEqual({ ok: false, reason: 'malformed' });
    expect(parseBbox(null)).toEqual({ ok: false, reason: 'malformed' });
  });

  test('rejects inverted min/max', () => {
    expect(parseBbox('90.5,22.0,89.5,24.0')).toEqual({ ok: false, reason: 'inverted' });
    expect(parseBbox('89.5,24.0,90.5,22.0')).toEqual({ ok: false, reason: 'inverted' });
  });

  test('rejects out-of-range latitude', () => {
    expect(parseBbox('89.5,-95.0,90.5,24.0')).toEqual({ ok: false, reason: 'out-of-range' });
    expect(parseBbox('89.5,22.0,90.5,95.0')).toEqual({ ok: false, reason: 'out-of-range' });
  });

  test('rejects a span exceeding BBOX_MAX_SPAN_DEG', () => {
    expect(parseBbox('0,0,15,5')).toEqual({ ok: false, reason: 'too-large' });
    expect(parseBbox('0,0,5,15')).toEqual({ ok: false, reason: 'too-large' });
  });
});
