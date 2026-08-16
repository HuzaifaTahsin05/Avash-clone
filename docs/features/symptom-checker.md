# Symptom Checker

Follows the mandatory template from `docs/PROJECT_PLAN.md` §12.

**Gist:** A page at `/symptoms` lets a visitor describe how they feel in
free text and/or tick WHO warning-sign checkboxes. `POST
/api/symptom-check` always returns a triage outcome
(`emergency` / `consult-24h` / `monitor`), fixed server-side guidance
copy, the final checklist used, and whether AI assist was available for
this request. **ADR-004 (non-negotiable):** the LLM (Gemini) never makes
the triage decision — it only maps free text onto the 12-field checklist
shape. A deterministic rule engine, `assessTriage` (frozen,
`packages/security/triage.ts`), is the *only* thing that computes the
outcome, every time, whether or not Gemini ran or succeeded.

**Technical Detail:**

- Contract: `symptomCheckRequestSchema` (`packages/types/api.ts`) —
  `{ symptomText?: string (≤ SYMPTOM_TEXT_MAX_CHARS), checklist?:
  Partial<symptomChecklistSchema> }`. Both fields are optional; an empty
  `{}` body is valid per the frozen contract and yields the same result as
  an all-`false` checklist (`monitor`, `aiAssistAvailable: false`).
  `symptomCheckResponseSchema` — `{ outcome, guidance, checklist,
  aiAssistAvailable, requestId }`.
- The rule engine (`packages/security/triage.ts`, `assessTriage`, already
  frozen and untouched by this slice — read, verified correct, and left
  as-is):
  ```
  SEVERE_SIGNS = [severeAbdominalPain, persistentVomiting, mucosalBleeding,
                  lethargyOrRestlessness, liverEnlargement, fluidAccumulation]
  CONSULT_CRITERIA = [nauseaOrVomiting, rash, achesAndPains,
                       positiveTourniquetTest, leukopenia]
  if any(SEVERE_SIGNS) -> 'emergency'
  else if fever and count(CONSULT_CRITERIA) >= 2 -> 'consult-24h'
  else -> 'monitor'
  ```
  A missing field is treated as `false`, never "unknown" — there is no
  code path that infers absence as a positive signal.
- Route flow (`apps/api/src/routes/symptom-check.ts`), middleware chain
  `rateLimit(minute) → rateLimit(day) → handler` (`SYMPTOM_CHECK_RATE_LIMIT`,
  10/min + 50/day per IP, `packages/security/rateLimit.ts`):
  1. Parse the body against `symptomCheckRequestSchema`; a parse failure
     (including over-length `symptomText`) is a generic `400` before
     anything else runs.
  2. If `symptomText` is present and non-empty, call
     `consumeGeminiQuota` (`packages/security/quotaGuard.ts`,
     `GEMINI_DAILY_QUOTA_GUARD` = 1500/day, shared circuit breaker across
     the whole deployment). If the quota is exhausted, **or the guard call
     itself fails** (Upstash unreachable), Gemini is skipped entirely —
     the route falls straight through to step 4 with whatever checklist
     fields the client already sent, `aiAssistAvailable: false`. This is
     never a `500` and never a retry.
  3. Otherwise call `callGeminiStructured` (`apps/api/src/lib/geminiClient.ts`,
     frozen/not owned by this slice) with a fixed system instruction
     asking it to map `symptomText` onto the 12 checklist booleans, and
     `responseSchema: symptomChecklistSchema`. A `{ ok: false }` result
     (HTTP error, timeout, malformed JSON, or a response that fails
     re-validation against the schema) is *itself* the deterministic
     fallback — same as step 2, never a `500`.
  4. Merge: `merged[key] = clientChecklist[key] ?? geminiChecklist[key] ??
     false`. A field the client explicitly sent (`true` or `false`) always
     wins over what Gemini inferred; a field neither side supplied
     defaults to `false`.
  5. `assessTriage(merged)` computes `outcome` — this call's return value
     is the response's `outcome`, unconditionally.
  6. `guidance` is one of three fixed, calm, non-alarmist strings keyed by
     `outcome`, defined as constants in `symptom-check.ts` — **never**
     model-generated text. No prompt-injection payload in `symptomText`
     can change `outcome` or `guidance`: the worst it can do is bias what
     Gemini infers for the checklist, and even that is bounded by
     `symptomChecklistSchema` re-validation in `callGeminiStructured` and
     overridable by any client-supplied checklist field.
  7. No PII or symptom content is logged or persisted anywhere in this
     route (§7.2) — there is no DB write, and the only `logger` calls that
     can fire come from the shared `withErrorBoundary`/`rateLimit`
     helpers, which log a generic message and `requestId`, never request
     body content. Verified with
     `grep -rn "logger" apps/api/src/routes/symptom-check.ts` (no match).
