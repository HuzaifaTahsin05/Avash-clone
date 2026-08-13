# Parallel Work — Multiple Agents, Multiple Developers

**Read when:** two or more agents or developers will be working at the
same time, or when planning how to sequence a batch of slices.

**Decides:** what may run in parallel, what must be serialized, who owns
which paths, and how work merges without conflict.

---

## Cost estimate — required before any fan-out

**No parallel or multi-agent work starts without a written estimate and an
explicit go-ahead.** Not a gut call, not "this'll be faster" — a table with
numbers, presented and approved before the first worktree exists.

The reason is the thing everyone gets backwards:

> **Parallelism does not reduce total spend. It increases it.** You are
> buying wall-clock time, and paying for it in tokens and CI minutes.

Every agent re-establishes context the others already have. Rebases and
integration are superlinear in branch count. Four agents on one slice cost
noticeably more than one agent doing the same slice serially — the question
is only whether the time saved is worth that premium *on this particular
slice*. Sometimes it clearly is. That is a decision for whoever pays, made
in advance, with the number in front of them.

### What the estimate has to cover

Four metrics, because a plan can be affordable and still be a bad plan:

| Metric | Why it decides something |
|---|---|
| **Context-window pressure** — peak history ÷ the model's window | The one that can make a plan *unrunnable*. Past ~40% (`CLAUDE.md` hygiene limit) expect compaction, degraded instruction-following, and turn counts above estimate — which blows the other three |
| **Wall-clock** — parallel vs serial | The only thing fan-out actually buys. If it isn't materially faster, don't fan out |
| **CI minutes** — branches × runs × pipeline length | Scales with branch count, not with work done. Easy to forget, and it is the line item that grows quietly |
| **Token spend** — pay-as-you-go API cost | The obvious one, and usually not the deciding one |

### Run the estimator — never hand-quote rates

```bash
node scripts/estimate-parallel-cost.mjs --plan <plan>.json
node scripts/estimate-parallel-cost.mjs --refresh-rates    # force a re-fetch
```

**Rates and context windows are fetched at estimate time, from Anthropic's
published model docs.** They are deliberately *not* written down in this
repository: a price copied into a doc goes stale silently, and every budget
built on it is confidently wrong. If the fetch fails, the script exits
non-zero rather than falling back to an assumed number — an estimate you
cannot source is worse than no estimate.

Cache multipliers are contract-level API behavior rather than per-model
pricing, so they live in the script: reads are 0.1×, writes 1.25× at the
5-minute TTL (2× at one hour). Per turn:

```
turn_cost = uncached_in × rate_in
          + cache_write × rate_in × 1.25
          + cache_read  × rate_in × 0.10
          + output      × rate_out
```

The plan file states your assumptions explicitly — agents, turns, model, and
a per-turn token profile per phase, plus CI shape. `scripts/parallel-plan.example.json`
is a working starting point. Model choice per phase is itself a budget lever:
contracts and security review want the strongest model; a codemod across 40
files does not.

Batch API is 50% off but cannot serve interactive agent work — it fits
offline sweeps only.

### Present, then stop

The script emits the table to paste. Add the two lines it cannot compute:

```md
**Cheaper alternative considered:** <serial / fewer agents / smaller model>
**Confidence:** <low|medium|high — and what would sharpen it>

Proceed?
```

Then wait. Do not create a worktree, spawn an agent, or push a branch before
the answer comes back.

### Calibrate — the estimate is for deciding, not for billing

Turn count and history size dominate every other input, and both are
workload-specific. Before a large fan-out, run **one** agent on **one**
Phase-1 task and read its actual usage, then update the plan file. That
single measurement beats anything the script computes from guesses, and the
script says so in its own output.

### Levers that actually reduce spend

In rough order of effect:

1. **Do Phase 0 properly.** The single largest cost driver is agents
   re-deriving a contract that was never frozen. Rework is the expensive
   part, not tokens.
2. **Right-size the model per phase.** Contracts and security review want
   Opus; a codemod across 40 files does not. Mixing models is the cheapest
   real saving available.
3. **Protect the prompt cache.** Cache reads cost 0.1×. Anything that
   changes the prefix mid-session — swapping the tool set, editing the
   system prompt, switching models — throws that away and re-pays at full
   rate. Keep the eager tier stable (`docs/standards/agent-compliance.md`).
