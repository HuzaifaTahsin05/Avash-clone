#!/usr/bin/env node
/**
 * Claude Code PostToolUse hook — fires after every Edit/Write.
 *
 * If the edited path is an agentic file (canon, a pointer config, a skill, a
 * command, or a standards doc the routing table points at), re-run the sync
 * gate and hand any drift straight back to the agent. Editing AGENTS.md
 * invalidates all four pointer stamps, and the agent that made the edit is the
 * one that should repair them — not a reviewer three days later.
 *
 * Anything else exits 0 immediately: this must cost nothing on ordinary edits.
 *
 * Exit codes are the Claude Code hook contract: 0 = allow silently,
 * 2 = surface stderr to the agent as feedback.
 */

import { spawnSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const ROOT = resolve(import.meta.dirname, "..", "..");

/** Paths whose edit can desynchronize the agent-config set. */
const WATCHED = [
  /^AGENTS\.md$/,
  /^CLAUDE\.md$/,
  /^\.claude\//,
  /^\.cursor\//,
  /^\.codex\//,
  /^\.agents\//,
  /^\.github\/copilot-instructions\.md$/,
  /^docs\/standards\/.+\.md$/,
];

let payload = {};
try {
  payload = JSON.parse(readFileSync(0, "utf8") || "{}");
} catch {
  process.exit(0); // Malformed payload is not the agent's problem — stay quiet.
}

const raw = payload?.tool_input?.file_path ?? payload?.tool_input?.notebook_path ?? "";
if (!raw) process.exit(0);

/**
 * Reduce an incoming path to repo-relative POSIX form. It can arrive in three
 * shapes on this project: a native Windows path from Claude Code, a Git Bash
 * POSIX path (`/d/…`) with no drive letter to match against ROOT, or already
 * relative. Slicing ROOT's length off blindly silently mismatches the middle
 * case — the hook then no-ops on exactly the files it exists to watch, which
 * is the worst failure mode a guard can have. Anchor on the repo folder name.
 */
const slash = (p) => p.replaceAll("\\", "/");
const rootPosix = slash(ROOT);
const repoDir = rootPosix.slice(rootPosix.lastIndexOf("/") + 1);
const incoming = slash(raw);

let rel;
if (incoming.toLowerCase().startsWith(rootPosix.toLowerCase())) {
  rel = incoming.slice(rootPosix.length);
} else {
  const anchor = incoming.toLowerCase().lastIndexOf(`/${repoDir.toLowerCase()}/`);
  rel = anchor === -1 ? incoming : incoming.slice(anchor + repoDir.length + 2);
}
rel = rel.replace(/^\/+/, "");

if (!WATCHED.some((re) => re.test(rel))) process.exit(0);

const run = spawnSync(process.execPath, [resolve(ROOT, "scripts/agent-sync.mjs")], {
  cwd: ROOT,
  encoding: "utf8",
});

if (run.status === 0) process.exit(0);

process.stderr.write(
  `Agent-config sync broke after editing ${rel}:\n\n` +
    `${run.stderr || run.stdout}\n` +
    `Repair it now, in this same change — do not leave it for review. ` +
    `Mechanical drift (stale hash stamps, an unlisted skill) is fixed by:\n` +
    `    node scripts/agent-sync.mjs --fix\n` +
    `Anything else — a routing row pointing at nothing, a skill description ` +
    `that is not a trigger, the eager tier over budget — needs a real edit. ` +
    `See docs/standards/agent-compliance.md.\n`,
);
process.exit(2);
