/**
 * Pure aggregate stats shared by `scripts/analyze.ts` (local `/debug` export -> stdout
 * report) and `/api/analytics` (accounts_cloud_saves D6, Supabase-sourced, `scope=self`
 * for the signed-in user's own numbers or `scope=all` for the admin cross-user view).
 * Moved out of `analyze.ts` so both call one implementation instead of drifting apart —
 * never reimplement this math in SQL or duplicate it in a route.
 *
 * `npm run analyze`'s output must stay byte-identical after this extraction — verify with
 * a before/after diff on the same `full_dump_*.json`, not just a fresh run's shape.
 */

import type { DraftSession, DraftSessionSeat, BuiltRoster, DraftPickRecord } from '@/engine/deckbuilder';
import type { Season, SeasonScheduleEntry } from '@/engine/season';
import { teamInfoForSeat, resolveMatchupReplay, HUMAN_SEAT_ID } from '@/engine/season';
import type { GameTheater, PossessionEvent, TeamInfo } from '@/engine/game';
import type { PlayerCardData } from '@/engine/types';
import {
  evaluateArchetypes,
  type ArchetypeSelection,
  type ArchetypeStatus,
  type ArchetypeTier,
} from '@/engine/archetypes';
import { evaluatePlaybook, type PlayAssignment } from '@/engine/playbook';

// ── Small stats helpers ─────────────────────────────────────────────────────

export function mean(arr: number[]): number {
  return arr.length ? arr.reduce((a, b) => a + b, 0) / arr.length : 0;
}

export function median(arr: number[]): number {
  if (!arr.length) return 0;
  const s = [...arr].sort((a, b) => a - b);
  const m = Math.floor(s.length / 2);
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
}

export function sd(arr: number[]): number {
  if (arr.length <= 1) return 0;
  const m = mean(arr);
  return Math.sqrt(mean(arr.map((x) => (x - m) ** 2)));
}

export function pct(n: number, d: number): number | null {
  return d > 0 ? (100 * n) / d : null;
}

// ── Active roster reconstruction from a DraftSessionSeat ───────────────────

export function activeRosterOf(seat: DraftSessionSeat): { players: PlayerCardData[]; starterIds: Set<string> } {
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

export function selectedTiersByLane(
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

export function staffedPlayInfo(
  assignments: PlayAssignment[] | undefined,
  players: PlayerCardData[]
): { staffed: number; total: number } {
  const status = evaluatePlaybook(assignments ?? [], players);
  return { staffed: status.plays.filter((p) => p.active).length, total: status.plays.length };
}

function laneTierOf(team: TeamInfo, lane: 'offense' | 'defense' | 'gold'): ArchetypeTier {
  const statuses = evaluateArchetypes(team.players ?? [], new Set(team.starters ?? []), team.archetypes);
  return selectedTiersByLane(statuses, team.archetypes)[lane].tier;
}

function staffedCountOf(team: TeamInfo): number {
  const status = evaluatePlaybook(team.playAssignments ?? [], team.players ?? []);
  return status.plays.filter((p) => p.active).length;
}

// ── Game collection (re-simulates D1-slim matchup results) ─────────────────

export interface OwnedGame {
  theater: GameTheater;
  ownerId?: string;
  session?: DraftSession;
}

/** Re-simulates every played matchup back into a full `GameTheater` so downstream stats
 *  can read possessions/calledPlays, skipping a matchup whose `balanceVersion` no longer
 *  matches the current engine (can't safely re-simulate under today's rules) or that has
 *  no matching draft session to rebuild bot `TeamInfo` from. */
export function collectGames(seasons: Season[], sessions: DraftSession[]): OwnedGame[] {
  const sessionById = new Map(sessions.map((s) => [s.id, s]));
  const games: OwnedGame[] = [];
  seasons.forEach((season) => {
    const session = sessionById.get(season.sessionId);
    (season.schedule ?? []).forEach((entry: SeasonScheduleEntry) => {
      if (!entry.played) return;
      for (const matchup of entry.matchups ?? []) {
        if (!matchup.result) continue;
        if (matchup.result.legacyTheater) {
          games.push({ theater: matchup.result.legacyTheater as GameTheater, ownerId: session?.ownerId, session });
          continue;
        }
        if (!session) continue;
        const homeTeam = teamInfoForSeat(season, session, matchup.homeSeatIndex);
        const awayTeam = teamInfoForSeat(season, session, matchup.awaySeatIndex);
        const replay = resolveMatchupReplay(matchup.result, homeTeam, awayTeam);
        if (replay.kind !== 'versionMismatch') games.push({ theater: replay.theater, ownerId: session?.ownerId, session });
      }
    });
  });
  return games;
}

// ── Game stats: score/margin/home-win/OT/play-calls ────────────────────────

export interface GameStats {
  games: number;
  scoreMean: number;
  scoreMedian: number;
  scoreSd: number;
  marginMean: number;
  closePct: number | null;
  midPct: number | null;
  blowoutPct: number | null;
  homeWinPct: number | null;
  otPct: number | null;
  playCallCounts: Array<{ name: string; count: number }>;
  possessionsWithCallsPct: number | null;
}

export function computeGameStats(theaters: GameTheater[]): GameStats {
  const teamScores: number[] = [];
  const margins: number[] = [];
  let homeWins = 0;
  let otGames = 0;
  const playCallCounts: Record<string, number> = {};
  let possessionsWithCalls = 0;
  let totalPossessions = 0;

  theaters.forEach((g) => {
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

  const close = margins.filter((m) => m <= 5).length;
  const mid = margins.filter((m) => m >= 6 && m <= 14).length;
  const blowout = margins.filter((m) => m >= 15).length;

  return {
    games: theaters.length,
    scoreMean: mean(teamScores),
    scoreMedian: median(teamScores),
    scoreSd: sd(teamScores),
    marginMean: mean(margins),
    closePct: pct(close, margins.length),
    midPct: pct(mid, margins.length),
    blowoutPct: pct(blowout, margins.length),
    homeWinPct: pct(homeWins, theaters.length),
    otPct: pct(otGames, theaters.length),
    playCallCounts: Object.entries(playCallCounts).sort((a, b) => b[1] - a[1]).map(([name, count]) => ({ name, count })),
    possessionsWithCallsPct: pct(possessionsWithCalls, totalPossessions),
  };
}

// ── Win rate by identity tier / staffed-play count ──────────────────────────

export interface WinRateStats {
  sawArchetypes: boolean;
  sawAssignments: boolean;
  byLaneTier: Record<string, { wins: number; games: number }>;
  byStaffedCount: Record<number, { wins: number; games: number }>;
}

export function computeWinRateStats(theaters: GameTheater[]): WinRateStats {
  const byLaneTier: Record<string, { wins: number; games: number }> = {};
  const byStaffedCount: Record<number, { wins: number; games: number }> = {};
  let sawArchetypes = false;
  let sawAssignments = false;

  theaters.forEach((g) => {
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
        const key = `${lane}:${laneTierOf(team, lane)}`;
        byLaneTier[key] = byLaneTier[key] || { wins: 0, games: 0 };
        byLaneTier[key].games++;
        if (won) byLaneTier[key].wins++;
      });

      const staffed = staffedCountOf(team);
      byStaffedCount[staffed] = byStaffedCount[staffed] || { wins: 0, games: 0 };
      byStaffedCount[staffed].games++;
      if (won) byStaffedCount[staffed].wins++;
    });
  });

  return { sawArchetypes, sawAssignments, byLaneTier, byStaffedCount };
}

