#!/usr/bin/env tsx
/**
 * Headless balance report.
 *
 * Usage: tsx scripts/balance.ts [games=500] [--seed N]
 *
 * Runs the same headless draft -> roster -> game pipeline as the vitest
 * suite (tests/unit/helpers.ts) and prints a compact tuning report: PPP,
 * score distribution, home-court/OT rates, possession counts, margins, and
 * synergy/play activation rates. Intended to replace the
 * play -> /debug -> export -> analyze loop for balance tuning.
 *
 * Pass --seed N to make the run reproducible: the same games (draft, pairing,
 * and simulation) are generated every time for a given seed + game count.
 */

import { loadPlayers, PLAYS, simulateMany, activationRates, runHeadlessDraft, buildTeams } from '../tests/unit/helpers';
import { randomSeed, createRng } from '../src/engine/rng';
import { PLAYBOOK, isEligibleForRole, evaluatePlaybook, type PlayAssignment, type PlayRole } from '../src/engine/playbook';
import { simulateGame, type TeamInfo, type GameTheater } from '../src/engine/game';
import { evaluateArchetypes, type ArchetypeTier } from '../src/engine/archetypes';
import type { PlayerCardData } from '../src/engine/types';
import { pathToFileURL } from 'url';

function parseArgs(argv: string[]): { games: number; seed: number; ab: boolean } {
  let games = 500;
  let seed: number | undefined;
  let ab = false;

  const positional: string[] = [];
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === '--seed') {
      seed = parseInt(argv[++i], 10);
    } else if (argv[i] === '--ab') {
      ab = true;
    } else {
      positional.push(argv[i]);
    }
  }
  if (positional[0]) games = parseInt(positional[0], 10);

  return { games, seed: seed ?? randomSeed(), ab };
}

function mean(arr: number[]): number {
  return arr.length ? arr.reduce((a, b) => a + b, 0) / arr.length : 0;
}

function median(arr: number[]): number {
  if (!arr.length) return 0;
  const s = [...arr].sort((a, b) => a - b);
  const m = Math.floor(s.length / 2);
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
}

function sd(arr: number[]): number {
  if (!arr.length) return 0;
  const m = mean(arr);
  return Math.sqrt(mean(arr.map((x) => (x - m) ** 2)));
}

function pct(n: number, d: number): string {
  return d > 0 ? `${((100 * n) / d).toFixed(1)}%` : 'n/a';
}

// ── Play impact (task 9: playbook wave 1) ───────────────────────────────────
//
// For a handful of representative plays, build a fixed 5-starter roster whose
// role players are the BEST eligible active-roster candidates for that play (by
// overall rating), then compare that exact roster/matchup with the play active vs
// the identical roster with no play assignment at all — isolating the play's own
// on-call modifiers, scorer boost, and lineup priority from roster-composition noise.
// Bots (the opponents) never have assignments, which is fine for this comparison:
// we're measuring the fixed side's lift, not the bots'.

const POSITIONS = ['PG', 'SG', 'SF', 'PF', 'C'] as const;
const NO_BADGE_ROLE: PlayRole = { id: 'filler', name: 'Filler' };

/** Best-rated (by overall) eligible player for `role`, not already in `used`. */
function bestEligiblePlayer(pool: PlayerCardData[], role: PlayRole, used: Set<string>): PlayerCardData | undefined {
  const candidates = pool
    .filter((p) => !used.has(p.id) && isEligibleForRole(p, role))
    .sort((a, b) => (b.ratings?.overall ?? 0) - (a.ratings?.overall ?? 0));
  const best = candidates[0];
  if (best) used.add(best.id);
  return best;
}

/** A fixed 5-starter (no bench) roster: the play's role players in the first N
 *  columns, the next-best available players filling the rest, all on court every
 *  possession (no backup => 100% possession share per calcPossessionShares). */
