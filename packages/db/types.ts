/**
 * Hand-maintained row types for every table/view in
 * packages/db/supabase/migrations, kept column-for-column in sync by hand
 * (docs/PROJECT_PLAN.md §4). No hosted Supabase project is linked
 * yet, so `supabase gen types typescript` has nothing to run against —
 * `packages/db/scripts/generate-types.mjs` explains the switchover path.
 *
 * This is the only place a database row shape is defined. `packages/types`
 * re-exports the subset both apps consume (R3) — never redefine one of
 * these inline in apps/web or apps/api.
 */

export interface GeoJSONPoint {
  type: 'Point';
  coordinates: [number, number];
}

export interface GeoJSONMultiPolygon {
  type: 'MultiPolygon';
  coordinates: number[][][][];
}

export interface RegionRow {
  id: string;
  code: string;
  name: string;
  admin_level: number;
  population: number | null;
  geom: GeoJSONMultiPolygon;
}

export interface WeatherObservationRow {
  id: number;
  region_id: string;
  observed_at: string;
  temp_mean_c: number | null;
  temp_min_c: number | null;
  temp_max_c: number | null;
  humidity_pct: number | null;
  precipitation_mm: number | null;
  source: string | null;
  raw_payload: Record<string, unknown> | null;
}

export interface DengueCaseRow {
  id: number;
  region_id: string;
  reported_week: string;
  case_count: number;
  source: string | null;
}

export type RiskLevel = 'low' | 'moderate' | 'high' | 'severe';

export interface RiskPredictionRow {
  id: number;
  region_id: string;
  prediction_date: string;
  horizon_weeks: 2 | 4;
  risk_score: number;
  risk_level: RiskLevel;
  top_factors: unknown | null;
  model_version: string;
  generated_at: string;
}

export interface RegionRiskSummaryRow {
  region_id: string;
  name: string;
  geom: GeoJSONMultiPolygon;
  risk_score: number;
  risk_level: RiskLevel;
  horizon_weeks: 2 | 4;
  generated_at: string;
}

export type BreedingReportStatus = 'pending' | 'verified' | 'rejected' | 'resolved';

export interface BreedingReportRow {
  id: string;
  reporter_id: string | null;
  geom: GeoJSONPoint;
  description: string | null;
  photo_url: string | null;
  ai_validation: Record<string, unknown> | null;
  status: BreedingReportStatus;
  verified_by: string | null;
  municipal_ref_id: string | null;
  created_at: string;
}

export interface HospitalRow {
  id: string;
  name: string;
  geom: GeoJSONPoint;
  address: string | null;
  phone: string | null;
  verified: boolean;
  updated_at: string;
}

export type BloodGroup = 'A+' | 'A-' | 'B+' | 'B-' | 'AB+' | 'AB-' | 'O+' | 'O-';

export interface BloodInventoryRow {
  id: number;
  hospital_id: string;
  blood_group: BloodGroup;
  units_available: number;
  platelet_units: number | null;
  updated_by: string | null;
  updated_at: string;
}

export interface VerifiedHospitalStaffRow {
  user_id: string;
  hospital_id: string;
}

export interface AlertSubscriptionRow {
  id: string;
  user_id: string;
  geom: GeoJSONPoint;
  radius_m: number;
  active: boolean;
  created_at: string;
}

export interface PushSubscriptionRow {
  id: string;
  user_id: string;
  endpoint: string;
  p256dh: string;
  auth_key: string;
  created_at: string;
}

export interface NewsItemRow {
  id: number;
  source_url: string;
  title: string | null;
  published_at: string | null;
  region_guess: string | null;
  ai_confidence: number | null;
  flagged: boolean;
  reviewed: boolean;
  created_at: string;
}

// Read-only views (20260215000009_api_read_views.sql) — PostgREST cannot
// express PostGIS calls, so these push exactly that into SQL.

export interface RegionWeatherObservationRow {
  id: number;
  region_id: string;
  region_code: string;
  region_name: string;
  observed_at: string;
  temp_mean_c: number | null;
  temp_min_c: number | null;
  temp_max_c: number | null;
  humidity_pct: number | null;
  precipitation_mm: number | null;
  source: string | null;
}

export type RegionLatestWeatherRow = RegionWeatherObservationRow;

export interface RegionIngestTargetRow {
  region_id: string;
  code: string;
  name: string;
  lat: number;
  lon: number;
}

export interface RegionRiskGeojsonRow {
  region_id: string;
  region_name: string;
  risk_score: number;
  risk_level: RiskLevel;
  horizon_weeks: 2 | 4;
  generated_at: string;
  geometry: GeoJSONMultiPolygon;
  min_lon: number;
  min_lat: number;
  max_lon: number;
  max_lat: number;
}
