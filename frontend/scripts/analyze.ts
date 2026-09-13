#!/usr/bin/env tsx
/**
 * Analytics report over a real /debug export.
 *
 * Wave-0 driver contract for plan_analytics_tooling (docs/plans/plan_analytics_tooling_2026-09-13.md).
 * T1/T3 implement against this comment block; do not change the field names below without
 * updating both the /debug export (src/app/debug/page.tsx `loadData`/`GameStore.exportAll`)
 * and this file together.
 *
 * Reads the newest `data/game_logs/full_dump_*.json` (same shape POSTed by /debug's
 * "Save Full Logs to Disk", written by `src/app/api/game-logs/route.ts`):
 *
 *   { sessions: DraftSession[], seasons: Season[], rosters: SavedRoster[] }
 *
 * Fields this report depends on (verify each is actually present in a fresh export
 * before trusting it — T3's job):
 *   - DraftSession.seats[].builtRoster.archetypes    (ArchetypeSelection, engine/archetypes.ts)
 *   - DraftSession.seats[].builtRoster.playAssignments (PlayAssignment[], engine/playbook.ts)
 *   - Season.schedule[].matchups[].result            (GameTheater, engine/game.ts)
 *   - GameTheater.possessions[].calledPlays          (per-possession play calls, engine/game.ts)
 *
 * Report sections (D2), replacing the old scripts/analyze_game_data.js sections
 * (synergy activation, PLAY_EFFECTS activation, OVR-vs-win correlation — all removed,
 * those systems no longer exist):
 *   1. Draft cube integrity (dupes) + rarity distribution — kept as-is.
 *   2. Per roster: identity tier reached per lane, selected identity, staffed plays
 *      (roles filled / total).
 *   3. Per game: play call counts from calledPlays, score bands, margin, home/away.
 *   4. Win rate by identity tier and by number of staffed plays.
 *
 * Output: plain text to stdout, deterministic ordering, no ANSI colour (D6) — must be
 * safe to paste into a commit message or docs/HANDOVER.md.
 *
 * npm run analyze (root) invokes this via tsx; it replaces scripts/analyze_game_data.js,
 * which T1 deletes once this file covers its still-relevant sections.
 */

import fs from 'fs';
import path from 'path';

import type { DraftCard, PlayerCardData } from '../src/engine/types';
import type { DraftSession, DraftSessionSeat, BuiltRoster, DraftPickRecord } from '../src/engine/deckbuilder';
import type { Season, SeasonScheduleEntry } from '../src/engine/season';
import { teamInfoForSeat, resolveMatchupReplay } from '../src/engine/season';
import type { GameTheater, PossessionEvent, TeamInfo } from '../src/engine/game';
import type { SavedRoster } from '../src/storage/types';
import {
  evaluateArchetypes,
  type ArchetypeSelection,
  type ArchetypeStatus,
  type ArchetypeTier,
} from '../src/engine/archetypes';
import { evaluatePlaybook, type PlayAssignment } from '../src/engine/playbook';

// ── Small stats helpers (mirrors balance.ts) ────────────────────────────────

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
  if (arr.length <= 1) return 0;
  const m = mean(arr);
  return Math.sqrt(mean(arr.map((x) => (x - m) ** 2)));
}

function pct(n: number, d: number): string {
  return d > 0 ? `${((100 * n) / d).toFixed(1)}%` : 'n/a';
}

function header(title: string): void {
  console.log(`\n=== ${title} ===`);
}

// ── Locating and loading the dump ───────────────────────────────────────────

interface GameLogData {
  sessions: DraftSession[];
  seasons: Season[];
  rosters: SavedRoster[];
}

/** Same directory route.ts writes to: `<repo root>/data/game_logs`, resolved the same
 *  way build-cards.ts resolves game.db — relative to cwd, which is `frontend/` when run
 *  via the npm script. */
function gameLogsDir(): string {
  return path.resolve(process.cwd(), '..', 'data', 'game_logs');
}

