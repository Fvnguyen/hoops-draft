#!/usr/bin/env node
/**
 * Guarantee every card has a headshot file, and pre-generate the two thumbnail sets
 * `src/lib/headshotThumb.ts` serves (plan mobile_load D3/D4).
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
 * silhouette, and nothing ever 404s. This part is unchanged from before mobile_load.
 *
 * NEW (mobile_load D3/D4): components used to request the full `<id>.png` — a 1040x760
 * source of up to 280 KB that decodes to ~3 MB of bitmap even for a 26 px avatar, and an
 * assign popover listing a 12-man roster pulled ~3.8 MB of images to paint a strip of
 * discs. Every consumer now goes through `headshotThumb(playerId, size)`, which points at
 * a pre-shrunk WebP instead:
 *
 *   96   avatars — play-role rows, assign popovers, roster rows, drag ghosts (20-48 CSS
 *        px; a phone at 0.7 zoom / 3x DPR needs ~55 device px for a 26 CSS px avatar)
 *   480  card fronts and previews (a later task points `<Image>` at these, `unoptimized`,
 *        so they bypass Vercel's image-optimization quota instead of being re-transformed
 *        from the source PNG on every request)
 *
 * Both sets resize to WIDTH = size and let height follow the source's 1040x760 aspect
 * ratio (no crop) — every consumer already crops with `object-cover object-top` /
 * `background-size: cover; background-position: top`, so the crop happens in CSS, not in
 * the generated file. mobile_load T4: the source PNGs (87 MB — every Vercel deployment
 * stores the whole `public/`) moved OUT of the deployed folder to `data/headshots_src/`,
 * a sibling of `frontend/`; nothing under `src/` points at the raw `.png` any more, only
 * this script and `data/download_images.py` (which writes new ones there).
 *
 * Runs as part of `npm run build:cards`. Re-run it after a pipeline refresh — thumbnail
 * generation is incremental (skipped when the WebP is newer than its source PNG) so a
 * routine re-run costs nothing; pass `--force` to regenerate every thumbnail regardless.
 * Safe to run twice concurrently: each thumbnail is written to a pid-scoped temp file and
 * renamed into place, so two build:cards runs racing on the same file never see a partial
 * write.
 */

import { readFileSync, existsSync, copyFileSync, statSync, mkdirSync, renameSync } from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import sharp from 'sharp';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const cardsPath = path.join(root, 'src/data/cards.json');
// mobile_load T4: the 1040x760 source PNGs live outside the deployed `public/` folder,
// in a sibling of `frontend/` — resolved relative to THIS script, not the cwd, so
// `npm run build:cards` works the same from the repo root or from `frontend/`.
const srcDir = path.join(root, '../data/headshots_src');
const dir = path.join(root, 'public/headshots');
const placeholder = path.join(srcDir, '_missing.png');
const FORCE = process.argv.includes('--force');

// Keep this in step with `HEADSHOT_SIZES`/quality in `src/lib/headshotThumb.ts`.
const THUMB_QUALITY = { 96: 82, 480: 80 };
const THUMB_SIZES = /** @type {const} */ ([96, 480]);

if (!existsSync(placeholder)) {
  console.error(`ensure-headshots: ${placeholder} is missing — cannot backfill.`);
  process.exit(1);
}

const cards = JSON.parse(readFileSync(cardsPath, 'utf8'));
const placeholderSize = statSync(placeholder).size;

// --- Step 1: guarantee every card has a full-size source PNG in `data/headshots_src/`
// (existing behaviour, just a different directory since mobile_load T4). ---
const filled = [];
const alreadyPlaceholder = [];
for (const card of cards) {
  const id = card.player?.id;
  if (!id) continue;
  const file = path.join(srcDir, `${id}.png`);
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

// --- Step 2: pre-generate the 96/480 WebP thumbnails. ---

/**
 * Resize `sourcePng` to WIDTH = size (height follows, no crop) and write it as WebP at
 * `destWebp`, skipping the work when the destination already exists and is not older
 * than its source. Writes to a pid-scoped temp path and renames into place so a
 * concurrent run of this script never observes a half-written file.
 */
async function ensureThumb(sourcePng, destWebp, size, quality) {
  if (!FORCE && existsSync(destWebp)) {
    const srcStat = statSync(sourcePng);
    const destStat = statSync(destWebp);
    if (destStat.mtimeMs >= srcStat.mtimeMs) {
      return { status: 'skipped', bytes: destStat.size };
    }
  }
  const tmp = `${destWebp}.${process.pid}.tmp`;
  await sharp(sourcePng)
    .resize({ width: size })
    .webp({ quality, effort: 6 })
    .toFile(tmp);
  renameSync(tmp, destWebp);
  return { status: 'generated', bytes: statSync(destWebp).size };
}

async function generateThumbnails() {
  // Dedupe by player id: several cards (rookie/veteran variants, drafted copies) can
  // share one player, and there is only one headshot per player.
  const byPlayerId = new Map();
  for (const card of cards) {
    const id = card.player?.id;
    if (id && !byPlayerId.has(id)) byPlayerId.set(id, card);
  }

  let anyFailed = false;
  for (const size of THUMB_SIZES) {
    const sizeDir = path.join(dir, String(size));
    mkdirSync(sizeDir, { recursive: true });
    const quality = THUMB_QUALITY[size];
    let generated = 0;
    let skipped = 0;
    let failed = 0;
    let bytes = 0;

    try {
      const r = await ensureThumb(placeholder, path.join(sizeDir, '_missing.webp'), size, quality);
      if (r.status === 'generated') generated++; else skipped++;
      bytes += r.bytes;
    } catch (err) {
      failed++;
      console.error(`ensure-headshots: failed _missing.webp @${size}px — ${err.message}`);
    }

    for (const [id, card] of byPlayerId) {
      const sourcePng = path.join(srcDir, `${id}.png`);
      const destWebp = path.join(sizeDir, `${id}.webp`);
      try {
        const r = await ensureThumb(sourcePng, destWebp, size, quality);
        if (r.status === 'generated') generated++; else skipped++;
        bytes += r.bytes;
      } catch (err) {
        failed++;
        console.error(`ensure-headshots: failed thumb for ${card.player.name} (${id}) @${size}px — ${err.message}`);
      }
    }

    if (failed > 0) anyFailed = true;
    console.log(`ensure-headshots: ${size}px — ${generated} generated, ${skipped} skipped, ${failed} failed, ${(bytes / 1024).toFixed(1)} KB total`);
  }

  if (anyFailed) {
    console.error('ensure-headshots: one or more thumbnails failed to generate.');
    process.exit(1);
  }
}

generateThumbnails().catch((err) => {
  console.error(`ensure-headshots: fatal — ${err.message}`);
  process.exit(1);
});
