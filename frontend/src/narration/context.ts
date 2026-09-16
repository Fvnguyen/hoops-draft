/**
 * game_theater D11: the season context GameView's header shows (record, streak, rank,
 * head-to-head), computed AS OF a game day so replays of earlier days show what the
 * standings looked like then, not now. Pure; derived from the schedule's stored results.
 */
import type { Season } from '../engine/season';
import type { GameContext, TeamSeasonLine } from './types';

interface Line { seatIndex: number; wins: number; losses: number; diff: number; results: ('W' | 'L')[] }

function emptyLine(i: number): Line {
  return { seatIndex: i, wins: 0, losses: 0, diff: 0, results: [] };
}

function linesBefore(season: Season, gameIndex: number): Map<number, Line> {
  const lines = new Map<number, Line>();
  const get = (i: number) => {
    let l = lines.get(i);
    if (!l) { l = emptyLine(i); lines.set(i, l); }
    return l;
  };
  for (const entry of season.schedule) {
    if (entry.gameIndex >= gameIndex || !entry.played) continue;
    for (const m of entry.matchups) {
      if (!m.result) continue;
      const [h, a] = m.result.finalScore;
      const home = get(m.homeSeatIndex);
      const away = get(m.awaySeatIndex);
      const homeWon = h > a;
      home.wins += homeWon ? 1 : 0; home.losses += homeWon ? 0 : 1; home.diff += h - a; home.results.push(homeWon ? 'W' : 'L');
      away.wins += homeWon ? 0 : 1; away.losses += homeWon ? 1 : 0; away.diff += a - h; away.results.push(homeWon ? 'L' : 'W');
    }
  }
  return lines;
}

/** "W3" / "L1" from a chronological result list; "—" before the first game. */
export function streakOf(results: ('W' | 'L')[]): string {
  if (results.length === 0) return '—';
  const last = results[results.length - 1];
  let n = 0;
  for (let i = results.length - 1; i >= 0 && results[i] === last; i--) n++;
  return `${last}${n}`;
}

/** Head-to-head wins [homeSeat, awaySeat] over the days before `gameIndex`. */
function headToHeadBefore(season: Season, gameIndex: number, homeSeat: number, awaySeat: number): [number, number] {
  let hw = 0, aw = 0;
  for (const entry of season.schedule) {
    if (entry.gameIndex >= gameIndex || !entry.played) continue;
    for (const m of entry.matchups) {
      if (!m.result) continue;
      const pair = new Set([m.homeSeatIndex, m.awaySeatIndex]);
      if (!pair.has(homeSeat) || !pair.has(awaySeat)) continue;
      const winnerSeat = m.result.finalScore[0] > m.result.finalScore[1] ? m.homeSeatIndex : m.awaySeatIndex;
      if (winnerSeat === homeSeat) hw++; else aw++;
    }
  }
  return [hw, aw];
}

export function gameContextFor(
  season: Season,
  gameIndex: number,
  homeSeatIndex: number,
  awaySeatIndex: number,
  userSeatId?: string,
): GameContext {
  const lines = linesBefore(season, gameIndex);
  const seatCount = season.standings.length;
  const ranked = Array.from({ length: seatCount }, (_, i) => lines.get(i) ?? emptyLine(i))
    .sort((a, b) => b.wins - a.wins || b.diff - a.diff || a.seatIndex - b.seatIndex);
  const rankOf = new Map(ranked.map((l, idx) => [l.seatIndex, idx + 1]));
  const lineFor = (i: number): TeamSeasonLine => {
    const l = lines.get(i) ?? emptyLine(i);
    return { wins: l.wins, losses: l.losses, streak: streakOf(l.results), rank: rankOf.get(i) ?? seatCount, of: seatCount };
  };
  return {
    userSeatId,
    home: lineFor(homeSeatIndex),
    away: lineFor(awaySeatIndex),
    headToHead: headToHeadBefore(season, gameIndex, homeSeatIndex, awaySeatIndex),
  };
}
