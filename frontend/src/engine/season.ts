/**
 * Season Engine
 *
 * Orchestrates a 7-game mini-season: schedule, standings, game results.
 * Persistence (localStorage) lives in `src/lib/legacyStorage.ts`, not here.
 */

import { DraftSession } from './deckbuilder';
import { simulateGame, buildTeamInfo, GameTheater, TeamInfo } from './game';
import { Rng, createRng, randomSeed, shuffle } from './rng';

// ── Types ──────────────────────────────────────────────────────────────────

export interface SeasonScheduleEntry {
  gameIndex: number;          // 0-6
  opponentSeatIndex: number;  // 1-7 (bot seat index in the draft session)
  result?: GameTheater;       // Populated after game is played
  played: boolean;
  /** RNG seed the game was (or will be) simulated with — set once the game is played. */
  seed?: number;
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
  /** RNG seed used to generate the opponent schedule order. */
  seed: number;
}

// ── Season Creation ────────────────────────────────────────────────────────

export function createSeason(
  session: DraftSession,
  rosterId: string,
  rng?: Rng
): Season {
  const seasonRng = rng ?? createRng(randomSeed());
  const humanTeam = buildTeamInfo(session.seats[0], true);

  // Randomize opponent order
  const opponentIndices = shuffle([1, 2, 3, 4, 5, 6, 7], seasonRng);

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
    seed: seasonRng.seed,
  };
}

// ── Play Next Game ─────────────────────────────────────────────────────────

export function playNextGame(
  season: Season,
  session: DraftSession,
  rng?: Rng
): { season: Season; gameResult: GameTheater } | null {
  if (season.currentGame >= 7) return null;

  const entry = season.schedule[season.currentGame];
  const opponentSeat = session.seats[entry.opponentSeatIndex];
  const opponentTeam = buildTeamInfo(opponentSeat, false);

  // Alternate home/away each game
  const isHomeGame = season.currentGame % 2 === 0;
  const homeTeam = isHomeGame ? season.humanTeam : opponentTeam;
  const awayTeam = isHomeGame ? opponentTeam : season.humanTeam;

  // Reuse the entry's stored seed when replaying a game that was already
  // simulated once (e.g. re-deriving box scores); otherwise mint a fresh one.
  const gameRng = rng ?? createRng(entry.seed ?? randomSeed());
  const gameResult = simulateGame(homeTeam, awayTeam, { rng: gameRng });

  // Determine human result
  const humanIsHome = isHomeGame;
  const humanScore = humanIsHome ? gameResult.finalScore[0] : gameResult.finalScore[1];
  const oppScore = humanIsHome ? gameResult.finalScore[1] : gameResult.finalScore[0];
  const humanWon = humanScore > oppScore;

  // Update schedule
  entry.result = gameResult;
  entry.played = true;
  entry.seed = gameResult.seed;

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
