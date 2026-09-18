#!/usr/bin/env tsx
/**
 * Player-level bootstrap harness.
 *
 * Usage: tsx scripts/player_bootstrap.ts [drafts=150] [--seed N] [--min-games N] [--top N] [--json]
 *
 * Runs many headless drafts (real cube-pool generation + the real bot draft AI from
 * engine/draft.ts, exactly as scripts/balance.ts does), but — unlike balance.ts, which
 * always builds each seat's roster with `buildBotRoster` (deterministic best-OVR-first) —
 * assigns every drafted player to a RANDOM eligible depth-chart slot (`buildRandomRoster`
 * below). This deliberately decorrelates "a smart deckbuilder chose to start/bench this
 * card" from "how good this card's own ratings/badges are", so a weak card gets roughly
 * the same shot at starter minutes as a strong one, and its measured performance reflects
 * its own rating rather than the bot roster-builder's judgment of it.
 *
 * Each draft's 8 teams then play a full round robin (28 games, same length as
 * runDraftImpact in balance.ts) so results sample many different rosters/opponents, not
 * one fixed pod. Every simulated game's real per-player `PlayerBoxScore` (points,
 * possessions, ...) is attributed back to the player, so playing time — not just
 * "was on the roster" — controls how much a game counts.
 *
 * "Win Shares" proxy (there is no such concept in the engine itself — the old OVR-vs-win
 * system was removed when the game moved from box scores to the archetype/identity layer,
 * see scripts/analyze.ts's header): for each game a player actually played in
 * (boxScore possessions > 0), if their team won, they're credited
 *   winShare = theirPossessions / sum(possessions of every player on their side that game)
 * i.e. one win's worth of credit is split across the winning team's players in proportion
 * to playing time; a loss credits nothing. Summed across every game a player appears in,
 * this is directly comparable to real-NBA Win Shares (both approximate "how much of my
 * team's winning is mine"), though it is a simulation-specific proxy, not the real formula.
 * `winSharesPerGame` (the total divided by games played) is what every ranking/correlation
 * below uses, since raw totals are dominated by how often a card got drafted+played.
 *
 * Output: console report (best/worst by win-shares, win-shares by rarity, OVR<->win-shares
 * correlation, badge-level<->win-shares correlation per badge type, over/underrated by
 * rarity and by OVR) plus, with --json, a full per-player dump at
 * data/game_logs/player_bootstrap_<timestamp>.json for further slicing.
 */

import fs from 'fs';
import path from 'path';
import { pathToFileURL } from 'url';

import { loadPlayers, PLAYS } from '../tests/unit/helpers';
import { generateCubePool, getBotPick, createBotProfiles, type DraftSeat } from '../src/engine/draft';
import { simulateGame, type TeamInfo, type GameTheater } from '../src/engine/game';
import { createRng, randomSeed, shuffle, type Rng } from '../src/engine/rng';
import { CUBE_PLAYER_CARDS_PER_PACK, TARGET_ROSTER } from '../src/engine/balance';
import { DEPTH_COLUMNS, canPlaceAt, type DepthColumn } from '../src/engine/positions';
import { mean, median, sd, pct } from '../src/lib/analyzeStats';
import type { PlayerCardData, DraftCard, Rarity } from '../src/engine/types';

// ── CLI args ─────────────────────────────────────────────────────────────

interface Args {
  drafts: number;
  seed: number;
  minGames: number;
  top: number;
  json: boolean;
}

function parseArgs(argv: string[]): Args {
  let drafts = 150; // 150 drafts x 28 games/round-robin = 4200 games
  let seed: number | undefined;
  let minGames = 15;
  let top = 20;
  let json = false;
  const positional: string[] = [];

  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === '--seed') seed = parseInt(argv[++i], 10);
    else if (argv[i] === '--min-games') minGames = parseInt(argv[++i], 10);
    else if (argv[i] === '--top') top = parseInt(argv[++i], 10);
    else if (argv[i] === '--json') json = true;
    else positional.push(argv[i]);
  }
  if (positional[0]) drafts = parseInt(positional[0], 10);

  return { drafts, seed: seed ?? randomSeed(), minGames, top, json };
}

// ── Random roster construction ──────────────────────────────────────────
//
// Mirrors deckbuilder.ts's private getEligiblePositions (bots stay natural-only, no
// adjacent-position placement) — that helper isn't exported, so it's re-derived from the
// same source of truth (engine/positions.ts) rather than duplicating its logic by hand.

