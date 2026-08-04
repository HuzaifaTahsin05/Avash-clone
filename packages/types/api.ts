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
