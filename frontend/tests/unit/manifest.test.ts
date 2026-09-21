/**
 * mobile_load T9/D9: the PWA manifest contract — a PNG 192 and 512 icon (installable on
 * Android without an SVG fallback), a maskable 512 PNG, and the `id`/`scope`/`display`
 * fields the install prompt and splash screen rely on. Every icon `src` must resolve to a
 * real file under `public/` — a broken manifest icon path fails silently in the browser.
 */
import { describe, it, expect } from 'vitest';
import { existsSync, readFileSync } from 'fs';
import path from 'path';
import manifest from '@/app/manifest';

const publicDir = path.resolve(__dirname, '../../public');

describe('manifest', () => {
  const m = manifest();

  it('sets id and scope to the app root, standalone display', () => {
    expect(m.id).toBe('/');
    expect(m.scope).toBe('/');
    expect(m.display).toBe('standalone');
  });

  it('has a 192 and a 512 PNG icon with purpose any (or unset)', () => {
    const anyPurpose = (p: string | undefined) => p === undefined || p === 'any';
    const png192 = m.icons?.find((i) => i.type === 'image/png' && i.sizes === '192x192' && anyPurpose(i.purpose));
    const png512 = m.icons?.find((i) => i.type === 'image/png' && i.sizes === '512x512' && anyPurpose(i.purpose));
    expect(png192).toBeTruthy();
    expect(png512).toBeTruthy();
  });

  it('has a 512 PNG icon with purpose maskable', () => {
    const maskable = m.icons?.find((i) => i.type === 'image/png' && i.sizes === '512x512' && i.purpose === 'maskable');
    expect(maskable).toBeTruthy();
  });

  it('every icon src exists under public/', () => {
    expect(m.icons?.length ?? 0).toBeGreaterThan(0);
    for (const icon of m.icons ?? []) {
      const filePath = path.join(publicDir, icon.src.replace(/^\//, ''));
      expect(existsSync(filePath), `${icon.src} does not exist under public/`).toBe(true);
    }
  });
});

describe('favicon', () => {
  it('is the brand icon, not the stock create-next-app file', () => {
    const ico = readFileSync(path.join(__dirname, '..', '..', 'src', 'app', 'favicon.ico'));
    expect(ico.length).not.toBe(25931); // the exact size of the create-next-app favicon
    expect(ico.readUInt16LE(2)).toBe(1); // ICO
    const count = ico.readUInt16LE(4);
    expect(count).toBeGreaterThanOrEqual(3);
    for (let i = 0; i < count; i++) {
      const offset = ico.readUInt32LE(6 + 16 * i + 12);
      expect(ico.subarray(offset, offset + 8).toString('hex')).toBe('89504e470d0a1a0a'); // PNG entry
    }
  });
});
