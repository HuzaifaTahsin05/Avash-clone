---
name: wrapup
description: Generate the commit message + PR description for the current changes
---

Use `git status`, `git diff`, and `git log` to analyze the current uncommitted
(and/or recently committed but unpushed) changes on this branch, then generate:

1. **A conventional commit message** — `type(scope): summary`, blank line,
   body explaining what/why. Match the style of this repo's existing commits
   (check `git log`). Write to `temp/COMMIT_MESSAGE.txt`, overwriting it if it
   already exists.
2. **A PR description following `.github/PULL_REQUEST_TEMPLATE.md` exactly**
   — every section filled in (Slice/Section, Summary, Docs updated §12,
   Automated test evidence, Manual test log three-pass protocol §10,
   Security vectors STRIDE table, Constants registry, Checklist). Mark N/A
   rows explicitly rather than omitting them. Write to `temp/PR_DESCRIPTION.md`,
   overwriting it if it already exists.

## Hard rule: no implementation-instruction / milestone references in the PR

PR descriptions (and commit messages) must never mention:
- Any internal task-contract file, methodology, or terminology
- Milestone or phase labels, numbered or otherwise; task IDs of the
  `<milestone>-<task>` form; exit-gate references; or the filename of any
  execution-schedule document. Deliberately not spelled out with real
  examples here — `scripts/check-internal-refs.mjs` matches those patterns
  anywhere in a shipped file, including in a file explaining the rule.

These are internal planning artifacts, not something a reviewer or the
public repo history needs. Describe the change, its rationale, and its
test evidence entirely in terms of the code and docs affected — never by
citing which milestone/task it corresponds to or which instruction file
drove it.

## Hard rule: generate only, never act

Output the commit message / PR description as text only (in addition to
writing them to `temp/`). Never run `git commit`, `git push`, or
`gh pr create` (or open the PR) without explicit per-instance confirmation
in that same turn. Approval given once does not carry over to future requests.
