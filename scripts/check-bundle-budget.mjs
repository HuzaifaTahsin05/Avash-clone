#!/usr/bin/env node
// CI gate (docs/PROJECT_PLAN.md §14 FRONTEND_BUNDLE_BUDGET_KB): fails the
// build if the gzipped app shell (JS + CSS emitted under dist/assets)
// exceeds the budget. Icons and other static assets are not part of the
// shell and are excluded.
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { gzipSync } from 'node:zlib';
import { join } from 'node:path';

const BUDGET_KB = Number(process.env.FRONTEND_BUNDLE_BUDGET_KB ?? 180);
const distAssetsDir = join('apps', 'web', 'dist', 'assets');

function collectShellFiles(dir) {
  return readdirSync(dir)
    .filter((name) => name.endsWith('.js') || name.endsWith('.css'))
    .map((name) => join(dir, name))
    .filter((path) => statSync(path).isFile());
}

const files = collectShellFiles(distAssetsDir);
if (files.length === 0) {
  console.error(`No shell JS/CSS assets found under ${distAssetsDir} — did the build run?`);
  process.exit(1);
}

let totalGzipBytes = 0;
for (const file of files) {
  const contents = readFileSync(file);
  totalGzipBytes += gzipSync(contents).length;
}

const totalGzipKB = totalGzipBytes / 1024;
console.log(`Shell bundle (gzip): ${totalGzipKB.toFixed(2)} KB — budget ${BUDGET_KB} KB`);

if (totalGzipKB > BUDGET_KB) {
  console.error(`FAIL: shell bundle exceeds the ${BUDGET_KB} KB budget by ${(totalGzipKB - BUDGET_KB).toFixed(2)} KB.`);
  process.exit(1);
}

console.log('PASS: shell bundle within budget.');