// ── Per-owner summary (draft quality, lineup construction, outcome) ────────

export interface OwnerSummary {
  sessions: number;
  games: number;
  draftQualityAvgOvr: number | null;
  avgStaffedPlays: number | null;
  dedicatedTierPct: number | null;
  winRatePct: number | null;
  avgMargin: number | null;
}

/** `sessions`/`ownedGames` must already be filtered to one owner (or one bucket) before
 *  calling this — it does not filter by id itself, so the same function serves both a
 *  single `scope=self` user and each row of an admin `scope=all` breakdown. */
export function computeOwnerSummary(sessions: DraftSession[], ownedGames: OwnedGame[]): OwnerSummary {
  const early: number[] = [];
  sessions.forEach((session) => {
    const allCards = (session.seats ?? []).flatMap((s) => s.drafted ?? []);
    (session.pickLog ?? [])
      .filter((rec: DraftPickRecord) => rec.packNumber === 1 && rec.pickNumber <= 4)
      .forEach((rec: DraftPickRecord) => {
        const card = allCards.find((c) => c.id === rec.pickedCardId);
        if (card?.type === 'Player' && card.ratings?.overall) early.push(card.ratings.overall);
      });
  });

  const staffedCounts: number[] = [];
  const bestTiers: ArchetypeTier[] = [];
  sessions.forEach((session) => {
    (session.seats ?? []).forEach((seat: DraftSessionSeat) => {
      const roster: BuiltRoster | undefined = seat.builtRoster;
      if (!roster?.archetypes && !roster?.playAssignments) return;
      const { players, starterIds } = activeRosterOf(seat);
      const statuses = evaluateArchetypes(players, starterIds, roster.archetypes);
      const lanes = selectedTiersByLane(statuses, roster.archetypes);
      const { staffed } = staffedPlayInfo(roster.playAssignments, players);
      staffedCounts.push(staffed);
      const tierRank: Record<ArchetypeTier, number> = { none: 0, online: 1, dedicated: 2 };
      const best = ([lanes.offense.tier, lanes.defense.tier, lanes.gold.tier] as ArchetypeTier[])
        .sort((a, b) => tierRank[b] - tierRank[a])[0];
      bestTiers.push(best);
    });
  });

  let wins = 0;
  const margins: number[] = [];
  ownedGames.forEach(({ theater }) => {
    const [h, a] = theater.finalScore ?? [0, 0];
    const homeIsOwner = theater.homeTeam?.seatId === HUMAN_SEAT_ID;
    const awayIsOwner = theater.awayTeam?.seatId === HUMAN_SEAT_ID;
    if (!homeIsOwner && !awayIsOwner) return;
    const won = homeIsOwner ? h > a : a > h;
    if (won) wins++;
    margins.push(homeIsOwner ? h - a : a - h);
  });

  return {
    sessions: sessions.length,
    games: margins.length,
    draftQualityAvgOvr: early.length ? mean(early) : null,
    avgStaffedPlays: staffedCounts.length ? mean(staffedCounts) : null,
    dedicatedTierPct: bestTiers.length ? pct(bestTiers.filter((t) => t === 'dedicated').length, bestTiers.length) : null,
    winRatePct: margins.length ? pct(wins, margins.length) : null,
    avgMargin: margins.length ? mean(margins) : null,
  };
}
