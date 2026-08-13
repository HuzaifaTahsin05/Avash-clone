import { z } from 'zod';

export interface ApiResponse<T> {
  data: T | null;
  error: string | null;
}

/**
 * `GET /health` response contract. Liveness only — no DB field, since the
 * endpoint is intentionally dependency-free so CI can exercise it without
 * live database credentials. A separate `/health/db` readiness probe with
 * its own schema arrives with the database schema work.
 */
export const healthResponseSchema = z.object({
  status: z.literal('ok'),
  version: z.string(),
  environment: z.string(),
  timestamp: z.string(),
  requestId: z.string(),
});

export type HealthResponse = z.infer<typeof healthResponseSchema>;

/**
 * `GET /health/db` response contract. Readiness, not
 * liveness — `/health` staying dependency-free is unaffected by this
 * endpoint ever failing. `ready: false` is a normal, well-typed response,
 * never an exception with a leaked driver error (R4/R10) — `reason` is a
 * short generic label, never the raw error message.
 */
export const healthDbResponseSchema = z.object({
  ready: z.boolean(),
  reason: z.string().nullable(),
  requestId: z.string(),
});

export type HealthDbResponse = z.infer<typeof healthDbResponseSchema>;
