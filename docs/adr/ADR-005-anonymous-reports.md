# ADR-005: Anonymous reports allowed, gated by Turnstile + rate limit

**Date:** 2026-08-01
**Status:** Accepted

## Context

Breeding-site reporting is a citizen-science feature — the more people who
can report a standing-water breeding site, the earlier a municipal team can
act on it. Requiring an account before someone can submit a report is
significant friction that would suppress report volume, especially from
first-time or one-off users who just want to flag a hazard near them.

**Rejected alternative:** require authentication for every breeding
report submission. Rejected because it directly trades away report volume
— the feature's core value — for a marginal reduction in spam risk that
can be handled at the network layer instead.

## Decision

`POST /api/reports/breeding-site` accepts both anonymous (`anon` role) and
authenticated submissions. Abuse is controlled at the network/behavioral
layer, not the identity layer: Cloudflare Turnstile is mandatory on every
submission, combined with IP-based rate limiting
(`BREEDING_REPORT_RATE_LIMIT`, §14: 5/min, 20/day per IP) and
Gemini-assisted spam-likelihood scoring. `reporter_id` is nullable and
recorded only when the submitter is authenticated.

## Consequences

**Easier:** maximizes citizen participation with no signup wall; the
report form works the same for a first-time visitor as for a returning
verified user.

**Harder:** RLS on `breeding_reports` cannot key `select`/`update`
authorization off `reporter_id` for anonymous rows the way it can for
authenticated ones — verification and moderation must go through the
`moderator`/`admin` role check instead (`docs/PROJECT_PLAN.md` §4.1). Abuse
mitigation depends entirely on Turnstile + rate limiting holding up; if
either is misconfigured or bypassed, there is no secondary identity-based
backstop for anonymous submissions.
