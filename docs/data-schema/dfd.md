# Data Flow Diagrams

This document is a **Data Flow Diagram (DFD)** in the classic
Gane–Sarson sense — external entities, processes, data stores, and the
data flows between them — as distinct from `architecture.md`'s system
diagram (which shows *technology/deployment* boxes: apps, Workers, GitHub
Actions jobs) and `schema.md`'s ERD (which shows *table* relationships).
All three describe the same system from a different axis; none
supersedes the others.

Shape convention used below, consistent across both diagrams:

| Shape | Meaning |
|---|---|
| `[Rectangle]` | External entity — a person or system outside Avash's boundary |
| `(Rounded rectangle)` | Process — something that transforms or routes data |
| `[(Cylinder)]` | Data store — a Postgres table (or table group) in the Supabase database |

## Level 0 — Context Diagram

The whole system as a single process, showing every external entity that
sends data in or receives data out.

```mermaid
flowchart TB
    CITIZEN[Citizen / App User]
    STAFF[Verified Hospital Staff]
    MOD[Moderator / Admin]
    OWM[OpenWeatherMap API]
    GEMINI[Google Gemini API]
    NEWSSRC[News Sources]
    TURNSTILE[Cloudflare Turnstile]
    WEBPUSH[Web Push Service]
    OSM[OpenStreetMap Tiles]

    SYS((0.0<br/>Avash System))

    CITIZEN -- breeding report, blood update request, alert subscription, symptom query --> SYS
    SYS -- risk map, resource ticker, push notifications, symptom guidance --> CITIZEN
    STAFF -- blood inventory update --> SYS
    SYS -- current inventory --> STAFF
    MOD -- verify/reject report, review news item --> SYS
    SYS -- pending report queue, flagged news queue --> MOD

    SYS -- weather data request --> OWM
    OWM -- observations --> SYS
    SYS -- report/news content --> GEMINI
    GEMINI -- structured validation / classification --> SYS
    NEWSSRC -- articles --> SYS
    SYS -- CAPTCHA challenge --> TURNSTILE
    TURNSTILE -- verification result --> SYS
    SYS -- push payload --> WEBPUSH
    WEBPUSH -- delivered notification --> CITIZEN
    SYS -- tile request --> OSM
    OSM -- basemap tiles --> SYS
```

## Level 1 — Process Decomposition

`0.0 Avash System` decomposed into its constituent processes, mapped to
the data stores (Postgres tables, §4) they read and write.

```mermaid
flowchart TB
    subgraph ext [External Entities]
        CITIZEN[Citizen / App User]
        STAFF[Verified Hospital Staff]
        MOD[Moderator / Admin]
        OWM[OpenWeatherMap API]
        GEMINI[Google Gemini API]
        NEWSSRC[News Sources]
        TURNSTILE[Cloudflare Turnstile]
        WEBPUSH[Web Push Service]
    end

    P1((1.0<br/>Ingest Weather))
    P2((2.0<br/>Run Batch Prediction))
    P3((3.0<br/>Serve Risk Map))
    P4((4.0<br/>Process Breeding Report))
    P5((5.0<br/>Manage Blood Inventory))
    P6((6.0<br/>Manage Alerts & Push))
    P7((7.0<br/>Symptom Check))
    P8((8.0<br/>Aggregate & Review News))

    D1[(regions)]
    D2[(weather_observations)]
    D3[(dengue_cases)]
    D4[(risk_predictions)]
    D5[(region_risk_summary)]
    D6[(breeding_reports)]
    D7[(hospitals /<br/>blood_inventory)]
    D8[(alert_subscriptions /<br/>push_subscriptions)]
    D9[(news_items)]

    OWM -- raw observations --> P1
    P1 -- observation rows --> D2
    D1 -- region boundary --> P1

    D2 -- weather features --> P2
    D3 -- case history features --> P2
    D1 -- region boundary --> P2
    P2 -- prediction rows --> D4
    P2 -- refresh trigger --> D5
    D4 -- latest per region/horizon --> D5
    P2 -- risk-crossing event --> P6

    D5 -- summary rows --> P3
    D7 -- resource rows --> P3
    P3 -- map/resource payload --> CITIZEN

    CITIZEN -- report submission --> P4
    P4 -- CAPTCHA challenge --> TURNSTILE
    TURNSTILE -- pass/fail --> P4
    P4 -- content for validation --> GEMINI
    GEMINI -- structured validation --> P4
    P4 -- new report row --> D6
    D6 -- pending queue --> MOD
    MOD -- verify/reject decision --> P4
    P4 -- status update --> D6

    STAFF -- inventory delta --> P5
    P5 -- updated row --> D7
    D7 -- live inventory (Realtime) --> CITIZEN

    CITIZEN -- geofence definition --> P6
    P6 -- subscription row --> D8
    D8 -- active subscriptions --> P6
    P6 -- push payload --> WEBPUSH
    WEBPUSH -- delivered notification --> CITIZEN

    CITIZEN -- symptom description --> P7
    P7 -- prompt --> GEMINI
    GEMINI -- structured guidance --> P7
    P7 -- guidance (not stored) --> CITIZEN

    NEWSSRC -- article --> P8
    P8 -- content for classification --> GEMINI
    GEMINI -- region guess / confidence --> P8
    P8 -- unreviewed item --> D9
    D9 -- flagged queue --> MOD
    MOD -- review decision --> P8
    P8 -- reviewed status --> D9
    D9 -- reviewed items --> CITIZEN
```

## Reading notes

- **P2 (batch prediction) and P8 (news aggregation) run as scheduled
  GitHub Actions jobs**, not `apps/api` request handlers (R7, ADR-007) —
  the diagram shows *data* flow, which is identical regardless of which
  runtime executes the process.
- **P3 (serve risk map) never reads `risk_predictions` directly** — it
  reads only `region_risk_summary`, the materialized view, per the §4.2
  rule against live joins on the hot read path.
- **P5's read edge back to the citizen is Supabase Realtime**, not a
  request through `apps/api` (ADR-010) — the only data store in this
  document with a direct external-entity read edge that bypasses every
  process box.
- **P7 (symptom check) has no data store** — by design, symptom queries
  and Gemini's guidance are never persisted (privacy: no health data at
  rest for an unauthenticated feature).
- Every arrow into a data store from a process that isn't `P1`/`P2`/`P4`/
  `P5`/`P6`/`P8` would indicate an unreviewed write path and is
  intentionally absent — e.g. nothing writes to `D4`/`D5`
  (`risk_predictions`/`region_risk_summary`) except `P2`, matching the
  RLS stance in `rls-policies.md` (`insert`/`update` on those tables is
  service-role-only, never via a client role).

## Cross-reference

- Table-level structure and constraints: `schema.md` (§4).
- FK `on delete`/`on update` behavior referenced implicitly by the
  `D*` stores above: `schema.md` §4.3.
- RLS predicates gating who may read/write each store: `rls-policies.md`.
- Deployment/technology view of the same system: `../architecture.md`.