function buildFixedRosterForPlay(pool: PlayerCardData[], playId: string): { players: PlayerCardData[]; depthChart: Record<string, string[]>; assignment: PlayAssignment } {
  const def = PLAYBOOK[playId];
  const used = new Set<string>();
  const rolePlayers = def.roles.map((role) => {
    const p = bestEligiblePlayer(pool, role, used);
    if (!p) throw new Error(`Play impact: no eligible player found for ${playId} role ${role.id}`);
    return p;
  });

  const starters: PlayerCardData[] = [...rolePlayers];
  while (starters.length < 5) {
    const filler = bestEligiblePlayer(pool, NO_BADGE_ROLE, used);
    if (!filler) throw new Error('Play impact: ran out of players to fill the fixed roster');
    starters.push(filler);
  }

  const depthChart: Record<string, string[]> = {};
  POSITIONS.forEach((pos, i) => { depthChart[pos] = [starters[i].id]; });

  const roles: Record<string, string> = {};
  def.roles.forEach((role, i) => { roles[role.id] = rolePlayers[i].id; });

  return { players: starters, depthChart, assignment: { cardId: `${playId}-impact`, playId, roles } };
}

function makeTeamInfo(seatId: string, players: PlayerCardData[], depthChart: Record<string, string[]>, assignment?: PlayAssignment): TeamInfo {
  return {
    seatId,
    name: seatId,
    players,
    starters: players.map((p) => p.id),
    plays: [],
    depthChart,
    playAssignments: assignment ? [assignment] : [],
    archetypes: {},
  };
}

function pppSide(games: GameTheater[], side: 'home' | 'away'): number {
  let pts = 0, poss = 0;
  for (const g of games) {
    pts += side === 'home' ? g.finalScore[0] : g.finalScore[1];
    poss += g.possessions.filter((p) => p.team === side).length;
  }
  return poss > 0 ? pts / poss : 0;
}

function winPctSide(games: GameTheater[], side: 'home' | 'away'): number {
  let wins = 0;
  for (const g of games) {
    const own = side === 'home' ? g.finalScore[0] : g.finalScore[1];
    const opp = side === 'home' ? g.finalScore[1] : g.finalScore[0];
    if (own > opp) wins++;
  }
  return wins / games.length;
}

function reportPlayImpact(players: PlayerCardData[], n: number, seed: number): void {
  console.log('\n=== Play Impact (fixed roster, best eligible players vs inactive) ===');

  // A single fixed opponent (5 starters, no assignments) reused for every comparison.
  const oppUsed = new Set<string>();
  const oppStarters = POSITIONS.map(() => bestEligiblePlayer(players, NO_BADGE_ROLE, oppUsed)!);
  const oppDepthChart: Record<string, string[]> = {};
  POSITIONS.forEach((pos, i) => { oppDepthChart[pos] = [oppStarters[i].id]; });
  const opponent = makeTeamInfo('play-impact-opponent', oppStarters, oppDepthChart);

  for (const playId of ['play-std-1', 'play-std-2', 'play-sys-4']) {
    const def = PLAYBOOK[playId];
    const { players: rosterPlayers, depthChart, assignment } = buildFixedRosterForPlay(players, playId);

    const withPlay = makeTeamInfo(`${playId}-with`, rosterPlayers, depthChart, assignment);
    const withoutPlay = makeTeamInfo(`${playId}-without`, rosterPlayers, depthChart);

    const gamesWith: GameTheater[] = [];
    const gamesWithout: GameTheater[] = [];
    for (let i = 0; i < n; i++) {
      const gameSeed = seed + i * 7919 + 1; // spread out from the main run's seeds
      gamesWith.push(simulateGame(withPlay, opponent, { rng: createRng(gameSeed) }));
      gamesWithout.push(simulateGame(withoutPlay, opponent, { rng: createRng(gameSeed) }));
    }

    console.log(`\n${def.name} (${playId}, ${def.side}, ${(def.allocation * 100).toFixed(0)}% allocation) — ${n} games each`);
    console.log(`  win%       with ${pct(winPctSide(gamesWith, 'home') * n, n)}  without ${pct(winPctSide(gamesWithout, 'home') * n, n)}`);
    console.log(`  PPP (own)  with ${pppSide(gamesWith, 'home').toFixed(3)}  without ${pppSide(gamesWithout, 'home').toFixed(3)}`);
    console.log(`  PPP (opp)  with ${pppSide(gamesWith, 'away').toFixed(3)}  without ${pppSide(gamesWithout, 'away').toFixed(3)}`);
  }
}

