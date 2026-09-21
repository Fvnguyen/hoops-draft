/**
 * Engine micro-benchmark (plan render_and_engine_perf T1).
 *
 *   npm run bench                 # default: seed 42, 15 measured runs
 *   npm run bench -- --runs 30 --seed 7 --json
 *
 * Times what the 82:0 challenge page actually does on the main thread — it blocks the UI
 * behind a "Simulating" notice, and a phone is roughly 3-5x slower than this desktop:
 *
 *   simulateGame      one full game, the unit everything else is made of
 *   buildNbaTeams     the 30 opponents (the page rebuilds them for every half today)
 *   half 1            buildNbaTeams + simulateHalf(1)
 *   half 2            buildNbaTeams + simulateHalf(2): the roster was not changed at the break
 *   half 2 + ghost    ... + simulateHalf(2) again for the counterfactual roster: the worst
 *                     case, a trade at the break
 *
 * Deterministic inputs (a headless draft from a fixed seed), so the numbers move only when
 * the engine does. Medians, not means: the first runs pay for JIT warm-up and are
 * discarded, and a stray GC pause should not decide whether an optimisation "worked".
 * The printed checksum must not change across this plan: every task in it is
 * behaviour-preserving, so a different checksum means a different game was simulated.
 */
import { performance } from 'node:perf_hooks';
import { loadPlayers, runHeadlessDraft, buildTeams } from '../tests/unit/helpers';
import { PLAY_CATALOG } from '../src/engine/plays';
import { buildNbaTeams, buildChallengeSchedule, challengeGameSeed, simulateHalf } from '../src/engine/challenge';
import { CHALLENGE_TUNING } from '../src/engine/balance';
import { simulateGame } from '../src/engine/game';
import { createRng } from '../src/engine/rng';

const args = process.argv.slice(2);
const numArg = (flag: string, fallback: number) => {
  const i = args.indexOf(flag);
  return i >= 0 ? parseInt(args[i + 1], 10) : fallback;
};
const seed = numArg('--seed', 42);
const runs = numArg('--runs', 15);
const warmup = 3;
const asJson = args.includes('--json');

const players = loadPlayers();
const teams = buildTeams(runHeadlessDraft(players, PLAY_CATALOG, seed));
const userTeam = teams[0];
// The ghost replays half 2 with the pre-trade roster; any other drafted team is a fair
// stand-in for "a structurally different roster", which is all the timing depends on.
const ghostTeam = teams[1];
const schedule = buildChallengeSchedule(seed);

function median(values: number[]): number {
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
}

function time(label: string, fn: () => void): { label: string; median: number; min: number; max: number } {
  const samples: number[] = [];
  for (let i = 0; i < warmup + runs; i++) {
    const t0 = performance.now();
    fn();
    const dt = performance.now() - t0;
    if (i >= warmup) samples.push(dt);
  }
  return { label, median: median(samples), min: Math.min(...samples), max: Math.max(...samples) };
}

const opponents = buildNbaTeams(players, PLAY_CATALOG);
const anOpponent = opponents.values().next().value!;

// What was simulated, reduced to one number: if this changes, so did the games.
const h1 = simulateHalf(userTeam, opponents, schedule, 1, seed, CHALLENGE_TUNING);
const h2 = simulateHalf(userTeam, opponents, schedule, 2, seed, CHALLENGE_TUNING);
const checksum = [...h1.games, ...h2.games]
  .reduce((acc, g, i) => (acc * 31 + (g.score[0] * 1000 + g.score[1]) * (i + 1)) % 2147483647, 7);

const results = [
  time('simulateGame', () => {
    simulateGame(userTeam, anOpponent, { rng: createRng(challengeGameSeed(seed, 0)), tuning: CHALLENGE_TUNING });
  }),
  time('buildNbaTeams', () => { buildNbaTeams(players, PLAY_CATALOG); }),
  time('half 1', () => {
    const opp = buildNbaTeams(players, PLAY_CATALOG);
    simulateHalf(userTeam, opp, schedule, 1, seed, CHALLENGE_TUNING);
  }),
  time('half 2', () => {
    const opp = buildNbaTeams(players, PLAY_CATALOG);
    simulateHalf(userTeam, opp, schedule, 2, seed, CHALLENGE_TUNING);
  }),
  time('half 2 + ghost', () => {
    const opp = buildNbaTeams(players, PLAY_CATALOG);
    simulateHalf(userTeam, opp, schedule, 2, seed, CHALLENGE_TUNING);
    simulateHalf(ghostTeam, opp, schedule, 2, seed, CHALLENGE_TUNING);
  }),
];

if (asJson) {
  console.log(JSON.stringify({ seed, runs, record: `${h1.wins + h2.wins}-${82 - h1.wins - h2.wins}`, checksum, results }, null, 2));
} else {
  console.log(`engine bench — seed ${seed}, ${runs} runs after ${warmup} warm-up, node ${process.version}`);
  console.log(`simulated record ${h1.wins + h2.wins}-${82 - h1.wins - h2.wins}, checksum ${checksum}  (must not change across render_and_engine_perf)`);
  console.log('');
  console.log('                     median      min      max');
  for (const r of results) {
    console.log(`${r.label.padEnd(18)} ${r.median.toFixed(1).padStart(7)} ms ${r.min.toFixed(1).padStart(7)} ${r.max.toFixed(1).padStart(8)}`);
  }
}
