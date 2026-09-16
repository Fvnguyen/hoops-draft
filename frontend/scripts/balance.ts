#!/usr/bin/env tsx
/**
 * Headless balance report.
 *
 * Usage: tsx scripts/balance.ts [games=500] [--seed N] [--ab] [--catalog] [--draft-impact] [--report]
 *        [--eff-scale X] [--max-shift Y]   (engine_possession_model D5 lever sweep: override
 *        EFFICIENCY_SCALE / MAX_EFF_SHIFT for this run only; the header prints both)
 *
 * Runs the same headless draft -> roster -> game pipeline as the vitest
 * suite (tests/unit/helpers.ts) and prints a compact tuning report: PPP,
 * score distribution, home-court/OT rates, possession counts, margins, and
 * synergy/play activation rates. Intended to replace the
 * play -> /debug -> export -> analyze loop for balance tuning.
 *
 * Pass --seed N to make the run reproducible: the same games (draft, pairing,
 * and simulation) are generated every time for a given seed + game count.
 *
 * --ab pairs every organic bot opponent against a stripped (no identity/plays)
 * copy of itself on the same seed, reporting the aggregate margin/win-rate
 * delta by identity tier and staffed-play count.
 *
 * --catalog measures EVERY play and identity individually (not just 3 sample
 * plays), pairing X = how hard it is to get (organic full-activation / dedicated
 * rate) with Y = how much it's worth when active (isolated win%/margin delta
 * vs an identical roster without it). Writes `data/game_logs/catalog_report_*.json`
 * for building the report.md canvas plotting the two.
 *
 * --draft-impact (game_engine D10) drafts with three synthetic pick strategies instead
 * of the real bot AI (best-OVR, highest-rarity, random — see engine/draft.ts for the
 * actual product bot behavior, untouched here), plays a full round robin among the
 * resulting 8 teams, and reports win rate/margin by strategy alone and by strategy x
 * identity-tier x staffed-play-count — how much drafting well, building the lineup well,
 * and chance each contribute to winning.
 *
 * --report (game_engine D11) is the one command to run after a tuning pass: merges the
 * base spread numbers, --catalog, and --draft-impact into one versioned
 * `data/game_logs/balance_report_*.json` (schemaVersion 2: catalog/draftImpact/spread/
 * outcomeDecomposition sections) — the source for the Power Curve artifact.
 * outcomeDecomposition splits "opponent was just better" (real OVR-gap talent, knowable
 * from the roster) from home/away and true per-possession noise, at both the single-game
 * and full-7-game-season level. `--ab`/`--catalog`/`--draft-impact` stay as focused flags
 * for a quick single-question loop; `--report` is what ships.
 */

import { loadPlayers, PLAYS, simulateMany, activationRates, runHeadlessDraft, buildTeams } from '../tests/unit/helpers';
import { randomSeed, createRng, type Rng } from '../src/engine/rng';
import { PLAYBOOK, isEligibleForRole, evaluatePlaybook, type PlayAssignment, type PlayRole } from '../src/engine/playbook';
import { simulateGame, type TeamInfo, type GameTheater, type EdgeTuning } from '../src/engine/game';
import { lineupValue } from '../src/engine/lineup';
import { evaluateArchetypes, ARCHETYPES, type ArchetypeTier, type ArchetypeDef, type ArchetypeSelection, type Color } from '../src/engine/archetypes';
import { generateCubePool } from '../src/engine/draft';
import { buildBotRoster, type DraftSessionSeat } from '../src/engine/deckbuilder';
import { CUBE_PLAYER_CARDS_PER_PACK, RATING_DIMS, LINEUP_CENTRE, LINEUP_AGG, EFFICIENCY_SCALE, MAX_EFF_SHIFT } from '../src/engine/balance';
import type { PlayerCardData, Play, DraftCard } from '../src/engine/types';
import { pathToFileURL } from 'url';
import fs from 'fs';
import path from 'path';

function parseArgs(argv: string[]): { games: number; seed: number; ab: boolean; catalog: boolean; draftImpact: boolean; report: boolean; tuning: EdgeTuning } {
  const tuning: EdgeTuning = {};
  let games = 500;
  let seed: number | undefined;
  let ab = false;
  let catalog = false;
  let draftImpact = false;
  let report = false;

  const positional: string[] = [];
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === '--eff-scale') {
      tuning.efficiencyScale = Number(argv[++i]);
    } else if (argv[i] === '--max-shift') {
      tuning.maxEffShift = Number(argv[++i]);
    } else if (argv[i] === '--seed') {
      seed = parseInt(argv[++i], 10);
    } else if (argv[i] === '--ab') {
      ab = true;
    } else if (argv[i] === '--catalog') {
      catalog = true;
    } else if (argv[i] === '--draft-impact') {
      draftImpact = true;
    } else if (argv[i] === '--report') {
      report = true;
    } else {
      positional.push(argv[i]);
    }
  }
  if (positional[0]) games = parseInt(positional[0], 10);

  return { games, seed: seed ?? randomSeed(), ab, catalog, draftImpact, report, tuning };
}

/** T8 (D11): the `spread` section of balance_report_*.json — same numbers the plain
 *  console run already prints, just structured for reuse. */
