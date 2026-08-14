#!/usr/bin/env node
/**
 * Parallel-work estimator (docs/standards/parallel-work.md § Cost estimate).
 *
 * Produces the estimate that AGENTS.md rule 11 requires before any fan-out:
 * context-window pressure, wall-clock, CI minutes, and token spend.
 *
 * Rates and context windows are FETCHED, never hard-coded — a rate baked into
 * a repo goes stale silently and every estimate built on it is wrong without
 * anyone noticing. If the fetch fails this exits non-zero rather than guessing.
 *
 *   node scripts/estimate-parallel-cost.mjs --plan plan.json
 *   node scripts/estimate-parallel-cost.mjs --refresh-rates   # update cache only
 *   node scripts/estimate-parallel-cost.mjs --plan plan.json --max-age 14
 *
 * plan.json:
 * {
 *   "slice": "breeding-site reporting",
 *   "turnSeconds": 45,
 *   "ci": { "branches": 4, "runsPerBranch": 3, "minutesPerRun": 25,
 *           "usdPerMinute": 0.008 },
 *   "phases": [
 *     { "name": "0 — contract", "parallel": false, "agents": 1, "turns": 40,
 *       "model": "claude-opus-5",
 *       "turn": { "cacheRead": 30000, "uncachedIn": 2000,
 *                 "cacheWrite": 2000, "output": 1500 } }
 *   ]
 * }
 *
 * Every field is an assumption you are stating out loud. Calibrate them by
 * running ONE agent on ONE task and reading its real usage — that single
 * measurement beats anything this script computes from guesses.
 */

import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";

const ROOT = resolve(import.meta.dirname, "..");
const CACHE = join(ROOT, "node_modules", ".cache", "avash", "model-rates.json");

const argv = process.argv.slice(2);
const flag = (n, d) => {
  const i = argv.indexOf(n);
  return i === -1 ? d : argv[i + 1];
};
const MAX_AGE_DAYS = Number(flag("--max-age", "30"));

/** Markdown doc carrying current model IDs, context windows and prices. */
const SOURCES = ["https://platform.claude.com/docs/en/about-claude/models/overview.md"];

/** Multipliers are contract-level API behavior, not per-model prices. */
const CACHE_READ = 0.1;
const CACHE_WRITE_5M = 1.25;

const usd = (n) => `$${n < 10 ? n.toFixed(2) : Math.round(n).toLocaleString()}`;
const die = (msg) => {
  console.error(`\n${msg}\n`);
  process.exit(1);
};

// ------------------------------------------------------------------ fetching

/**
 * The models doc lays each comparison table out with one COLUMN per model and
 * the attribute name in column 0:
 *
 *   | **Claude API ID**   | claude-opus-5 | claude-sonnet-5 | ...
 *   | **Pricing**1        | $5 / input MTok $25 / output MTok | ...
 *   | **Context window**  | <Tooltip …>1M tokens</Tooltip>    | ...
 *
 * So parsing is positional: read the ID row to learn which column is which
 * model, then read the attribute rows by the same index. Several such tables
 * appear in the page (current models, previous generations), each starting a
 * fresh ID row.
 */