4. **Fewer, longer-lived agents.** Each new agent pays to establish context
   from scratch. Two agents doing three tasks each is cheaper than six
   agents doing one.
5. **Cap fan-out width.** 3–4 concurrent slices (see § Sizing). Past that
   you pay for rebasing, not building.

## The rule that makes everything else work

**Parallelize on contracts, not on files.** Two workers can move at full
speed only when neither needs to know what the other typed. The thing that
makes that true is a frozen interface between them — in this repository,
`packages/types`.

So every batch of parallel work has two phases, and the first one is
**serial**:

```
Phase 0 (serial, one owner, hours not days)
  types + zod schemas in packages/types
  DB migration for the slice
  route signature stubs in apps/api (404 or 501, contract-shaped)
  constants added to §14 + docs/constants-registry.md
        │
        ├──────────────┬──────────────┬──────────────┐
Phase 1 (parallel, N workers, isolated worktrees)
  backend impl     frontend impl     jobs/ML        docs/tests
        └──────────────┴──────────────┴──────────────┘
                       │
Phase 2 (serial) integrate into local dev, run full gates, promote
```

Phase 0 is where you spend the discipline. A team that skips it and
"agrees on the shape in chat" spends Phase 2 reconciling three different
interpretations of the same payload — which costs more than Phase 0 ever
did.

**Corollary:** if a proposed parallel task cannot name the contract it
codes against, it is not ready to be parallel. Serialize it or finish
Phase 0 first.

## What must never run in parallel

These are single-writer resources. Two concurrent edits produce either a
conflict or, worse, a silent merge that type-checks and is wrong.

| Resource | Why | Protocol |
|---|---|---|
| `packages/db/supabase/migrations/` | Ordering is semantic; two migrations written against the same base schema can both apply and leave a state neither author intended | One migration in flight at a time. Timestamp-prefixed filenames. Rebase, never renumber |
| `packages/types` barrel + shared DTOs | Everything downstream compiles against it | Phase 0 only. A Phase-1 change means the contract was wrong — stop, fix it serially, tell everyone |
| `docs/PROJECT_PLAN.md` §14 / `docs/constants-registry.md` | Append-heavy single table | Phase 0. Alphabetical order so appends rarely touch the same line |
| `pnpm-lock.yaml` | Merge conflicts here are unresolvable by hand | One dependency-adding task at a time; regenerate, never hand-merge |
| `apps/web/src/router.tsx` and any barrel/index | Every slice appends to the same list | Append at the end, alphabetically. Prefer file-per-route with a generated barrel |
| `.github/workflows/**` | Pipeline changes interact | One CI task at a time. `ci/*` work does not run alongside other `ci/*` work |
| `AGENTS.md` + agent config pointers | Hash-stamped; every edit invalidates all pointers | Serial, and re-stamp in the same commit |

Everything else — route handlers, components, package internals, feature
docs, tests — parallelizes freely, because each lives in a file one slice
owns.

## Ownership

One owner per path, declared in `CODEOWNERS`, mirroring the roles in
`.agents/task-contracts.json`:

| Path | Role |
|---|---|
| `apps/web/**` | frontend-dev |
| `apps/api/**` | backend-dev |
| `packages/db/**` | db-engineer |
| `ml/**`, `packages/ml-inference/**` | ml-engineer |
| `.github/**`, `turbo.json`, `wrangler.toml` | devops |
| `packages/types/**` | **whoever is running Phase 0** — never a Phase-1 worker |
| `docs/**` | the author of the change being documented |

Ownership is about *who resolves a conflict*, not about who may edit. A
frontend task that needs a backend change does not silently make it — it
reports the dependency, because that dependency is almost always a sign
Phase 0 was incomplete.

## Isolation: one worktree per worker

Agents must not share a working tree. Two agents editing one checkout
produce interleaved edits, a test run that sees a half-written file, and
findings that are artifacts of timing.

```bash
git worktree add ../avash-<slice> -b feat/<slice>
cd ../avash-<slice>
pnpm install                    # shared store; link-only, cheap
```

Each worktree needs bootstrapping, because the things that make it work
are gitignored:

- **Env files** — `.env`, `apps/api/.dev.vars`, `apps/web/.env` are not
  copied by `git worktree add`. Copy them in.
- **Ports** — 5173, 8787, 54322 collide across worktrees. Assign each a
  port offset and export it.
