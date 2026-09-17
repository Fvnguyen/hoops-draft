/**
 * Card Ratings — the single source of truth for OVR, per-skill ratings,
 * rarity, and badges (card_ratings_rebalance, 2026-09-18: rate-stat dimensions
 * through one mean-centred index, magnitude×shape defence, flat-mean OVR).
 *
 * PURE: no sqlite, no cache, no I/O. `computeCards` takes plain data in and
 * returns plain data out — `scripts/build-cards.ts` is the only caller that
 * touches a database, and it does so before calling in here.
 */

import {
  SeasonStat, Trait, Rarity, PlayerCard, AwardRow, RatingsInput,
} from './types';
import { RATING_CONFIG, LEGENDARY_PLAYERS, POSITIONLESS_PLAYERS, BADGE_THRESHOLDS, RARITY_CUTOFFS, type RatingDim } from './balance';

const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));

function getBadge(val: number, name: string, dim: RatingDim): Trait | null {
  const t = BADGE_THRESHOLDS[dim];
  if (val >= t.l3) return { name, level: 3 };
  if (val >= t.l2) return { name, level: 2 };
  if (val >= t.l1) return { name, level: 1 };
  return null;
}

/** D2: mean and "elite" (top-benchmarkCutoff% average) over rotation players (mpg >= rotationMpg)
 *  for one raw stat channel. Falls back to the full pool if nobody clears the rotation bar
 *  (tiny test fixtures, an early-season pool). */
function statBounds(rows: { v: number; mpg: number }[]): { mean: number; elite: number } {
  const rotation = rows.filter(r => r.mpg >= RATING_CONFIG.rotationMpg).map(r => r.v);
  const pool = rotation.length > 0 ? rotation : rows.map(r => r.v);
  const mean = pool.length ? pool.reduce((a, b) => a + b, 0) / pool.length : 0;
  const sorted = [...pool].sort((a, b) => b - a);
  const topCount = Math.max(1, Math.floor(pool.length * RATING_CONFIG.benchmarkCutoff));
  let sum = 0;
  for (let i = 0; i < topCount; i++) sum += sorted[i];
  const elite = topCount > 0 ? sum / topCount : mean;
  return { mean, elite };
}

/** D2: idx(v) = clamp(0.5 + (v - mean) / (2 * (elite - mean)), 0, idxMax). League average
 *  maps to 0.5, elite (the rotation top-7.5% mean) to 1.0. */
function makeIdx(bounds: { mean: number; elite: number }) {
  const denom = 2 * (bounds.elite - bounds.mean);
  return (v: number) => {
    if (denom <= 0) return 0.5;
    return clamp(0.5 + (v - bounds.mean) / denom, 0, RATING_CONFIG.idxMax);
  };
}

