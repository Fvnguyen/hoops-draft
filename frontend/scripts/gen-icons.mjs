#!/usr/bin/env node
/**
 * Rasterize the two hand-drawn SVG app icons (public/icons/icon.svg,
 * icon-maskable.svg) into the PNGs the PWA install path actually needs.
 *
 * `src/app/manifest.ts` used to list SVG-only icons. Chrome/Android's install
 * prompt and splash screen accept an SVG icon, but iOS Safari's "Add to Home
 * Screen" ignores an SVG `apple-touch-icon` entirely (`layout.tsx`'s
 * `metadata.icons.apple`) — PNGs are the safe baseline everywhere. This script
 * is the one-time (re-run-able) source of those PNGs; the manifest and layout
 * just point at the files it writes.
 *
 * Output (public/icons/):
 *   icon-192.png            192x192, from icon.svg
 *   icon-512.png             512x512, from icon.svg
 *   icon-maskable-512.png    512x512, from icon-maskable.svg (already draws its
 *                            art inside the ~80% maskable safe zone)
 *   apple-touch-icon.png     180x180, from icon.svg, flattened onto the
 *                            manifest's background_color (#0c0a09) — iOS
 *                            renders SVG/PNG transparency as black on the home
 *                            screen anyway, and adds its own corner rounding,
 *                            so flattening here just makes that explicit
 *                            instead of leaving it to the OS.
 *
 * Idempotent: re-run any time the source SVGs change. Not wired into
 * `npm run build:cards` — icons are hand-authored art, not pipeline output.
 *
 * Usage (from frontend/): node scripts/gen-icons.mjs
 */

import sharp from 'sharp';
import { readFileSync, statSync } from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const iconsDir = path.join(root, 'public/icons');

const BACKGROUND = '#0c0a09'; // manifest.ts background_color / theme_color

// High density so the SVG (a 512x512 viewBox) rasterizes crisply at every
// target size instead of upscaling a low-res render.
const DENSITY = 384;

async function render(svgFile, outFile, size, { flatten = false } = {}) {
  const svgPath = path.join(iconsDir, svgFile);
  const outPath = path.join(iconsDir, outFile);
  const svg = readFileSync(svgPath);

  let pipeline = sharp(svg, { density: DENSITY }).resize(size, size);
  if (flatten) {
    pipeline = pipeline.flatten({ background: BACKGROUND });
  }
  await pipeline.png().toFile(outPath);

  const { size: bytes } = statSync(outPath);
  console.log(`  ${outFile}  ${size}x${size}  ${(bytes / 1024).toFixed(1)} KB`);
}

console.log('gen-icons: rendering PNGs from public/icons/*.svg');
await render('icon.svg', 'icon-192.png', 192);
await render('icon.svg', 'icon-512.png', 512);
await render('icon-maskable.svg', 'icon-maskable-512.png', 512);
await render('icon.svg', 'apple-touch-icon.png', 180, { flatten: true });
console.log('gen-icons: done.');
