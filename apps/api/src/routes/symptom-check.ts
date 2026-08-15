import { Hono } from 'hono';
import { symptomCheckRequestSchema } from '@avash/types';
import { buildGenericErrorBody } from '@avash/logger';
import type { AppEnv } from '../types';

/**
 * Contract-shaped stub (Phase 0). Parses the frozen request schema, then
 * 501s — the real triage/Gemini body ships with the symptom-checker
 * slice. No Phase 1 worker edits this file's mount point in index.ts.
 */
export const symptomCheck = new Hono<AppEnv>().post('/', async (c) => {
  const requestId = c.get('requestId');
  const body = await c.req.json().catch(() => undefined);
  const parsed = symptomCheckRequestSchema.safeParse(body);
  if (!parsed.success) {
    return c.json(buildGenericErrorBody(requestId), 400);
  }
  return c.json(buildGenericErrorBody(requestId), 501);
});
