# ADR-010: Resource ticker subscribes to Supabase Realtime directly

**Date:** 2026-08-01
**Status:** Accepted

## Context

The hospital/blood-inventory resource ticker needs to reflect stock
updates live, without the user refreshing the page. The two-app split
(ADR-001) puts all privileged logic behind `apps/api`, which could suggest
that Realtime updates should also be proxied through the Worker (e.g., the
Worker holds a Supabase subscription and pushes to connected clients via
WebSocket/SSE). That adds a stateful connection-management problem to a
Worker runtime that is designed around short-lived request/response
invocations, and duplicates a capability (`postgres_changes` streaming)
Supabase already exposes safely to browsers.

**Rejected alternative:** proxy Realtime updates through `apps/api`
(Worker holds the subscription, fans out to connected clients). Rejected
because Cloudflare Workers are not well-suited to long-lived stateful
connections at this scale, and because `blood_inventory`/`hospitals` are
already public-read under RLS (`docs/PROJECT_PLAN.md` §4.1) — there is no
privileged data to protect by adding a proxy hop.

## Decision

`apps/web`'s resource ticker (`RES` in the §3 architecture diagram)
subscribes directly to Supabase Realtime's `postgres_changes` channel for
`blood_inventory`/`hospitals`, using the public anon key. Because RLS
already gates `select` on these tables to public rows only
(`docs/PROJECT_PLAN.md` §4.1), the Realtime channel exposes nothing beyond
what an anonymous `select` already would. The initial paint still comes
from `GET /api/resources/hospitals`/`blood` through `apps/api` (for
bbox-filtered, cacheable first load); Realtime only carries the live delta
after that.

## Consequences

**Easier:** removes an unnecessary hop and a stateful-connection problem
from `apps/api` entirely; live updates are as fast as Supabase Realtime
itself, with no additional infrastructure to run or secure.

**Harder:** the browser now depends on a second data source
(Supabase Realtime, not just `apps/api`) for this one feature, and every
open ticker view must clean up its subscription on unmount
(`docs/PROJECT_PLAN.md` §8) — a leaked subscription is a real resource
leak on the Supabase project's connection/channel limits, not just a
client-side memory leak.
