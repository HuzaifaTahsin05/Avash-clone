/**
 * PostgREST stringifies `numeric`/`decimal` columns to avoid float
 * precision loss over JSON, so a value that is a DB `number` column can
 * still arrive here as a string (or, defensively, some other JSON
 * primitive). Every numeric field read from a Supabase row goes through
 * this before it can reach a `z.number().nullable()` schema field —
 * never let a raw string or a coercion `NaN` leak into a response body.
 */
export function toNumberOrNull(value: unknown): number | null {
  if (value === null || value === undefined) {
    return null;
  }
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}
