/**
 * Post-game summary (plan D11): player of the game on a fixed game-score formula, the
 * user team's top and low performer, and roster hints from `hints.ts`. Pure.
 */
import type { GameScoreLine, GameSummary, GameTheater, PlayerBoxScore, Side } from './types';
import { MAX_HINTS, SUMMARY_MIN_POSSESSIONS } from './types';
import { rosterHints } from './hints';

/**
 * Hollinger game score: PTS + 0.4*FGM - 0.7*FGA - 0.4*(FTA-FTM) + 0.7*OREB + 0.3*DREB
 * + STL + 0.7*AST + 0.7*BLK - TOV, rounded to 0.1.
 */
export function gameScore(b: PlayerBoxScore): number {
  const raw = b.points
    + 0.4 * b.fieldGoalsMade
    - 0.7 * b.fieldGoalsAttempted
    - 0.4 * (b.freeThrowsAttempted - b.freeThrowsMade)
    + 0.7 * b.offensiveRebounds
    + 0.3 * b.defensiveRebounds
    + b.steals
    + 0.7 * b.assists
    + 0.7 * b.blocks
    - b.turnovers;
  return Math.round(raw * 10) / 10;
}

function line(theater: GameTheater, side: Side, box: PlayerBoxScore): GameScoreLine {
  const team = side === 'home' ? theater.homeTeam : theater.awayTeam;
  const name = team.players.find(p => p.id === box.playerId)?.player.name ?? box.playerName;
  return { playerId: box.playerId, name, side, gameScore: gameScore(box), box };
}

function sideLines(theater: GameTheater, side: Side): GameScoreLine[] {
  return theater.boxScore[side].map(b => line(theater, side, b));
}

/** Highest game score; ties go to more points, then to the home side. */
function best(lines: GameScoreLine[]): GameScoreLine | null {
  let top: GameScoreLine | null = null;
  for (const l of lines) {
    if (!top) { top = l; continue; }
    if (l.gameScore > top.gameScore) { top = l; continue; }
    if (l.gameScore === top.gameScore) {
      if (l.box.points > top.box.points) { top = l; continue; }
      if (l.box.points === top.box.points && l.side === 'home' && top.side !== 'home') top = l;
    }
  }
  return top;
}

/** Player of the game across both box scores (see `best` for tie-breaks). */
export function playerOfTheGame(theater: GameTheater): GameScoreLine {
  const all = [...sideLines(theater, 'home'), ...sideLines(theater, 'away')];
  const top = best(all);
  if (!top) throw new Error('playerOfTheGame: empty box score');
  return top;
}

function userSide(theater: GameTheater, userSeatId?: string): Side | null {
  if (!userSeatId) return null;
  if (theater.homeTeam.seatId === userSeatId) return 'home';
  if (theater.awayTeam.seatId === userSeatId) return 'away';
  return null;
}

export function summarizeGame(theater: GameTheater, userSeatId?: string): GameSummary {
  const summary: GameSummary = { playerOfTheGame: playerOfTheGame(theater) };
  const side = userSide(theater, userSeatId);
  if (!side) return summary;

  const lines = sideLines(theater, side);
  const top = best(lines);
  if (!top) return summary;

  let low: GameScoreLine | null = null;
  for (const l of lines) {
    if (l.box.possessions < SUMMARY_MIN_POSSESSIONS) continue;
    if (!low || l.gameScore < low.gameScore || (l.gameScore === low.gameScore && l.box.points < low.box.points)) low = l;
  }

  summary.userTeam = { side, top, low, hints: rosterHints(theater, side).slice(0, MAX_HINTS) };
  return summary;
}
