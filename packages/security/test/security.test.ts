import { describe, test, expect } from 'vitest';
import { verifyToken } from '../index';

/**
 * `packages/security` is a one-line placeholder (`verifyToken = () => {}`)
 * — rate-limit key generation, zod validators, and input sanitization
 * belong to the vertical slices that write to a guarded endpoint (§13,
 * slices 4/5/6), none of which have been built yet. This test pins the
 * current stub's contract so a future change to it is deliberate, not an
 * accidental regression picked up mid-slice.
 */
describe('verifyToken (placeholder — real implementation ships with the first write-path slice)', () => {
  test('exists and is callable without throwing', () => {
    expect(() => verifyToken()).not.toThrow();
  });

  test('current placeholder returns undefined', () => {
    expect(verifyToken()).toBeUndefined();
  });
});
