/**
 * `weather_observations` has no natural unique key (append-only by design,
 * docs/PROJECT_PLAN.md §4 migration comment) — re-run safety comes from
 * checking whether a row already exists for a region within the current
 * hour bucket before inserting, the same pattern scripts/seed-db.ts uses
 * at day granularity. This is a read-then-write check, not a DB
 * constraint: never add a unique index to "fix" this (see task brief).
 */

/** Floors an ISO timestamp to the start of its UTC hour. */
export function hourBucketStart(observedAtIso: string): string {
  const d = new Date(observedAtIso);
  d.setUTCMinutes(0, 0, 0);
  return d.toISOString();
}

/** Exclusive end of the hour bucket that starts at `bucketStartIso`. */
export function hourBucketEnd(bucketStartIso: string): string {
  return new Date(new Date(bucketStartIso).getTime() + 60 * 60 * 1000).toISOString();
}
