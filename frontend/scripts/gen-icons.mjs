#!/usr/bin/env node
/**
 * Compose the app icons from the booster-pack art (owner decision, 2026-09-21; the first
 * icon was a hand-drawn basketball SVG). Everything that shows an icon is written here
 * from ONE master, so they cannot drift apart:
 *
 *   public/icons/icon-192.png, icon-512.png   manifest, purpose "any": rounded dark tile
 *   public/icons/icon-maskable-512.png        manifest, purpose "maskable": full-bleed, the
 *                                             pack kept inside Android's safe zone
 *   public/icons/apple-touch-icon.png         180x180, full-bleed and flattened (iOS shows
 *                                             transparency as black and rounds corners itself)
 *   src/app/favicon.ico                       16/32/48/256 px, browser tab
 *
 * PNGs, not SVG: iOS ignores an SVG apple-touch-icon, and PNG is the safe baseline for
 * Android's install prompt and splash screen. Palette-quantized, because a photographic
 * 512 px PNG is 340 KB otherwise and an icon does not need 16 million colours.
 *
 * Idempotent; re-run after changing the master. Not part of `npm run build:cards`.
 * Usage (from frontend/): node scripts/gen-icons.mjs
 */

import sharp from 'sharp';
import { mkdirSync, writeFileSync, statSync } from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const iconsDir = path.join(root, 'public/icons');

// Part of every output file name; keep in step with src/app/manifest.ts (see the note there).
const ICON_TAG = 'pack1';

const BACKGROUND = '#0c0a09'; // manifest.ts background_color / theme_color

// App icon artwork (owner, 2026-09-21): the 2025-26 booster pack, tilted on the app's dark
// surface. The master lives outside public/ with the other art masters.
const PACK_MASTER = path.resolve(root, '..', 'data', 'art_src', 'pack_2025_2026.png');
const TILT_DEGREES = -8;

/**
 * One square icon. `packHeight` is the pack's height as a fraction of the canvas:
 *  - 'any' icons get a rounded dark tile and a large pack (0.86);
 *  - the maskable icon is full-bleed and keeps the pack inside Android's safe zone, a
 *    circle of radius 40% — a 2:3 pack tilted a few degrees fits at 0.66.
 */
async function composeIcon(size, { packHeight, rounded }) {
  const radius = rounded ? Math.round(size * 0.1875) : 0; // 96/512, same as the old tile
  const background = Buffer.from(
    `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}">
       <defs><radialGradient id="g" cx="50%" cy="42%" r="70%">
         <stop offset="0%" stop-color="#292524"/><stop offset="100%" stop-color="${BACKGROUND}"/>
       </radialGradient></defs>
       <rect width="${size}" height="${size}" rx="${radius}" fill="url(#g)"/>
     </svg>`);
  const pack = await sharp(PACK_MASTER)
    .trim()
    .resize({ height: Math.round(size * packHeight) })
    .rotate(TILT_DEGREES, { background: { r: 0, g: 0, b: 0, alpha: 0 } })
    .png()
    .toBuffer();
  return sharp(background).composite([{ input: pack, gravity: 'centre' }]).png();
}

async function render(outFile, size, options) {
  const outPath = path.join(iconsDir, outFile);
  let pipeline = await composeIcon(size, options);
  if (options.flatten) pipeline = sharp(await pipeline.toBuffer()).flatten({ background: BACKGROUND });
  await pipeline.png({ palette: true, quality: 92, effort: 10 }).toFile(outPath);
  const { size: bytes } = statSync(outPath);
  console.log(`  ${outFile}  ${size}x${size}  ${(bytes / 1024).toFixed(1)} KB`);
}

mkdirSync(iconsDir, { recursive: true });
console.log('gen-icons: composing icons from data/art_src/pack_2025_2026.png');
await render(`icon-192.${ICON_TAG}.png`, 192, { packHeight: 0.86, rounded: true });
await render(`icon-512.${ICON_TAG}.png`, 512, { packHeight: 0.86, rounded: true });
await render(`icon-maskable-512.${ICON_TAG}.png`, 512, { packHeight: 0.66, rounded: false });
// iOS shows transparency as black and rounds the corners itself: full-bleed, flattened.
await render(`apple-touch-icon.${ICON_TAG}.png`, 180, { packHeight: 0.86, rounded: false, flatten: true });

// The browser-tab icon. `src/app/favicon.ico` was still the stock create-next-app file, so
// the tab — and any "add to home screen" path that falls back to the favicon instead of
// the manifest — showed the Next.js logo. An .ico is just a directory of images, and every
// current browser accepts PNG-encoded entries, so no extra dependency is needed.
async function renderFavicon(outPath, sizes) {
  const images = [];
  for (const size of sizes) images.push(await (await composeIcon(size, { packHeight: 0.9, rounded: true })).png({ palette: true, quality: 92, effort: 10 }).toBuffer());

  const header = Buffer.alloc(6);
  header.writeUInt16LE(0, 0); // reserved
  header.writeUInt16LE(1, 2); // type: icon
  header.writeUInt16LE(images.length, 4);
  const entries = [];
  let offset = 6 + 16 * images.length;
  images.forEach((image, i) => {
    const entry = Buffer.alloc(16);
    entry.writeUInt8(sizes[i] >= 256 ? 0 : sizes[i], 0); // width  (0 means 256)
    entry.writeUInt8(sizes[i] >= 256 ? 0 : sizes[i], 1); // height
    entry.writeUInt16LE(1, 4);  // colour planes
    entry.writeUInt16LE(32, 6); // bits per pixel
    entry.writeUInt32LE(image.length, 8);
    entry.writeUInt32LE(offset, 12);
    offset += image.length;
    entries.push(entry);
  });
  writeFileSync(outPath, Buffer.concat([header, ...entries, ...images]));
  console.log(`  ${path.relative(root, outPath)}  ${sizes.join('/')} px  ${(statSync(outPath).size / 1024).toFixed(1)} KB`);
}
await renderFavicon(path.join(root, 'src/app/favicon.ico'), [16, 32, 48, 256]);
console.log('gen-icons: done.');
