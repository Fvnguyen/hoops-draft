#!/usr/bin/env tsx
/**
 * 82:0 Challenge difficulty calibration (plan_challenge_mode T1 / D5).
 *
 * Usage: tsx scripts/challenge-sim.ts [drafts=30] [--seed N] [--sweep] [--seats all|best]
 *
 * Runs N seeded cube drafts, then plays every drafted seat's full 82-game challenge
 * schedule against the 30 NBA opponents (`engine/challenge.ts`), and prints the win
 * distribution by seat rank plus the grade shares. `--sweep` repeats the whole thing
 * across a grid of EdgeTuning values so `CHALLENGE_TUNING` can be picked against D5's
 * target: the best drafted seat's top decile reaches A+ (72+), S (80+) is rare.
 *
 * Seat rank is by OVR-weighted roster strength, so "best seat" means the draft a player
 * would recognise as the good one, not whichever seat happened to win.
 */

import { loadPlayers, runHeadlessDraft, buildTeams } from '../tests/unit/helpers';
import { PLAY_CATALOG } from '../src/engine/plays';
import {
  buildNbaTeams, buildChallengeSchedule, simulateHalf, gradeForWins, CHALLENGE_GRADES, NBA_TEAMS,
} from '../src/engine/challenge';
import { CHALLENGE_TUNING } from '../src/engine/balance';
import type { EdgeTuning, TeamInfo } from '../src/engine/game';
import { createRng, randomSeed } from '../src/engine/rng';

const args = process.argv.slice(2);
const numArg = args.find((a) => /^\d+$/.test(a));
const drafts = numArg ? parseInt(numArg, 10) : 30;
const seedIdx = args.indexOf('--seed');
const seed = seedIdx >= 0 ? parseInt(args[seedIdx + 1], 10) : randomSeed();
const sweep = args.includes('--sweep');

const players = loadPlayers();

/** Mean OVR of the starting five, the simplest honest proxy for "this is the good draft". */
function seatStrength(team: TeamInfo): number {
  const byId = new Map(team.players.map((p) => [p.id, p]));
  const five = team.starters.map((id) => byId.get(id)).filter(Boolean);
  if (five.length === 0) return 0;
  return five.reduce((s, p) => s + (p!.ratings?.overall ?? 0), 0) / five.length;
}

interface SeatRun { rank: number; strength: number; wins: number }

function runTuning(tuning: EdgeTuning): SeatRun[] {
  const rng = createRng(seed);
  const out: SeatRun[] = [];
  for (let d = 0; d < drafts; d++) {
    const draftSeed = Math.floor(rng.next() * 4294967296);
    const runSeed = Math.floor(rng.next() * 4294967296);
    const teams = buildTeams(runHeadlessDraft(players, PLAY_CATALOG, draftSeed));
    const schedule = buildChallengeSchedule(runSeed);

    const ranked = teams
      .map((t) => ({ team: t, strength: seatStrength(t) }))
      .sort((a, b) => b.strength - a.strength);

    ranked.forEach((entry, rank) => {
      // Opponents are rebuilt per seat: a card this seat drafted must not also suit up for
      // its real NBA team in the same game (see buildNbaTeams).
      const opponents = buildNbaTeams(players, PLAY_CATALOG, new Set(entry.team.players.map((p) => p.id)));
      const h1 = simulateHalf(entry.team, opponents, schedule, 1, runSeed, tuning);
      const h2 = simulateHalf(entry.team, opponents, schedule, 2, runSeed, tuning);
      out.push({ rank, strength: entry.strength, wins: h1.wins + h2.wins });
    });
  }
  return out;
}

function quantile(sorted: number[], q: number): number {
  if (sorted.length === 0) return 0;
  const pos = (sorted.length - 1) * q;
  const lo = Math.floor(pos);
  const hi = Math.ceil(pos);
  return sorted[lo] + (sorted[hi] - sorted[lo]) * (pos - lo);
}

function report(label: string, runs: SeatRun[]): void {
  const best = runs.filter((r) => r.rank === 0).map((r) => r.wins).sort((a, b) => a - b);
  const all = runs.map((r) => r.wins).sort((a, b) => a - b);

  console.log(`\n=== ${label} ===`);
  console.log(`  all seats      mean ${mean(all).toFixed(1)}  median ${quantile(all, 0.5).toFixed(0)}  max ${all[all.length - 1]}`);
  console.log(`  best seat      mean ${mean(best).toFixed(1)}  median ${quantile(best, 0.5).toFixed(0)}  p90 ${quantile(best, 0.9).toFixed(0)}  max ${best[best.length - 1]}`);
  console.log(`  best seat A+ (72+): ${pct(best.filter((w) => w >= 72).length / best.length)}   S (80+): ${pct(best.filter((w) => w >= 80).length / best.length)}   82-0: ${best.filter((w) => w === 82).length}/${best.length}`);

  console.log('  wins by seat rank (mean / median / max):');
  for (let r = 0; r < 8; r++) {
    const s = runs.filter((x) => x.rank === r).map((x) => x.wins).sort((a, b) => a - b);
    if (s.length === 0) continue;
    console.log(`    #${r + 1}  ${mean(s).toFixed(1).padStart(5)}  ${quantile(s, 0.5).toFixed(0).padStart(3)}  ${String(s[s.length - 1]).padStart(3)}`);
  }

  console.log('  grade shares (all seats / best seat):');
  for (const g of CHALLENGE_GRADES) {
    const a = all.filter((w) => gradeForWins(w).grade === g.grade).length / all.length;
    const b = best.filter((w) => gradeForWins(w).grade === g.grade).length / best.length;
    if (a === 0 && b === 0) continue;
    console.log(`    ${g.grade.padEnd(3)} ${g.title.padEnd(10)} ${pct(a).padStart(6)}  ${pct(b).padStart(6)}`);
  }
}

const mean = (xs: number[]) => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : 0);
const pct = (x: number) => `${(x * 100).toFixed(1)}%`;

console.log(`Seed: ${seed}   drafts: ${drafts}   seats/draft: 8   games/seat: 82`);
console.log(`Opponents: ${NBA_TEAMS.length} NBA teams from the card pool, full play catalog,`);
console.log('rebuilt per seat so nobody plays against himself.');

const t0 = Date.now();
if (sweep) {
  const grid: EdgeTuning[] = [
    { efficiencyScale: 0.20, maxEffShift: 0.08 },  // engine default (tournament)
    { efficiencyScale: 0.30, maxEffShift: 0.12 },
    { efficiencyScale: 0.40, maxEffShift: 0.16 },
    { efficiencyScale: 0.50, maxEffShift: 0.20 },
    { efficiencyScale: 0.60, maxEffShift: 0.24 },
    { efficiencyScale: 0.75, maxEffShift: 0.30 },
    { efficiencyScale: 0.90, maxEffShift: 0.36 },
  ];
  for (const t of grid) {
    report(`effScale ${t.efficiencyScale} / maxShift ${t.maxEffShift}`, runTuning(t));
  }
} else {
  report(`CHALLENGE_TUNING (effScale ${CHALLENGE_TUNING.efficiencyScale} / maxShift ${CHALLENGE_TUNING.maxEffShift})`, runTuning(CHALLENGE_TUNING));
}
console.log(`\nDone in ${((Date.now() - t0) / 1000).toFixed(1)}s`);