function eligiblePositions(rawPos: string): DepthColumn[] {
  const natural = DEPTH_COLUMNS.filter((col) => canPlaceAt(rawPos, col, false));
  return natural.length > 0 ? natural : ['SF'];
}

const MAX_PER_COLUMN = 3;

/**
 * Randomly assigns drafted players to depth-chart slots, instead of buildBotRoster's
 * deterministic best-OVR-first placement. Phase 1 guarantees one random eligible starter
 * per position (so every column has at least a shot at being non-empty); phase 2 randomly
 * distributes the rest up to TARGET_ROSTER, capped at MAX_PER_COLUMN per column (a 4th+
 * player in a column never gets any possession share — see calcPossessionShares — so
 * placing more there would be wasted). A repair pass at the end force-fills any column
 * that's still empty (rare: only happens if none of this team's drafted players are
 * eligible for that position at all) from whatever's left, so every game gets a full
 * 5-position lineup.
 */
function buildRandomRoster(players: PlayerCardData[], rng: Rng): Record<DepthColumn, string[]> {
  const depthChart: Record<DepthColumn, string[]> = { PG: [], SG: [], SF: [], PF: [], C: [] };
  const assigned = new Set<string>();

  for (const pos of DEPTH_COLUMNS) {
    const eligible = players.filter((p) => !assigned.has(p.id) && eligiblePositions(p.player.position).includes(pos));
    if (eligible.length === 0) continue;
    const picked = eligible[Math.floor(rng.next() * eligible.length)];
    depthChart[pos].push(picked.id);
    assigned.add(picked.id);
  }

  const remaining = shuffle(players.filter((p) => !assigned.has(p.id)), rng);
  for (const player of remaining) {
    if (assigned.size >= TARGET_ROSTER) break;
    const openCols = eligiblePositions(player.player.position).filter((pos) => depthChart[pos].length < MAX_PER_COLUMN);
    if (openCols.length === 0) continue;
    const pos = openCols[Math.floor(rng.next() * openCols.length)];
    depthChart[pos].push(player.id);
    assigned.add(player.id);
  }

  // Repair pass: force-fill any column still empty from whatever's unassigned (or, failing
  // that, whatever's assigned elsewhere isn't an option — duplicate ids would corrupt the
  // box score — so this only helps when there's at least one unassigned player left; in
  // practice a 21-card draft leaves several, and this branch is a rare safety net, not the
  // common path).
  const leftover = shuffle(players.filter((p) => !assigned.has(p.id)), rng);
  for (const pos of DEPTH_COLUMNS) {
    if (depthChart[pos].length > 0) continue;
    const filler = leftover.pop();
    if (filler) {
      depthChart[pos].push(filler.id);
      assigned.add(filler.id);
    }
  }

  return depthChart;
}

function buildRandomTeam(seatId: string, drafted: DraftCard[], rng: Rng): TeamInfo {
  const players = drafted.filter((c): c is PlayerCardData => c.type === 'Player');
  const depthChart = buildRandomRoster(players, rng);
  const activeIds = new Set(Object.values(depthChart).flat());
  const activePlayers = players.filter((p) => activeIds.has(p.id));
  const starters = DEPTH_COLUMNS.map((pos) => depthChart[pos][0]).filter((id): id is string => !!id);

  return {
    seatId,
    name: seatId,
    players: activePlayers,
    starters,
    plays: [],
    depthChart,
    playAssignments: [],
    archetypes: {},
  };
}

// ── Headless draft (mirrors tests/unit/helpers.ts runHeadlessDraft, but only the draft
//    half — roster-building is buildRandomTeam above, not buildBotRoster) ───────────────

/** Runs one 8-seat/3-pack cube draft (real generateCubePool + real getBotPick, every seat
 *  bot-controlled — a bootstrap harness has no human), then builds each seat's team with
 *  buildRandomTeam instead of the deterministic buildBotRoster. */
