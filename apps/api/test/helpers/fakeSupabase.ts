/**
 * `fetch`-shaped PostgREST test double. `apps/api` has no local PostgREST
 * to hit (`compose.yaml` runs Postgres only) — routes talk to Supabase
 * over its REST interface via `createSupabaseAdmin(env, { fetch })`
 * (`apps/api/src/lib/supabaseAdmin.ts`), and this is the seam that lets a
 * route test drive that interface with canned responses instead of a live
 * database.
 *
 * Matching is on request URL — pathname (`/rest/v1/<table>`) plus, when a
 * rule provides one, a predicate over the query string — because the URL
 * a handler builds IS the query it runs. Route tests should assert on
 * `calls` directly rather than only trusting the response body: a wrong
 * bbox filter or a missing `order=` is only observable there.
 */

export interface FakeSupabaseRule {
  /** Exact pathname to match, e.g. `/rest/v1/region_latest_weather`. */
  path: string;
  /** Optional extra predicate over the request's query string. */
  match?: (searchParams: URLSearchParams) => boolean;
  /** JSON body to return. */
  body: unknown;
  /** HTTP status to return. Defaults to 200. */
  status?: number;
}

export interface FakeSupabase {
  fetch: typeof fetch;
  /** Every request URL seen, in call order — inspect this to assert on the outgoing query. */
  calls: URL[];
}

function requestUrl(input: RequestInfo | URL): URL {
  if (input instanceof URL) {
    return input;
  }
  if (typeof input === 'string') {
    return new URL(input);
  }
  return new URL(input.url);
}

/**
 * Builds a fake PostgREST `fetch`. Rules are checked in order; the first
 * whose `path` (and optional `match`) both hold wins. No matching rule is
 * a hard failure (thrown, not a 200) — a route test that forgets to stub
 * a table it queries should fail loudly, not silently succeed with an
 * empty collection.
 */
export function createFakeSupabase(rules: FakeSupabaseRule[]): FakeSupabase {
  const calls: URL[] = [];

  const fetchFn = (async (input: RequestInfo | URL) => {
    const url = requestUrl(input);
    calls.push(url);

    const rule = rules.find((r) => url.pathname === r.path && (!r.match || r.match(url.searchParams)));
    if (!rule) {
      throw new Error(`fakeSupabase: no rule matched ${url.pathname}${url.search}`);
    }

    return new Response(JSON.stringify(rule.body), {
      status: rule.status ?? 200,
      headers: { 'content-type': 'application/json' },
    });
  }) as typeof fetch;

  return { fetch: fetchFn, calls };
}

/**
 * An `env.SUPABASE_URL` value that makes `createSupabaseAdmin` throw
 * synchronously (supabase-js validates the URL before any I/O happens),
 * exercising a route's outer `catch` without an actual network round
 * trip — a rejected/thrown `fetch` was tried here first and reliably
 * hung past the test timeout inside the workerd test runtime, so this is
 * the seam that's actually reachable from a Vitest project running under
 * `@cloudflare/vitest-pool-workers`.
 */
export const INVALID_SUPABASE_URL = 'not-a-valid-url';

/** A canned PostgREST error body — the shape `postgrest-js` surfaces on a non-2xx response. */
export function postgrestErrorBody(message = 'permission denied for table'): unknown {
  return { message, code: '42501', details: null, hint: null };
}