export function computeCards(input: RatingsInput): PlayerCard[] {
  const { players, stats: allStats, awards: allAwards } = input;

  // Latest season per player: mirrors `ORDER BY season DESC LIMIT 1`, i.e. keep the
  // max `season` string per playerId, preferring the first-encountered row on ties
  // (matches SQLite's stable sort over the original table-scan order).
  const latestStatByPlayer = new Map<string, SeasonStat & { playerId: string; season: string }>();
  for (const s of allStats) {
    const existing = latestStatByPlayer.get(s.playerId);
    if (!existing || s.season > existing.season) {
      latestStatByPlayer.set(s.playerId, s);
    }
  }

  const awardsByPlayer = new Map<string, AwardRow[]>();
  for (const a of allAwards) {
    let list = awardsByPlayer.get(a.playerId);
    if (!list) {
      list = [];
      awardsByPlayer.set(a.playerId, list);
    }
    list.push(a);
  }

  // card_balance T1 follow-up (2026-09-16): 'G' and 'F' pools removed — bref-primary
  // positions never produce a bare letter, so they were dead code. Kept only for the
  // All-Defensive floor's "which dimension is this player's real defensive role" check
  // (D8 removed the positional OVR weighting this used to also feed).
  const getPool = (pos: string) => {
    if (pos === 'PG') return 'PG';
    if (pos === 'SG') return 'SG';
    if (pos === 'SF') return 'SF';
    if (pos === 'PF') return 'PF';
    if (pos === 'C') return 'C';
    if (pos.includes('G/F') || pos.includes('F/G') || pos.includes('SG/SF') || pos.includes('SF/SG')) return 'G/F';
    if (pos.includes('F/C') || pos.includes('C/F') || pos.includes('PF/C') || pos.includes('C/PF')) return 'F/C';
    return 'Gold';
  };

  let maxPts = 0, maxAst = 0, maxTrb = 0, max3pm = 0;

  interface RawRow {
    player: typeof players[number];
    stat: SeasonStat;
    awards: AwardRow[];
    pool: string;
    raw: {
      finFGM: number; finEff: number; midFGM: number; midEff: number; perFGM: number; perEff: number;
      dbpm: number; dws48: number; stlPct: number; blkPct: number; drbPct: number; trbPct: number;
      astPct: number; negTovPct: number; apg: number; rpg: number; selfFg3: number; selfFg2: number;
    };
  }

  const rawScoresRaw = players.map(p => {
    const stat = latestStatByPlayer.get(p.id) as SeasonStat | undefined;
    const awardsRows = awardsByPlayer.get(p.id) || [];
    if (!stat) return null;

    // Track max stats for the League Leader bump (D9: steals/blocks dropped).
    if (stat.pts > maxPts) maxPts = stat.pts;
    if (stat.ast > maxAst) maxAst = stat.ast;
    if (stat.trb > maxTrb) maxTrb = stat.trb;
    const fg3m = stat.fg3a * stat.fg3_pct;
    if (fg3m > max3pm) max3pm = fg3m;

    const vol = stat.fga;
    const finFGA = vol * stat.pct_fga_0_3;
    const finFGM = finFGA * stat.fg_pct_0_3;
    const finEff = stat.fg_pct_0_3;

    const midFGA = vol * (stat.pct_fga_3_10 + stat.pct_fga_10_16 + stat.pct_fga_16_3p);
    const midFGM = vol * ((stat.pct_fga_3_10 * stat.fg_pct_3_10) + (stat.pct_fga_10_16 * stat.fg_pct_10_16) + (stat.pct_fga_16_3p * stat.fg_pct_16_3p));
    const midEff = midFGA > 0 ? (midFGM / midFGA) : 0;

    const perFGM = fg3m;
    const perEff = stat.fg3_pct || 0;

    return {
      player: p,
      stat,
      awards: awardsRows,
      pool: getPool(p.position),
      raw: {
        finFGM, finEff, midFGM, midEff, perFGM, perEff,
        dbpm: stat.dbpm || 0,
        dws48: stat.ws_per_48 || 0,
        stlPct: stat.stl_pct || 0,
        blkPct: stat.blk_pct || 0,
        drbPct: stat.drb_pct || 0,
        trbPct: stat.trb_pct || 0,
        astPct: stat.ast_pct || 0,
        negTovPct: -(stat.tov_pct || 0),
        apg: stat.ast,
        rpg: stat.trb,
        selfFg3: 1 - (stat.pct_ast_fg3 ?? 0),
        selfFg2: 1 - (stat.pct_ast_fg2 ?? 0),
      },
    };
  });
  const rawScores: RawRow[] = rawScoresRaw.filter((r): r is RawRow => r !== null);

  const bounds = <K extends keyof RawRow['raw']>(key: K) =>
    statBounds(rawScores.map(r => ({ v: r.raw[key], mpg: r.stat.mpg })));

  const idx = {
    finFGM: makeIdx(bounds('finFGM')), finEff: makeIdx(bounds('finEff')),
    midFGM: makeIdx(bounds('midFGM')), midEff: makeIdx(bounds('midEff')),
    perFGM: makeIdx(bounds('perFGM')), perEff: makeIdx(bounds('perEff')),
    dbpm: makeIdx(bounds('dbpm')), dws48: makeIdx(bounds('dws48')),
    stlPct: makeIdx(bounds('stlPct')), blkPct: makeIdx(bounds('blkPct')), drbPct: makeIdx(bounds('drbPct')),
    trbPct: makeIdx(bounds('trbPct')), rpg: makeIdx(bounds('rpg')),
    astPct: makeIdx(bounds('astPct')), apg: makeIdx(bounds('apg')), negTovPct: makeIdx(bounds('negTovPct')),
  };
  const selfFg3Bounds = bounds('selfFg3');
  const selfFg2Bounds = bounds('selfFg2');

  const creationBoost = (self: number, b: { mean: number; elite: number }) => {
    const denom = b.elite - b.mean;
    const ratio = denom > 0 ? clamp((self - b.mean) / denom, -1, 1) : 0;
    return 1 + RATING_CONFIG.shooting.creationBoost * ratio;
  };

  const cfgDef = RATING_CONFIG.defense;
  const cfgShoot = RATING_CONFIG.shooting;
  const cfgPlay = RATING_CONFIG.playmaking;
  const cfgReb = RATING_CONFIG.rebounding;

  const cards: PlayerCard[] = [];

  for (const r of rawScores) {
    const p = r.player;
    const stat = r.stat;

    // T2 general fix (card_balance, 2026-09-16, unchanged by the rebalance): a
    // sub-rotation player can hit the same index as a full-time starter on a small
    // sample. Under 10 MPG no rating dimension may exceed 85.
    const capLowMinutes = (v: number) => (stat.mpg < 10 ? Math.min(v, 85) : v);

    // D4: shooting channels — volume/efficiency index × a self-creation boost.
    const finishingRaw = 99 * (cfgShoot.vol * idx.finFGM(r.raw.finFGM) + cfgShoot.eff * idx.finEff(r.raw.finEff))
      * creationBoost(r.raw.selfFg2, selfFg2Bounds);
    const midRangeRaw = 99 * (cfgShoot.vol * idx.midFGM(r.raw.midFGM) + cfgShoot.eff * idx.midEff(r.raw.midEff))
      * creationBoost(r.raw.selfFg2, selfFg2Bounds);
    const perimeterRaw = 99 * (cfgShoot.vol * idx.perFGM(r.raw.perFGM) + cfgShoot.eff * idx.perEff(r.raw.perEff))
      * creationBoost(r.raw.selfFg3, selfFg3Bounds);

    // D5: playmaking — AST%^0.65 * APG^0.35 * a turnover-rate boost.
    const playmakingRaw = 99 * (idx.astPct(r.raw.astPct) ** cfgPlay.astPctExp)
      * (idx.apg(r.raw.apg) ** cfgPlay.apgExp)
      * (cfgPlay.tovBase + cfgPlay.tovSwing * idx.negTovPct(r.raw.negTovPct));

    // D6: rebounding — TRB%^0.45 * RPG^0.55.
    const reboundingRaw = 99 * (idx.trbPct(r.raw.trbPct) ** cfgReb.trbPctExp) * (idx.rpg(r.raw.rpg) ** cfgReb.rpgExp);

    // D3: defence = magnitude (DBPM/DWS-48 blend) × shape (perimeter vs. post signal split).
    const magnitude = cfgDef.magDbpm * idx.dbpm(r.raw.dbpm) + cfgDef.magDws48 * idx.dws48(r.raw.dws48);
    const perimSig = cfgDef.perimSigStl * idx.stlPct(r.raw.stlPct);
    const postSig = cfgDef.postSigBlk * idx.blkPct(r.raw.blkPct) + cfgDef.postSigDrb * idx.drbPct(r.raw.drbPct);
    const sigSum = perimSig + postSig;
    const perimShape = sigSum > 0 ? (2 * perimSig / sigSum) : 1;
    const postShape = sigSum > 0 ? (2 * postSig / sigSum) : 1;
    let perimeterDefenseRaw = 99 * magnitude * (cfgDef.shapeBase + cfgDef.shapeSwing * perimShape);
    let postDefenseRaw = 99 * magnitude * (cfgDef.shapeBase + cfgDef.shapeSwing * postShape);

    const isAllDef = r.awards.some((a: AwardRow) => a.name === 'All-Defensive');
    if (isAllDef) {
      const defTeam = r.awards.find((a: AwardRow) => a.name === 'All-Defensive')?.level || 2;
      const floor = defTeam === 1 ? 96 : 90;
      // card_balance T2 finding (2026-09-16, owner-approved): flooring "whichever
      // dimension is already higher" could floor the wrong one for a player's real
      // defensive role (a center's perimeter score outscoring their post score, e.g.
      // Bam Adebayo). Floor the dimension matching the player's position pool instead.
      const isBigPool = r.pool === 'C' || r.pool === 'PF' || r.pool === 'F/C';
      if (isBigPool) postDefenseRaw = Math.max(postDefenseRaw, floor);
      else perimeterDefenseRaw = Math.max(perimeterDefenseRaw, floor);
    }

    // D7: low-minutes cap, then clamp at 99 — a raw that still clears 99 earns a gold
    // badge (Trait.level 4) instead of the ordinary l3.
    const dims: { key: RatingDim; raw: number; name: string }[] = [
      { key: 'finishing', raw: capLowMinutes(finishingRaw), name: 'Finisher' },
      { key: 'midRange', raw: capLowMinutes(midRangeRaw), name: 'Mid-Range Maestro' },
      { key: 'perimeter', raw: capLowMinutes(perimeterRaw), name: 'Sharpshooter' },
      { key: 'playmaking', raw: capLowMinutes(playmakingRaw), name: 'Floor General' },
      { key: 'rebounding', raw: capLowMinutes(reboundingRaw), name: 'Glass Cleaner' },
      { key: 'perimeterDefense', raw: capLowMinutes(perimeterDefenseRaw), name: 'Lockdown Defender' },
      { key: 'postDefense', raw: capLowMinutes(postDefenseRaw), name: 'Paint Protector' },
    ];

    const stored: Record<RatingDim, number> = {} as Record<RatingDim, number>;
    const traits: Trait[] = [];
    for (const d of dims) {
      stored[d.key] = Math.round(Math.min(99, d.raw));
      if (d.raw > 99) {
        traits.push({ name: d.name, level: 4 });
      } else {
        const b = getBadge(stored[d.key], d.name, d.key);
        if (b) traits.push(b);
      }
    }

    // D8: OVR is the flat mean of the seven (already-capped) ratings.
    const overall = Math.max(0, Math.min(99, Math.round(
      (stored.finishing + stored.midRange + stored.perimeter + stored.playmaking
        + stored.rebounding + stored.perimeterDefense + stored.postDefense) / 7,
    )));

    let rarity: Rarity = 'Common';
    for (const cutoff of RARITY_CUTOFFS) {
      if (overall >= cutoff.min) { rarity = cutoff.rarity; break; }
    }

    const hasMvp = r.awards.some((a: AwardRow) => a.name === 'MVP');
    const hasAllNba1 = r.awards.some((a: AwardRow) => a.name === 'All-NBA' && a.level === 1);
    const hasAllNba = r.awards.some((a: AwardRow) => a.name === 'All-NBA');
    const hasDpoy = r.awards.some((a: AwardRow) => a.name === 'DPOY');
    const hasAllDef = r.awards.some((a: AwardRow) => a.name === 'All-Defensive');
    const isLegendary = LEGENDARY_PLAYERS.has(p.name);

    // D9: the league-leader rarity bump drops steals/blocks as qualifying categories
    // (a leader at a low counting rate, e.g. 2.2 stl/g, shouldn't Mythic-bump on that
    // alone) — points, assists, rebounds, 3PM remain — and the tie test is now strict
    // `>` — matching the max exactly no longer qualifies, only the outright leader does.
    const fg3m = stat.fg3a * stat.fg3_pct;
    const isLeagueLeader = (
      stat.pts > maxPts || stat.ast > maxAst || stat.trb > maxTrb || fg3m > max3pm
    );

    const bumpRarity = (current: Rarity): Rarity => {
      if (current === 'Common') return 'Uncommon';
      if (current === 'Uncommon') return 'Rare';
      return 'Mythic';
    };

    // 1. BASE AWARDS BUMP
    if ((hasMvp || hasAllNba1) && rarity !== 'Mythic') rarity = 'Mythic';
    else if ((hasAllNba || hasDpoy) && rarity !== 'Mythic' && rarity !== 'Rare') rarity = 'Rare';
    else if (hasAllDef && rarity === 'Common') rarity = 'Uncommon';

    // card_balance T2 (2026-09-17, owner-approved): a real 2025-26 starter (games
    // started / games played >= 0.5) is never Common.
    const isStarter = (stat.gs ?? 0) / Math.max(1, stat.gp) >= 0.5;
    if (isStarter && rarity === 'Common') rarity = 'Uncommon';

    // 2. LEGENDARY BUMP (Adds 1 tier, making drafting harder)
    if (isLegendary) {
      rarity = bumpRarity(rarity);
    }

    // 3. LEAGUE LEADER BUMP
    if (isLeagueLeader) {
      rarity = bumpRarity(rarity);
    }

    if (POSITIONLESS_PLAYERS.has(p.name)) traits.push({ name: 'Positionless', level: 3 });

    // card_balance T2 (2026-09-17)/D9 (2026-09-18): Uncommon -> Rare promotion by badge
    // level — a gold badge (D7's above-99 overflow), or two skill badges at l3+, since
    // D4-D6 moved every badge level wholesale and a raw OVR band would no longer track
    // real standout skill the way the old benchmark-ratio ratings did. Positionless is
    // excluded (not a skill badge).
    const skillBadges = traits.filter(t => t.name !== 'Positionless');
    const hasGold = skillBadges.some(t => t.level >= 4);
    const l3PlusCount = skillBadges.filter(t => t.level >= 3).length;
    if (rarity === 'Uncommon' && (hasGold || l3PlusCount >= 2)) {
      rarity = 'Rare';
    }

    const formattedAwards: string[] = [];
    for (const a of r.awards) {
      if (a.name === 'All-NBA' || a.name === 'All-Defensive') {
        const suffix = a.level === 1 ? '1st' : a.level === 2 ? '2nd' : '3rd';
        formattedAwards.push(`${a.name} ${suffix} Team`);
      } else {
        formattedAwards.push(a.name);
      }
    }

    cards.push({
      id: p.id,
      player: p,
      stats: stat,
      awards: formattedAwards,
      ratings: {
        overall,
        finishing: stored.finishing, midRange: stored.midRange, perimeter: stored.perimeter,
        playmaking: stored.playmaking, rebounding: stored.rebounding,
        perimeterDefense: stored.perimeterDefense, postDefense: stored.postDefense,
      },
      traits,
      rarity,
    });
  }

  return cards;
}
