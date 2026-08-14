import { describe, test, expect } from 'vitest';
import { Hono } from 'hono';
import { alerts } from '../../src/routes/alerts';
import { reports } from '../../src/routes/reports';
import { resources } from '../../src/routes/resources';
import { symptomCheck } from '../../src/routes/symptom-check';
import { weather } from '../../src/routes/weather';
import { riskMap, riskDetail } from '../../src/routes/risk-map';
import { requestId } from '../../src/middleware/request-id';
import type { AppEnv } from '../../src/types';
import {
  latestWeatherResponseSchema,
  weatherHistoryResponseSchema,
  riskMapResponseSchema,
} from '@avash/types';

// weather/risk-map/risk read `c.get('requestId')`, which only exists once
// the request-id middleware has run — mount each under a throwaway app
// carrying that middleware, the same pattern health.test.ts uses.
function withRequestId(mountPath: string, router: Hono<AppEnv>) {
  const app = new Hono<AppEnv>();
  app.use('*', requestId());
  app.route(mountPath, router);
  return app;
}

const weatherApp = withRequestId('/', weather);
const riskMapApp = withRequestId('/', riskMap);
const riskDetailApp = withRequestId('/', riskDetail);

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

/**
 * `weather` and `risk-map`/`risk` are mounted, contract-shaped stubs: the
 * final paths, query parsing, and status codes are locked in, and the
 * body already validates against the frozen Appendix A schemas — only the
 * database read is missing. This pins that shape so a Phase 1 worker
 * fills in the read without changing the contract underneath it.
 */
describe('mounted, contract-shaped stubs', () => {
  test('weather/latest: 200 with a schema-valid empty payload', async () => {
    const res = await weatherApp.request('/latest');
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(() => latestWeatherResponseSchema.parse(json)).not.toThrow();
  });

  test('weather/history: 400 when regionCode is missing', async () => {
    const res = await weatherApp.request('/history');
    expect(res.status).toBe(400);
  });

  test('weather/history: 200 with a schema-valid empty payload when regionCode is present', async () => {
    const res = await weatherApp.request('/history?regionCode=dhaka');
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(() => weatherHistoryResponseSchema.parse(json)).not.toThrow();
  });

  test('risk-map: 200 with a schema-valid empty FeatureCollection', async () => {
    const res = await riskMapApp.request('/');
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(() => riskMapResponseSchema.parse(json)).not.toThrow();
  });

  test('risk-map: 400 on an invalid horizon', async () => {
    const res = await riskMapApp.request('/?horizon=3');
    expect(res.status).toBe(400);
  });

  test('risk-map: 400 on a malformed bbox', async () => {
    const res = await riskMapApp.request('/?bbox=not-a-bbox');
    expect(res.status).toBe(400);
  });

  test('risk/:regionId: 400 on a malformed UUID, no I/O attempted', async () => {
    const res = await riskDetailApp.request('/not-a-uuid');
    expect(res.status).toBe(400);
  });

  test('risk/:regionId: 404 on a well-formed UUID (no seeded data behind the stub)', async () => {
    const res = await riskDetailApp.request('/11111111-1111-4111-8111-111111111111');
    expect(res.status).toBe(404);
  });
});
