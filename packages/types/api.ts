import { z } from 'zod';

export interface ApiResponse<T> {
  data: T | null;
  error: string | null;
}

/**
 * `GET /health` response contract (M3-T09). Liveness only — no DB field,
 * since this endpoint is intentionally dependency-free (§0.5B). M6 adds a
 * separate `/health/db` readiness probe with its own schema.
 */
export const healthResponseSchema = z.object({
  status: z.literal('ok'),
  version: z.string(),
  environment: z.string(),
  timestamp: z.string(),
  requestId: z.string(),
});

export type HealthResponse = z.infer<typeof healthResponseSchema>;