function parseRates(markdown) {
  const out = {};
  const cellsOf = (line) =>
    line
      .replace(/<[^>]+>/g, "") // strip Tooltip/JSX wrappers around values
      .split("|")
      .slice(1, -1)
      .map((c) => c.trim());

  const label = (line) => /^\s*\|\s*\*\*([^*]+)\*\*/.exec(line)?.[1]?.trim();

  let columns = null; // model id per column index, for the table being read

  for (const line of markdown.split(/\r?\n/)) {
    const key = label(line);
    if (!key) continue;
    const cells = cellsOf(line);

    if (/^Claude API ID$/i.test(key)) {
      columns = cells.slice(1).map((c) => /(claude-[a-z0-9-]+)/i.exec(c)?.[1] ?? null);
      for (const id of columns) if (id) (out[id] ??= {});
      continue;
    }
    if (!columns) continue;

    if (/^Pricing/i.test(key)) {
      cells.slice(1).forEach((cell, i) => {
        const id = columns[i];
        if (!id) return;
        const money = [...cell.matchAll(/\$\s?([\d.]+)/g)].map((m) => Number(m[1]));
        if (money.length >= 2) {
          out[id].input = money[0];
          out[id].output = money[1];
        }
      });
      continue;
    }

    if (/^Context window$/i.test(key)) {
      cells.slice(1).forEach((cell, i) => {
        const id = columns[i];
        if (!id) return;
        const m = /(\d+(?:\.\d+)?)\s*([MmKk])\s*tokens/.exec(cell);
        if (m) out[id].context = Number(m[1]) * (m[2].toLowerCase() === "m" ? 1e6 : 1e3);
      });
    }
  }

  // Drop partial rows — a model with an id but no price would silently
  // produce a $0 phase, which is worse than reporting it as unknown.
  for (const [id, v] of Object.entries(out)) {
    if (typeof v.input !== "number" || typeof v.output !== "number") delete out[id];
  }
  return out;
}

async function fetchRates() {
  const merged = {};
  const failures = [];
  for (const url of SOURCES) {
    try {
      const res = await fetch(url, { headers: { accept: "text/markdown, text/plain" } });
      if (!res.ok) {
        failures.push(`${url} → HTTP ${res.status}`);
        continue;
      }
      Object.assign(merged, parseRates(await res.text()));
    } catch (err) {
      failures.push(`${url} → ${err.message}`);
    }
  }
  if (!Object.keys(merged).length) {
    die(
      `Could not fetch current model rates. Refusing to estimate from stale or\n` +
        `assumed prices — a wrong rate produces a confident wrong budget.\n\n` +
        failures.map((f) => `  - ${f}`).join("\n") +
        `\n\nCheck connectivity, or read the rates yourself from:\n  ${SOURCES[0]}`,
    );
  }
  return { fetchedAt: new Date().toISOString(), source: SOURCES, models: merged };
}

async function loadRates() {
  if (argv.includes("--refresh-rates")) {
    const fresh = await fetchRates();
    mkdirSync(dirname(CACHE), { recursive: true });
    writeFileSync(CACHE, JSON.stringify(fresh, null, 2));
    console.log(
      `Fetched rates for ${Object.keys(fresh.models).length} models at ${fresh.fetchedAt}`,
    );
    return fresh;
  }

  if (existsSync(CACHE)) {
    const cached = JSON.parse(readFileSync(CACHE, "utf8"));
    const ageDays = (Date.now() - Date.parse(cached.fetchedAt)) / 86_400_000;
    if (ageDays <= MAX_AGE_DAYS) return { ...cached, ageDays };
    console.error(`Cached rates are ${ageDays.toFixed(0)} days old — refetching.`);
  }

  const fresh = await fetchRates();
  mkdirSync(dirname(CACHE), { recursive: true });
  writeFileSync(CACHE, JSON.stringify(fresh, null, 2));
  return { ...fresh, ageDays: 0 };
}

// ----------------------------------------------------------------- estimating

function turnCost(turn, rate) {
  const perM = (t, r) => (t / 1_000_000) * r;
  return (
    perM(turn.uncachedIn ?? 0, rate.input) +
    perM(turn.cacheWrite ?? 0, rate.input) * CACHE_WRITE_5M +
    perM(turn.cacheRead ?? 0, rate.input) * CACHE_READ +
    perM(turn.output ?? 0, rate.output)
  );
}