- **Docker** — set `COMPOSE_PROJECT_NAME=avash-<slice>`, or containers and
  host port bindings fight. Fixed container names (`smoke`,
  `api-parity`) collide too.
- **Turbo cache** — local `.turbo` per worktree is fine and correct.

Automate this in `scripts/worktree-new.sh` so it is one command. A manual
six-step setup will be done wrong, in a hurry, by whoever is least
familiar with it.

Remove finished worktrees (`git worktree remove ../avash-<slice>`) —
a stale one is a tree that silently misses everyone else's merges.

## Integration cadence

**Merge to local `dev` at least daily, and always at slice completion.**
The cost of a merge grows superlinearly with branch age; three days of
divergence across four workers is not four merges, it is one bad afternoon.

Order of operations at integration (Phase 2), serially, one worker at a
time holding the "integration seat":

1. `git fetch origin && git rebase origin/dev` in the slice worktree.
2. Run the full gate **in the worktree**: `pnpm lint && pnpm typecheck &&
   pnpm test && pnpm build`, plus the e2e suites the slice touches.
3. Merge into local `dev`. Resolve conflicts here, never on a remote.
4. Re-run the full gate on `dev` — a merge of two green branches is not
   itself green, and this is the step people skip.
5. Push `dev`, watch Actions, fix red before anyone else takes the seat.

One integration seat at a time is the point. Parallel merging into the
same branch is how you get a `dev` that no single person has ever seen
pass.

## Agent-specific rules

**One agent, one worktree, one slice, one contract.** An agent's task
brief must state: the slice name, the paths it owns, the contract it codes
against (`packages/types` symbols by name), its definition of done, and
the paths it must **not** touch. Without the last one, agents drift into
shared files because that is where the interesting problems are.

**Never fan out N agents over N files of the same change.** They duplicate
each other, each sees too little context to judge anything, and you pay N
times for one opinion. Fan out across *slices* (genuinely independent
work), not across files of one slice.

**Review is per diff checkpoint, one agent per concern** — correctness,
security, performance — over the whole change, not per file save. A
reviewer that sees a half-finished refactor reports defects that are
artifacts of when it looked, and a reviewer people learn to ignore is
worse than none. Every finding carries a concrete failure scenario
(inputs → wrong output); a finding without one is an opinion and does not
block a merge. Recurring findings get promoted to a lint or `semgrep`
rule — that is the ratchet that stops you re-litigating the same issue.

**Deterministic tools run first, always.** `eslint`, `tsc`, `semgrep`,
`gitleaks`, and the repo's own gate scripts are faster, cheaper, and
reproducible. An agent's comparative advantage is what static analysis
structurally cannot see — "this route validates the payload but never
checks the requester owns the row," "this rate limit keys on user ID so
signing out bypasses it." Point agents there.

**No agent gets a weaker gate.** The same lint, typecheck, test, coverage,
and manual-test requirements apply regardless of who or what wrote the
code. "The agent generated it, we'll clean it in integration" is how a
parallel codebase becomes incoherent.

## Keeping quality while going fast

The gates are not friction on parallelism — they are what makes it safe.
Four workers merging into one branch is only survivable because every
merge is verified identically.

- **Speed comes from removing waits, not from removing checks.** Turbo
  remote cache, a warm pnpm store, jobs that run concurrently rather than
  sequentially, and Phase 0 done properly buy far more wall-clock time
  than any skipped gate.
- **Security scales by being deterministic.** CodeQL, Trivy, `gitleaks`
  and the client-env scan run per-PR regardless of worker count. A
  per-worker security review does not scale and does not reproduce.
- **Performance budgets are per-PR, not per-release.** The bundle budget
  gate catches the 3 KB each of four slices adds; a release-time check
  catches 12 KB with no owner.
- **Coherence is a review property.** The reviewer's first question is
  "does this match the pattern in the file it edits?" — that question is
  what keeps four workers from producing four conventions.

## Sizing

Parallel width is bounded by Phase 0 throughput and by the integration
seat, not by how many agents you can start. Practical ceiling for this
repository: **3–4 concurrent slices**. Past that, workers spend more time
rebasing than building, and the integration seat becomes the bottleneck
that Phase 0 was supposed to prevent.

If a slice cannot be described without referencing another in-flight
slice's internals, they are one slice. Merge them and run them serially.
