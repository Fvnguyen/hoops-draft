/**
 * Box-score arithmetic shared by everything that totals rows (plan render_and_engine_perf
 * D6). Season totals (`season.ts`) and 82:0 totals (`challenge.ts`) each hand-copied the
 * same twenty `+=` lines; a column added to `PlayerBoxScore` had to be remembered in both,
 * and forgetting one silently produced a stat that never adds up.
 *
 * T2 (2026-09-21) moved `emptyBoxScore` and `boxScoreThrough` here from `game.ts` and
 * switched the two hand-copied callers (`season.ts`, `challenge.ts`) to `accumulateBoxRow`.
 */

import type { GameTheater, PlayerBoxScore } from './gameTypes';
import { OT_PERIOD_MINUTES, OT_POSS_PER_TEAM } from './balance';

/** Every column that is summed as-is. `minutes` is additive too but rounded (see below);
 *  `playerId`/`playerName` identify the row. A new numeric column belongs in this list —
 *  `boxscore-accumulate.test.ts` fails if `PlayerBoxScore` grows a number that is not covered. */
export const ADDITIVE_BOX_COLUMNS = [
  'possessions', 'points', 'twoPointers', 'threePointers', 'andOnes', 'turnovers', 'assists',
  'offensiveRebounds', 'defensiveRebounds', 'steals', 'blocks',
  'fieldGoalsMade', 'fieldGoalsAttempted', 'threesMade', 'threesAttempted',
  'freeThrowsMade', 'freeThrowsAttempted', 'plusMinus',
] as const satisfies readonly (keyof PlayerBoxScore)[];

/**
 * Adds one row into a running total, in place. Rows from saves that predate a column lack
 * it and count as 0. Minutes are kept to one decimal, re-rounded after every addition, so
 * a season of `x.x` values cannot drift into `1229.3999999999999`.
 *
 * Games played is deliberately NOT handled here: one game contributes 1 when the player
 * was on the floor, while merging two halves contributes that half's own count. That is
 * the caller's knowledge, not the row's.
 */
export function accumulateBoxRow(total: PlayerBoxScore, row: Partial<PlayerBoxScore>): void {
  total.minutes = Math.round((total.minutes + (row.minutes ?? 0)) * 10) / 10;
  for (const column of ADDITIVE_BOX_COLUMNS) total[column] += row[column] ?? 0;
}

/** A zeroed PlayerBoxScore row (every D9 field present). */
export function emptyBoxScore(playerId: string, playerName: string): PlayerBoxScore {
  return {
    playerId, playerName,
    minutes: 0, possessions: 0, points: 0,
    twoPointers: 0, threePointers: 0, andOnes: 0,
    turnovers: 0, assists: 0, offensiveRebounds: 0,
    defensiveRebounds: 0, steals: 0, blocks: 0,
    fieldGoalsMade: 0, fieldGoalsAttempted: 0, threesMade: 0, threesAttempted: 0,
    freeThrowsMade: 0, freeThrowsAttempted: 0, plusMinus: 0,
  };
}

/**
 * game_theater D9: the full box score after `theater.possessions[0..throughIndex]`, derived
 * from the events alone (GameView's live box during playback). Minutes: regulation
 * possessions share 48 minutes equally, each OT period's possessions share
 * OT_PERIOD_MINUTES — the same per-possession increments simulateGame accrued, summed in
 * the same order, so at the last index this reproduces `theater.boxScore` exactly
 * (boxscore.test.ts). The one non-event point — the MAX_OT_PERIODS tiebreak +1 that
 * simulateGame credits to the winner's first starter — is re-applied here when
 * `throughIndex` covers the last possession and `finalScore` exceeds its runningScore.
 */
