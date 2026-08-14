---
name: parallel-work
description: Use before spawning agents, fanning out work, or running anything concurrently — and when planning a batch of slices, setting up a git worktree, splitting a task, resolving a merge conflict, or judging whether two pieces of work can proceed at once. Invoke to produce the cost estimate required before any parallel work starts.
---

# Estimate first, then wait for approval

**No fan-out without a written estimate and an explicit go-ahead**
(`AGENTS.md` rule 11). Parallelism does not save money — every agent
re-establishes context the others already have, and integration cost is
superlinear in branch count. You are buying wall-clock and paying in tokens,
CI minutes, and context pressure.

```bash
node scripts/estimate-parallel-cost.mjs --plan <plan>.json
```

**Never hand-quote a rate.** The script fetches current prices and context
windows from Anthropic's model docs at estimate time and exits non-zero if it
cannot — a price copied into the repo goes stale silently and every budget
built on it is confidently wrong. Start from `scripts/parallel-plan.example.json`.

Four metrics, and the first can make a plan unrunnable rather than merely
expensive:

- **Context pressure** — peak history ÷ window. Past ~40% expect compaction
  and turn counts above estimate, which blows everything else.
- **Wall-clock** — parallel vs serial. The only thing fan-out buys.
- **CI minutes** — scales with branch count, not with work done.
- **Token spend** — usually not the deciding number.

Paste the emitted table, add *cheaper alternative considered* and
*confidence*, then **stop**. No worktree, no agent, no branch until the
answer comes back. Calibrate by running one agent on one task and reading
real usage — that beats any computed guess.

Biggest savings, in order: do Phase 0 properly (rework dominates),
right-size the model per phase, protect the prompt cache, prefer fewer
longer-lived agents, cap width at 3–4. Full detail:
`docs/standards/parallel-work.md` § Cost estimate.

# Parallelize on contracts, not on files

Two phases, and the first is **serial**:

**Phase 0 (serial, one owner):** types + zod schemas in `packages/types`,
the DB migration, contract-shaped route stubs in `apps/api`, and any new
constants in §14 + `docs/constants-registry.md`.

**Phase 1 (parallel):** backend impl, frontend impl, jobs/ML, docs/tests —
each in its own worktree, each coding against the frozen contract.

**Phase 2 (serial):** integrate into local `dev`, full gates, promote.

If a task cannot name the contract it codes against, it is not ready to be
parallel.

## Never concurrent

Migrations · `packages/types` barrel · §14 / constants registry ·
`pnpm-lock.yaml` · `router.tsx` and barrels · `.github/workflows/**` ·
`AGENTS.md` + its hash-stamped pointers.

Everything else — route handlers, components, package internals, feature
docs, tests — parallelizes freely.

## Worktree setup

```bash
git worktree add ../avash-<slice> -b feat/<slice>
cd ../avash-<slice> && pnpm install
```

Then bootstrap what git does not copy: the three gitignored env files, a
port offset (5173/8787/54322 collide), and
`COMPOSE_PROJECT_NAME=avash-<slice>` so containers and fixed container
names don't fight. Remove the worktree when the slice lands.

## Agent rules

- One agent, one worktree, one slice, one contract. The brief names the
  paths it owns **and the paths it must not touch**.
- Fan out across independent **slices**, never across files of one change.
- Review per diff checkpoint, one agent per concern, over the whole diff.
  Every finding needs a concrete failure scenario or it is an opinion.
- Deterministic tools first — eslint, tsc, semgrep, gitleaks. Agents get
  the things static analysis structurally cannot see (authz gaps,
  business-rule bypass).
- No agent gets a weaker gate than a human.

## Integration

Merge to local `dev` at least daily. **One integration seat at a time:**
rebase → full gate in the worktree → merge to `dev` → **re-run the full
gate on `dev`** (a merge of two green branches is not itself green) →
push → watch Actions.

Practical ceiling here is 3–4 concurrent slices; past that the
integration seat is the bottleneck.

Ownership map, the per-resource conflict protocols, and the quality
rationale: **`docs/standards/parallel-work.md`**.
