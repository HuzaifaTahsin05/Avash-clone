import { describe, test, expect } from 'vitest';
import { getDistance } from '../index';

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
