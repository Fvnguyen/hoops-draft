#!/usr/bin/env node
/**
 * First-load JavaScript per route, from the last `npm run build`.
 *
 * Next 16's Turbopack build no longer prints a "First Load JS" column, and the
 * mobile_load plan's exit criteria are before/after numbers for it. This reads the
 * prerendered HTML of each route, collects the `/_next/static/**.js` files it loads
 * (script tags and preloads: what a phone actually downloads before the page is
 * interactive) and sums them raw and gzipped.
 *
 * Usage (from frontend/, after `npm run build`):
 *   node scripts/route-js-size.mjs [route ...]      default: /login / /draft /rosters
 *   node scripts/route-js-size.mjs --json           machine-readable
 */

import { readFileSync, existsSync, statSync } from 'fs';
import { gzipSync } from 'zlib';
import path from 'path';
import { fileURLToPath } from 'url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const args = process.argv.slice(2);
const asJson = args.includes('--json');
const routes = args.filter((a) => !a.startsWith('--'));
if (routes.length === 0) routes.push('/login', '/', '/draft', '/rosters');

const appDir = path.join(root, '.next', 'server', 'app');
if (!existsSync(appDir)) {
  console.error('No build found. Run `npm run build` first.');
  process.exit(1);
}

function htmlFor(route) {
  const name = route === '/' ? 'index' : route.replace(/^\//, '');
  const file = path.join(appDir, `${name}.html`);
  return existsSync(file) ? file : null;
}

const sizeCache = new Map();
function sizes(chunk) {
  if (!sizeCache.has(chunk)) {
    const file = path.join(root, '.next', decodeURIComponent(chunk.replace(/^\/_next\//, '')));
    if (!existsSync(file)) return null;
    sizeCache.set(chunk, { raw: statSync(file).size, gzip: gzipSync(readFileSync(file)).length });
  }
  return sizeCache.get(chunk);
}

const report = [];
for (const route of routes) {
  const file = htmlFor(route);
  if (!file) {
    report.push({ route, error: 'not prerendered (dynamic route?)' });
    continue;
  }
  const html = readFileSync(file, 'utf8');
  const chunks = [...new Set([...html.matchAll(/["'](\/_next\/static\/[^"'?]+\.js)/g)].map((m) => m[1]))];
  let raw = 0;
  let gzip = 0;
  const detail = [];
  for (const chunk of chunks) {
    const s = sizes(chunk);
    if (!s) continue;
    raw += s.raw;
    gzip += s.gzip;
    detail.push({ chunk: path.basename(chunk), ...s });
  }
  detail.sort((a, b) => b.gzip - a.gzip);
  report.push({ route, files: detail.length, raw, gzip, largest: detail.slice(0, 3) });
}

if (asJson) {
  console.log(JSON.stringify(report, null, 2));
} else {
  const kb = (n) => `${(n / 1024).toFixed(0)} KB`.padStart(8);
  console.log('route'.padEnd(12), 'files'.padStart(5), 'raw'.padStart(8), 'gzip'.padStart(8), '  largest chunks (gzip)');
  for (const r of report) {
    if (r.error) { console.log(r.route.padEnd(12), r.error); continue; }
    console.log(r.route.padEnd(12), String(r.files).padStart(5), kb(r.raw), kb(r.gzip), ' ',
      r.largest.map((c) => `${c.chunk} ${(c.gzip / 1024).toFixed(0)}K`).join(', '));
  }
}
