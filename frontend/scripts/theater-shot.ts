/**
 * Static screenshot harness for the game theater (game_theater T5/T9 verification).
 *
 * Every app route sits behind the Supabase session gate (src/proxy.ts), so
 * `scripts/screenshot.js` needs a logged-in dev server. This script needs neither: it
 * simulates the same seeded game `/theater-preview` shows, renders `GameView` to static
 * HTML with react-dom/server at a chosen state, wraps it in the production CSS emitted by
 * `next build` (the .css chunk under `.next/static`), and screenshots it with Playwright, serving
 * `public/` (headshots, logos) from disk.
 *
 * Usage (from frontend/, after `npm run build`):
 *   npx tsx scripts/theater-shot.ts --seed 42 --poss 120 --tab playByPlay --out ../screenshots/theater-feed.png
 *   npx tsx scripts/theater-shot.ts --seed 42 --end --tab boxScore --width 1400
 *   npx tsx scripts/theater-shot.ts --seed 42 --clutch --pop          # first crunch-time possession + pop-up
 *   --phone renders at 830x385 with the game_canvas zoom (0.7) like a landscape phone.
 *
 * Effects never run in a static render, so this shows exactly one frame of state — which
 * is what a screenshot is. Output goes to ../screenshots/ (gitignored) by default.
 */
import fs from 'fs';
import path from 'path';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { chromium } from 'playwright';
import { GameView } from '../src/components/GameView';
import { buildPreviewGame, PREVIEW_CONTEXT } from '../src/lib/previewGame';

function arg(name: string, fallback?: string): string | undefined {
  const i = process.argv.indexOf(`--${name}`);
  if (i === -1) return fallback;
  const v = process.argv[i + 1];
  return v && !v.startsWith('--') ? v : 'true';
}
const flag = (name: string) => process.argv.includes(`--${name}`);

async function main() {
  const seed = Number(arg('seed', '42')) >>> 0;
  const tab = (arg('tab') ?? 'playByPlay') as 'playByPlay' | 'boxScore' | 'matchup';
  const phone = flag('phone');
  const width = Number(arg('width', phone ? '830' : '1400'));
  const height = Number(arg('height', phone ? '385' : '900'));
  const theme = arg('theme', 'court');

  const game = buildPreviewGame(seed);
  let possession: number | undefined = arg('poss') !== undefined ? Number(arg('poss')) : undefined;
  if (flag('end')) possession = game.possessions.length - 1;
  if (flag('clutch')) {
    const first = game.possessions.findIndex(e => e.isClutch);
    if (first === -1) throw new Error(`seed ${seed}: no crunch-time window in this game — try another seed`);
    possession = first;
  }
  const outDefault = `../screenshots/theater-${seed}-${flag('clutch') ? 'clutch' : possession ?? 'pregame'}-${tab}${phone ? '-phone' : ''}.png`;
  const out = path.resolve(process.cwd(), arg('out', outDefault)!);

  // Next 16 (Turbopack) emits the stylesheet under .next/static/chunks; older builds used
  // .next/static/css. Take every .css under .next/static.
  const staticDir = path.resolve(process.cwd(), '.next/static');
  const cssFiles: string[] = [];
  const walk = (dir: string) => { for (const e of fs.readdirSync(dir, { withFileTypes: true })) { const f = path.join(dir, e.name); if (e.isDirectory()) walk(f); else if (e.name.endsWith('.css')) cssFiles.push(f); } };
  if (fs.existsSync(staticDir)) walk(staticDir);
  if (cssFiles.length === 0) throw new Error('No built stylesheet under .next/static — run `npm run build` first');
  const css = cssFiles.map(f => fs.readFileSync(f, 'utf8')).join('\n');

  const markup = renderToStaticMarkup(createElement(GameView, {
    game,
    context: PREVIEW_CONTEXT,
    initialState: { possession, tab, crunchPopup: flag('pop') },
  }))
    // next/image renders /_next/image?url=<encoded>&w=..; serve the original file instead.
    .replace(/\/_next\/image\?url=([^&"]+)[^"]*/g, (_m, u) => decodeURIComponent(u));

  const html = `<!doctype html><html lang="en" data-theme="${theme}"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<link rel="preconnect" href="https://fonts.googleapis.com">
<link href="https://fonts.googleapis.com/css2?family=Bebas+Neue&family=Inter:wght@400;600;700;900&display=swap" rel="stylesheet">
<style>${css}</style>
<style>:root{--font-inter:'Inter';--font-bebas:'Bebas Neue';--font-geist-mono:ui-monospace,monospace}${phone ? ':root{--zoom:0.7}' : ''}</style>
</head><body><div class="h-dvh-z p-4 flex flex-col"><div class="flex-1 min-h-0">${markup}</div></div></body></html>`;

  const publicDir = path.resolve(process.cwd(), 'public');
  // PW_CHROMIUM lets a runner with a preinstalled browser (a path to its executable) skip
  // `playwright install`; otherwise Playwright's own download is used.
  const browser = await chromium.launch(process.env.PW_CHROMIUM ? { executablePath: process.env.PW_CHROMIUM } : {});
  const page = await browser.newPage({ viewport: { width, height }, deviceScaleFactor: 2 });
  await page.route('http://theater.local/**', async route => {
    const url = new URL(route.request().url());
    if (url.pathname === '/index.html') { await route.fulfill({ contentType: 'text/html', body: html }); return; }
    const file = path.join(publicDir, decodeURIComponent(url.pathname));
    if (fs.existsSync(file) && fs.statSync(file).isFile()) await route.fulfill({ path: file });
    else await route.fulfill({ status: 404, body: '' });
  });
  await page.goto('http://theater.local/index.html', { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(800); // fonts + images
  // Scroll the feed to the bottom like the live auto-scroll would (feed tab only).
  if (tab === 'playByPlay') await page.evaluate(() => { document.querySelectorAll('.overflow-y-auto').forEach(el => { el.scrollTop = el.scrollHeight; }); });
  await page.waitForTimeout(400);
  fs.mkdirSync(path.dirname(out), { recursive: true });
  await page.screenshot({ path: out, fullPage: flag('full') });
  await browser.close();
  console.log(`wrote ${out} (seed ${seed}, possession ${possession ?? 'pregame'}, tab ${tab}, ${game.possessions.length} possessions)`);
}

main().catch(err => { console.error(err); process.exit(1); });
