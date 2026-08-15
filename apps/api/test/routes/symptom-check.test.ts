import { describe, test, expect } from 'vitest';
import { symptomCheck } from '../../src/routes/symptom-check';
import { Hono } from 'hono';
import { requestId } from '../../src/middleware/request-id';
import type { AppEnv } from '../../src/types';

function buildApp() {
  const app = new Hono<AppEnv>();
  app.use('*', requestId());
  app.route('/', symptomCheck);
  return app;
}

const env = {} as never;

describe('POST /api/symptom-check — contract-shaped stub (Phase 0)', () => {
  test('a schema-valid body → 501 (real body ships with the symptom-checker slice)', async () => {
    const res = await buildApp().request(
      '/',
      { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ symptomText: 'fever' }) },
      env
    );
    expect(res.status).toBe(501);
  });

  test('an empty body → 501 (both fields are optional per the frozen schema)', async () => {
    const res = await buildApp().request(
      '/',
      { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({}) },
      env
    );
    expect(res.status).toBe(501);
  });

  test('a missing body entirely → 400', async () => {
    const res = await buildApp().request('/', { method: 'POST', headers: { 'content-type': 'application/json' } }, env);
    expect(res.status).toBe(400);
  });

  test('over-length symptomText → 400', async () => {
    const res = await buildApp().request(
      '/',
      {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ symptomText: 'a'.repeat(501) }),
      },
      env
    );
    expect(res.status).toBe(400);
  });

  test('a non-JSON body → 400, never throws', async () => {
    const res = await buildApp().request('/', { method: 'POST', body: 'not json' }, env);
    expect(res.status).toBe(400);
  });
});
