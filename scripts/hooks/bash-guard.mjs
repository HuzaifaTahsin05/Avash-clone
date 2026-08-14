#!/usr/bin/env node
/**
 * Claude Code PreToolUse hook on Bash (docs/standards/agent-compliance.md
 * § Layer 2). Denies the promotion-path and deploy violations outright,
 * before the command runs — Layer 3 (.githooks/) and Layer 4 (CI) catch
 * the same violations, but only after something already happened.
 *
 * Exit codes are the Claude Code hook contract: 0 = allow, 2 = deny and
 * surface stderr to the agent as the reason.
 */

import { readFileSync } from "node:fs";
import { spawnSync } from "node:child_process";

let payload = {};
try {
  payload = JSON.parse(readFileSync(0, "utf8") || "{}");
} catch {
  process.exit(0); // Malformed payload is not the agent's problem — stay quiet.
}

const cmd = payload?.tool_input?.command ?? "";
if (!cmd) process.exit(0);

function deny(reason) {
  process.stderr.write(`${reason}\nSee docs/standards/git-workflow.md § Hard rule: the promotion path.\n`);
  process.exit(2);
}

function currentBranch() {
  const run = spawnSync("git", ["branch", "--show-current"], { encoding: "utf8" });
  return run.status === 0 ? run.stdout.trim() : null;
}

// --no-verify on either commit or push bypasses Layer 3 entirely.
if (/\bgit\s+(commit|push)\b.*--no-verify\b/.test(cmd)) {
  deny("Denied: --no-verify bypasses the repo's git hooks. Fix the underlying failure instead.");
}

// Force-push to dev or main destroys shared history.
if (/\bgit\s+push\b/.test(cmd) && /(--force\b|--force-with-lease\b|\s-f\b)/.test(cmd)) {
  if (/\b(dev|main)\b/.test(cmd) || !/\S+\/\S+/.test(cmd)) {
    deny('Denied: force-push targeting "dev" or "main" (or with no explicit target — could resolve to either).');
  }
}

if (/\bgit\s+push\b/.test(cmd)) {
  const branch = currentBranch();
  const toUpstream = /\bupstream\b/.test(cmd);

  if (branch && branch !== "dev" && branch !== "main" && !cmd.includes("--delete")) {
    deny(`Denied: "git push" from "${branch}" — feature branches are local-only.`);
  }
  if (toUpstream && branch !== "dev") {
    deny(`Denied: "git push …upstream…" from "${branch}" — only "dev" reaches upstream directly.`);
  }
}

if (/\bgh\s+pr\s+create\b/.test(cmd) && /--base[= ]main\b/.test(cmd)) {
  const branch = currentBranch();
  if (branch !== "dev") {
    deny(`Denied: "gh pr create --base main" from "${branch}" — a PR into "main" must come from "dev".`);
  }
}

if (/\bwrangler\s+(deploy|secret\s+put)\b/.test(cmd)) {
  deny(
    'Denied: deploys and secret writes are not a side effect of a coding task. ' +
      "Run this yourself, outside the agent session, when you actually mean to deploy."
  );
}

process.exit(0);
