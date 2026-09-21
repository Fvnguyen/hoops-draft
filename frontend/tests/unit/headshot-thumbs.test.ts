import { describe, it, expect } from 'vitest';
import { existsSync, statSync } from 'fs';
import path from 'path';
import cards from '@/data/cards.json';

/**
 * plan mobile_load D3/D4: `scripts/ensure-headshots.mjs` pre-generates a 96px and a
 * 480px WebP per player alongside the full-size PNG, and every avatar/card-front call
 * site reads through `headshotThumb()` instead of the raw `<id>.png`. If a pipeline
 * refresh adds a card and someone forgets to re-run the script, every avatar for that
 * player silently 404s in production — this is the CI guard that catches it before a
 * merge instead.
 */
const root = path.resolve(__dirname, '../..');
const headshotsDir = path.join(root, 'public/headshots');

const playerIds = Array.from(
  new Set(
    (cards as Array<{ player?: { id?: string } }>)
      .map((card) => card.player?.id)
      .filter((id): id is string => Boolean(id))
  )
);

describe('headshot thumbnails (mobile_load D3/D4)', () => {
  it('cards.json has at least one player id to check', () => {
    expect(playerIds.length).toBeGreaterThan(0);
  });

  it('every card has a 96px and a 480px WebP thumbnail', () => {
    const missing: string[] = [];
    for (const id of playerIds) {
      for (const size of [96, 480] as const) {
        const file = path.join(headshotsDir, String(size), `${id}.webp`);
        if (!existsSync(file)) missing.push(`${size}/${id}.webp`);
      }
    }
    expect(missing).toEqual([]);
  });

  it('both size directories also carry a _missing.webp placeholder', () => {
    for (const size of [96, 480] as const) {
      expect(existsSync(path.join(headshotsDir, String(size), '_missing.webp'))).toBe(true);
    }
  });

  it('every 96px thumbnail is under 8 KB', () => {
    const oversize: Array<{ id: string; bytes: number }> = [];
    for (const id of playerIds) {
      const file = path.join(headshotsDir, '96', `${id}.webp`);
      if (!existsSync(file)) continue; // reported by the existence test above
      const bytes = statSync(file).size;
      if (bytes >= 8 * 1024) oversize.push({ id, bytes });
    }
    expect(oversize).toEqual([]);
  });
});