function findNewestDump(): string {
  const dir = gameLogsDir();
  if (!fs.existsSync(dir)) {
    throw new Error(`No data/game_logs directory at ${dir}. Play a draft/season and export from /debug first.`);
  }
  const dumps = fs.readdirSync(dir).filter((f) => f.startsWith('full_dump_') && f.endsWith('.json'));
  if (!dumps.length) {
    throw new Error(`No full_dump_*.json files in ${dir}. Export from /debug ("Save Full Logs to Disk") first.`);
  }
  // Filenames are timestamp-sortable (full_dump_<ISO-ish>.json), but stat mtime is the
  // ground truth in case of clock skew or manual copies.
  dumps.sort((a, b) => {
    const sa = fs.statSync(path.join(dir, a)).mtimeMs;
    const sb = fs.statSync(path.join(dir, b)).mtimeMs;
    return sb - sa;
  });
  return path.join(dir, dumps[0]);
}

function loadDump(filepath: string): GameLogData {
  const raw = JSON.parse(fs.readFileSync(filepath, 'utf-8'));
  return {
    sessions: raw.sessions ?? [],
    seasons: raw.seasons ?? [],
    rosters: raw.rosters ?? [],
  };
}

// ── Shared: active roster reconstruction from a DraftSessionSeat ───────────

/** Active-roster players (depth chart) + starter ids for a seat, built from its drafted
 *  cards — mirrors buildTeamInfo (engine/game.ts) minus the OOP-rating penalty, which is
 *  a game-sim detail that doesn't affect badge tallies (archetypes) or role eligibility
 *  (plays), both of which read `traits`/position, not adjusted ratings. */
function activeRosterOf(seat: DraftSessionSeat): { players: PlayerCardData[]; starterIds: Set<string> } {
  const byId = new Map<string, PlayerCardData>();
  for (const card of seat.drafted ?? []) {
    if (card.type === 'Player') byId.set(card.id, card);
  }
  const players: PlayerCardData[] = [];
  const starterIds = new Set<string>();
  const depthChart = seat.builtRoster?.depthChart ?? {};
  for (const ids of Object.values(depthChart)) {
    ids.forEach((id, i) => {
      const p = byId.get(id);
      if (p && !players.find((x) => x.id === id)) players.push(p);
      if (i === 0 && id) starterIds.add(id);
    });
  }
  return { players, starterIds };
}

/** Tier + name of whatever the roster actually selected in each lane, 'none' if nothing
 *  was chosen for that lane (independent of whether something else was unlocked). */
function selectedTiersByLane(
  statuses: ArchetypeStatus[],
  selection: ArchetypeSelection | undefined
): Record<'offense' | 'defense' | 'gold', { name: string; tier: ArchetypeTier }> {
  const byId = new Map(statuses.map((s) => [s.def.id, s]));
  const pick = (id: string | undefined) => {
    if (!id) return { name: '—', tier: 'none' as ArchetypeTier };
    const s = byId.get(id);
    return s ? { name: s.def.name, tier: s.tier } : { name: id, tier: 'none' as ArchetypeTier };
  };
  return {
    offense: pick(selection?.gold ?? selection?.offense),
    defense: pick(selection?.gold ?? selection?.defense),
    gold: pick(selection?.gold),
  };
}

/** Staffed play count for a roster: plays whose every role is filled. */
function staffedPlayInfo(
  assignments: PlayAssignment[] | undefined,
  players: PlayerCardData[]
): { staffed: number; total: number } {
  const status = evaluatePlaybook(assignments ?? [], players);
  return { staffed: status.plays.filter((p) => p.active).length, total: status.plays.length };
}

// ── Section 1: Draft cube integrity + rarity distribution ─────────────────