// ── Identities & plays A/B harness (--ab) ────────────────────────────────────
//
// Question: how much do a bot's identities (archetypes) and staffed plays
// actually add to its margin/win rate? For N seeded drafts, build the 8-seat
// pod as usual (treatment), then for every bot opponent of the human seat
// build a "control" copy with archetypes stripped to {} and playAssignments
// stripped to [] (all else — players, depth chart, starters — identical).
// Simulate the SAME matchup (human vs that opponent) twice with the SAME
// per-matchup seed, once per arm, so the only thing that can differ between
// the two games is the opponent's archetypes/playAssignments treatment.
// Deltas are reported from the OPPONENT's perspective (its own margin/win
// with the treatment minus without) since the opponent is the side varied.

const TIER_RANK: Record<ArchetypeTier, number> = { none: 0, online: 1, dedicated: 2 };

/** The highest tier reached among a team's actually-selected archetype slot(s) ('none' if it picked none). */
function identityTierOf(team: TeamInfo): ArchetypeTier {
  const selection = team.archetypes;
  const selectedIds = [selection?.offense, selection?.defense, selection?.gold].filter(
    (id): id is string => !!id
  );
  if (selectedIds.length === 0) return 'none';
  const statuses = evaluateArchetypes(team.players, new Set(team.starters), selection);
  let best: ArchetypeTier = 'none';
  for (const id of selectedIds) {
    const s = statuses.find((st) => st.def.id === id);
    if (s && TIER_RANK[s.tier] > TIER_RANK[best]) best = s.tier;
  }
  return best;
}

/** Number of the team's play assignments that are fully staffed (every role filled by an eligible active-roster player). */
function staffedPlayCountOf(team: TeamInfo): number {
  const status = evaluatePlaybook(team.playAssignments ?? [], team.players);
  return status.plays.filter((p) => p.active).length;
}

/** A control copy of `team` with identities and play assignments stripped, everything else unchanged. */
function stripIdentitiesAndPlays(team: TeamInfo): TeamInfo {
  return { ...team, seatId: `${team.seatId}-control`, archetypes: {}, playAssignments: [] };
}

export interface ABPair {
  identityTier: ArchetypeTier;   // opponent's tier, as built (treatment arm)
  staffedPlays: number;          // opponent's staffed-play count, as built (treatment arm)
  marginTreatment: number;       // opponent score - human score, treatment arm
  marginControl: number;         // opponent score - human score, control arm
  winTreatment: boolean;         // did the opponent win, treatment arm
  winControl: boolean;           // did the opponent win, control arm
  oppHome: boolean;              // was the opponent the home team (shared by both arms)
}

/**
 * Build the paired treatment/control games. `buildControl` defaults to
 * stripping the opponent's archetypes/playAssignments (the real --ab
 * treatment); tests pass an identity function (control === treatment) to
 * verify the harness itself reports a zero delta when there is no actual
 * difference between arms.
 */
export function runAbPairs(
  players: PlayerCardData[],
  nDrafts: number,
  seed: number,
  buildControl: (opponent: TeamInfo) => TeamInfo = stripIdentitiesAndPlays,
): ABPair[] {
  const pairs: ABPair[] = [];
  const draftRng = createRng(seed);
  const flipRng = createRng(seed ^ 0x9e3779b9);

  for (let d = 0; d < nDrafts; d++) {
    const draftSeed = Math.floor(draftRng.next() * 4294967296);
    const seats = runHeadlessDraft(players, PLAYS, draftSeed);
    const teams = buildTeams(seats);
    const human = teams[0];
    const opponents = teams.slice(1);

    opponents.forEach((opponentTreatment, oi) => {
      const opponentControl = buildControl(opponentTreatment);
      const oppHome = flipRng.next() < 0.5;
      const gameSeed = draftSeed + oi * 104729 + 7;

      const playTreatment = (opp: TeamInfo) =>
        simulateGame(oppHome ? opp : human, oppHome ? human : opp, { rng: createRng(gameSeed) });

      const gT = playTreatment(opponentTreatment);
      const gC = playTreatment(opponentControl);

      const oppScoreT = oppHome ? gT.finalScore[0] : gT.finalScore[1];
      const humanScoreT = oppHome ? gT.finalScore[1] : gT.finalScore[0];
      const oppScoreC = oppHome ? gC.finalScore[0] : gC.finalScore[1];
      const humanScoreC = oppHome ? gC.finalScore[1] : gC.finalScore[0];

      pairs.push({
        identityTier: identityTierOf(opponentTreatment),
        staffedPlays: staffedPlayCountOf(opponentTreatment),
        marginTreatment: oppScoreT - humanScoreT,
        marginControl: oppScoreC - humanScoreC,
        winTreatment: oppScoreT > humanScoreT,
        winControl: oppScoreC > humanScoreC,
        oppHome,
      });
    });
  }

  return pairs;
}

