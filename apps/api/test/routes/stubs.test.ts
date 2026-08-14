import { describe, test, expect } from 'vitest';
import { alerts } from '../../src/routes/alerts';
import { reports } from '../../src/routes/reports';
import { resources } from '../../src/routes/resources';
import { symptomCheck } from '../../src/routes/symptom-check';

/**
 * `alerts`, `reports`, `resources`, and `symptom-check` are one-line
 * placeholders — not mounted in src/index.ts, so no request ever reaches
 * them today. Each belongs to a vertical slice (§13, slices 4/5/6) that
 * has not been built yet. This test pins each stub's current in-process
 * contract so a future change to it is deliberate, not an accidental
 * regression picked up mid-slice.
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

  test('symptom-check: POST / returns an empty object', async () => {
    const res = await symptomCheck.request('/', { method: 'POST' });
    expect(await res.json()).toEqual({});
  });
});

// `weather` and `risk-map`/`risk` were mounted, contract-shaped stubs at
// this point in the branch history; the real-read behavior pinned here
// previously now lives in apps/api/test/routes/weather.test.ts and
// apps/api/test/routes/risk-map.test.ts, exercised against the fake
// PostgREST double in apps/api/test/helpers/fakeSupabase.ts.