function estimate(plan, rates) {
  const rows = [];
  let usdTotal = 0;
  let serialSeconds = 0;
  let parallelSeconds = 0;

  for (const phase of plan.phases) {
    const rate = rates.models[phase.model];
    if (!rate) {
      die(
        `No fetched rate for "${phase.model}".\n` +
          `Known: ${Object.keys(rates.models).sort().join(", ")}\n` +
          `Fix the model id in the plan, or re-run with --refresh-rates.`,
      );
    }

    const agents = phase.agents ?? 1;
    const perAgent = turnCost(phase.turn, rate) * phase.turns;
    const phaseUsd = perAgent * agents;
    usdTotal += phaseUsd;

    const secs = phase.turns * (plan.turnSeconds ?? 45);
    serialSeconds += secs * agents;
    parallelSeconds += phase.parallel === false ? secs * agents : secs;

    // Peak history vs the model's context window is the metric that decides
    // whether a plan is even runnable — a phase that will blow the window
    // fails as a plan, not as a budget line.
    const peak = (phase.turn.cacheRead ?? 0) + (phase.turn.uncachedIn ?? 0);
    const pct = rate.context ? (peak / rate.context) * 100 : undefined;

    rows.push({
      name: phase.name,
      agents,
      turns: phase.turns,
      model: phase.model,
      peak,
      pct,
      usd: phaseUsd,
    });
  }

  return { rows, usdTotal, serialSeconds, parallelSeconds };
}

// --------------------------------------------------------------------- output

const rates = await loadRates();
const planPath = flag("--plan");
if (!planPath) {
  if (argv.includes("--refresh-rates")) process.exit(0);
  die("Usage: node scripts/estimate-parallel-cost.mjs --plan <plan.json>");
}
if (!existsSync(planPath)) die(`Plan not found: ${planPath}`);

const plan = JSON.parse(readFileSync(planPath, "utf8"));
const { rows, usdTotal, serialSeconds, parallelSeconds } = estimate(plan, rates);

const hrs = (s) => `${(s / 3600).toFixed(1)}h`;
const ci = plan.ci ?? {};
const ciMinutes = (ci.branches ?? 0) * (ci.runsPerBranch ?? 0) * (ci.minutesPerRun ?? 0);
const ciUsd = ciMinutes * (ci.usdPerMinute ?? 0);

console.log(`\n## Parallelization estimate — ${plan.slice ?? "(unnamed slice)"}\n`);
console.log(
  `Rates fetched ${rates.fetchedAt}` +
    (rates.ageDays > 0 ? ` (${rates.ageDays.toFixed(1)} days old)` : " (just now)"),
);
console.log(`Source: ${SOURCES[0]}\n`);

console.log("| Phase | Agents | Turns | Model | Peak ctx | % window | Est. |");
console.log("|---|---:|---:|---|---:|---:|---:|");
for (const r of rows) {
  const ctxPct = r.pct === undefined ? "—" : `${r.pct.toFixed(0)}%${r.pct > 40 ? " ⚠" : ""}`;
  console.log(
    `| ${r.name} | ${r.agents} | ${r.turns} | ${r.model} | ` +
      `${(r.peak / 1000).toFixed(0)}k | ${ctxPct} | ${usd(r.usd)} |`,
  );
}

console.log(`\n**Token spend:** ${usd(usdTotal)}`);
if (ciMinutes) console.log(`**CI:** ${ciMinutes} runner-minutes ≈ ${usd(ciUsd)}`);
console.log(`**Total:** ${usd(usdTotal + ciUsd)}`);
console.log(
  `\n**Wall-clock:** ~${hrs(parallelSeconds)} parallel vs ~${hrs(serialSeconds)} serial ` +
    `(${(serialSeconds / parallelSeconds).toFixed(1)}× faster)`,
);

const over = rows.filter((r) => (r.pct ?? 0) > 40);
if (over.length) {
  console.log(
    `\n⚠ Context pressure: ${over.map((r) => r.name).join(", ")} exceed 40% of the ` +
      `window (CLAUDE.md hygiene limit). Expect compaction, degraded instruction\n` +
      `  following, and turn counts above the estimate. Split the phase or narrow its scope.`,
  );
}

console.log(
  `\n**Assumptions:** ${plan.turnSeconds ?? 45}s/turn; per-turn token profile as stated per phase.\n` +
    `These are guesses until calibrated. Run ONE agent on ONE task, read its actual\n` +
    `usage, and update the plan before trusting any total above.\n\n` +
    `Present this table and wait for explicit approval (AGENTS.md rule 11).\n`,
);