function reportDraftSection(sessions: DraftSession[]): void {
  header('Draft Cube Integrity & Rarity');
  if (!sessions.length) {
    console.log('No draft sessions found.');
    return;
  }
  sessions.forEach((session, sIdx) => {
    console.log(`\nSession #${sIdx + 1} (${session.id})`);
    const seats = session.seats ?? [];
    const allCards = seats.flatMap((s) => s.drafted ?? []);
    const players = allCards.filter((c: DraftCard) => c.type === 'Player');
    const plays = allCards.filter((c: DraftCard) => c.type === 'Play');
    const playerIds = players.map((p) => p.id);
    const uniqueIds = new Set(playerIds);
    const dupes = playerIds.length - uniqueIds.size;

    console.log(`  Cards: ${allCards.length} (${players.length} players, ${plays.length} plays)`);
    console.log(`  Cube uniqueness: ${uniqueIds.size}/${players.length} — ${dupes === 0 ? 'PASS' : `${dupes} DUPLICATES`}`);

    const rarity: Record<string, number> = { Mythic: 0, Rare: 0, Uncommon: 0, Common: 0 };
    allCards.forEach((c: DraftCard) => { if (rarity[c.rarity] !== undefined) rarity[c.rarity]++; });
    console.log(`  Rarity: ${Object.entries(rarity).map(([r, c]) => `${r}:${c}`).join(' | ')}`);

    const POS = ['PG', 'SG', 'SF', 'PF', 'C'];
    let covered = 0;
    seats.forEach((seat) => {
      const dc = seat.builtRoster?.depthChart || {};
      if (POS.every((p) => (dc[p] || []).length >= 1)) covered++;
    });
    console.log(`  Position coverage: ${covered}/${seats.length} seats`);

    const pickLog = session.pickLog ?? [];
    if (pickLog.length > 0) {
      const ovrByPick: Record<number, number[]> = {};
      for (let p = 1; p <= 12; p++) ovrByPick[p] = [];
      pickLog.forEach((rec: DraftPickRecord) => {
        const card = allCards.find((c: DraftCard) => c.id === rec.pickedCardId);
        if (card?.type === 'Player' && card.ratings?.overall && ovrByPick[rec.pickNumber]) {
          ovrByPick[rec.pickNumber].push(card.ratings.overall);
        }
      });
      const early = mean([1, 2, 3, 4].flatMap((p) => ovrByPick[p]));
      const late = mean([9, 10, 11, 12].flatMap((p) => ovrByPick[p]));
      console.log(`  OVR gradient: Early(1-4) ${early.toFixed(1)} vs Late(9-12) ${late.toFixed(1)} -> gap ${(early - late).toFixed(1)}`);
    }
  });
}

// ── Section 2: Per-roster identity tiers + staffed plays ──────────────────

interface RosterSummary {
  seatId: string;
  lanes: Record<'offense' | 'defense' | 'gold', { name: string; tier: ArchetypeTier }>;
  staffed: number;
  totalPlays: number;
}

function reportRosterSection(sessions: DraftSession[]): RosterSummary[] {
  header('Roster Identities & Staffed Plays');
  const summaries: RosterSummary[] = [];
  if (!sessions.length) {
    console.log('No draft sessions found.');
    return summaries;
  }
  sessions.forEach((session, sIdx) => {
    console.log(`\nSession #${sIdx + 1} (${session.id})`);
    const seats = session.seats ?? [];
    let anyData = false;
    seats.forEach((seat) => {
      const roster: BuiltRoster | undefined = seat.builtRoster;
      const archetypes = roster?.archetypes;
      const assignments = roster?.playAssignments;
      if (!archetypes && !assignments) return; // pre-v2 roster: nothing to report
      anyData = true;
      const { players, starterIds } = activeRosterOf(seat);
      const statuses = evaluateArchetypes(players, starterIds, archetypes);
      const lanes = selectedTiersByLane(statuses, archetypes);
      const { staffed, total } = staffedPlayInfo(assignments, players);
      summaries.push({ seatId: seat.id, lanes, staffed, totalPlays: total });
      console.log(
        `  ${seat.id.padEnd(10)} offense: ${lanes.offense.name}(${lanes.offense.tier})  ` +
        `defense: ${lanes.defense.name}(${lanes.defense.tier})  ` +
        `gold: ${lanes.gold.name}(${lanes.gold.tier})  ` +
        `staffed plays: ${staffed}/${total}`
      );
    });
    if (!anyData) console.log('  No archetypes/playAssignments on any seat (pre-v2 roster export).');
  });
  return summaries;
}

