#!/usr/bin/env node
/**
 * Build the app icons from the square booster-pack art (owner artwork, 2026-09-21; earlier
 * versions were a hand-drawn basketball SVG, then the portrait pack on a dark tile, which
 * left most of the icon black). The art FILLS the icon. Everything that shows an icon is
 * written here from ONE master, so the variants cannot drift apart:
 *
 *   public/icons/icon-192.<tag>.png, icon-512.<tag>.png
 *        manifest, purpose "any": the art edge to edge, rounded transparent corners
 *   public/icons/icon-maskable-512.<tag>.png
 *        manifest, purpose "maskable": the art edge to edge, square and opaque. Android
 *        crops this to a circle or squircle and only guarantees the middle 80%, so the
 *        corners (NBA logo, pack crimp) are trimmed on some launchers; the face and the
 *        title sit inside the safe zone. Insetting the art to protect the corners was
 *        tried and rejected: it reads as a picture in a frame, not as an icon
 *   public/icons/apple-touch-icon.<tag>.png
 *        180x180, edge to edge, square and opaque (iOS rounds the corners itself)
 *   src/app/favicon.ico                       16/32/48/256 px, browser tab
 *
 * PNGs, not SVG: iOS ignores an SVG apple-touch-icon, and PNG is the safe baseline for
 * Android's install prompt and splash screen. Palette-quantized, because a photographic
 * 512 px PNG is ~340 KB otherwise and an icon does not need 16 million colours.
 *
 * New artwork needs a new ICON_TAG (here AND in src/app/manifest.ts): `/icons/` is cached
 * for 30 days and launchers cache icons for longer, so a reused file name keeps showing
 * the old picture. Idempotent; not part of `npm run build:cards`.
 * Usage (from frontend/): node scripts/gen-icons.mjs
 */

import sharp from 'sharp';
import { mkdirSync, writeFileSync, statSync } from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const iconsDir = path.join(root, 'public/icons');

// Part of every output file name; keep in step with src/app/manifest.ts (see the note there).
const ICON_TAG = 'pack2';

const BACKGROUND = '#0c0a09'; // manifest.ts background_color / theme_color

// The master lives outside public/ with the other art masters (it is 2.6 MB).
const MASTER = path.resolve(root, '..', 'data', 'art_src', 'pack_icon_square.png');

/** The master has a thin black margin around the pack; cut it off and square the result. */
async function squareArt(size) {
  const trimmed = await sharp(MASTER).trim({ background: '#000000', threshold: 40 }).toBuffer();
  return sharp(trimmed).resize(size, size, { fit: 'cover' }).png().toBuffer();
}

/** One square icon. `rounded`: transparent rounded corners (radius 18.75%, the usual tile). */
async function composeIcon(size, { rounded = false } = {}) {
  const art = await squareArt(size);
  if (!rounded) return sharp(art).png();
  const radius = Math.round(size * 0.1875);
  const mask = Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}"><rect width="${size}" height="${size}" rx="${radius}"/></svg>`);
  return sharp(art).composite([{ input: mask, blend: 'dest-in' }]).png();
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
console.log('gen-icons: building icons from data/art_src/pack_icon_square.png');
await render(`icon-192.${ICON_TAG}.png`, 192, { rounded: true });
await render(`icon-512.${ICON_TAG}.png`, 512, { rounded: true });
await render(`icon-maskable-512.${ICON_TAG}.png`, 512, { flatten: true });
// iOS rounds the corners itself and shows transparency as black: square and opaque.
await render(`apple-touch-icon.${ICON_TAG}.png`, 180, { flatten: true });

// The browser-tab icon. `src/app/favicon.ico` was still the stock create-next-app file, so
// the tab — and any "add to home screen" path that falls back to the favicon instead of
// the manifest — showed the Next.js logo. An .ico is just a directory of images, and every
// current browser accepts PNG-encoded entries, so no extra dependency is needed.
async function renderFavicon(outPath, sizes) {
  const images = [];
  for (const size of sizes) images.push(await (await composeIcon(size, { rounded: true })).png({ palette: true, quality: 92, effort: 10 }).toBuffer());

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
