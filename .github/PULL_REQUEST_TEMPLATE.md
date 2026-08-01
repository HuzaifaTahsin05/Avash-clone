<!--
  See CONTRIBUTING.md for the full explanation of every section below.
  Every PR must be one vertical slice (docs/PROJECT_PLAN.md §13).
-->

## Slice / Section
<!-- Linked slice number (docs/PROJECT_PLAN.md §13) or section reference. -->

## Summary
<!-- What changed and why, in 2-3 sentences. -->

## Docs updated (§12)
- [ ] Feature doc in `docs/features/*.md` (Gist / Technical Detail / Critical
      Constants / Security Considerations / Manual Test Log — all five
      sections present)
- [ ] `docs/data-schema/schema.md` and/or `docs/data-schema/rls-policies.md`
      updated (if schema changed)
- [ ] `docs/constants-registry.md` updated (if a new constant was introduced
      — every hardcoded number must appear there first, §14)
- [ ] N/A — no behavior change

## Automated test evidence
<!-- Paste Vitest and/or Playwright run output/summary. -->

```
<paste here>
```

## Manual test log — three-pass protocol (§10)

Manual testing is **mandatory** for any PR touching a write path or an
LLM-touching feature. Automated tests never substitute for these passes.

### Pass 1 — Assume not implemented
<!-- Loading/empty/error states, offline, no console errors. -->

### Pass 2 — Assume implemented correctly
<!-- Full happy path with real data, at least two browsers where applicable. -->

### Pass 3 — Assume full of bugs and security flaws
<!-- Malformed input, oversized payloads, rate-limit bypass attempts, XSS
     strings, invalid coordinates, forged/expired tokens, direct curl calls
     bypassing the UI, cross-origin requests from an unlisted domain. -->

**Reviewer sign-off:** <!-- reviewer name — confirms all three passes above
were independently verified before approval. Required; a PR touching a
write path or LLM feature is not mergeable without this line filled in. -->

## Security vectors considered (STRIDE)

Required for any write-path or auth-adjacent change. Mirrors
`docs/PROJECT_PLAN.md` §7.2's format. Write "N/A — read-only, no new
surface" per row if genuinely not applicable.

| Category | Threat | Mitigation | Enforcement point |
|---|---|---|---|
| Spoofing | | | |
| Tampering | | | |
| Repudiation | | | |
| Information Disclosure | | | |
| Denial of Service | | | |
| Elevation of Privilege | | | |

## Constants registry
- [ ] Every new hardcoded threshold/limit is added to `docs/PROJECT_PLAN.md`
      §14 **and** `docs/constants-registry.md` in this same PR.
- [ ] N/A — no new constants introduced

## Checklist
- [ ] `pnpm lint && pnpm typecheck && pnpm test && pnpm build` passes locally
- [ ] No non-`VITE_PUBLIC_` env reference introduced under `apps/web/src`
- [ ] No type/interface redefined outside `packages/types`
- [ ] No test, lint rule, or manual-test description was weakened to force a pass