function fmtDelta(n: number): string {
  return `${n >= 0 ? '+' : ''}${n.toFixed(2)}`;
}

function reportAb(pairs: ABPair[]): void {
  console.log(`\n=== Identities & Plays A/B (--ab, ${pairs.length} paired opponent-games) ===`);

  const marginDeltas = pairs.map((p) => p.marginTreatment - p.marginControl);
  const winT = pairs.filter((p) => p.winTreatment).length;
  const winC = pairs.filter((p) => p.winControl).length;
  console.log(`Mean margin delta (treatment - control): ${fmtDelta(mean(marginDeltas))}`);
  console.log(`Win-rate delta (treatment - control):    ${fmtDelta((100 * winT) / pairs.length - (100 * winC) / pairs.length)}pp  (treatment ${pct(winT, pairs.length)}, control ${pct(winC, pairs.length)})`);

  console.log('\nBy identity tier (opponent, as built):');
  for (const tier of ['none', 'online', 'dedicated'] as ArchetypeTier[]) {
    const bucket = pairs.filter((p) => p.identityTier === tier);
    if (bucket.length === 0) continue;
    const bMargin = mean(bucket.map((p) => p.marginTreatment - p.marginControl));
    const bWinT = bucket.filter((p) => p.winTreatment).length;
    const bWinC = bucket.filter((p) => p.winControl).length;
    console.log(
      `  ${tier.padEnd(10)} n=${bucket.length.toString().padEnd(5)} margin delta ${fmtDelta(bMargin).padEnd(8)} ` +
      `win-rate delta ${fmtDelta((100 * bWinT) / bucket.length - (100 * bWinC) / bucket.length)}pp`
    );
  }

  console.log('\nBy staffed-play count (opponent, as built):');
  const counts = Array.from(new Set(pairs.map((p) => p.staffedPlays))).sort((a, b) => a - b);
  for (const count of counts) {
    const bucket = pairs.filter((p) => p.staffedPlays === count);
    const bMargin = mean(bucket.map((p) => p.marginTreatment - p.marginControl));
    const bWinT = bucket.filter((p) => p.winTreatment).length;
    const bWinC = bucket.filter((p) => p.winControl).length;
    console.log(
      `  ${count} staffed  n=${bucket.length.toString().padEnd(5)} margin delta ${fmtDelta(bMargin).padEnd(8)} ` +
      `win-rate delta ${fmtDelta((100 * bWinT) / bucket.length - (100 * bWinC) / bucket.length)}pp`
    );
  }

  // Home vs away margin (treatment arm, opponent's margin, split by whether the
  // opponent was the home team for that matchup).
  const homePairs = pairs.filter((p) => p.oppHome);
  const awayPairs = pairs.filter((p) => !p.oppHome);
  console.log('\nHome vs away margin (treatment arm, opponent-side margin):');
  console.log(`  Opponent home: n=${homePairs.length}  mean margin ${fmtDelta(mean(homePairs.map((p) => p.marginTreatment)))}`);
  console.log(`  Opponent away: n=${awayPairs.length}  mean margin ${fmtDelta(mean(awayPairs.map((p) => p.marginTreatment)))}`);
}

