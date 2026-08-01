# ADR-004: Deterministic triage; LLM only structures input

**Date:** 2026-08-01
**Status:** Accepted

## Context

The Symptom Checker is a health-safety-relevant feature. An LLM asked to
directly decide "is this an emergency" can hallucinate, be prompt-injected,
or give inconsistent answers to the same input across calls — unacceptable
for a decision that could delay someone from seeking emergency care.

**Rejected alternative:** let Gemini make the triage decision directly
from free-text symptom descriptions. Rejected because it is
non-deterministic, not fully reviewable/testable ahead of time, and
vulnerable to prompt injection steering the model toward a falsely
reassuring answer (`docs/PROJECT_PLAN.md` §7.2's Symptom Checker threat
row).

## Decision

The LLM (Gemini) is used only to structure free-text user input into a
fixed checklist shape (`{ fever: bool, retroOrbitalPain: bool, ... }`) via
a `responseSchema`-constrained call — it never outputs the triage verdict
itself. A deterministic, plain-TypeScript WHO-warning-signs rule engine
(`docs/PROJECT_PLAN.md` §5.4) makes the actual triage call from that
structured checklist. The rule engine ships to `apps/api` as the
authoritative check, and as a fallback-only copy bundled into `apps/web`
for the offline case.

## Consequences

**Easier:** the triage logic is 100% deterministic, unit-testable, and
independently reviewable branch-by-branch — a reviewer can verify every
possible output without needing to reason about model behavior. It also
degrades safely offline (the bundled fallback copy) and when the Gemini
quota guard trips (§7.3): symptom checking still works, just without the
free-text convenience layer.

**Harder:** the rule engine must be kept in sync in two places
(`apps/api` and the `apps/web` fallback copy) — any change to the WHO
warning-signs logic needs both updated in the same PR, or the two triage
paths silently diverge.
