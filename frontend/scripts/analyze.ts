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
 *
 * accounts_cloud_saves T7: the aggregate math (score/margin/win-rate/per-owner numbers)
 * lives in `src/lib/analyzeStats.ts` so `/api/analytics` (D6) shares it instead of
 * duplicating it here. This file stays the CLI report: it calls those pure functions and
 * formats their output as text.
 */

import fs from 'fs';
import path from 'path';

import type { DraftCard } from '../src/engine/types';
import type { DraftSession, DraftPickRecord } from '../src/engine/deckbuilder';
import type { Season } from '../src/engine/season';
import type { SavedRoster } from '../src/storage/types';
import {
  mean,
  pct,
  activeRosterOf,
  selectedTiersByLane,
  staffedPlayInfo,
  collectGames,
  computeGameStats,
  computeWinRateStats,
  computeOwnerSummary,
  type OwnedGame,
} from '../src/lib/analyzeStats';
import { evaluateArchetypes, type ArchetypeStatus, type ArchetypeTier } from '../src/engine/archetypes';

// ── Formatting ───────────────────────────────────────────────────────────

function fmtPct(v: number | null): string {
  return v === null ? 'n/a' : `${v.toFixed(1)}%`;
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

function reportRosterSection(sessions: DraftSession[]): void {
  header('Roster Identities & Staffed Plays');
  if (!sessions.length) {
    console.log('No draft sessions found.');
    return;
  }
  sessions.forEach((session, sIdx) => {
    console.log(`\nSession #${sIdx + 1} (${session.id})`);
    const seats = session.seats ?? [];
    let anyData = false;
    seats.forEach((seat) => {
      const roster = seat.builtRoster;
      const archetypes = roster?.archetypes;
      const assignments = roster?.playAssignments;
      if (!archetypes && !assignments) return; // pre-v2 roster: nothing to report
      anyData = true;
      const { players, starterIds } = activeRosterOf(seat);
      const statuses: ArchetypeStatus[] = evaluateArchetypes(players, starterIds, archetypes);
      const lanes = selectedTiersByLane(statuses, archetypes);
      const { staffed, total } = staffedPlayInfo(assignments, players);
      console.log(
        `  ${seat.id.padEnd(10)} offense: ${lanes.offense.name}(${lanes.offense.tier})  ` +
        `defense: ${lanes.defense.name}(${lanes.defense.tier})  ` +
        `gold: ${lanes.gold.name}(${lanes.gold.tier})  ` +
        `staffed plays: ${staffed}/${total}`
      );
    });
    if (!anyData) console.log('  No archetypes/playAssignments on any seat (pre-v2 roster export).');
  });
}

// ── Section 3: Per-game play calls, score bands, margin, home/away ────────

function reportGameSection(theaters: import('../src/engine/game').GameTheater[]): void {
  header('Game Results: Play Calls, Score Bands, Margins');
  if (!theaters.length) {
    console.log('No completed games found.');
    return;
  }

  const stats = computeGameStats(theaters);
  console.log(`\nGames: ${stats.games}`);
  console.log(`Score: mean ${stats.scoreMean.toFixed(1)} | median ${stats.scoreMedian.toFixed(1)} | sd ${stats.scoreSd.toFixed(1)}`);
  console.log(`Margin: mean ${stats.marginMean.toFixed(1)} | close(<=5) ${fmtPct(stats.closePct)} | mid(6-14) ${fmtPct(stats.midPct)} | blowout(15+) ${fmtPct(stats.blowoutPct)}`);
  console.log(`Home win %: ${fmtPct(stats.homeWinPct)}`);
  console.log(`OT %: ${fmtPct(stats.otPct)}`);

  console.log('\nPlay call counts (from PossessionEvent.calledPlays):');
  if (!stats.playCallCounts.length) {
    console.log('  No calledPlays data (pre-plays-and-identities export, or no plays staffed).');
  } else {
    stats.playCallCounts.forEach(({ name, count }) => {
      console.log(`  ${name.padEnd(24)} ${String(count).padStart(5)}  (${fmtPct(stats.possessionsWithCallsPct)} of possessions have a call)`);
    });
  }
}

// ── Section 4: Win rate by identity tier and by staffed-play count ────────

function reportWinRateSection(theaters: import('../src/engine/game').GameTheater[]): void {
  header('Win Rate by Identity Tier and Staffed Plays');
  if (!theaters.length) {
    console.log('No completed games found.');
    return;
  }

  const stats = computeWinRateStats(theaters);

  console.log('\nBy identity tier (per lane, team-games):');
  if (!stats.sawArchetypes) {
    console.log('  No archetypes data on any GameTheater team (pre-plays-and-identities export).');
  } else {
    (['offense', 'defense', 'gold'] as const).forEach((lane) => {
      (['none', 'online', 'dedicated'] as ArchetypeTier[]).forEach((tier) => {
        const rec = stats.byLaneTier[`${lane}:${tier}`];
        if (!rec) return;
        console.log(`  ${lane.padEnd(8)} ${tier.padEnd(10)} ${fmtPct(pct(rec.wins, rec.games))} (${rec.games} team-games)`);
      });
    });
  }

  console.log('\nBy staffed-play count (team-games):');
  if (!stats.sawAssignments) {
    console.log('  No playAssignments data on any GameTheater team (pre-plays-and-identities export).');
  } else {
    Object.keys(stats.byStaffedCount)
      .map(Number)
      .sort((a, b) => a - b)
      .forEach((count) => {
        const rec = stats.byStaffedCount[count];
        console.log(`  ${count} staffed play(s): ${fmtPct(pct(rec.wins, rec.games))} (${rec.games} team-games)`);
      });
  }
}

// ── Section 5: Draft & performance by owner (human user vs bots) ──────────

/**
 * Attributes sessions/games to the Supabase `ownerId` who ran the draft, so results can
 * be compared across real users. Pass ids/emails to exclude via
 * `--exclude=<ownerId1>,<ownerId2>` (e.g. the E2E test account from `npm run
 * bootstrap:e2e`), never hardcoded here since that account's id is generated per
 * environment. Per-owner number crunching is `analyzeStats.computeOwnerSummary` (shared
 * with `/api/analytics`'s `scope=self`); this function only buckets by owner and prints.
 */
function reportOwnerSection(sessions: DraftSession[], ownedGames: OwnedGame[], excludeOwnerIds: Set<string>): void {
  header('Draft & Performance by Owner');

  const filteredSessions = sessions.filter((s) => !s.ownerId || !excludeOwnerIds.has(s.ownerId));
  const filteredGames = ownedGames.filter((g) => !g.ownerId || !excludeOwnerIds.has(g.ownerId));
  if (excludeOwnerIds.size) {
    const excludedSessions = sessions.length - filteredSessions.length;
    console.log(`Excluding ${excludeOwnerIds.size} owner id(s): ${excludedSessions} session(s) dropped.`);
  }

  const ownerKey = (id: string | undefined) => id ?? 'local/anonymous';
  const ownerIds = new Set<string>([...filteredSessions.map((s) => ownerKey(s.ownerId)), ...filteredGames.map((g) => ownerKey(g.ownerId))]);
  if (!ownerIds.size) {
    console.log('No sessions or games found.');
    return;
  }

  Array.from(ownerIds).sort().forEach((owner) => {
    const ownerSessions = filteredSessions.filter((s) => ownerKey(s.ownerId) === owner);
    const ownerGames = filteredGames.filter((g) => ownerKey(g.ownerId) === owner);
    const s = computeOwnerSummary(ownerSessions, ownerGames);

    console.log(`\n${owner}`);
    console.log(`  Sessions: ${s.sessions}  |  Games: ${s.games}`);
    console.log(`  Draft quality (avg OVR, R1 picks 1-4): ${s.draftQualityAvgOvr !== null ? s.draftQualityAvgOvr.toFixed(1) : 'n/a'}`);
    console.log(`  Lineup construction: avg staffed plays ${s.avgStaffedPlays !== null ? s.avgStaffedPlays.toFixed(1) : 'n/a'}, dedicated-tier lanes ${fmtPct(s.dedicatedTierPct)}`);
    console.log(`  Outcome: win rate ${fmtPct(s.winRatePct)}, avg margin ${s.avgMargin !== null ? s.avgMargin.toFixed(1) : 'n/a'}`);
  });
}

// ── Main ────────────────────────────────────────────────────────────────

function parseExcludeOwnerIds(argv: string[]): Set<string> {
  const flag = argv.find((a) => a.startsWith('--exclude='));
  const fromFlag = flag ? flag.slice('--exclude='.length) : '';
  const fromEnv = process.env.ANALYZE_EXCLUDE_OWNER_IDS ?? '';
  return new Set([fromFlag, fromEnv].join(',').split(',').map((s) => s.trim()).filter(Boolean));
}

function main(): void {
  const dumpPath = findNewestDump();
  console.log(`Reading ${path.relative(path.resolve(process.cwd(), '..'), dumpPath)}`);
  const data = loadDump(dumpPath);
  console.log(`Sessions: ${data.sessions.length} | Seasons: ${data.seasons.length} | Rosters: ${data.rosters.length}`);

  reportDraftSection(data.sessions);
  reportRosterSection(data.sessions);
  const ownedGames = collectGames(data.seasons, data.sessions);
  const theaters = ownedGames.map((g) => g.theater);
  reportGameSection(theaters);
  reportWinRateSection(theaters);
  reportOwnerSection(data.sessions, ownedGames, parseExcludeOwnerIds(process.argv.slice(2)));

  console.log('');
}

main();
