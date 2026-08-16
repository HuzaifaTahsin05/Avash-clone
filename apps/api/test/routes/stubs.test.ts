import { describe, test, expect } from 'vitest';
import { alerts } from '../../src/routes/alerts';

/**
 * `alerts` remains a one-line placeholder — not mounted in src/index.ts,
 * so no request ever reaches it today. It is out of scope for this slice
 * (decision I, §13 slice 7: alerts is gated on Web Push and the batch
 * job's proximity check). This test pins its current in-process contract
 * so a future change to it is deliberate, not an accidental regression.
 */
describe('unmounted route stubs (placeholders — real handlers ship with their vertical slice)', () => {
  test('alerts: POST / returns an empty object', async () => {
    const res = await alerts.request('/', { method: 'POST' });
    expect(await res.json()).toEqual({});
  });
});

// `weather`, `risk-map`/`risk`, `symptom-check`, `reports`, and
// `resources` were unmounted, empty-body stubs at this point in the
// branch history; they are now mounted, contract-shaped stubs
// (Phase 0 — parse the frozen schema, then 501) exercised in
// apps/api/test/routes/{weather,risk-map,symptom-check,reports,resources}.test.ts.
