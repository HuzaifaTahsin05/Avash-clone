#!/usr/bin/env node
/**
 * Claude Code SessionStart hook (docs/standards/agent-compliance.md §
 * Layer 2) — injects the promotion path and the current branch into
 * context unprompted, every session. Nobody has to remember to mention
 * the git workflow; it is already there before the first prompt is read.
 *
 * It also carries the standing fan-out authorization. AGENTS.md rule 11
 * blocks parallel work behind per-slice approval; the user granted that
 * approval once, standing, for implementation work (2026-08-14). Stating
 * it here rather than leaving it to recall is what makes it actually
 * change execution behaviour — and it keeps the estimate requirement,
 * which is the half of rule 11 that was never the bottleneck.
 *
 * stdout is injected as additional context per the Claude Code hook
 * contract; this hook never blocks, so it always exits 0.
 */

import { spawnSync } from "node:child_process";

function git(args) {
  const run = spawnSync("git", args, { encoding: "utf8" });
  return run.status === 0 ? run.stdout.trim() : null;
}

const branch = git(["branch", "--show-current"]) ?? "(detached HEAD)";

console.log(`Current git branch: ${branch}`);
console.log("");
console.log(
  "Promotion path (docs/standards/git-workflow.md): local feature branch -> " +
    "local dev -> local gates green -> push dev to origin -> Actions green -> " +
    "PR origin/dev -> upstream/dev. Feature branches never reach a remote; " +
    "never PR into main from anything but dev."
);
console.log(
  "Testing (docs/standards/testing.md): Vitest + Playwright + the manual " +
    "three-pass protocol are all mandatory for a write path or LLM-touching " +
    "change — none substitutes for another."
);
console.log(
  "Secrets (R2): no non-VITE_PUBLIC_ env var may ever be referenced under apps/web/src."
);
console.log("");
console.log(
  "Parallel work — STANDING FAN-OUT AUTHORIZATION (granted 2026-08-14): the " +
    "user has pre-approved multi-agent fan-out for implementation work on a " +
    "vertical slice. Do not stop and ask for per-slice approval. AGENTS.md " +
    "rule 11 still requires the estimate, so run `node " +
    "scripts/estimate-parallel-cost.mjs --plan <plan>.json`, paste the table, " +
    "and proceed in the same turn."
);
console.log(
  "Shape (docs/standards/parallel-work.md): Phase 0 SERIAL, one owner — " +
    "packages/types + zod, the migration, contract-shaped route stubs, new " +
    "constants in PROJECT_PLAN §14 + docs/constants-registry.md; freeze the " +
    "contract first. Phase 1 PARALLEL — one agent per slice-of-the-slice (api " +
    "| web | jobs/ML | docs+tests), each in its own worktree via " +
    "scripts/worktree.sh, capped at 3-4, each brief naming the paths it owns " +
    "AND the paths it must not touch. Phase 2 SERIAL — one integration seat: " +
    "rebase, full gate in the worktree, merge to local dev, re-run the full " +
    "gate on dev, push, watch Actions."
);
console.log(
  "Never concurrent: migrations, the packages/types barrel, §14 / the " +
    "constants registry, pnpm-lock.yaml, router.tsx and barrels, " +
    ".github/workflows/**, AGENTS.md and its hash-stamped pointers. Work that " +
    "cannot name the contract it codes against stays serial, and nothing fans " +
    "out onto a red dev — a worktree branched from a broken base inherits it."
);
console.log(
  "Review fans out separately and is the point of this: one agent per concern " +
    "over the whole diff, each cold, each finding carrying a concrete failure " +
    "scenario — that is what independent review buys over self-review."
);

process.exit(0);
