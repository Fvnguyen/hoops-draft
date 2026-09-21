#!/usr/bin/env node
/**
 * Proves a refactor did not change the game: runs `balance.ts 500 --seed 42` and compares
 * its report with the committed one (plan render_and_engine_perf: every task in it must be
 * behaviour-preserving, "byte-identical" rather than "PPP looks about the same").
 *
 *   node scripts/balance-baseline.mjs            compare; exit 1 and print the diff on any change
 *   node scripts/balance-baseline.mjs --write    re-record (only when a change is MEANT to move
 *                                                the numbers — that is balance work, and balance
 *                                                work belongs in its own plan, see AGENTS.md)
 *
 * The only non-deterministic part of the report is its elapsed-milliseconds figure, which is
 * normalised away. This script compares; it never judges or tunes anything.
 */
import { execFileSync } from 'child_process';
import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const baselinePath = path.join(root, 'tests', 'fixtures', 'balance-500-seed42.txt');
const ARGS = ['500', '--seed', '42'];

const tsx = path.join(root, 'node_modules', 'tsx', 'dist', 'cli.mjs');
const raw = execFileSync(process.execPath, [tsx, path.join('scripts', 'balance.ts'), ...ARGS], { cwd: root, encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 });
const report = raw.replace(/\r\n/g, '\n').replace(/\(\s*(\d+) games, \d+ms\)/g, '($1 games, <ms>)').trimEnd() + '\n';

if (process.argv.includes('--write')) {
  mkdirSync(path.dirname(baselinePath), { recursive: true });
  writeFileSync(baselinePath, report);
  console.log(`balance-baseline: wrote ${path.relative(root, baselinePath)} (${report.split('\n').length - 1} lines)`);
  process.exit(0);
}

if (!existsSync(baselinePath)) {
  console.error('balance-baseline: no baseline recorded yet. Run with --write first.');
  process.exit(1);
}
const expected = readFileSync(baselinePath, 'utf8').replace(/\r\n/g, '\n');
if (expected === report) {
  console.log('balance-baseline: IDENTICAL to the committed report (balance.ts 500 --seed 42).');
  process.exit(0);
}

const a = expected.split('\n');
const b = report.split('\n');
console.error('balance-baseline: the report CHANGED. First differing lines (expected | actual):');
let shown = 0;
for (let i = 0; i < Math.max(a.length, b.length) && shown < 20; i++) {
  if (a[i] !== b[i]) {
    console.error(`  ${String(i + 1).padStart(4)}  - ${a[i] ?? '<missing>'}`);
    console.error(`        + ${b[i] ?? '<missing>'}`);
    shown++;
  }
}
process.exit(1);
