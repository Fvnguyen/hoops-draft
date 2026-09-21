/**
 * D4 regression (plan render_and_engine_perf T7).
 *
 * `narration/render.ts`'s picker used to derive its per-possession seed with the exact
 * same formula `engine/possession.ts` uses for its attribution draw (who gets the
 * assist/steal/block): `seed ^ Math.imul(index + 1, 0x9e3779b1)`. Same seed, same
 * generator, so the picker's FIRST draw equalled the engine's first attribution draw for
 * that possession, and variant choice ended up correlated with what happened (measured
 * over 200 games: 1,324/1,520 block lines drew from the first tenth of the pool, steals
 * never used the top 45%, unforced turnovers never used the bottom 45%). The fix mixes a
 * `NARRATION_SALT` constant into the picker's seed so its stream is independent of the
 * engine's.
 *
 * This asserts, over a fixed set of seeded games, that every (kind, channel) pool with
 * >= 4 variants and >= 40 sampled occurrences has the renderer draw from at least 60% of
 * its variants — not just the same narrow slice every time. SEED/GAMES below were picked
 * because at this sample size the pre-fix (unsalted) picker actually fails this bound for
 * `block/mid` (57.1%, verified by temporarily reverting the `NARRATION_SALT` mix-in in
 * `render.ts` and rerunning this test — restore it before committing); a larger sample
 * eventually visits every variant under either version, so bumping GAMES up would hide
 * the regression instead of catching it.
 */
import { describe, it, expect } from 'vitest';
import { simulateMany } from './helpers';
import { renderTheater } from '@/narration/render';
import { KIND_TEMPLATES } from '@/narration/templates';
import type { NarrativeKind } from '@/narration/types';

const SEED = 7007;
const GAMES = 15;
const MIN_OCCURRENCES = 40;
const MIN_POOL_SIZE = 4;
const MIN_VARIANT_COVERAGE = 0.6;

/** Kinds whose pool selection can be redirected by a coverage-specific pool (selectPool). */
const DEFENSIVE_KINDS: ReadonlySet<NarrativeKind> = new Set(['miss', 'block', 'turnover', 'steal']);

/**
 * Matches a rendered line back to the kind-pool template it came from, by checking that
 * the template's literal (non-placeholder) chunks appear in order in the line. Prefixes
 * (possession-win, second-chance) and suffixes (assist, steer) surround the body but
 * don't break the in-order substring check.
 */
function literalChunks(template: string): string[] {
  return template.split(/\{\w+\}/g).map(s => s.trim()).filter(Boolean);
}

function variantIndexOf(pool: string[], line: string): number {
  for (let i = 0; i < pool.length; i++) {
    const chunks = literalChunks(pool[i]);
    if (chunks.length === 0) continue;
    let pos = 0;
    let ok = true;
    for (const c of chunks) {
      const idx = line.indexOf(c, pos);
      if (idx === -1) { ok = false; break; }
      pos = idx + c.length;
    }
    if (ok) return i;
  }
  return -1;
}

describe('narration variant variety (D4)', () => {
  it('spreads variant choice across at least 60% of a well-sampled pool', () => {
    const games = simulateMany(GAMES, undefined, undefined, SEED);
    const byGroup = new Map<string, number[]>();
    const poolSizeOf = new Map<string, number>();

    for (const g of games) {
      const lines = renderTheater(g);
      for (let i = 0; i < g.possessions.length; i++) {
        const n = g.possessions[i].narrative;
        if (!n) continue;
        // Restrict to possessions actually rendered from the plain kind pool (selectPool
        // routes to a play/coverage-specific pool otherwise).
        if (n.calledPlayId) continue;
        if (n.coverageId && DEFENSIVE_KINDS.has(n.kind)) continue;
        const kt = KIND_TEMPLATES[n.kind];
        const pool = (n.channel && kt.pools[n.channel]?.length) ? kt.pools[n.channel]! : kt.pools.any;
        if (!pool || pool.length < MIN_POOL_SIZE) continue;
        const key = `${n.kind}/${n.channel ?? 'any'}`;
        poolSizeOf.set(key, pool.length);
        const idx = variantIndexOf(pool, lines[i]);
        if (idx < 0) continue;
        if (!byGroup.has(key)) byGroup.set(key, []);
        byGroup.get(key)!.push(idx);
      }
    }

    const checked: string[] = [];
    const offenders: string[] = [];
    for (const [key, indices] of byGroup) {
      if (indices.length < MIN_OCCURRENCES) continue;
      const poolSize = poolSizeOf.get(key)!;
      const coverage = new Set(indices).size / poolSize;
      checked.push(key);
      if (coverage < MIN_VARIANT_COVERAGE) {
        offenders.push(`${key}: n=${indices.length} coverage=${(coverage * 100).toFixed(1)}% (pool ${poolSize})`);
      }
    }

    // Sanity: the fixture should always clear the 40-occurrence bar for several groups;
    // an empty `checked` would make the assertion below vacuously true.
    expect(checked.length).toBeGreaterThan(0);
    expect(offenders, offenders.join('\n')).toEqual([]);
  });
});
