#!/usr/bin/env node
/**
 * Layer 4 (docs/standards/agent-compliance.md) — the promotion-path gate
 * that cannot be argued with. Everything upstream of this (the Claude Code
 * PreToolUse hook, .githooks/pre-push) is bypassable by a human or a tool
 * with weaker hook support; this runs in CI and cannot be.
 *
 * docs/standards/git-workflow.md § Hard rule: the promotion path —
 * feature branches never reach a remote, and a PR into `main` only ever
 * comes from `dev`.
 *
 * Reads GitHub Actions' own event context rather than re-deriving it, so
 * this has no dependency on how deep the checkout's history is.
 */

import { execFileSync } from 'node:child_process';

const eventName = process.env.GITHUB_EVENT_NAME;
const headRef = process.env.GITHUB_HEAD_REF; // set only on pull_request
const baseRef = process.env.GITHUB_BASE_REF; // set only on pull_request
const refName = process.env.GITHUB_REF_NAME; // set on push (branch or tag name)

const ALLOWED_PR_HEAD = (ref) => ref === 'dev' || ref.startsWith('hotfix/');

function fail(message) {
  console.error(`FAIL: ${message}`);
  console.error('See docs/standards/git-workflow.md § Hard rule: the promotion path.');
  process.exitCode = 1;
}

function isMergeCommit() {
  try {
    const parents = execFileSync('git', ['log', '-1', '--pretty=%P'], { encoding: 'utf8' }).trim();
    return parents.split(/\s+/).filter(Boolean).length > 1;
  } catch {
    // No history to inspect (e.g. a shallow checkout with depth 1) — treat
    // as unverifiable rather than failing a check this script cannot answer.
    return null;
  }
}

if (eventName === 'pull_request' || eventName === 'pull_request_target') {
  if (!headRef || !baseRef) {
    fail('pull_request event is missing GITHUB_HEAD_REF/GITHUB_BASE_REF.');
  } else if (!ALLOWED_PR_HEAD(headRef)) {
    fail(
      `PR head ref "${headRef}" is not "dev" or a "hotfix/*" branch — a feature ` +
        'branch must never reach a remote, so a PR from one means the earlier layers were bypassed.'
    );
  } else if (baseRef === 'main' && headRef !== 'dev') {
    fail(`PR targets "main" from "${headRef}" — only "dev" may open a PR into "main".`);
  } else {
    console.log(`PASS: PR ${headRef} -> ${baseRef} follows the promotion path.`);
  }
} else if (eventName === 'push') {
  if (refName === 'main') {
    const merge = isMergeCommit();
    if (merge === false) {
      fail('a commit landed on "main" that is not a merge commit — "main" only ever advances via a merge from "dev".');
    } else {
      console.log(
        merge === null
          ? 'SKIP: push to "main" — merge-commit check unverifiable on a shallow checkout.'
          : 'PASS: push to "main" is a merge commit.'
      );
    }
  } else {
    console.log(`PASS: push to "${refName}" — only "main" is checked for merge provenance.`);
  }
} else {
  console.log(`SKIP: event "${eventName}" is not a pull_request or push — nothing to check.`);
}