// ── Section 3: Per-game play calls, score bands, margin, home/away ────────

/**
 * plan_data_storage (D1) stores a slim `{ seed, balanceVersion, boxScore, ... }` per
 * matchup instead of the full theater — re-simulate it here so this report can still
 * read `possessions`/`calledPlays`. A game whose `balanceVersion` no longer matches the
 * current engine, or that predates seeded persistence entirely and has no matching
 * draft session to rebuild TeamInfo from, is skipped (undercounts rather than reports a
 * game that never actually happened under today's rules).
 */
function collectGames(seasons: Season[], sessions: DraftSession[]): GameTheater[] {
  const sessionById = new Map(sessions.map((s) => [s.id, s]));
  const games: GameTheater[] = [];
  seasons.forEach((season) => {
    const session = sessionById.get(season.sessionId);
    (season.schedule ?? []).forEach((entry: SeasonScheduleEntry) => {
      if (!entry.played) return;
      for (const matchup of entry.matchups ?? []) {
        if (!matchup.result) continue;
        if (matchup.result.legacyTheater) {
          games.push(matchup.result.legacyTheater as GameTheater);
          continue;
        }
        if (!session) continue; // can't rebuild bot TeamInfo without the draft session
        const homeTeam = teamInfoForSeat(season, session, matchup.homeSeatIndex);
        const awayTeam = teamInfoForSeat(season, session, matchup.awaySeatIndex);
        const replay = resolveMatchupReplay(matchup.result, homeTeam, awayTeam);
        if (replay.kind !== 'versionMismatch') games.push(replay.theater);
      }
    });
  });
  return games;
}

function reportGameSection(games: GameTheater[]): void {
  header('Game Results: Play Calls, Score Bands, Margins');
  if (!games.length) {
    console.log('No completed games found.');
    return;
  }

  const teamScores: number[] = [];
  const margins: number[] = [];
  let homeWins = 0;
  let otGames = 0;
  const playCallCounts: Record<string, number> = {};
  let possessionsWithCalls = 0;
  let totalPossessions = 0;

  games.forEach((g) => {
    const [h, a] = g.finalScore ?? [0, 0];
    teamScores.push(h, a);
    margins.push(Math.abs(h - a));
    if (h > a) homeWins++;
    if (g.isOvertime) otGames++;

    (g.possessions ?? []).forEach((p: PossessionEvent) => {
      totalPossessions++;
      const calls = p.calledPlays ?? [];
      if (calls.length > 0) possessionsWithCalls++;
      calls.forEach((c) => { playCallCounts[c.name] = (playCallCounts[c.name] || 0) + 1; });
    });
  });

  console.log(`\nGames: ${games.length}`);
  console.log(`Score: mean ${mean(teamScores).toFixed(1)} | median ${median(teamScores).toFixed(1)} | sd ${sd(teamScores).toFixed(1)}`);
  const close = margins.filter((m) => m <= 5).length;
  const mid = margins.filter((m) => m >= 6 && m <= 14).length;
  const blowout = margins.filter((m) => m >= 15).length;
  console.log(`Margin: mean ${mean(margins).toFixed(1)} | close(<=5) ${pct(close, margins.length)} | mid(6-14) ${pct(mid, margins.length)} | blowout(15+) ${pct(blowout, margins.length)}`);
  console.log(`Home win %: ${pct(homeWins, games.length)}`);
  console.log(`OT %: ${pct(otGames, games.length)}`);

  console.log('\nPlay call counts (from PossessionEvent.calledPlays):');
  if (!Object.keys(playCallCounts).length) {
    console.log('  No calledPlays data (pre-plays-and-identities export, or no plays staffed).');
  } else {
    Object.entries(playCallCounts)
      .sort((a, b) => b[1] - a[1])
      .forEach(([name, count]) => {
        console.log(`  ${name.padEnd(24)} ${String(count).padStart(5)}  (${pct(possessionsWithCalls, totalPossessions)} of possessions have a call)`);
      });
  }
}

