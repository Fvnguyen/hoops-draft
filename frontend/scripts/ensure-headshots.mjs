#!/usr/bin/env node
/**
 * Guarantee every card has a headshot file.
 *
 * `data/fetch_players.py` resolves a player to an NBA id by fuzzy name match and falls
 * back to an md5 hash of name+team+pos when that fails, so a rookie the bundled
 * `nba_api` list has not caught up with gets a hash id and no image. The app then asks
 * for `/headshots/<hash>.png`, gets a 404, and every route that renders that card logs a
 * console error — which is what `smoke.spec.ts` trips on.
 *
 * Fixing that per component does not work: of the ten places a headshot URL is built,
 * several are CSS `background-image`, which has no error hook. So the guarantee lives in
 * the data instead — any card without an image gets a copy of `_missing.png`, the neutral
 * silhouette, and nothing ever 404s.
 *
 * Runs as part of `npm run build:cards`. Re-run it after a pipeline refresh. A real
 * headshot that arrives later simply overwrites the placeholder.
 */

import { readFileSync, writeFileSync, existsSync, copyFileSync, statSync } from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const cardsPath = path.join(root, 'src/data/cards.json');
const dir = path.join(root, 'public/headshots');
const placeholder = path.join(dir, '_missing.png');

if (!existsSync(placeholder)) {
  console.error(`ensure-headshots: ${placeholder} is missing — cannot backfill.`);
  process.exit(1);
}

const cards = JSON.parse(readFileSync(cardsPath, 'utf8'));
const placeholderSize = statSync(placeholder).size;

const filled = [];
const alreadyPlaceholder = [];
for (const card of cards) {
  const id = card.player?.id;
  if (!id) continue;
  const file = path.join(dir, `${id}.png`);
  if (!existsSync(file)) {
    copyFileSync(placeholder, file);
    filled.push(`${card.player.name} (${id})`);
  } else if (statSync(file).size === placeholderSize) {
    alreadyPlaceholder.push(`${card.player.name} (${id})`);
  }
}

if (filled.length > 0) {
  console.log(`ensure-headshots: backfilled ${filled.length} placeholder(s):`);
  for (const n of filled) console.log(`  + ${n}`);
}
if (alreadyPlaceholder.length > 0) {
  // Not an error — the app renders fine. Surfaced so a real photo can be fetched once the
  // NBA feed catches up, rather than the silhouette quietly becoming permanent.
  console.log(`ensure-headshots: ${alreadyPlaceholder.length} card(s) still on the placeholder:`);
  for (const n of alreadyPlaceholder) console.log(`  · ${n}`);
}
if (filled.length === 0 && alreadyPlaceholder.length === 0) {
  console.log(`ensure-headshots: all ${cards.length} cards have a real headshot.`);
}