function main(): void {
  const { games: n, seed, ab } = parseArgs(process.argv.slice(2));
  console.log(`Seed: ${seed}`);
  const t0 = Date.now();

  const players = loadPlayers();

  console.log(`\n=== League Rating Means (${players.length} cards) ===`);
  const ratingKeys = [
    'finishing', 'midRange', 'perimeter', 'playmaking',
    'rebounding', 'perimeterDefense', 'postDefense',
  ] as const;
  for (const key of ratingKeys) {
    const m = mean(players.map((p) => p.ratings[key] ?? 0));
    console.log(`  ${key.padEnd(18)} ${m.toFixed(2)}`);
  }

  console.log(`\nRunning ${n} headless games...`);
  const games = simulateMany(n, players, PLAYS, seed);
  const dt = Date.now() - t0;

  const allTeamScores: number[] = [];
  const margins: number[] = [];
  let homeWins = 0;
  let otGames = 0;
  let totalPoss = 0;
  let totalPoints = 0;
  let homePoss = 0, awayPoss = 0, homePts = 0, awayPts = 0;
  let inRange9030 = 0;

  for (const g of games) {
    allTeamScores.push(g.finalScore[0], g.finalScore[1]);
    margins.push(Math.abs(g.finalScore[0] - g.finalScore[1]));
    if (g.finalScore[0] > g.finalScore[1]) homeWins++;
    if (g.isOvertime) otGames++;

    totalPoss += g.possessions.length;
    totalPoints += g.finalScore[0] + g.finalScore[1];

    homePts += g.finalScore[0];
    awayPts += g.finalScore[1];
    homePoss += g.possessions.filter((p) => p.team === 'home').length;
    awayPoss += g.possessions.filter((p) => p.team === 'away').length;

    for (const s of g.finalScore) {
      if (s >= 90 && s <= 130) inRange9030++;
    }
  }

  const overallPPP = totalPoints / totalPoss;

  console.log(`\n=== Balance Report (${games.length} games, ${dt}ms) ===`);
  console.log(`Overall PPP:        ${overallPPP.toFixed(3)}`);
  console.log(`Home-side PPP:      ${(homePts / homePoss).toFixed(3)}`);
  console.log(`Away-side PPP:      ${(awayPts / awayPoss).toFixed(3)}`);
  console.log(`Team score mean:    ${mean(allTeamScores).toFixed(1)}`);
  console.log(`Team score median:  ${median(allTeamScores).toFixed(1)}`);
  console.log(`Team score sd:      ${sd(allTeamScores).toFixed(1)}`);
  console.log(`% scores in [90,130]: ${pct(inRange9030, allTeamScores.length)}`);
  console.log(`Home win %:         ${pct(homeWins, games.length)}`);
  console.log(`OT %:               ${pct(otGames, games.length)}`);
  console.log(`Mean total poss/game: ${(totalPoss / games.length).toFixed(1)}`);
  console.log(`Margin mean:        ${mean(margins).toFixed(1)}`);
  console.log(`Margin median:      ${median(margins).toFixed(1)}`);

  const { synergyCounts, playCounts, teamSamples } = activationRates(games);

  console.log('\n=== Synergy Activation Rates (sorted desc) ===');
  const sortedSyn = Object.entries(synergyCounts).sort((a, b) => b[1] - a[1]);
  for (const [name, count] of sortedSyn) {
    console.log(`  ${name.padEnd(24)} ${pct(count, teamSamples)}`);
  }

  console.log('\n=== Play Activation Rates ===');
  for (const [name, counts] of Object.entries(playCounts)) {
    const total = counts.full + counts.partial + counts.none;
    console.log(
      `  ${name.padEnd(24)} full ${pct(counts.full, total)}  ` +
      `partial ${pct(counts.partial, total)}  none ${pct(counts.none, total)}`
    );
  }

  console.log('\nMost common synergies:');
  for (const [name, count] of sortedSyn.slice(0, 3)) {
    console.log(`  ${name}: ${pct(count, teamSamples)}`);
  }
  console.log('Least common synergies:');
  for (const [name, count] of sortedSyn.slice(-3).reverse()) {
    console.log(`  ${name}: ${pct(count, teamSamples)}`);
  }

  reportPlayImpact(players, n, seed);

  if (ab) {
    const pairs = runAbPairs(players, n, seed);
    reportAb(pairs);
  }

  console.log('');
}

// Only run when executed directly (`tsx scripts/balance.ts ...`), not when
// imported as a module (e.g. by tests/unit/balance-ab.test.ts, which imports
// `runAbPairs` and must not trigger a full CLI run as a side effect).
const isDirectRun = (() => {
  try {
    return import.meta.url === pathToFileURL(process.argv[1] ?? '').href;
  } catch {
    return false;
  }
})();

if (isDirectRun) {
  main();
}