// ── Section 4: Win rate by identity tier and by staffed-play count ────────

function laneTierOf(team: TeamInfo, lane: 'offense' | 'defense' | 'gold'): ArchetypeTier {
  const statuses = evaluateArchetypes(team.players ?? [], new Set(team.starters ?? []), team.archetypes);
  const lanes = selectedTiersByLane(statuses, team.archetypes);
  return lanes[lane].tier;
}

function staffedCountOf(team: TeamInfo): number {
  const status = evaluatePlaybook(team.playAssignments ?? [], team.players ?? []);
  return status.plays.filter((p) => p.active).length;
}

function reportWinRateSection(games: GameTheater[]): void {
  header('Win Rate by Identity Tier and Staffed Plays');
  if (!games.length) {
    console.log('No completed games found.');
    return;
  }

  const byLaneTier: Record<string, { w: number; g: number }> = {};
  const byStaffedCount: Record<number, { w: number; g: number }> = {};
  let sawArchetypes = false;
  let sawAssignments = false;

  games.forEach((g) => {
    const [h, a] = g.finalScore ?? [0, 0];
    const sides: { team: TeamInfo; won: boolean }[] = [
      { team: g.homeTeam, won: h > a },
      { team: g.awayTeam, won: a > h },
    ];
    sides.forEach(({ team, won }) => {
      if (!team) return;
      if (team.archetypes) sawArchetypes = true;
      if (team.playAssignments) sawAssignments = true;

      (['offense', 'defense', 'gold'] as const).forEach((lane) => {
        const tier = laneTierOf(team, lane);
        const key = `${lane}:${tier}`;
        byLaneTier[key] = byLaneTier[key] || { w: 0, g: 0 };
        byLaneTier[key].g++;
        if (won) byLaneTier[key].w++;
      });

      const staffed = staffedCountOf(team);
      byStaffedCount[staffed] = byStaffedCount[staffed] || { w: 0, g: 0 };
      byStaffedCount[staffed].g++;
      if (won) byStaffedCount[staffed].w++;
    });
  });

  console.log('\nBy identity tier (per lane, team-games):');
  if (!sawArchetypes) {
    console.log('  No archetypes data on any GameTheater team (pre-plays-and-identities export).');
  } else {
    (['offense', 'defense', 'gold'] as const).forEach((lane) => {
      (['none', 'online', 'dedicated'] as ArchetypeTier[]).forEach((tier) => {
        const key = `${lane}:${tier}`;
        const rec = byLaneTier[key];
        if (!rec) return;
        console.log(`  ${lane.padEnd(8)} ${tier.padEnd(10)} ${pct(rec.w, rec.g)} (${rec.g} team-games)`);
      });
    });
  }

  console.log('\nBy staffed-play count (team-games):');
  if (!sawAssignments) {
    console.log('  No playAssignments data on any GameTheater team (pre-plays-and-identities export).');
  } else {
    Object.keys(byStaffedCount)
      .map(Number)
      .sort((a, b) => a - b)
      .forEach((count) => {
        const rec = byStaffedCount[count];
        console.log(`  ${count} staffed play(s): ${pct(rec.w, rec.g)} (${rec.g} team-games)`);
      });
  }
}

// ── Main ────────────────────────────────────────────────────────────────

function main(): void {
  const dumpPath = findNewestDump();
  console.log(`Reading ${path.relative(path.resolve(process.cwd(), '..'), dumpPath)}`);
  const data = loadDump(dumpPath);
  console.log(`Sessions: ${data.sessions.length} | Seasons: ${data.seasons.length} | Rosters: ${data.rosters.length}`);

  reportDraftSection(data.sessions);
  reportRosterSection(data.sessions);
  const games = collectGames(data.seasons, data.sessions);
  reportGameSection(games);
  reportWinRateSection(games);

  console.log('');
}

main();
