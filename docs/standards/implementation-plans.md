# Implementation Plan Format

**Read when:** asked to write a detailed, fan-out-ready implementation plan
for a set of features from `docs/PROJECT_PLAN.md`.

**Decides:** what a plan document contains, in what order, and where it lives.

Claude Code additionally surfaces this as the `create-implementation-plan`
skill, which triggers on the same request. Both routes land here — this file
is the single copy of the format.

## 0. Get the features first

If the request does not name specific features/sections of
`docs/PROJECT_PLAN.md` to implement, **stop and ask** which ones, before
reading anything else. Do not guess from "whatever seems next" in the plan —
a wrong guess wastes the whole write-up.

## 1. Gather context (read, don't preload everything)

- The relevant slice(s) of `docs/PROJECT_PLAN.md` — especially §13 (build
  order), the schema sections the feature touches, and any named ADRs.
- `AGENTS.md`'s non-negotiables and the read-before-you-act table — load
  only the rows the feature touches.
- Actual repo state for anything the plan might assume: does the
  route/page/migration already exist as a stub, a placeholder, or not at
  all? Do not write "implement X" against a file you haven't checked — the
  baseline section (§3.2.4 below) must be verified, not assumed.
- `docs/standards/parallel-work.md` for the cost-estimate requirement and
  the phase shape this whole document is built on.

## 2. Output location

Write to `temp/<slice-name>.md` — a path scoped to *this* slice, not a
fixed generic filename. `temp/` is gitignored, which is what makes it legal
to name task IDs, worker letters, and phase numbers inside it (rule 9
forbids those in tracked files).

## 3. Document structure to follow

Reproduce all of these sections — omit one only if it is genuinely
inapplicable (e.g. no migration needed → say so explicitly in the baseline,
don't delete the section):

### 3.1 Title + scope

Which `docs/PROJECT_PLAN.md` slice(s), one sentence on what
"minimal"/"done" means if that needs defining.

### 3.2 §0 How To Use This Document

1. **Execution contract** — numbered rules: phases strictly ordered; every
   micro-task has an ID, file paths, an instruction, and an
   objectively-checkable **Acceptance** line; each worker's brief is a
   fence (Owns / Must not touch); no silent scope changes — report blocked
   tasks instead of substituting; no fake green (never weaken a
   test/lint/coverage gate to pass); commit convention; context hygiene
   reminder.
2. **Completion report format** — a verbatim template each phase/worker
   prints at its boundary (tasks done, files touched, gate results with
   literal command output, contract deviations, paths touched outside
   Owns, blocked items).
3. **Rules not restated per task** — a table of the specific `AGENTS.md`
   rules that bite hardest in *this* slice, with one concrete sentence
   each on what it means here.
4. **Verified repository baseline** — dated, and split into "already
   exists and works — build on it" vs. "stubs this plan replaces" (a table
   of path → current stub contents) vs. "facts that will bite if you
   forget them" (gotchas found by actually checking the repo).
5. **Scoping decisions** — lettered (A, B, C…), each a decision the plan
   author made that isn't obvious from the feature request alone, written
   as a claim + reasoning + trade-off, not a bare assertion.
6. **Required cost estimate** (rule 11) — run
   `node scripts/estimate-parallel-cost.mjs --plan <plan>.json` for real,
   paste the emitted table verbatim, add the "cheaper alternative
   considered" and "confidence" lines `docs/standards/parallel-work.md`
   requires. Never hand-quote a rate.
7. **Branch, worktree, and ownership map** — a table of
   phase/worker/branch/worktree, plus an explicit **single-writer paths**
   list (migrations, `packages/types`, §14, the constants registry,
   lockfile, router/barrels, workflows, `AGENTS.md`) that no Phase 1
   worker touches.

### 3.3 PHASE 0 — Contract Freeze (serial, one owner)

