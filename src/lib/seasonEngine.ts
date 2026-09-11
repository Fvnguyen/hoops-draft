/**
 * Season Engine
 * 
 * Orchestrates a 7-game mini-season: schedule, standings, game results.
 * Persists season state to localStorage for resume/review.
 */

import { DraftSession } from './botDeckBuilder';
import { simulateGame, buildTeamInfo, GameTheater, TeamInfo } from './gameEngine';

// ── Types ──────────────────────────────────────────────────────────────────

export interface SeasonScheduleEntry {
  gameIndex: number;          // 0-6
  opponentSeatIndex: number;  // 1-7 (bot seat index in the draft session)
  result?: GameTheater;       // Populated after game is played
  played: boolean;
}

export interface StandingsEntry {
  seatId: string;
  name: string;
  wins: number;
  losses: number;
  pointsFor: number;
  pointsAgainst: number;
  pointDiff: number;
}

export interface Season {
  id: string;
  sessionId: string;         // Draft session this season belongs to
  rosterId: string;           // Human roster ID
  timestamp: string;
  schedule: SeasonScheduleEntry[];
  standings: StandingsEntry[];
  currentGame: number;        // Next game to play (0-6, or 7 if complete)
  humanTeam: TeamInfo;
}

// ── Season Creation ────────────────────────────────────────────────────────

export function createSeason(
  session: DraftSession,
  rosterId: string
): Season {
  const humanTeam = buildTeamInfo(session.seats[0], true);
  
  // Randomize opponent order
  const opponentIndices = [1, 2, 3, 4, 5, 6, 7];
  for (let i = opponentIndices.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [opponentIndices[i], opponentIndices[j]] = [opponentIndices[j], opponentIndices[i]];
  }
  
  const schedule: SeasonScheduleEntry[] = opponentIndices.map((seatIdx, gameIdx) => ({
    gameIndex: gameIdx,
    opponentSeatIndex: seatIdx,
    played: false,
  }));
  
  // Initialize standings with all 8 seats
  const standings: StandingsEntry[] = session.seats.map((seat, idx) => ({
    seatId: seat.id,
    name: idx === 0 ? 'You' : (seat.botProfile?.name || seat.id),
    wins: 0,
    losses: 0,
    pointsFor: 0,
    pointsAgainst: 0,
    pointDiff: 0,
  }));
  
  return {
    id: `season_${Date.now()}`,
    sessionId: session.id,
    rosterId,
    timestamp: new Date().toISOString(),
    schedule,
    standings,
    currentGame: 0,
    humanTeam,
  };
}

// ── Play Next Game ─────────────────────────────────────────────────────────

export function playNextGame(
  season: Season,
  session: DraftSession
): { season: Season; gameResult: GameTheater } | null {
  if (season.currentGame >= 7) return null;
  
  const entry = season.schedule[season.currentGame];
  const opponentSeat = session.seats[entry.opponentSeatIndex];
  const opponentTeam = buildTeamInfo(opponentSeat, false);
  
  // Alternate home/away each game
  const isHomeGame = season.currentGame % 2 === 0;
  const homeTeam = isHomeGame ? season.humanTeam : opponentTeam;
  const awayTeam = isHomeGame ? opponentTeam : season.humanTeam;
  
  const gameResult = simulateGame(homeTeam, awayTeam);
  
  // Determine human result
  const humanIsHome = isHomeGame;
  const humanScore = humanIsHome ? gameResult.finalScore[0] : gameResult.finalScore[1];
  const oppScore = humanIsHome ? gameResult.finalScore[1] : gameResult.finalScore[0];
  const humanWon = humanScore > oppScore;
  
  // Update schedule
  entry.result = gameResult;
  entry.played = true;
  
  // Update standings
  const humanStanding = season.standings.find(s => s.seatId === 'human-0');
  const oppStanding = season.standings.find(s => s.seatId === opponentSeat.id);
  
  if (humanStanding) {
    if (humanWon) humanStanding.wins++; else humanStanding.losses++;
    humanStanding.pointsFor += humanScore;
    humanStanding.pointsAgainst += oppScore;
    humanStanding.pointDiff = humanStanding.pointsFor - humanStanding.pointsAgainst;
  }
  
  if (oppStanding) {
    if (!humanWon) oppStanding.wins++; else oppStanding.losses++;
    oppStanding.pointsFor += oppScore;
    oppStanding.pointsAgainst += humanScore;
    oppStanding.pointDiff = oppStanding.pointsFor - oppStanding.pointsAgainst;
  }
  
  // Sort standings: wins desc, then point diff desc
  season.standings.sort((a, b) => {
    if (b.wins !== a.wins) return b.wins - a.wins;
    return b.pointDiff - a.pointDiff;
  });
  
  season.currentGame++;
  
  return { season, gameResult };
}

// ── Persistence ────────────────────────────────────────────────────────────

const SEASONS_KEY = 'hoops-draft-seasons';

export function saveSeason(season: Season): void {
  const seasons = getAllSeasons();
  const existing = seasons.findIndex(s => s.id === season.id);
  if (existing >= 0) seasons[existing] = season;
  else seasons.push(season);
  localStorage.setItem(SEASONS_KEY, JSON.stringify(seasons));
}

export function getAllSeasons(): Season[] {
  try {
    return JSON.parse(localStorage.getItem(SEASONS_KEY) || '[]');
  } catch { return []; }
}

export function getSeason(seasonId: string): Season | null {
  return getAllSeasons().find(s => s.id === seasonId) ?? null;
}

export function getSeasonByRoster(rosterId: string): Season | null {
  return getAllSeasons().find(s => s.rosterId === rosterId) ?? null;
}
