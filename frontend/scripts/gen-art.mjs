#!/usr/bin/env node
/**
 * Re-encode the large static-art masters (hero background, booster-pack art, card back)
 * into pre-shrunk WebP under `public/art/` (plan mobile_load D4/D5).
 *
 * These four files were shipped at their original camera/export resolution — a 2.7 MB
 * 2752x1536 JPEG behind the home page's CSS background, two ~1 MB transparent PNGs for a
 * pack rendered at most ~300 CSS px wide, and a 3.2 MB 2048x2048 card-back JPEG that is
 * drawn up to 8 times at once during a pack reveal. None of them need anywhere near that
 * resolution or a lossless-ish format on a phone over mobile data. This script writes the
 * WebP equivalents once; `next.config.ts`'s `headers()` then serves `public/art/*` with a
 * one-year immutable Cache-Control (`src/lib/headshotThumb.ts`'s `IMMUTABLE_ASSET_PREFIXES`
 * includes `/art/`), which is safe because — like the headshot thumbnails — new art always
 * gets a new file name instead of overwriting one in place.
 *
 * Masters are declared in the `MASTERS` map below (not scattered through the function
 * bodies) so a later pass can repoint every entry's `src` at a folder outside `public/`
 * (the same move `data/headshots_src/` is doing for headshot source PNGs) without touching
 * the resize/encode logic.
 *
 * Idempotent: re-run any time a master or a quality/width setting changes. A destination
 * newer than its source is skipped; pass `--force` to regenerate everything regardless
 * (used while tuning quality — banding and blur are judgment calls a byte count can't make,
 * so re-run and look at the file with an image viewer or the `Read` tool after any change).
 *
 * Usage (from frontend/): node scripts/gen-art.mjs [--force]
 */

import sharp from 'sharp';
import { existsSync, mkdirSync, statSync } from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const outDir = path.join(root, 'public/art');
// Masters live OUTSIDE public/: every Vercel deployment stores public/, and these are
// 2.6-3.2 MB each. Unused variants (arena_vertical, pack variant_1) are kept there too.
const mastersDir = path.resolve(root, '..', 'data', 'art_src');
const FORCE = process.argv.includes('--force');

/**
 * One entry per output file. `width` is the target CSS-pixel-equivalent WIDTH (height
 * follows the source aspect ratio, no crop — every consumer already crops in CSS).
 * `quality` is a WebP quality picked by looking at the actual output, not guessed:
 *
 *   arena-1600.webp        home page full-screen background, no alpha. 80: no visible
 *                           banding in the image's dark gradient areas at 76 already, and
 *                           80 (139 KB, still well under the 250 KB budget) buys extra
 *                           margin against banding on lower-end phone panels for ~24 KB.
 *   pack-2025-26(.-820).webp booster-pack art, has alpha (kept). Rendered at most ~300 CSS
 *                           px wide at up to 3x DPR (900 px ceiling); 760 px is the plan's
 *                           ~640 px target rounded up to match the source's exact aspect
 *                           ratio without a fractional scale.
 *   cardback.webp           shown face-down on up to 8 cards at once during a pack reveal,
 *                           so small matters more than peak fidelity here.
 */
const MASTERS = {
  'arena-1600.webp': { src: path.join(mastersDir, 'arena_16_9.jpg'), width: 1600, quality: 80 },
  'pack-2025-26.webp': { src: path.join(mastersDir, 'pack_2025_2026.png'), width: 760, quality: 82 },
  'pack-2025-26-820.webp': { src: path.join(mastersDir, 'pack_2025_2026_variant_820.png'), width: 760, quality: 82 },
  'cardback.webp': { src: path.join(mastersDir, 'cardback.jpg'), width: 640, quality: 82 },
};

async function genOne(name, { src, width, quality }) {
  if (!existsSync(src)) {
    throw new Error(`master not found: ${src}`);
  }
  const dest = path.join(outDir, name);
  if (!FORCE && existsSync(dest)) {
    const srcStat = statSync(src);
    const destStat = statSync(dest);
    if (destStat.mtimeMs >= srcStat.mtimeMs) {
      const meta = await sharp(dest).metadata();
      console.log(`  ${name}  (skipped, up to date)  ${meta.width}x${meta.height}  ${(destStat.size / 1024).toFixed(1)} KB`);
      return;
    }
  }

  const image = sharp(src);
  const meta = await image.metadata();
  const pipeline = image.resize({ width }).webp({ quality, effort: 6, alphaQuality: meta.hasAlpha ? 100 : undefined });
  await pipeline.toFile(dest);

  const outMeta = await sharp(dest).metadata();
  const bytes = statSync(dest).size;
  console.log(
    `  ${name}  ${outMeta.width}x${outMeta.height}  alpha=${outMeta.hasAlpha ?? false}  quality=${quality}  ${(bytes / 1024).toFixed(1)} KB`,
  );
}

async function main() {
  mkdirSync(outDir, { recursive: true });
  console.log('gen-art: writing public/art/*.webp');

  let anyFailed = false;
  for (const [name, spec] of Object.entries(MASTERS)) {
    try {
      await genOne(name, spec);
    } catch (err) {
      anyFailed = true;
      console.error(`gen-art: failed ${name} — ${err.message}`);
    }
  }

  if (anyFailed) {
    console.error('gen-art: one or more outputs failed to generate.');
    process.exit(1);
  }
  console.log('gen-art: done.');
}

main().catch((err) => {
  console.error(`gen-art: fatal — ${err.message}`);
  process.exit(1);
});
