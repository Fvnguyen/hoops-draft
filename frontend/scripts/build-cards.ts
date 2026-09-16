#!/usr/bin/env tsx
/**
 * Build-time card artifact generator.
 *
 * Reads `frontend/game.db` (SQLite, read-only pipeline output) with
 * better-sqlite3, runs the pure `computeCards` rating math against it, and
 * writes `src/data/cards.json` — the static build artifact `src/engine/cards.ts`
 * serves at runtime instead of opening a database.
 *
 * Usage (from frontend/): `npx tsx scripts/build-cards.ts`
 */

import Database from 'better-sqlite3';
import path from 'path';
import fs from 'fs';
import { computeCards } from '../src/engine/ratings';
import type { PlayerBio, SeasonStat, AwardRow, PlayerCardData } from '../src/engine/types';

function mean(arr: number[]): number {
  return arr.length ? arr.reduce((a, b) => a + b, 0) / arr.length : 0;
}

function main(): void {
  const dbPath = path.join(process.cwd(), 'game.db');
  const db = new Database(dbPath, { readonly: true, fileMustExist: true });

  const players = db.prepare('SELECT * FROM Player').all() as PlayerBio[];
  const stats = db.prepare('SELECT * FROM SeasonStat').all() as (SeasonStat & { playerId: string; season: string })[];
  const awards = db.prepare('SELECT * FROM Award').all() as AwardRow[];
  db.close();

  const cards = computeCards({ players, stats, awards });

  // Tag every card `type: 'Player'` as the FIRST key (matches the shape
  // PlayerCardData/DraftCard expect at runtime).
  const tagged: PlayerCardData[] = cards.map((c) => ({ type: 'Player', ...c }));

  const outPath = path.join(process.cwd(), 'src', 'data', 'cards.json');
  fs.writeFileSync(outPath, JSON.stringify(tagged));

  console.log(`Wrote ${tagged.length} cards to ${path.relative(process.cwd(), outPath)}`);

  const ratingKeys = [
    'overall', 'finishing', 'midRange', 'perimeter', 'playmaking',
    'rebounding', 'perimeterDefense', 'postDefense',
  ] as const;

  console.log('\nLeague rating means:');
  for (const key of ratingKeys) {
    const m = mean(tagged.map((c) => c.ratings[key] ?? 0));
    console.log(`  ${key.padEnd(18)} ${m.toFixed(2)}`);
  }

  // engine_possession_model D1: paste this block over RATING_NORM in src/engine/balance.ts
  // whenever the pool changes (tests/unit/lineup.test.ts fails on >0.5 drift).
  console.log('\nRATING_NORM (mean / sd per dimension — copy into engine/balance.ts):');
  for (const key of ratingKeys) {
    if (key === 'overall') continue;
    const v = tagged.map((c) => c.ratings[key] ?? 0);
    const m = mean(v);
    const sd = Math.sqrt(mean(v.map((x) => (x - m) ** 2)));
    console.log(`  ${(key + ':').padEnd(18)} { mean: ${m.toFixed(2)}, sd: ${sd.toFixed(2)} },`);
  }

  // card_balance T3 (2026-09-16, owner-approved): the same top-X% cutoff per dimension,
  // guaranteeing badge coverage is consistent by construction across all 7 skills — no
  // dimension's L3 can be easier than another's L2. Paste over BADGE_THRESHOLDS in
  // engine/balance.ts whenever the pool changes.
  const L1_PCT = 0.09, L2_PCT = 0.035, L3_PCT = 0.013;
  console.log('\nBADGE_THRESHOLDS (per-dimension percentile cutoffs — copy into engine/balance.ts):');
  for (const key of ratingKeys) {
    if (key === 'overall') continue;
    const v = tagged.map((c) => c.ratings[key] ?? 0).sort((a, b) => b - a);
    const at = (pct: number) => v[Math.max(0, Math.floor(v.length * pct))];
    console.log(`  ${(key + ':').padEnd(18)} { l1: ${at(L1_PCT)}, l2: ${at(L2_PCT)}, l3: ${at(L3_PCT)} },`);
  }
}

main();
