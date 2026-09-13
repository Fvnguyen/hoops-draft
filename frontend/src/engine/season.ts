/**
 * Season Engine
 *
 * Orchestrates a 7-game mini-season: schedule, standings, game results.
 * Persistence lives in `src/storage` (GameStore), not here.
 */

import { DraftSession } from './deckbuilder';
import { simulateGame, buildTeamInfo, GameTheater, TeamInfo } from './game';
import { Rng, createRng, randomSeed, shuffle } from './rng';

// ── Types ──────────────────────────────────────────────────────────────────

export interface SeasonMatchup {
  homeSeatIndex: number;
  awaySeatIndex: number;
  result?: GameTheater;
  seed?: number;
}

export interface SeasonScheduleEntry {
  gameIndex: number;          // 0-6
  matchups: SeasonMatchup[];  // 4 matchups per Game Day
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

  // Calculate bot OVRs to sort them from weakest to strongest
  const botOvr = new Map<number, number>();
  for (let i = 1; i < 8; i++) {
    const seat = session.seats[i];
    const activeIds = Object.values(seat.builtRoster.depthChart).flat();
    let sum = 0;
    let count = 0;
    for (const card of seat.drafted) {
      if (card.type !== 'Player' || !activeIds.includes(card.id)) continue;
      // Internal only: used to order the human's opponents weakest → strongest.
      // Never surfaced to the user (product rule: no OVR shown).
      sum += card.ratings?.overall ?? 0;
      count++;
    }
    botOvr.set(i, count > 0 ? sum / count : 0);
  }

  // Sort bot indices by OVR ascending
  const sortedBots = [1, 2, 3, 4, 5, 6, 7].sort((a, b) => (botOvr.get(a) || 0) - (botOvr.get(b) || 0));

  // Circle Scheduling Algorithm
  const schedule: SeasonScheduleEntry[] = [];
  
  // We want the human (0) to play sortedBots[r] in round r.
  // We maintain a circle array A of 7 bots. 
  // By rotating A to the left each round, A[0] sweeps through sortedBots in order.
  let circle = [...sortedBots];
  
  for (let r = 0; r < 7; r++) {
    const matchups: SeasonMatchup[] = [];
    
    // Match 1: Human (0) vs circle[0]
    // Alternate home/away for the human based on round
    if (r % 2 === 0) {
      matchups.push({ homeSeatIndex: 0, awaySeatIndex: circle[0] });
    } else {
      matchups.push({ homeSeatIndex: circle[0], awaySeatIndex: 0 });
    }
    
    // Remaining 6 bots pair off: circle[6-i] vs circle[i+1] for i=0..2
    for (let i = 0; i < 3; i++) {
      const b1 = circle[6 - i];
      const b2 = circle[i + 1];
      // Alternate home/away to be fair
      if ((r + i) % 2 === 0) {
        matchups.push({ homeSeatIndex: b1, awaySeatIndex: b2 });
      } else {
        matchups.push({ homeSeatIndex: b2, awaySeatIndex: b1 });
      }
    }
    
    schedule.push({
      gameIndex: r,
      matchups,
      played: false
    });
    
    // Rotate circle left by 1 for the next round
    circle = [...circle.slice(1), circle[0]];
  }

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
  let humanGameResult: GameTheater | null = null;

  for (const matchup of entry.matchups) {
    const isHumanMatch = matchup.homeSeatIndex === 0 || matchup.awaySeatIndex === 0;
    const homeTeam = matchup.homeSeatIndex === 0 ? season.humanTeam : buildTeamInfo(session.seats[matchup.homeSeatIndex], false);
    const awayTeam = matchup.awaySeatIndex === 0 ? season.humanTeam : buildTeamInfo(session.seats[matchup.awaySeatIndex], false);

    // Reuse seed if replaying
    const gameRng = rng ?? createRng(matchup.seed ?? randomSeed());
    const result = simulateGame(homeTeam, awayTeam, { rng: gameRng });

    matchup.result = result;
    matchup.seed = result.seed;

    if (isHumanMatch) {
      humanGameResult = result;
    }

    // Update Standings
    const homeScore = result.finalScore[0];
    const awayScore = result.finalScore[1];
    const homeWon = homeScore > awayScore;

    const homeStanding = season.standings.find(s => s.seatId === session.seats[matchup.homeSeatIndex].id);
    const awayStanding = season.standings.find(s => s.seatId === session.seats[matchup.awaySeatIndex].id);

    if (homeStanding) {
      if (homeWon) homeStanding.wins++; else homeStanding.losses++;
      homeStanding.pointsFor += homeScore;
      homeStanding.pointsAgainst += awayScore;
      homeStanding.pointDiff = homeStanding.pointsFor - homeStanding.pointsAgainst;
    }
    if (awayStanding) {
      if (!homeWon) awayStanding.wins++; else awayStanding.losses++;
      awayStanding.pointsFor += awayScore;
      awayStanding.pointsAgainst += homeScore;
      awayStanding.pointDiff = awayStanding.pointsFor - awayStanding.pointsAgainst;
    }
  }

  entry.played = true;

  // Sort standings: wins desc, then point diff desc
  season.standings.sort((a, b) => {
    if (b.wins !== a.wins) return b.wins - a.wins;
    return b.pointDiff - a.pointDiff;
  });

  season.currentGame++;

  return { season, gameResult: humanGameResult! };
}