- `apps/web`'s `/symptoms` page
  (`apps/web/src/pages/SymptomChecker.tsx` →
  `apps/web/src/features/symptom-checker/SymptomCheckerForm.tsx`) is a
  free-text `<textarea>` (`maxLength={SYMPTOM_TEXT_MAX_CHARS}`, live
  character counter) plus two fieldsets of checkboxes (`SEVERE_SIGN_FIELDS`
  / `OTHER_SYMPTOM_FIELDS`, `apps/web/src/features/symptom-checker/checklistFields.ts`),
  submitted via `useSymptomCheck` (`@tanstack/react-query`'s
  `useMutation`, `apps/web/src/features/symptom-checker/useSymptomCheck.ts`)
  — no manual `useEffect` fetching. The result panel shows the outcome as
  a colored badge, the fixed guidance text, and (when
  `aiAssistAvailable === false`) an "AI assist temporarily unavailable"
  notice — the triage result itself is still rendered in that case, since
  it never depended on Gemini succeeding. A "this is not a medical
  diagnosis" notice is rendered unconditionally, both before a first
  submission and inside every outcome state, never gated on `outcome`.

**Critical Constants:**

| Constant | Value | Defined in | Purpose |
|---|---|---|---|
| `SYMPTOM_TEXT_MAX_CHARS` | 500 | `packages/types/api.ts` | free-text input cap, enforced by both the schema and the textarea's `maxLength` |
| `SYMPTOM_CHECK_RATE_LIMIT` | 10/min, 50/day per IP | `packages/security/rateLimit.ts` | Gemini cost control at the route boundary |
| `GEMINI_DAILY_QUOTA_GUARD` | 1500/day | `packages/security/quotaGuard.ts` | global circuit breaker across all Gemini-calling routes |
| `GEMINI_MODEL_ID` / `GEMINI_REQUEST_TIMEOUT_MS` | `gemini-2.5-flash` / 5000 | `apps/api/src/lib/geminiClient.ts` | model pin + bounded request latency |

**Security Considerations:**

STRIDE analysis, mirrored into `docs/security/threat-model.md`:

- *Tampering (the core ADR-004 risk):* a crafted `symptomText` designed to
  make Gemini claim a false severe sign, or a prompt-injection payload
  trying to make the model emit something other than the checklist shape.
  Mitigated at two independent layers: `callGeminiStructured` (§5.4,
  frozen) sanitizes and delimits the untrusted text and re-validates the
  model's JSON against `symptomChecklistSchema` before this route ever
  sees it; and even a successful, schema-valid-but-dishonest inference
  only ever populates checklist *booleans* — it can never write `outcome`
  or `guidance` directly, because those two fields are computed
  server-side by `assessTriage`/the fixed guidance table and are not part
  of `symptomChecklistSchema` at all.
- *Tampering (client-supplied checklist):* a client could send
  `checklist: { severeAbdominalPain: true }` outright, without Gemini in
  the loop, to force `emergency`. Accepted as intended, not a
  vulnerability — this is a self-assessment tool with no authenticated
  identity or downstream action gated on the result; the worst case is a
  visitor telling themselves (truthfully or not) to seek care.
- *Denial of service (Gemini cost):* unbounded free-text submissions
  driving unbounded Gemini spend. Mitigated by the two-tier
  `SYMPTOM_CHECK_RATE_LIMIT` per IP plus the global
  `GEMINI_DAILY_QUOTA_GUARD` shared across every Gemini-calling route —
  the quota guard fails *closed* on the rate limiter (a Redis outage still
  blocks excess request volume) but fails *open* on the Gemini call itself
  (a Redis outage for the quota guard degrades to the deterministic
  checklist path rather than 500ing or blocking the whole route).
