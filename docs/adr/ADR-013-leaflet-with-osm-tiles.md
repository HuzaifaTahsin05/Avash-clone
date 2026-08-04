# ADR-013: Leaflet with OpenStreetMap raster tiles, no map credential

**Date:** 2026-08-04
**Status:** Accepted

## Context

The risk map (§13, slice 2) is the project's primary read surface: a
choropleth of `region_risk_summary` with hospital and breeding-report
markers layered over a basemap. Two independent choices hide inside "the
map": the **rendering library** that draws our own geometry, and the
**tile provider** that supplies the basemap underneath it. Earlier drafts
of §7.1 conflated them, carrying a `VITE_PUBLIC_MAPBOX_TOKEN` while §3's
architecture diagram and the tech-stack table already named Leaflet.

What the map actually has to do:

- Render region polygons and point markers **from our own API**, keyed to
  `RISK_LEVEL_BANDS`, and update them as data refreshes — this is the
  product. It is drawn from GeoJSON that `apps/api` serves out of the
  materialized view (ADR-006), and no tile provider participates in it.
- Show a legible basemap underneath, at Bangladesh district-to-street
  zoom levels.
- Stay inside the project's zero-cost constraint (§0), and inside the
  offline-first PWA story — map tiles are already specified as
  `CacheFirst`, 7-day expiry, max 200 entries (§8).

Mapbox GL JS answers all three but prices them in credentials: an
account, a domain-restricted public token, a token-scoping procedure in
the secrets matrix, a variable threaded through `apps/web/.env`, the
Pages build environment, `deploy-web.yml`, `apps/web/Dockerfile`, and the
CI variable inventory — plus a per-load billing meter and a WebGL
requirement on low-end Android hardware that is a realistic share of this
project's audience.

## Decision

**`apps/web` renders maps with Leaflet, drawing raster tiles from
OpenStreetMap's standard tile servers. No map credential exists.**

- **Library:** Leaflet, loaded only on the map route via the route's own
  `React.lazy` boundary, so it never enters the shell bundle counted
  against `FRONTEND_BUNDLE_BUDGET_KB` (§8, §9).
- **Basemap:** `MAP_TILE_URL_TEMPLATE` (§14) —
  `https://tile.openstreetmap.org/{z}/{x}/{y}.png` — rendered by a
  Leaflet `TileLayer` with `MAP_TILE_ATTRIBUTION` displayed on the map
  and `MAP_TILE_MAX_ZOOM` as the zoom ceiling. All three are registry
  constants, never bare literals (R9/§14).
- **`VITE_PUBLIC_MAPBOX_TOKEN` is removed** from §7.1, the secrets
  matrix, `apps/web/.env.example`, `apps/web/Dockerfile`,
  `deploy-web.yml`, and `docs/ci-cd.md`. §7.1's inventory drops from 12
  named variables to 11. There is no map credential to obtain, scope,
  restrict, rotate, or leak.
- **The dynamic layer is ours, not the provider's.** Region polygons,
  markers, and popups come from `apps/api` GeoJSON and are drawn as
  Leaflet vector/marker layers on top of the tiles. Nothing about the
  no-credential basemap constrains what the map can highlight, recolor,
  or update — the tile provider supplies background imagery and nothing
  else.
- **CSP:** the tile host is allow-listed under **`img-src`**, not
  `connect-src` — a Leaflet raster `TileLayer` requests tiles as `<img>`
  elements (§7.4). The entry lands in `apps/web/public/_headers` and
  `apps/web/docker/security-headers.conf.template` with the risk-map
  slice, not before.

**Rejected alternative — Mapbox GL JS.** Better cartography and true
vector tiles, at the cost of a credential this project would otherwise
not have, a billing meter on a zero-cost project, and a WebGL
requirement on the low-end devices that most need this tool to work.
None of the three is fatal alone; together they buy styling polish for a
map whose informational content is our own choropleth.

**Rejected alternative — a keyed free-tier raster provider (MapTiler,
Stadia).** A stricter uptime and usage posture than OSM's public tile
servers, and the natural upgrade path (below), but it reintroduces
exactly the credential this decision removes while the project has no
traffic that needs it. Deferred until measured need, not adopted
speculatively.

**Rejected alternative — self-hosting tiles.** Correct at scale and
wrong here: it means an object store, a tile pipeline, and a rendering
step, all outside this project's infrastructure budget.

## Consequences

**Easier:** one fewer external account, credential, rotation path, and
CI variable. A fresh clone renders a working map with nothing
provisioned — the map stops being a feature gated behind onboarding.
There is no client-side map credential to over-scope, so an entire class
of §7.2 information-disclosure risk simply does not exist. Leaflet's
raster rendering has no WebGL dependency and degrades gracefully on
low-end hardware.

**Harder:** raster tiles are lower-fidelity than vector tiles — no
runtime restyling, no smooth zoom interpolation, no per-feature basemap
theming. Bengali-language labels come from whatever OSM's standard style
renders, and are not ours to control; anything the map must state
authoritatively in Bengali belongs in our own overlay layer, not in the
basemap.

**The operational obligation this creates.** OpenStreetMap's standard
tile servers are a donated community resource governed by a
[usage policy](https://operations.osmfoundation.org/policies/tiles/)
written for modest traffic, not for an application that becomes popular.
This project must therefore: send a valid identifying `Referer`/user
agent, respect the `CacheFirst` service-worker policy already specified
in §8 rather than re-requesting tiles, and never bulk-download or
pre-scrape tiles. **If the risk map reaches sustained real-world
traffic, the basemap moves to a keyed provider or self-hosted tiles —
that is a `MAP_TILE_URL_TEMPLATE` change plus a CSP `img-src` change,
and a follow-up ADR, not a rewrite.** The isolation is the point:
because tiles are one registry constant and one header entry, the
provider is swappable; because the overlays are ours, they are unaffected
by the swap.
