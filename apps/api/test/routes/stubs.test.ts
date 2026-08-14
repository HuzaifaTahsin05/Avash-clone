import { describe, test, expect } from 'vitest';
import { alerts } from '../../src/routes/alerts';
import { reports } from '../../src/routes/reports';
import { resources } from '../../src/routes/resources';
import { riskMap } from '../../src/routes/risk-map';
import { symptomCheck } from '../../src/routes/symptom-check';

/**
 * `alerts`, `reports`, `resources`, `risk-map`, and `symptom-check` are
 * one-line placeholders — not mounted in src/index.ts, so no request ever
 * reaches them today. Each belongs to a vertical slice (§13, slices
 * 4/5/6/7) that has not been built yet. This test pins each stub's
 * current in-process contract so a future change to it is deliberate,
 * not an accidental regression picked up mid-slice.
 */
describe('unmounted route stubs (placeholders — real handlers ship with their vertical slice)', () => {
  test('alerts: POST / returns an empty object', async () => {
    const res = await alerts.request('/', { method: 'POST' });
    expect(await res.json()).toEqual({});
  });

  test('reports: POST / returns an empty object', async () => {
    const res = await reports.request('/', { method: 'POST' });
    expect(await res.json()).toEqual({});
  });

  test('resources: GET / returns an empty array', async () => {
    const res = await resources.request('/');
    expect(await res.json()).toEqual([]);
  });

  test('risk-map: GET / returns an empty array', async () => {
    const res = await riskMap.request('/');
    expect(await res.json()).toEqual([]);
  });

  test('symptom-check: POST / returns an empty object', async () => {
    const res = await symptomCheck.request('/', { method: 'POST' });
    expect(await res.json()).toEqual({});
  });
});