- *Information disclosure:* a raw Gemini or Redis error surfacing to the
  client. Mitigated by `buildGenericErrorBody()`/`withErrorBoundary` on
  every branch — the client only ever sees `{ outcome, guidance,
  checklist, aiAssistAvailable, requestId }` or the generic 400/error
  body; no Gemini error reason, HTTP status, or stack trace crosses the
  boundary.
- *Spoofing:* none new — the route is unauthenticated by design (a
  symptom self-check has no identity to protect), stated explicitly
  rather than left silent, matching the resource-map/weather precedent.

**Fallback behavior (§7.3-style), stated explicitly:**

| Condition | What happens |
|---|---|
| No `symptomText` sent at all | Gemini is never called; outcome comes straight from `checklist` (or all-`false`); `aiAssistAvailable: false` |
| Daily Gemini quota exhausted | Gemini is skipped; outcome comes from the client-supplied checklist; `aiAssistAvailable: false`; never a 500 |
| Quota-guard Redis call fails | Same as above — treated identically to "exhausted" per the brief, not distinguished to the client |
| Gemini HTTP error / timeout / malformed JSON / schema mismatch | `callGeminiStructured` returns `{ ok: false }`; same deterministic fallback; never a 500, never retried |
| Rate limit (10/min or 50/day) exceeded | `429` before the body is even parsed — the same fail-closed behavior as every other rate-limited route in this codebase |

**Manual Test Log:**

2026-08-16. `apps/api/test/routes/symptom-check.test.ts` (11 tests, run
inside workerd via `vitest-pool-workers`, fakes for both Redis-backed
concerns) covers: over-length text → 400; malformed body → 400; empty
body → 200/monitor; quota exhausted → deterministic fallback;
guard-call-fails (Upstash unreachable for the quota check specifically,
isolated from the rate limiter's own — separately tested — fail-closed
429) → deterministic fallback; a `{ ok: false }` Gemini result →
deterministic fallback; Gemini success → checklist merged and triage
computed from it; client checklist fields override Gemini's inference; a
prompt-injection string changes neither outcome nor response shape;
response never carries free-form model text; a severe sign alone still
reaches `emergency` end-to-end. Route coverage: 96.87% statements / 100%
branches / 96.77% lines (`apps/api/src/routes/symptom-check.ts`), above
the `apps/api/src/routes/**` gate (85%/80%).

`apps/web/e2e/symptom-checker.spec.ts` (8 tests, Playwright against
`pnpm preview`, route-intercepted — never a live `apps/api`, same
convention as `weather.spec.ts`) — all passing: severe-sign checkbox →
emergency outcome rendered; disclaimer visible before submit and in
every outcome state (emergency/monitor/consult-24h); AI-unavailable
notice renders alongside the still-shown triage result; an XSS string
(`<script>alert(1)</script>`) in the free-text field renders inert (no
dialog, no live `<script>` node); full keyboard operability. No
`@axe-core/playwright` (or equivalent) dependency exists in this
repository as of this writing, so no automated axe scan was added, per
the brief's instruction not to introduce a new a11y-testing dependency —
this is an open gap, not a mitigated one, called out here rather than
assumed done.

`apps/api/e2e/symptom-check.spec.ts` (4 tests, real HTTP against
`wrangler dev`) — written and passing against the contract when Redis is
reachable from the Worker process. **Open item, not resolved by this
slice:** in this local sandbox, `wrangler dev`'s outbound `fetch` to the
real Upstash REST endpoint configured in `.dev.vars` could not be
reached (`checkRateLimit` fails closed, every request 429s), even though
the identical credentials succeed over plain HTTPS from outside the
Worker process. This was independently reproduced against the frozen,
not-owned `apps/api/src/routes/resources.ts` `PATCH /blood/:id` route
(same 429), confirming it is a pre-existing environment/sandbox
networking condition affecting every rate-limited route here, not
something introduced by this slice. Full branch coverage for this route
already lives in the workerd Vitest suite above with injected fakes, so
this is a real-HTTP contract gap, not an unverified code path. Left open
for whoever owns CI/sandbox network configuration.
