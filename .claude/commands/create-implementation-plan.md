---
name: create-implementation-plan
description: Use when the user wants a detailed, technical, fan-out-ready implementation plan written for a set of features from docs/PROJECT_PLAN.md — e.g. "write an implementation plan for X", "plan out how to build Y using parallel work". Invoke to turn a feature list into a phased execution document under temp/, shaped for the parallel-work skill (serial contract → parallel workers → serial integration). If the user hasn't named the features, ask before doing anything else.
---

# Create an implementation plan

Turns a set of features (drawn from `docs/PROJECT_PLAN.md`) into a
single, self-contained execution document under `temp/`, shaped so it can
be fanned out via `parallel-work` (serial contract → parallel workers →
serial integration).

**If the request doesn't name the features**, stop and ask which ones
before reading anything else — don't guess from "whatever's next" in the
plan.

**Full format:** `docs/standards/implementation-plans.md`. It's the single
copy of the document structure (title/scope, §0 how-to-use with the
execution contract / completion-report format / rules table / verified
baseline / scoping decisions / cost estimate / ownership map, Phase 0
contract freeze, Phase 1 parallel workers, Phase 2 integration, and the
appendices), the output path convention (`temp/<slice-name>.md`), and the
writing standards (checkable Acceptance lines, registry-first constants,
verified — not invented — file paths). Read it before writing the plan;
this file only carries the trigger.

Before drafting: read the target slice(s) of `docs/PROJECT_PLAN.md`, the
`AGENTS.md` non-negotiables and routing rows the feature touches, and
verify actual repo state for anything the plan assumes (stub vs. real
file). Then invoke `parallel-work` for the cost-estimate requirement the
plan's §0.6 needs — never hand-quote a rate.
