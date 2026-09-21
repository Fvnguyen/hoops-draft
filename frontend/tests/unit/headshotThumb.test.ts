/**
 * plan mobile_load wave 0: the URL contract every headshot consumer, `next.config.ts`'s
 * cache headers and the service worker are written against.
 */
import { describe, it, expect } from 'vitest';
import { CARD_SET_VERSION } from '@/engine/cardSetVersion';
import { CARD_SET_VERSION as viaCards } from '@/engine/cards';
import { HEADSHOT_SIZES, IMMUTABLE_ASSET_PREFIXES, LONG_LIVED_ASSET_PREFIXES, headshotThumb } from '@/lib/headshotThumb';

describe('headshotThumb', () => {
  it('builds a versioned WebP URL per size', () => {
    expect(headshotThumb('1629029', 96)).toBe(`/headshots/96/1629029.webp?v=${CARD_SET_VERSION}`);
    expect(headshotThumb('1629029', 480)).toBe(`/headshots/480/1629029.webp?v=${CARD_SET_VERSION}`);
  });

  it('every generated size is served from an immutable prefix', () => {
    for (const size of HEADSHOT_SIZES) {
      expect(IMMUTABLE_ASSET_PREFIXES.some((prefix) => headshotThumb('x', size).startsWith(prefix))).toBe(true);
    }
  });

  it('never marks an unversioned path immutable, and never caches app routes', () => {
    const all = [...IMMUTABLE_ASSET_PREFIXES, ...LONG_LIVED_ASSET_PREFIXES];
    expect(IMMUTABLE_ASSET_PREFIXES).not.toContain('/logos/');
    expect(IMMUTABLE_ASSET_PREFIXES).not.toContain('/headshots/'); // the source PNGs leave public/
    for (const prefix of all) {
      expect(prefix.startsWith('/') && prefix.endsWith('/')).toBe(true);
      expect(['/', '/api/', '/_next/', '/_next/image/']).not.toContain(prefix);
    }
  });
});

describe('cardSetVersion', () => {
  it('is the same value engine/cards re-exports', () => {
    expect(viaCards).toBe(CARD_SET_VERSION);
  });
});
