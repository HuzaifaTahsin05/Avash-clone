#!/usr/bin/env node
// CI gate (docs/PROJECT_PLAN.md §14 FRONTEND_BUNDLE_BUDGET_KB): fails the
// build if the gzipped app shell exceeds the budget. "Shell" means what a
// browser actually downloads on first load — the entry chunk and whatever
// it statically imports (apps/web/vite.config.ts's `build.manifest: true`
// records this) — never a route's lazily-loaded chunk
// (React.lazy()/dynamic import()), which a browser only fetches once a
// user navigates there. Icons and other static assets are excluded too.
import { readFileSync } from 'node:fs';
import { gzipSync } from 'node:zlib';
import { join } from 'node:path';

const BUDGET_KB = Number(process.env.FRONTEND_BUNDLE_BUDGET_KB ?? 180);
const distDir = join('apps', 'web', 'dist');
const manifestPath = join(distDir, '.vite', 'manifest.json');

let manifest;
try {
  manifest = JSON.parse(readFileSync(manifestPath, 'utf-8'));
} catch {
  console.error(`Could not read ${manifestPath} — did the build run with build.manifest: true?`);
  process.exit(1);
}

const entryKey = Object.keys(manifest).find((key) => manifest[key]?.isEntry);
if (!entryKey) {
  console.error(`No isEntry chunk found in ${manifestPath}.`);
  process.exit(1);
}

// Walk only static `imports` (never `dynamicImports`) so a lazy route's
// own chunk, and anything only it imports, never counts toward the shell.
const shellFiles = new Set();
const visited = new Set();
function visit(key) {
  if (visited.has(key)) return;
  visited.add(key);
  const entry = manifest[key];
  if (!entry) return;
  if (entry.file) shellFiles.add(entry.file);
  for (const cssFile of entry.css ?? []) shellFiles.add(cssFile);
  for (const importedKey of entry.imports ?? []) visit(importedKey);
}
visit(entryKey);

if (shellFiles.size === 0) {
  console.error('No shell files resolved from the manifest — did the build run?');
  process.exit(1);
}

let totalGzipBytes = 0;
for (const file of shellFiles) {
  const contents = readFileSync(join(distDir, file));
  totalGzipBytes += gzipSync(contents).length;
}

const totalGzipKB = totalGzipBytes / 1024;
console.log(`Shell bundle (gzip): ${totalGzipKB.toFixed(2)} KB — budget ${BUDGET_KB} KB`);

if (totalGzipKB > BUDGET_KB) {
  console.error(`FAIL: shell bundle exceeds the ${BUDGET_KB} KB budget by ${(totalGzipKB - BUDGET_KB).toFixed(2)} KB.`);
  process.exit(1);
}

console.log('PASS: shell bundle within budget.');
