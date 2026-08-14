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

// ── Shared primitives ──────────────────────────────────────────────────────

export const riskLevelSchema = z.enum(['low', 'moderate', 'high', 'severe']);
export const horizonWeeksSchema = z.union([z.literal(2), z.literal(4)]);

// ── Weather ─────────────────────────────────────────────────────────────

export const weatherObservationDtoSchema = z.object({
  regionId: z.string().uuid(),
  regionCode: z.string(),
  regionName: z.string(),
  observedAt: z.string(), // ISO 8601
  tempMeanC: z.number().nullable(),
  tempMinC: z.number().nullable(),
  tempMaxC: z.number().nullable(),
  humidityPct: z.number().nullable(),
  precipitationMm: z.number().nullable(),
  source: z.string().nullable(),
});

export const latestWeatherResponseSchema = z.object({
  observations: z.array(weatherObservationDtoSchema), // [] is valid, never null
  generatedAt: z.string(),
  requestId: z.string(),
});

export const weatherHistoryPointSchema = z.object({
  observedAt: z.string(),
  tempMeanC: z.number().nullable(),
  humidityPct: z.number().nullable(),
  precipitationMm: z.number().nullable(),
});

export const weatherHistoryResponseSchema = z.object({
  regionCode: z.string(),
  regionName: z.string(),
  windowDays: z.number().int().positive(),
  points: z.array(weatherHistoryPointSchema), // ascending by observedAt
  generatedAt: z.string(),
  requestId: z.string(),
});

// ── Risk map ────────────────────────────────────────────────────────────

export const multiPolygonGeometrySchema = z.object({
  type: z.literal('MultiPolygon'),
  coordinates: z.array(z.array(z.array(z.tuple([z.number(), z.number()])))),
});

export const riskMapFeaturePropertiesSchema = z.object({
  regionId: z.string().uuid(),
  regionName: z.string(),
  riskScore: z.number().min(0).max(1),
  riskLevel: riskLevelSchema,
  horizonWeeks: horizonWeeksSchema,
  generatedAt: z.string(),
});

export const riskMapFeatureSchema = z.object({
  type: z.literal('Feature'),
  geometry: multiPolygonGeometrySchema,
  properties: riskMapFeaturePropertiesSchema,
});

// A GeoJSON FeatureCollection with foreign members (permitted by RFC 7946).
// `generatedAt` is the newest feature's timestamp, or null when empty.
export const riskMapResponseSchema = z.object({
  type: z.literal('FeatureCollection'),
  features: z.array(riskMapFeatureSchema),
  horizonWeeks: horizonWeeksSchema,
  generatedAt: z.string().nullable(),
  requestId: z.string(),
});

export const riskFactorSchema = z.object({
  feature: z.string(), // §5.1 feature name
  contribution: z.number(),
  direction: z.enum(['increases', 'decreases']),
});

export const regionRiskPredictionSchema = z.object({
  horizonWeeks: horizonWeeksSchema,
  predictionDate: z.string(),
  riskScore: z.number().min(0).max(1),
  riskLevel: riskLevelSchema,
  modelVersion: z.string(),
  isStub: z.boolean(), // modelVersion === STUB_MODEL_VERSION
  topFactors: z.array(riskFactorSchema), // [] when absent — never null
  generatedAt: z.string(),
});

export const riskDetailResponseSchema = z.object({
  regionId: z.string().uuid(),
  regionCode: z.string(),
  regionName: z.string(),
  predictions: z.array(regionRiskPredictionSchema),
  latestWeather: weatherObservationDtoSchema.nullable(), // null when none exists
  requestId: z.string(),
});

export type WeatherObservationDto = z.infer<typeof weatherObservationDtoSchema>;
export type LatestWeatherResponse = z.infer<typeof latestWeatherResponseSchema>;
export type WeatherHistoryResponse = z.infer<typeof weatherHistoryResponseSchema>;
export type RiskMapResponse = z.infer<typeof riskMapResponseSchema>;
export type RiskDetailResponse = z.infer<typeof riskDetailResponseSchema>;