Numbered tasks (`P0-T01`…) each with an instruction and an **Acceptance**
line that's a command or a checkable fact, not a description. Typically
covers: branch + green-base check, any new dependency, new registry
constants (§14 + `docs/constants-registry.md` in the same task), the frozen
DTO/zod surface in `packages/types`, any migration or read-only view, any
small shared helper the whole slice depends on, route stubs mounted with
final shapes, router/nav entries with placeholder pages, plan-doc
amendments, and a final exit-gate task with a gate table + merge-and-regate
instruction.

### 3.4 PHASE 1 — Implementation (parallel, N workers)

Universal rules block, then one `## WORKER <letter>` section per
slice-of-the-slice (typically api / web / jobs-or-ml / docs+tests, capped
at 3-4). Each worker section states **Owns** and **Must not touch** as
explicit path lists, then numbered tasks (`A-T01`…) each with instruction +
Acceptance, ending in a gate task naming the exact commands.

### 3.5 PHASE 2 — Integration (serial, one seat)

Fixed merge order with the reasoning for that order, a per-branch
rebase→gate→merge→regate loop (squash-before-merge default applies —
`docs/standards/git-workflow.md` § promotion path), any deferred wiring
(e.g. enabling a previously-guarded CI job), registry status flips, the
mandatory three
manual passes (happy / degraded / adversarial, `docs/standards/testing.md`)
if this change needs them, the fan-out review (one cold agent per concern,
over the whole diff, each finding needing a concrete failure scenario),
final gate table, promotion-path pointer (`docs/standards/git-workflow.md`),
and worktree/branch teardown commands.

### 3.6 Appendices

As many as the slice needs, typically:

- **A — The frozen contract**: the actual zod schemas / types / constants
  Phase 0 writes, plus an endpoint↔schema table and the error-shape
  convention. This is what Phase 1 workers code against instead of
  re-reading Phase 0's prose.
- **B — Any nontrivial shared implementation** Phase 0 owns end-to-end
  (e.g. a parser), given in full because its shape is contract-critical.
- **C — Command reference** — every command mentioned anywhere in the doc,
  grouped (local stack / dev servers / gate / e2e / parallel work),
  copy-pasteable.
- **D — The estimator plan file** — the actual JSON passed to
  `estimate-parallel-cost.mjs`, so it can be rerun after calibration.
- **E — Definition of done** — a numbered checklist every micro-task must
  satisfy, independent of its own Acceptance line (gate cleanliness,
  rule 2/8/6/5/9 compliance, no fake green).
- **F — When you are stuck** — a short list of named failure modes
  (contract is wrong / need a file you don't own / inherited red gate /
  plan-vs-code disagreement) each with the one correct response (usually:
  stop, report, do not silently resolve).

## 4. Writing standards

- Every **Acceptance** line must be something you could paste into a shell
  and get a pass/fail from — not "works correctly."
- Every constant introduced gets a registry row in the same Phase 0 task
  that introduces it (rule 8) — never invent one inline later.
- Flag plan/reality disagreements (a missing route, a stale count, an
  ambiguous rate-limit column) explicitly as a **recorded decision**, never
  resolve them silently — `docs/PROJECT_PLAN.md` wins on conflict.
- Do not invent file paths — verify each one exists (or verify the stub it
  replaces exists) before writing it into an Owns list or a task
  instruction.
- Keep worker Owns/Must-not-touch lists mutually exclusive and jointly
  exhaustive of the files the slice touches; cross-check against
  `docs/standards/parallel-work.md`'s "never concurrent" list.
- Internal-only labels (task IDs, worker letters, phase numbers) are fine
  inside this doc because `temp/` is gitignored, but note in the doc
  itself that they must never leak into a tracked file, commit message, or
  `docs/**` page.

## 5. After writing

State the output path, the phase/worker shape (e.g. "1 serial contract
owner, 3 parallel workers, 1 integration seat"), and that running it
requires the parallel-work cost estimate to actually be executed
(§3.2.6) — not fabricated — before any worktree is created.