export function boxScoreThrough(theater: GameTheater, throughIndex: number): { home: PlayerBoxScore[]; away: PlayerBoxScore[] } {
  // Side-keyed for the same reason simulateGame's map is (a card can be on both rosters).
  // This function is asserted to reproduce `theater.boxScore` at the last index, so the two
  // have to key identically or that invariant breaks the moment a duplicate appears.
  const stats = new Map<string, PlayerBoxScore>();
  for (const p of theater.homeTeam.players) stats.set(`home:${p.id}`, emptyBoxScore(p.id, p.player?.name ?? p.id));
  for (const p of theater.awayTeam.players) stats.set(`away:${p.id}`, emptyBoxScore(p.id, p.player?.name ?? p.id));

  const events = theater.possessions;
  const regulationPoss = events.filter(e => e.quarter <= 4).length || 1;
  const otPoss = new Map<number, number>();
  for (const e of events) if (e.quarter > 4) otPoss.set(e.quarter, (otPoss.get(e.quarter) ?? 0) + 1);

  const last = Math.min(throughIndex, events.length - 1);
  let prev: [number, number] = [0, 0];
  for (let i = 0; i <= last; i++) {
    const e = events[i];
    const minPerPoss = e.quarter <= 4 ? 48 / regulationPoss : OT_PERIOD_MINUTES / (otPoss.get(e.quarter) ?? OT_POSS_PER_TEAM * 2);
    // The offense is whichever side `e.team` names; the defense is the other one.
    const offKey = (id: string) => `${e.team}:${id}`;
    const defKey = (id: string) => `${e.team === 'home' ? 'away' : 'home'}:${id}`;
    for (const id of e.lineupOnCourt) { const b = stats.get(offKey(id)); if (b) { b.possessions++; b.minutes += minPerPoss; } }
    for (const id of e.defenseOnCourt) { const b = stats.get(defKey(id)); if (b) b.minutes += minPerPoss; }
    const points = e.team === 'home' ? e.runningScore[0] - prev[0] : e.runningScore[1] - prev[1];
    prev = e.runningScore;

    const shots = e.shots ?? [];
    const lastShot = shots.length ? shots[shots.length - 1] : undefined;
    if (points > 0 && e.scoringPlayerId) {
      const b = stats.get(offKey(e.scoringPlayerId));
      if (b) {
        b.points += points;
        if (e.shots && e.narrative) {
          // A scoring possession ends on the made shot (lastShot) or at the line (rim_ft:
          // no FGA, so lastShot is an earlier miss or absent). Mirrors simulateGame.
          const madeFg = e.narrative.kind !== 'rim_ft' && !!lastShot?.made;
          if (madeFg && lastShot!.channel !== 'three') b.twoPointers++;
          if (madeFg && lastShot!.channel === 'three') b.threePointers++;
          if (e.narrative.isAnd1) b.andOnes++;
        } else {
          // Pre-D9 event (no shots/narrative): infer from outcome + points.
          if (e.outcome === '3pt') { b.threePointers++; if (points === 4) b.andOnes++; }
          else if (points >= 2) { b.twoPointers++; if (e.outcome === 'and1') b.andOnes++; }
        }
      }
      if (e.assistPlayerId) { const a = stats.get(offKey(e.assistPlayerId)); if (a) a.assists++; }
    }
    if (e.turnoverPlayerId) { const b = stats.get(offKey(e.turnoverPlayerId)); if (b) b.turnovers++; }
    for (const id of e.offensiveRebounders ?? []) { const b = stats.get(offKey(id)); if (b) b.offensiveRebounds++; }
    for (const shot of shots) {
      const b = stats.get(offKey(shot.shooterId));
      if (b) {
        b.fieldGoalsAttempted++;
        if (shot.made) b.fieldGoalsMade++;
        if (shot.channel === 'three') { b.threesAttempted++; if (shot.made) b.threesMade++; }
      }
      if (shot.blockerId) { const d = stats.get(defKey(shot.blockerId)); if (d) d.blocks++; }
    }
    const ftA = e.narrative?.ftAttempted ?? 0;
    if (ftA > 0 && e.scoringPlayerId) {
      const b = stats.get(offKey(e.scoringPlayerId));
      if (b) { b.freeThrowsAttempted += ftA; b.freeThrowsMade += e.narrative?.ftMade ?? 0; }
    }
    if (e.stealPlayerId) { const d = stats.get(defKey(e.stealPlayerId)); if (d) d.steals++; }
    if (e.defensiveRebounderId) { const d = stats.get(defKey(e.defensiveRebounderId)); if (d) d.defensiveRebounds++; }
    if (points > 0) {
      for (const id of e.lineupOnCourt) { const b = stats.get(offKey(id)); if (b) b.plusMinus += points; }
      for (const id of e.defenseOnCourt) { const b = stats.get(defKey(id)); if (b) b.plusMinus -= points; }
    }
  }

  // Tiebreak point (see simulateGame): not an event, credited to the winner's first starter.
  if (last === events.length - 1 && events.length > 0) {
    const [h, a] = events[last].runningScore;
    const [fh, fa] = theater.finalScore;
    if (fh === h + 1 && fa === a) { const b = stats.get(`home:${theater.homeTeam.starters[0]}`); if (b) b.points += 1; }
    else if (fa === a + 1 && fh === h) { const b = stats.get(`away:${theater.awayTeam.starters[0]}`); if (b) b.points += 1; }
  }

  const byPoints = (x: PlayerBoxScore, y: PlayerBoxScore) => y.points - x.points;
  const rowsFor = (side: 'home' | 'away') => Array.from(stats.entries())
    .filter(([key]) => key.startsWith(`${side}:`))
    .map(([, b]) => ({ ...b, minutes: Math.round(b.minutes * 10) / 10 }))
    .sort(byPoints);
  return { home: rowsFor('home'), away: rowsFor('away') };
}