function runOneDraft(players: PlayerCardData[], seed: number): TeamInfo[] {
  const rng = createRng(seed);
  const allPacks = generateCubePool(players, PLAYS, rng);
  const profiles = createBotProfiles(rng, 8);

  const seats: DraftSeat[] = Array.from({ length: 8 }, (_, i) => ({
    id: `bot-${i}`,
    isBot: true,
    botProfile: profiles[i],
    drafted: [],
    currentPack: allPacks[i] || [],
  }));

  for (let packNumber = 1; packNumber <= 3; packNumber++) {
    for (let pickNumber = 1; pickNumber <= CUBE_PLAYER_CARDS_PER_PACK + 1; pickNumber++) {
      for (let i = 0; i < 8; i++) {
        const seat = seats[i];
        if (seat.currentPack.length === 0) continue;
        const pickId = getBotPick(seat, pickNumber);
        const idx = seat.currentPack.findIndex((c) => c.id === pickId);
        if (idx !== -1) seat.drafted.push(seat.currentPack.splice(idx, 1)[0]);
      }
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

  const rosterRng = createRng(seed ^ 0x9e3779b9);
  return seats.map((seat) => buildRandomTeam(seat.id, seat.drafted, rosterRng));
}

// ── Per-player accumulation ─────────────────────────────────────────────

interface PlayerAgg {
  card: PlayerCardData;
  draftCount: number;     // times this player was drafted onto a team
  activeCount: number;    // times drafted AND placed in the active 12 (could still go possession-less in a given game)
  gamesPlayed: number;    // games with boxScore possessions > 0
  teamWins: number;       // of gamesPlayed, how many the player's team won
  winShareSum: number;    // sum of per-game win-share credit (see header)
  totalPoints: number;
  totalPossessions: number;
}

function newAgg(card: PlayerCardData): PlayerAgg {
  return { card, draftCount: 0, activeCount: 0, gamesPlayed: 0, teamWins: 0, winShareSum: 0, totalPoints: 0, totalPossessions: 0 };
}

function playRoundRobinAndAccumulate(teams: TeamInfo[], seed: number, agg: Map<string, PlayerAgg>): void {
  for (let i = 0; i < teams.length; i++) {
    for (let j = i + 1; j < teams.length; j++) {
      const gameSeed = seed + i * 97 + j * 13 + 3;
      const iHome = (i + j) % 2 === 0;
      const home = iHome ? teams[i] : teams[j];
      const away = iHome ? teams[j] : teams[i];
      const g: GameTheater = simulateGame(home, away, { rng: createRng(gameSeed) });

      const homeWon = g.finalScore[0] > g.finalScore[1];
      accumulateSide(g, 'home', homeWon, agg);
      accumulateSide(g, 'away', !homeWon, agg);
    }
  }
}

function accumulateSide(g: GameTheater, side: 'home' | 'away', won: boolean, agg: Map<string, PlayerAgg>): void {
  const box = side === 'home' ? g.boxScore.home : g.boxScore.away;
  const played = box.filter((bs) => bs.possessions > 0);
  const totalPoss = played.reduce((s, bs) => s + bs.possessions, 0);

  for (const bs of played) {
    const a = agg.get(bs.playerId);
    if (!a) continue; // shouldn't happen — every boxScore entry comes from a TeamInfo.players id we registered
    a.gamesPlayed++;
    a.totalPoints += bs.points;
    a.totalPossessions += bs.possessions;
    if (won) {
      a.teamWins++;
      a.winShareSum += totalPoss > 0 ? bs.possessions / totalPoss : 0;
    }
  }
}

// ── Stats: correlation + simple linear regression ───────────────────────

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

/** y = slope*x + intercept, ordinary least squares over one predictor. */
function linFit(x: number[], y: number[]): { slope: number; intercept: number } {
  const mx = mean(x), my = mean(y);
  let num = 0, den = 0;
  for (let i = 0; i < x.length; i++) {
    num += (x[i] - mx) * (y[i] - my);
    den += (x[i] - mx) ** 2;
  }
  const slope = den > 0 ? num / den : 0;
  return { slope, intercept: my - slope * mx };
}

// ── Report ───────────────────────────────────────────────────────────────

function header(title: string): void {
  console.log(`\n=== ${title} ===`);
}

function fmtPct(v: number | null): string {
  return v === null ? 'n/a' : `${v.toFixed(1)}%`;
}

interface Row {
  name: string;
  rarity: Rarity;
  ovr: number;
  draftCount: number;
  activeCount: number;
  gamesPlayed: number;
  winSharesPerGame: number;
  teamWinPct: number;
}

function toRow(a: PlayerAgg): Row {
  return {
    name: a.card.player.name,
    rarity: a.card.rarity,
    ovr: a.card.ratings.overall,
    draftCount: a.draftCount,
    activeCount: a.activeCount,
    gamesPlayed: a.gamesPlayed,
    winSharesPerGame: a.gamesPlayed > 0 ? a.winShareSum / a.gamesPlayed : 0,
    teamWinPct: a.gamesPlayed > 0 ? (100 * a.teamWins) / a.gamesPlayed : 0,
  };
}

function reportDraftCoverage(all: PlayerAgg[], totalPlayers: number): void {
  header('Draft & Play Coverage');
  const withAnyDraft = all.filter((a) => a.draftCount > 0);
  const withAnyGame = all.filter((a) => a.gamesPlayed > 0);
  console.log(`Players in pool: ${totalPlayers}`);
  console.log(`Drafted at least once: ${withAnyDraft.length} (${fmtPct(pct(withAnyDraft.length, totalPlayers))})`);
  console.log(`Played at least one game: ${withAnyGame.length} (${fmtPct(pct(withAnyGame.length, totalPlayers))})`);
  console.log(`Draft count — mean ${mean(all.map((a) => a.draftCount)).toFixed(1)}, median ${median(all.map((a) => a.draftCount))}`);
  console.log(`Games played — mean ${mean(all.map((a) => a.gamesPlayed)).toFixed(1)}, median ${median(all.map((a) => a.gamesPlayed))}`);
  const under = withAnyDraft.filter((a) => a.gamesPlayed < 15).length;
  console.log(`Never drafted at all: ${totalPlayers - withAnyDraft.length}`);
  console.log(`Drafted but under 15 games played: ${under}`);
}

function reportOvrCorrelation(rows: Row[]): void {
  header('OVR <-> Win Shares');
  const ovr = rows.map((r) => r.ovr);
  const wspg = rows.map((r) => r.winSharesPerGame);
  const winPct = rows.map((r) => r.teamWinPct);
  console.log(`n = ${rows.length} players (min-games filter applied)`);
  console.log(`corr(OVR, winSharesPerGame) = ${corr(ovr, wspg).toFixed(3)}`);
  console.log(`corr(OVR, team win%)        = ${corr(ovr, winPct).toFixed(3)}`);

  const buckets = [
    { label: '90+ (Mythic-ish)', lo: 90, hi: 999 },
    { label: '80-89 (Rare-ish)', lo: 80, hi: 89 },
    { label: '65-79 (Uncommon-ish)', lo: 65, hi: 79 },
    { label: '<65 (Common-ish)', lo: 0, hi: 64 },
  ];
  console.log('\nMean win-shares/game by OVR band:');
  for (const b of buckets) {
    const bucket = rows.filter((r) => r.ovr >= b.lo && r.ovr <= b.hi);
    if (!bucket.length) continue;
    console.log(`  ${b.label.padEnd(22)} n=${bucket.length.toString().padEnd(5)} mean ${mean(bucket.map((r) => r.winSharesPerGame)).toFixed(4)}`);
  }
}

function reportRarity(rows: Row[]): void {
  header('Win Shares by Rarity');
  const order: Rarity[] = ['Mythic', 'Rare', 'Uncommon', 'Common'];
  for (const rarity of order) {
    const bucket = rows.filter((r) => r.rarity === rarity);
    if (!bucket.length) { console.log(`  ${rarity.padEnd(10)} n=0`); continue; }
    const wspg = bucket.map((r) => r.winSharesPerGame);
    console.log(
      `  ${rarity.padEnd(10)} n=${bucket.length.toString().padEnd(5)} ` +
      `mean win-shares/g ${mean(wspg).toFixed(4)}  median ${median(wspg).toFixed(4)}  sd ${sd(wspg).toFixed(4)}  ` +
      `team win% ${mean(bucket.map((r) => r.teamWinPct)).toFixed(1)}%`
    );
  }
}

function reportBadgeCorrelation(all: PlayerAgg[], minGames: number): void {
  header('Badge Level <-> Win Shares (per badge/trait type)');
  const filtered = all.filter((a) => a.gamesPlayed >= minGames);
  const traitNames = new Set<string>();
  for (const a of all) for (const t of a.card.traits ?? []) traitNames.add(t.name);

  const entries: { name: string; r: number; n: number; holders: number; meanWspgHolders: number; meanWspgNonHolders: number }[] = [];
  for (const name of traitNames) {
    const levels = filtered.map((a) => a.card.traits?.find((t) => t.name === name)?.level ?? 0);
    const wspg = filtered.map((a) => (a.gamesPlayed > 0 ? a.winShareSum / a.gamesPlayed : 0));
    const holders = filtered.filter((a) => (a.card.traits?.find((t) => t.name === name)?.level ?? 0) > 0);
    const nonHolders = filtered.filter((a) => !(a.card.traits?.find((t) => t.name === name)?.level ?? 0));
    entries.push({
      name,
      r: corr(levels, wspg),
      n: filtered.length,
      holders: holders.length,
      meanWspgHolders: mean(holders.map((a) => (a.gamesPlayed > 0 ? a.winShareSum / a.gamesPlayed : 0))),
      meanWspgNonHolders: mean(nonHolders.map((a) => (a.gamesPlayed > 0 ? a.winShareSum / a.gamesPlayed : 0))),
    });
  }

  entries.sort((a, b) => Math.abs(b.r) - Math.abs(a.r));
  console.log(`n = ${filtered.length} players (min-games filter applied); level is 0 for non-holders, 1-3 for holders`);
  for (const e of entries) {
    console.log(
      `  ${e.name.padEnd(22)} r=${e.r >= 0 ? '+' : ''}${e.r.toFixed(3)}  holders=${e.holders.toString().padEnd(5)} ` +
      `mean win-shares/g: holders ${e.meanWspgHolders.toFixed(4)}  non-holders ${e.meanWspgNonHolders.toFixed(4)}`
    );
  }
}

function reportBestWorst(rows: Row[], top: number): void {
  header(`Best Players by Win Shares/Game (top ${top}, min-games filter applied)`);
  const sorted = [...rows].sort((a, b) => b.winSharesPerGame - a.winSharesPerGame);
  for (const r of sorted.slice(0, top)) {
    console.log(`  ${r.name.padEnd(24)} ${r.rarity.padEnd(9)} OVR ${r.ovr.toString().padEnd(4)} win-shares/g ${r.winSharesPerGame.toFixed(4)}  (n=${r.gamesPlayed}, team win% ${r.teamWinPct.toFixed(1)}%)`);
  }

  header(`Worst Players by Win Shares/Game (bottom ${top}, min-games filter applied)`);
  for (const r of sorted.slice(-top).reverse()) {
    console.log(`  ${r.name.padEnd(24)} ${r.rarity.padEnd(9)} OVR ${r.ovr.toString().padEnd(4)} win-shares/g ${r.winSharesPerGame.toFixed(4)}  (n=${r.gamesPlayed}, team win% ${r.teamWinPct.toFixed(1)}%)`);
  }
}

/** Over/underrated relative to what their OWN rarity bucket typically delivers — a
 *  Mythic that performs like an average Uncommon is "overrated for its rarity" even if its
 *  raw win-shares/game beats most Commons. */
function reportOverUnderratedByRarity(rows: Row[], top: number): void {
  header(`Overrated / Underrated by Rarity (z-score of win-shares/g within rarity bucket, top ${top})`);
  const byRarity = new Map<Rarity, Row[]>();
  for (const r of rows) {
    if (!byRarity.has(r.rarity)) byRarity.set(r.rarity, []);
    byRarity.get(r.rarity)!.push(r);
  }

  const withZ: (Row & { z: number })[] = [];
  for (const [, bucket] of byRarity) {
    const wspg = bucket.map((r) => r.winSharesPerGame);
    const m = mean(wspg), s = sd(wspg) || 1;
    for (const r of bucket) withZ.push({ ...r, z: (r.winSharesPerGame - m) / s });
  }

  withZ.sort((a, b) => a.z - b.z);
  console.log('\nMost OVERRATED for their rarity (win-shares/g far below their rarity\'s average):');
  for (const r of withZ.slice(0, top)) {
    console.log(`  ${r.name.padEnd(24)} ${r.rarity.padEnd(9)} OVR ${r.ovr.toString().padEnd(4)} z=${r.z.toFixed(2)}  win-shares/g ${r.winSharesPerGame.toFixed(4)} (n=${r.gamesPlayed})`);
  }
  console.log('\nMost UNDERRATED for their rarity (win-shares/g far above their rarity\'s average):');
  for (const r of withZ.slice(-top).reverse()) {
    console.log(`  ${r.name.padEnd(24)} ${r.rarity.padEnd(9)} OVR ${r.ovr.toString().padEnd(4)} z=${r.z.toFixed(2)}  win-shares/g ${r.winSharesPerGame.toFixed(4)} (n=${r.gamesPlayed})`);
  }
}

/** Over/underrated relative to what their OVR alone predicts (OLS residual) — independent
 *  of rarity bucketing, this asks "does this specific card's number match its output". */
function reportOverUnderratedByOvr(rows: Row[], top: number): void {
  header(`Overrated / Underrated by OVR (OLS residual of win-shares/g on OVR, top ${top})`);
  const ovr = rows.map((r) => r.ovr);
  const wspg = rows.map((r) => r.winSharesPerGame);
  const { slope, intercept } = linFit(ovr, wspg);
  console.log(`Fit: win-shares/g ~= ${slope.toFixed(5)} * OVR + ${intercept.toFixed(4)}  (r=${corr(ovr, wspg).toFixed(3)})`);

  const withResid = rows.map((r) => ({ ...r, residual: r.winSharesPerGame - (slope * r.ovr + intercept) }));
  withResid.sort((a, b) => a.residual - b.residual);

  console.log('\nMost OVERRATED for their OVR (actual well below what OVR predicts):');
  for (const r of withResid.slice(0, top)) {
    console.log(`  ${r.name.padEnd(24)} ${r.rarity.padEnd(9)} OVR ${r.ovr.toString().padEnd(4)} residual ${r.residual.toFixed(4)}  win-shares/g ${r.winSharesPerGame.toFixed(4)} (n=${r.gamesPlayed})`);
  }
  console.log('\nMost UNDERRATED for their OVR (actual well above what OVR predicts):');
  for (const r of withResid.slice(-top).reverse()) {
    console.log(`  ${r.name.padEnd(24)} ${r.rarity.padEnd(9)} OVR ${r.ovr.toString().padEnd(4)} residual ${r.residual.toFixed(4)}  win-shares/g ${r.winSharesPerGame.toFixed(4)} (n=${r.gamesPlayed})`);
  }
}

function writeJson(all: PlayerAgg[], seed: number, args: Args): void {
  const dir = path.resolve(process.cwd(), '..', 'data', 'game_logs');
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
  const filepath = path.join(dir, `player_bootstrap_${timestamp}.json`);
  const players = all.map((a) => ({
    id: a.card.id,
    name: a.card.player.name,
    position: a.card.player.position,
    rarity: a.card.rarity,
    ovr: a.card.ratings.overall,
    traits: a.card.traits,
    draftCount: a.draftCount,
    activeCount: a.activeCount,
    gamesPlayed: a.gamesPlayed,
    teamWins: a.teamWins,
    winShareSum: a.winShareSum,
    winSharesPerGame: a.gamesPlayed > 0 ? a.winShareSum / a.gamesPlayed : 0,
    totalPoints: a.totalPoints,
    totalPossessions: a.totalPossessions,
  }));
  fs.writeFileSync(filepath, JSON.stringify({ generatedAt: new Date().toISOString(), seed, args, players }, null, 2), 'utf-8');
  console.log(`\nPer-player dump written to ${filepath}`);
}

// ── Main ─────────────────────────────────────────────────────────────────

function main(): void {
  const args = parseArgs(process.argv.slice(2));
  console.log(`Seed: ${args.seed}`);
  console.log(`Drafts: ${args.drafts} (x28 round-robin games = ${args.drafts * 28} games)`);
  const t0 = Date.now();

  const players = loadPlayers();
  const agg = new Map<string, PlayerAgg>();
  for (const p of players) agg.set(p.id, newAgg(p));

  const draftRng = createRng(args.seed);
  for (let d = 0; d < args.drafts; d++) {
    const draftSeed = Math.floor(draftRng.next() * 4294967296);
    const teams = runOneDraft(players, draftSeed);

    for (const team of teams) {
      const activeIds = new Set(team.players.map((p) => p.id));
      for (const p of team.players) {
        const a = agg.get(p.id);
        if (!a) continue;
        a.draftCount++;
        if (activeIds.has(p.id)) a.activeCount++;
      }
    }

    playRoundRobinAndAccumulate(teams, draftSeed, agg);
  }

  const dt = Date.now() - t0;
  console.log(`Done in ${dt}ms (${(dt / (args.drafts * 28)).toFixed(2)}ms/game)`);

  const all = [...agg.values()];
  reportDraftCoverage(all, players.length);

  const filtered = all.filter((a) => a.gamesPlayed >= args.minGames);
  const rows = filtered.map(toRow);
  console.log(`\n(${rows.length}/${players.length} players clear the --min-games ${args.minGames} filter used below)`);

  reportOvrCorrelation(rows);
  reportRarity(rows);
  reportBadgeCorrelation(all, args.minGames);
  reportBestWorst(rows, args.top);
  reportOverUnderratedByRarity(rows, args.top);
  reportOverUnderratedByOvr(rows, args.top);

  if (args.json) writeJson(all, args.seed, args);

  console.log('');
}

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