export interface SpreadSummary {
  games: number;
  overallPPP: number;
  homePPP: number;
  awayPPP: number;
  scoreMean: number;
  scoreMedian: number;
  scoreSd: number;
  pctIn90130: number;
  homeWinPct: number;
  otPct: number;
  meanPossPerGame: number;
  marginMean: number;
  marginMedian: number;
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

function corr(x: number[], y: number[]): number {
  const mx = mean(x), my = mean(y);
  let num = 0, dx2 = 0, dy2 = 0;
  for (let i = 0; i < x.length; i++) {
    const dx = x[i] - mx, dy = y[i] - my;
    num += dx * dy; dx2 += dx * dx; dy2 += dy * dy;
  }
  const denom = Math.sqrt(dx2 * dy2);
  return denom > 0 ? num / denom : 0;
}

/**
 * Owner request (2026-09-14): "does game_mechanics make sense" needs opponent talent
 * split out of the undifferentiated luck bucket, not lumped in with it. Small hand-rolled
 * OLS (normal equations + Gaussian elimination) rather than a dependency — a handful of
 * predictors over a few thousand rows doesn't need a stats library.
 */
function solveLinear(A: number[][], b: number[]): number[] {
  const n = b.length;
  const M = A.map((row, i) => [...row, b[i]]);
  for (let col = 0; col < n; col++) {
    let pivot = col;
    for (let r = col + 1; r < n; r++) if (Math.abs(M[r][col]) > Math.abs(M[pivot][col])) pivot = r;
    [M[col], M[pivot]] = [M[pivot], M[col]];
    const pv = M[col][col];
    if (Math.abs(pv) < 1e-9) continue; // near-singular column (e.g. an empty dummy) — leave at 0
    for (let r = 0; r < n; r++) {
      if (r === col) continue;
      const factor = M[r][col] / pv;
      for (let c = col; c <= n; c++) M[r][c] -= factor * M[col][c];
    }
  }
  return M.map((row, i) => (Math.abs(row[i]) > 1e-9 ? row[n] / row[i] : 0));
}

/** R² of an OLS fit of `y` on design matrix `X` (each row already includes the intercept
 *  column of 1s). */
function r2Of(X: number[][], y: number[]): number {
  const p = X[0].length;
  const XtX: number[][] = Array.from({ length: p }, () => new Array(p).fill(0));
  const Xty: number[] = new Array(p).fill(0);
  for (let r = 0; r < X.length; r++) {
    for (let a = 0; a < p; a++) {
      Xty[a] += X[r][a] * y[r];
      for (let b = 0; b < p; b++) XtX[a][b] += X[r][a] * X[r][b];
    }
  }
  const beta = solveLinear(XtX, Xty);
  const yMean = mean(y);
  let ssTot = 0, ssRes = 0;
  for (let i = 0; i < y.length; i++) {
    const pred = X[i].reduce((s, v, k) => s + v * beta[k], 0);
    ssRes += (y[i] - pred) ** 2;
    ssTot += (y[i] - yMean) ** 2;
  }
  return ssTot > 0 ? 1 - ssRes / ssTot : 0;
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

/** A single fixed opponent (5 starters, no assignments), reused across every comparison
 *  so the only thing that varies between arms is the side under test. */
function buildPlainOpponent(players: PlayerCardData[], seatId: string): TeamInfo {
  const used = new Set<string>();
  const starters = POSITIONS.map(() => bestEligiblePlayer(players, NO_BADGE_ROLE, used)!);
  const depthChart: Record<string, string[]> = {};
  POSITIONS.forEach((pos, i) => { depthChart[pos] = [starters[i].id]; });
  return makeTeamInfo(seatId, starters, depthChart);
}

export interface CatalogEntry {
  kind: 'play' | 'identity';
  id: string;
  name: string;
  side: string;
  rarity?: string;
  tierAchieved?: ArchetypeTier;
  /** X-axis: how hard this is to get, from organic games/drafts (0-1). */
  activationRate: number;
  /** Y-axis: win-rate lift when active vs an identical roster without it (0-1, e.g. 0.05 = +5pp). */
  winPctDelta: number;
  marginDelta: number;
}

function reportPlayImpact(players: PlayerCardData[], n: number, seed: number, playActivation: Record<string, { full: number; partial: number; none: number }>): CatalogEntry[] {
  console.log('\n=== Play Impact (fixed roster, best eligible players vs inactive) ===');
  const opponent = buildPlainOpponent(players, 'play-impact-opponent');
  const entries: CatalogEntry[] = [];

  const playIds = Object.keys(PLAYBOOK).filter((id) => PLAYBOOK[id].rarity !== 'Basic');
  for (const playId of playIds) {
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

    const winWith = winPctSide(gamesWith, 'home');
    const winWithout = winPctSide(gamesWithout, 'home');
    const counts = playActivation[def.name];
    const activationRate = counts ? counts.full / (counts.full + counts.partial + counts.none) : 0;

    console.log(`\n${def.name} (${playId}, ${def.side}, ${(def.allocation * 100).toFixed(0)}% allocation) — ${n} games each, full-activation rate ${pct(counts?.full ?? 0, (counts?.full ?? 0) + (counts?.partial ?? 0) + (counts?.none ?? 0))}`);
    console.log(`  win%       with ${pct(winWith * n, n)}  without ${pct(winWithout * n, n)}`);
    console.log(`  PPP (own)  with ${pppSide(gamesWith, 'home').toFixed(3)}  without ${pppSide(gamesWithout, 'home').toFixed(3)}`);
    console.log(`  PPP (opp)  with ${pppSide(gamesWith, 'away').toFixed(3)}  without ${pppSide(gamesWithout, 'away').toFixed(3)}`);

    entries.push({
      kind: 'play', id: playId, name: def.name, side: def.side, rarity: def.rarity,
      activationRate,
      winPctDelta: winWith - winWithout,
      marginDelta: mean(gamesWith.map((g) => g.finalScore[0] - g.finalScore[1])) - mean(gamesWithout.map((g) => g.finalScore[0] - g.finalScore[1])),
    });
  }
  return entries;
}

// ── Identity impact + activation rate (report.md canvas data) ──────────────
//
// Mirrors reportPlayImpact's isolate-one-thing technique, but for archetypes:
// build a roster of the best available carriers of the archetype's colour(s)
// (up to 10 players, 5 starters, so two-colour/gold "distinct carrier" and
// "starters" thresholds are reachable — a 5-man no-bench roster caps out at 5
// distinct carriers, below the 6-7 gold/two-colour dedicated requirement),
// then compare that roster with the identity selected vs the identical roster
// with no archetype selected at all.

function badgeLevel(p: PlayerCardData, color: Color): number {
  return (p.traits ?? []).find((t) => t.name === color)?.level ?? 0;
}

function hasTrait(p: PlayerCardData, names: string[] | undefined): boolean {
  if (!names?.length) return false;
  return (p.traits ?? []).some((t) => names.includes(t.name));
}

function buildFixedRosterForArchetype(pool: PlayerCardData[], def: ArchetypeDef): { players: PlayerCardData[]; starterIds: Set<string>; depthChart: Record<string, string[]> } {
  const colors = [def.colors.primary, def.colors.support, def.colors.tertiary].filter((c): c is Color => !!c);
  const weight = (p: PlayerCardData) => {
    const colorScore = colors.reduce((sum, c, i) => sum + badgeLevel(p, c) * (colors.length - i), 0);
    const keystoneBonus = def.keystones && hasTrait(p, def.keystones) ? 5 : 0;
    return colorScore + keystoneBonus;
  };
  const chosen = [...pool].sort((a, b) => weight(b) - weight(a)).slice(0, 10);
  const depthChart: Record<string, string[]> = {};
  POSITIONS.forEach((pos, i) => { depthChart[pos] = [chosen[i], chosen[i + 5]].filter(Boolean).map((p) => p.id); });
  return { players: chosen, starterIds: new Set(chosen.slice(0, 5).map((p) => p.id)), depthChart };
}

function selectionFor(def: ArchetypeDef): ArchetypeSelection {
  return def.kind === 'gold' ? { gold: def.id } : def.side === 'defense' ? { defense: def.id } : { offense: def.id };
}

/** Online/dedicated rate for every archetype across organic (drafted) bot/human rosters — no
 *  game sim needed, archetype tier depends only on roster composition. This is the "how hard
 *  is this to unlock at all" activation-difficulty proxy, independent of whether a roster that
 *  unlocked it actually chose to run it. */
function archetypeActivationRates(players: PlayerCardData[], nDrafts: number, seed: number): Record<string, { online: number; dedicated: number; total: number }> {
  const rates: Record<string, { online: number; dedicated: number; total: number }> = {};
  ARCHETYPES.forEach((def) => { rates[def.id] = { online: 0, dedicated: 0, total: 0 }; });
  const draftRng = createRng(seed ^ 0x2545f491);

  for (let d = 0; d < nDrafts; d++) {
    const draftSeed = Math.floor(draftRng.next() * 4294967296);
    const seats = runHeadlessDraft(players, PLAYS, draftSeed);
    const teams = buildTeams(seats);
    teams.forEach((team) => {
      const statuses = evaluateArchetypes(team.players, new Set(team.starters));
      statuses.forEach((s) => {
        const r = rates[s.def.id];
        r.total++;
        if (s.tier === 'online' || s.tier === 'dedicated') r.online++;
        if (s.tier === 'dedicated') r.dedicated++;
      });
    });
  }
  return rates;
}

function reportArchetypeImpact(
  players: PlayerCardData[],
  n: number,
  seed: number,
  activation: Record<string, { online: number; dedicated: number; total: number }>,
): CatalogEntry[] {
  console.log('\n=== Identity Impact (fixed roster, best-available carriers vs no identity) ===');
  const opponent = buildPlainOpponent(players, 'identity-impact-opponent');
  const entries: CatalogEntry[] = [];

  for (const def of ARCHETYPES) {
    const { players: rosterPlayers, starterIds, depthChart } = buildFixedRosterForArchetype(players, def);
    const status = evaluateArchetypes(rosterPlayers, starterIds).find((s) => s.def.id === def.id)!;
    const selection = selectionFor(def);

    const withIdentity: TeamInfo = { ...makeTeamInfo(`${def.id}-with`, rosterPlayers, depthChart), archetypes: selection };
    const withoutIdentity: TeamInfo = { ...makeTeamInfo(`${def.id}-without`, rosterPlayers, depthChart), archetypes: {} };

    const gamesWith: GameTheater[] = [];
    const gamesWithout: GameTheater[] = [];
    for (let i = 0; i < n; i++) {
      const gameSeed = seed + i * 7919 + 2;
      gamesWith.push(simulateGame(withIdentity, opponent, { rng: createRng(gameSeed) }));
      gamesWithout.push(simulateGame(withoutIdentity, opponent, { rng: createRng(gameSeed) }));
    }

    const winWith = winPctSide(gamesWith, 'home');
    const winWithout = winPctSide(gamesWithout, 'home');
    const rate = activation[def.id];
    const activationRate = rate ? rate.dedicated / rate.total : 0;

    console.log(
      `\n${def.name} (${def.id}, ${def.kind}/${def.side}) — best-case tier reached: ${status.tier}` +
      (status.tier !== 'dedicated' ? ' (could not build a Dedicated roster from this pool)' : '') +
      `, dedicated-rate in organic drafts ${pct(rate?.dedicated ?? 0, rate?.total ?? 0)}`
    );
    console.log(`  win%   with ${pct(winWith * n, n)}  without ${pct(winWithout * n, n)}`);

    entries.push({
      kind: 'identity', id: def.id, name: def.name, side: def.side, rarity: def.kind,
      tierAchieved: status.tier,
      activationRate,
      winPctDelta: winWith - winWithout,
      marginDelta: mean(gamesWith.map((g) => g.finalScore[0] - g.finalScore[1])) - mean(gamesWithout.map((g) => g.finalScore[0] - g.finalScore[1])),
    });
  }
  return entries;
}

function writeCatalogReport(entries: CatalogEntry[], seed: number, n: number): void {
  const dir = path.resolve(process.cwd(), '..', 'data', 'game_logs');
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
  const filepath = path.join(dir, `catalog_report_${timestamp}.json`);
  fs.writeFileSync(filepath, JSON.stringify({ generatedAt: new Date().toISOString(), seed, gamesPerEntry: n, entries }, null, 2), 'utf-8');
  console.log(`\nCatalog report written to ${filepath}`);
}

// ── Draft-impact analytics (--draft-impact, D10) ────────────────────────────
//
// Three synthetic pick strategies, distinct from the real bot AI in engine/draft.ts
// (draft_ai's, untouched): best-OVR (highest ratings.overall), highest-rarity
// (Mythic > Rare > Uncommon > Common, OVR tiebreak), random (seeded uniform). Each of
// the 8 seats per draft gets one via (seatIndex + draftIndex) % 3 so counts balance
// exactly over many drafts, not approximately. A full round robin among the resulting 8
// teams reports win rate/margin by strategy alone and by strategy x identity-tier x
// staffed-play-count, separating how much drafting well, building the lineup well, and
// chance each contribute to winning.

type DraftStrategy = 'best-ovr' | 'highest-rarity' | 'random';
const DRAFT_STRATEGIES: DraftStrategy[] = ['best-ovr', 'highest-rarity', 'random'];
const RARITY_RANK: Record<string, number> = { Mythic: 4, Rare: 3, Uncommon: 2, Common: 1, Basic: 0 };

function overallOf(card: DraftCard): number {
  return card.type === 'Player' ? (card.ratings?.overall ?? 0) : -1;
}

/** One card from `pack` per `strategy`. Ties broken by OVR where that's meaningful
 *  (a Play card has no OVR, so it only wins a rarity tie against another Play). */
function pickCard(strategy: DraftStrategy, pack: DraftCard[], rng: Rng): DraftCard {
  if (strategy === 'random') return pack[Math.floor(rng.next() * pack.length)];

  if (strategy === 'best-ovr') {
    const players = pack.filter((c): c is PlayerCardData => c.type === 'Player');
    const pool = players.length ? players : pack;
    return [...pool].sort((a, b) => overallOf(b) - overallOf(a))[0];
  }

  // highest-rarity
  const maxRank = Math.max(...pack.map((c) => RARITY_RANK[c.rarity] ?? 0));
  const topRarity = pack.filter((c) => (RARITY_RANK[c.rarity] ?? 0) === maxRank);
  return [...topRarity].sort((a, b) => overallOf(b) - overallOf(a))[0];
}

/** Mirrors runHeadlessDraft's pack-passing mechanics (tests/unit/helpers.ts) exactly,
 *  swapping the real bot AI (getBotPick) for a per-seat synthetic strategy. Returns
 *  seats ready for buildTeams, plus which strategy each seat drafted under. */
function runStrategyDraft(players: PlayerCardData[], plays: Play[], seed: number, draftIndex: number): { seats: DraftSessionSeat[]; strategies: DraftStrategy[] } {
  const rng = createRng(seed);
  const allPacks = generateCubePool(players, plays, rng);
  const strategies = Array.from({ length: 8 }, (_, i) => DRAFT_STRATEGIES[(i + draftIndex) % 3]);

  const seats = Array.from({ length: 8 }, (_, i) => ({
    id: i === 0 ? 'human-0' : `bot-${i}`,
    drafted: [] as DraftCard[],
    currentPack: allPacks[i] || [],
  }));

  for (let packNumber = 1; packNumber <= 3; packNumber++) {
    for (let pickNumber = 1; pickNumber <= CUBE_PLAYER_CARDS_PER_PACK + 1; pickNumber++) {
      for (let i = 0; i < 8; i++) {
        const seat = seats[i];
        if (seat.currentPack.length === 0) continue;
        const picked = pickCard(strategies[i], seat.currentPack, rng);
        const idx = seat.currentPack.findIndex((c) => c.id === picked.id);
        if (idx !== -1) seat.drafted.push(seat.currentPack.splice(idx, 1)[0]);
      }

      // Pass packs: pack 2 passes right (+1), packs 1 & 3 pass left (-1) — same rotation
      // as the real draft (useDraftEngine.ts / runHeadlessDraft).
      const packDirection = packNumber === 2 ? 1 : -1;
      const rotated: DraftCard[][] = new Array(8);
      for (let i = 0; i < 8; i++) {
        let target = (i + packDirection) % 8;
        if (target < 0) target += 8;
        rotated[target] = seats[i].currentPack;
      }
      for (let i = 0; i < 8; i++) seats[i].currentPack = rotated[i];
    }
    if (packNumber < 3) {
      const packOffset = packNumber * 8;
      for (let i = 0; i < 8; i++) seats[i].currentPack = allPacks[packOffset + i] || [];
    }
  }

  const draftSeats: DraftSessionSeat[] = seats.map((seat) => ({
    id: seat.id, isBot: true, drafted: seat.drafted,
    builtRoster: buildBotRoster(seat.drafted),
  }));

  return { seats: draftSeats, strategies };
}

export interface DraftImpactEntry {
  strategy: DraftStrategy;
  tier: ArchetypeTier;
  staffed: number;
  won: boolean;
  margin: number;
  /** This team's mean roster OVR minus the opponent's, for this one game — raw talent,
   *  no archetype/play bonuses folded in. Owner request (2026-09-14): split "the other
   *  team was just better" (knowable in advance from the roster) out of "true" per-game
   *  noise, instead of lumping both into one undifferentiated residual. */
  ovrGap: number;
  isHome: boolean;
}

/** One drafted team's full round-robin season (7 games, one per other team in the pod —
 *  the same length as a real in-app season). Owner request (2026-09-14): identity/tier/
 *  staffed-plays are fixed for a team all season, so this is the season-level analogue of
 *  DraftImpactEntry — did skill/talent predict winning over 7 games, not just one. */
export interface TeamSeasonRecord {
  strategy: DraftStrategy;
  tier: ArchetypeTier;
  staffed: number;
  ovr: number;
  /** This team's OVR minus the mean OVR of the 7 teams it actually played (all other
   *  teams in an 8-team round robin) — the season-length analogue of a single game's
   *  ovrGap. */
  seasonOvrGap: number;
  seasonWins: number;
}

function teamOvrOf(team: TeamInfo): number {
  return mean(team.players.map((p) => p.ratings?.overall ?? 0));
}

/** Runs `nDrafts` synthetic drafts, plays a full round robin (28 games) among each
 *  draft's 8 teams, and records one entry per team-game plus one season record per team. */
export function runDraftImpact(players: PlayerCardData[], plays: Play[], nDrafts: number, seed: number): { entries: DraftImpactEntry[]; seasons: TeamSeasonRecord[] } {
  const entries: DraftImpactEntry[] = [];
  const seasons: TeamSeasonRecord[] = [];

  for (let d = 0; d < nDrafts; d++) {
    const draftSeed = seed + d * 7919 + 5;
    const { seats, strategies } = runStrategyDraft(players, plays, draftSeed, d);
    const teams = buildTeams(seats);
    const ovrs = teams.map(teamOvrOf);
    const tiers = teams.map(identityTierOf);
    const staffedCounts = teams.map(staffedPlayCountOf);
    const seasonWins = new Array(teams.length).fill(0);

    for (let i = 0; i < teams.length; i++) {
      for (let j = i + 1; j < teams.length; j++) {
        const gameSeed = draftSeed + i * 97 + j * 13 + 3;
        const iHome = (i + j) % 2 === 0;
        const home = iHome ? teams[i] : teams[j];
        const away = iHome ? teams[j] : teams[i];
        const g = simulateGame(home, away, { rng: createRng(gameSeed) });
        const [homeScore, awayScore] = g.finalScore;
        const iScore = iHome ? homeScore : awayScore;
        const jScore = iHome ? awayScore : homeScore;
        const iWon = iScore > jScore;
        if (iWon) seasonWins[i]++; else seasonWins[j]++;

        entries.push({ strategy: strategies[i], tier: tiers[i], staffed: staffedCounts[i], won: iWon, margin: iScore - jScore, ovrGap: ovrs[i] - ovrs[j], isHome: iHome });
        entries.push({ strategy: strategies[j], tier: tiers[j], staffed: staffedCounts[j], won: !iWon, margin: jScore - iScore, ovrGap: ovrs[j] - ovrs[i], isHome: !iHome });
      }
    }

    const totalOvr = ovrs.reduce((s, v) => s + v, 0);
    for (let i = 0; i < teams.length; i++) {
      const meanOthers = (totalOvr - ovrs[i]) / (teams.length - 1);
      seasons.push({ strategy: strategies[i], tier: tiers[i], staffed: staffedCounts[i], ovr: ovrs[i], seasonOvrGap: ovrs[i] - meanOthers, seasonWins: seasonWins[i] });
    }
  }

  return { entries, seasons };
}

export interface DraftImpactByStrategy {
  strategy: DraftStrategy;
  winPct: number;
  avgMargin: number;
  n: number;
}

export interface DraftImpactByStrategyTierStaffed extends DraftImpactByStrategy {
  tier: ArchetypeTier;
  staffed: number;
}

export interface DraftImpactSummary {
  totalTeamGames: number;
  byStrategy: DraftImpactByStrategy[];
  /** n>=10 buckets only — smaller buckets are too noisy to report. */
  byStrategyTierStaffed: DraftImpactByStrategyTierStaffed[];
}

/** T8 (D11): builds the structured summary once; reportDraftImpact and writeReport both
 *  render it (console text, or as the draftImpact section of balance_report_*.json). */
function summarizeDraftImpact(entries: DraftImpactEntry[]): DraftImpactSummary {
  const byStrategy = DRAFT_STRATEGIES.map((strategy) => {
    const bucket = entries.filter((e) => e.strategy === strategy);
    return { strategy, winPct: bucket.length ? bucket.filter((e) => e.won).length / bucket.length : 0, avgMargin: mean(bucket.map((e) => e.margin)), n: bucket.length };
  });

  const tiers: ArchetypeTier[] = ['none', 'online', 'dedicated'];
  const staffedCounts = Array.from(new Set(entries.map((e) => e.staffed))).sort((a, b) => a - b);
  const byStrategyTierStaffed: DraftImpactByStrategyTierStaffed[] = [];
  for (const strategy of DRAFT_STRATEGIES) {
    for (const tier of tiers) {
      for (const staffed of staffedCounts) {
        const bucket = entries.filter((e) => e.strategy === strategy && e.tier === tier && e.staffed === staffed);
        if (bucket.length < 10) continue;
        byStrategyTierStaffed.push({ strategy, tier, staffed, winPct: bucket.filter((e) => e.won).length / bucket.length, avgMargin: mean(bucket.map((e) => e.margin)), n: bucket.length });
      }
    }
  }

  return { totalTeamGames: entries.length, byStrategy, byStrategyTierStaffed };
}

function reportDraftImpact(summary: DraftImpactSummary): void {
  console.log(`\n=== Draft Impact by Strategy (--draft-impact, ${summary.totalTeamGames} team-games) ===`);

  console.log('\nBy strategy alone:');
  for (const row of summary.byStrategy) {
    console.log(`  ${row.strategy.padEnd(16)} win% ${pct(row.winPct * row.n, row.n).padEnd(6)} avg margin ${fmtDelta(row.avgMargin).padEnd(7)} (n=${row.n})`);
  }

  console.log('\nBy strategy x identity tier x staffed-play count (n>=10 only):');
  for (const row of summary.byStrategyTierStaffed) {
    console.log(
      `  ${row.strategy.padEnd(16)} ${row.tier.padEnd(10)} ${row.staffed} staffed  win% ${pct(row.winPct * row.n, row.n).padEnd(6)} ` +
      `avg margin ${fmtDelta(row.avgMargin).padEnd(7)} (n=${row.n})`
    );
  }
}

export interface OutcomeDecomposition {
  singleGame: {
    ovrGapMarginCorr: number;
    ovrGapMarginR2: number;
    winPctByOvrGapDecile: { avgGap: number; winPct: number; n: number }[];
    varianceExplainedPct: { talent: number; home: number; strategy: number; lineup: number; unexplained: number };
  };
  season: {
    ovrGapWinsCorr: number;
    ovrGapWinsR2: number;
    varianceExplainedPct: { talent: number; strategy: number; lineup: number; unexplained: number };
  };
}

/**
 * Owner request (2026-09-14): the draft-impact strategy-only decomposition lumped
 * "the other team was just better" (knowable in advance from the roster — not luck) in
 * with true per-possession randomness. This splits them out, at both the single-game
 * level and over a full 7-game round robin (the same length as an in-app season) — the
 * question being whether game_mechanics behave sensibly (talent should predict winning)
 * independent of any card-content/rarity balance question. Folded into the unified
 * report (D11) so every `--report` run tracks this, not just a one-off console check.
 */
function reportOutcomeDecomposition(entries: DraftImpactEntry[], seasons: TeamSeasonRecord[]): OutcomeDecomposition {
  console.log('\n=== What Decides a Game vs. a Season (talent vs. home/away vs. choice vs. noise) ===');

  const gaps = entries.map((e) => e.ovrGap);
  const margins = entries.map((e) => e.margin);
  const won = entries.map((e) => (e.won ? 1 : 0));
  console.log(`\nSingle game: OVR gap <-> margin correlation r=${corr(gaps, margins).toFixed(3)} (r^2=${(corr(gaps, margins) ** 2 * 100).toFixed(1)}%)`);

  console.log('Win% by OVR-gap decile (this team\'s OVR minus its opponent\'s, weakest -> strongest matchup):');
  const byGap = entries.map((e, i) => ({ gap: gaps[i], won: won[i] })).sort((a, b) => a.gap - b.gap);
  const bucketSize = Math.floor(byGap.length / 10);
  const winPctByOvrGapDecile: { avgGap: number; winPct: number; n: number }[] = [];
  for (let i = 0; i < 10; i++) {
    const bucket = byGap.slice(i * bucketSize, i === 9 ? byGap.length : (i + 1) * bucketSize);
    const avgGap = mean(bucket.map((b) => b.gap));
    const w = bucket.filter((b) => b.won).length;
    console.log(`  decile ${(i + 1).toString().padStart(2)}: avg gap ${fmtDelta(avgGap).padEnd(7)} OVR -> win% ${pct(w, bucket.length)}`);
    winPctByOvrGapDecile.push({ avgGap, winPct: w / bucket.length, n: bucket.length });
  }

  // Hierarchical R^2: each row is the ADDITIONAL variance explained beyond the rows above.
  const homeCol = entries.map((e) => (e.isHome ? 1 : 0));
  const stratBest = entries.map((e) => (e.strategy === 'best-ovr' ? 1 : 0));
  const stratRarity = entries.map((e) => (e.strategy === 'highest-rarity' ? 1 : 0));
  const tierOnline = entries.map((e) => (e.tier === 'online' ? 1 : 0));
  const tierDedicated = entries.map((e) => (e.tier === 'dedicated' ? 1 : 0));
  const staffedCol = entries.map((e) => e.staffed);
  const buildX = (cols: number[][]) => entries.map((_, i) => [1, ...cols.map((c) => c[i])]);

  const rTalent = r2Of(buildX([gaps]), won);
  const rTalentHome = r2Of(buildX([gaps, homeCol]), won);
  const rTalentHomeStrategy = r2Of(buildX([gaps, homeCol, stratBest, stratRarity]), won);
  const rFull = r2Of(buildX([gaps, homeCol, stratBest, stratRarity, tierOnline, tierDedicated, staffedCol]), won);

  console.log('\nSingle-game variance in who wins, decomposed (order matters, each row is additional):');
  console.log(`  Opponent talent gap (OVR, no archetypes/plays): ${(rTalent * 100).toFixed(1)}%`);
  console.log(`  + Home/away:                                    +${((rTalentHome - rTalent) * 100).toFixed(1)}%`);
  console.log(`  + Draft strategy, beyond what it does to talent: +${((rTalentHomeStrategy - rTalentHome) * 100).toFixed(1)}%`);
  console.log(`  + Lineup construction (tier + staffed plays):    +${((rFull - rTalentHomeStrategy) * 100).toFixed(1)}%`);
  console.log(`  Unexplained (opponent draw aside, true noise):   ${((1 - rFull) * 100).toFixed(1)}%`);

  // Season level: same decomposition, y = wins out of 7.
  const seasonGaps = seasons.map((s) => s.seasonOvrGap);
  const seasonWins = seasons.map((s) => s.seasonWins);
  console.log(`\nFull season (7 games, same length as an in-app season): OVR gap <-> season wins correlation r=${corr(seasonGaps, seasonWins).toFixed(3)} (r^2=${(corr(seasonGaps, seasonWins) ** 2 * 100).toFixed(1)}%)`);

  const seasonStratBest = seasons.map((s) => (s.strategy === 'best-ovr' ? 1 : 0));
  const seasonStratRarity = seasons.map((s) => (s.strategy === 'highest-rarity' ? 1 : 0));
  const seasonTierOnline = seasons.map((s) => (s.tier === 'online' ? 1 : 0));
  const seasonTierDedicated = seasons.map((s) => (s.tier === 'dedicated' ? 1 : 0));
  const seasonStaffed = seasons.map((s) => s.staffed);
  const buildSeasonX = (cols: number[][]) => seasons.map((_, i) => [1, ...cols.map((c) => c[i])]);

  const sTalent = r2Of(buildSeasonX([seasonGaps]), seasonWins);
  const sTalentStrategy = r2Of(buildSeasonX([seasonGaps, seasonStratBest, seasonStratRarity]), seasonWins);
  const sFull = r2Of(buildSeasonX([seasonGaps, seasonStratBest, seasonStratRarity, seasonTierOnline, seasonTierDedicated, seasonStaffed]), seasonWins);

  console.log('\nSeason win-total (0-7) variance, decomposed the same way (no per-game home/away term —');
  console.log('home/opponent alternates across a season, per season.ts\'s scheduler):');
  console.log(`  Opponent talent gap (OVR):                       ${(sTalent * 100).toFixed(1)}%`);
  console.log(`  + Draft strategy, beyond what it does to talent: +${((sTalentStrategy - sTalent) * 100).toFixed(1)}%`);
  console.log(`  + Lineup construction (tier + staffed plays):    +${((sFull - sTalentStrategy) * 100).toFixed(1)}%`);
  console.log(`  Unexplained (residual noise across the season):  ${((1 - sFull) * 100).toFixed(1)}%`);

  const gapMarginR = corr(gaps, margins);
  const seasonR = corr(seasonGaps, seasonWins);
  return {
    singleGame: {
      ovrGapMarginCorr: gapMarginR,
      ovrGapMarginR2: gapMarginR ** 2,
      winPctByOvrGapDecile,
      varianceExplainedPct: {
        talent: rTalent * 100,
        home: (rTalentHome - rTalent) * 100,
        strategy: (rTalentHomeStrategy - rTalentHome) * 100,
        lineup: (rFull - rTalentHomeStrategy) * 100,
        unexplained: (1 - rFull) * 100,
      },
    },
    season: {
      ovrGapWinsCorr: seasonR,
      ovrGapWinsR2: seasonR ** 2,
      varianceExplainedPct: {
        talent: sTalent * 100,
        strategy: (sTalentStrategy - sTalent) * 100,
        lineup: (sFull - sTalentStrategy) * 100,
        unexplained: (1 - sFull) * 100,
      },
    },
  };
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

// ── Unified report (--report, D11) ──────────────────────────────────────────

const REPORT_SCHEMA_VERSION = 2; // v2 (2026-09-14): added outcomeDecomposition (talent/home/strategy/lineup split)

function writeUnifiedReport(
  seed: number,
  catalog: CatalogEntry[],
  draftImpact: DraftImpactSummary,
  spread: SpreadSummary,
  outcomeDecomposition: OutcomeDecomposition,
): void {
  const dir = path.resolve(process.cwd(), '..', 'data', 'game_logs');
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
  const filepath = path.join(dir, `balance_report_${timestamp}.json`);
  const report = { schemaVersion: REPORT_SCHEMA_VERSION, generatedAt: new Date().toISOString(), seed, catalog, draftImpact, spread, outcomeDecomposition };
  fs.writeFileSync(filepath, JSON.stringify(report, null, 2), 'utf-8');
  console.log(`\nUnified report written to ${filepath}`);
}

function main(): void {
  const { games: n, seed, ab, catalog, draftImpact, report, tuning } = parseArgs(process.argv.slice(2));
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

  // engine_possession_model D3: the centre each channel edge is measured from. Printed so
  // LINEUP_CENTRE in balance.ts can be regenerated (the unit test allows ±1.5 drift).
  console.log(`\n=== Lineup centres (20,000 seeded random 5-man lineups, rotation mpg>=15) ===`);
  console.log(`  ${'dimension'.padEnd(18)} ${'k'.padStart(5)} ${'measured'.padStart(9)} ${'balance.ts'.padStart(11)}`);
  {
    const rot = players.filter((p) => (p.stats?.mpg ?? 0) >= 15);
    const crng = createRng(20260916);
    const sums: Record<string, number> = {};
    const N = 20000;
    for (let i = 0; i < N; i++) {
      const idx = new Set<number>();
      while (idx.size < 5) idx.add(Math.floor(crng.next() * rot.length));
      const lineup = [...idx].map((j) => rot[j]);
      for (const d of RATING_DIMS) sums[d] = (sums[d] ?? 0) + lineupValue(lineup, d);
    }
    for (const d of RATING_DIMS) {
      console.log(`  ${d.padEnd(18)} ${String(LINEUP_AGG[d].k).padStart(5)} ${(sums[d] / N).toFixed(1).padStart(9)} ${LINEUP_CENTRE[d].toFixed(1).padStart(11)}`);
    }
  }
  console.log(`\nEdge size: EFFICIENCY_SCALE ${tuning.efficiencyScale ?? EFFICIENCY_SCALE}${tuning.efficiencyScale !== undefined ? ' (override)' : ''}, MAX_EFF_SHIFT ${tuning.maxEffShift ?? MAX_EFF_SHIFT}${tuning.maxEffShift !== undefined ? ' (override)' : ''}`);

  console.log(`\nRunning ${n} headless games...`);
  const games = simulateMany(n, players, PLAYS, seed, { tuning });
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

  // T8 (D11): one summary object, built once — printed to console below and reused
  // verbatim as --report's `spread` section, instead of recomputing from raw arrays twice.
  const spreadSummary: SpreadSummary = {
    games: games.length,
    overallPPP: totalPoints / totalPoss,
    homePPP: homePts / homePoss,
    awayPPP: awayPts / awayPoss,
    scoreMean: mean(allTeamScores),
    scoreMedian: median(allTeamScores),
    scoreSd: sd(allTeamScores),
    pctIn90130: inRange9030 / allTeamScores.length,
    homeWinPct: homeWins / games.length,
    otPct: otGames / games.length,
    meanPossPerGame: totalPoss / games.length,
    marginMean: mean(margins),
    marginMedian: median(margins),
  };

  console.log(`\n=== Balance Report (${games.length} games, ${dt}ms) ===`);
  console.log(`Overall PPP:        ${spreadSummary.overallPPP.toFixed(3)}`);
  console.log(`Home-side PPP:      ${spreadSummary.homePPP.toFixed(3)}`);
  console.log(`Away-side PPP:      ${spreadSummary.awayPPP.toFixed(3)}`);
  console.log(`Team score mean:    ${spreadSummary.scoreMean.toFixed(1)}`);
  console.log(`Team score median:  ${spreadSummary.scoreMedian.toFixed(1)}`);
  console.log(`Team score sd:      ${spreadSummary.scoreSd.toFixed(1)}`);
  console.log(`% scores in [90,130]: ${(spreadSummary.pctIn90130 * 100).toFixed(1)}%`);
  console.log(`Home win %:         ${(spreadSummary.homeWinPct * 100).toFixed(1)}%`);
  console.log(`OT %:               ${(spreadSummary.otPct * 100).toFixed(1)}%`);
  console.log(`Mean total poss/game: ${spreadSummary.meanPossPerGame.toFixed(1)}`);
  console.log(`Margin mean:        ${spreadSummary.marginMean.toFixed(1)}`);
  console.log(`Margin median:      ${spreadSummary.marginMedian.toFixed(1)}`);

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

  // --report (D11) needs the catalog and draft-impact data regardless of whether their
  // own focused flags were also passed — it's the "run everything, merge into one file"
  // command, per D11.
  let catalogEntries: CatalogEntry[] | undefined;
  if (catalog || report) {
    // T4 (game_engine D1/D2, 2026-09-14): raised from 300 — at n=300 the standard error on
    // a win% delta is ~2.9pp, wide enough to make several real (if modest) play deltas
    // indistinguishable from zero and mask which plays are genuine "trap commons" vs which
    // just needed a bigger sample. 600 halves that to ~2.0pp without blowing up runtime.
    const catalogGames = Math.min(n, 600);
    const playEntries = reportPlayImpact(players, catalogGames, seed, playCounts);
    const identityActivation = archetypeActivationRates(players, Math.min(n, 200), seed);
    const identityEntries = reportArchetypeImpact(players, catalogGames, seed, identityActivation);
    catalogEntries = [...playEntries, ...identityEntries];
    if (catalog) writeCatalogReport(catalogEntries, seed, catalogGames);
  } else {
    reportPlayImpact(players, n, seed, playCounts);
  }

  if (ab) {
    const pairs = runAbPairs(players, n, seed);
    reportAb(pairs);
  }

  let draftImpactSummary: DraftImpactSummary | undefined;
  let outcomeDecomposition: OutcomeDecomposition | undefined;
  if (draftImpact || report) {
    const nDrafts = Math.min(n, 150); // 28 games/draft; 150 drafts = 4200 games
    const { entries, seasons } = runDraftImpact(players, PLAYS, nDrafts, seed);
    draftImpactSummary = summarizeDraftImpact(entries);
    reportDraftImpact(draftImpactSummary);
    outcomeDecomposition = reportOutcomeDecomposition(entries, seasons);
  }

  if (report && catalogEntries && draftImpactSummary && outcomeDecomposition) {
    writeUnifiedReport(seed, catalogEntries, draftImpactSummary, spreadSummary, outcomeDecomposition);
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
