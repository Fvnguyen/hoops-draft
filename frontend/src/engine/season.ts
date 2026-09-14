/**
 * Season Engine
 *
 * Orchestrates a 7-game mini-season: schedule, standings, game results.
 * Persistence lives in `src/storage` (GameStore), not here.
 */

import { DraftSession } from './deckbuilder';
import { simulateGame, buildTeamInfo, GameTheater, TeamInfo, PlayerBoxScore } from './game';
import { Rng, createRng, randomSeed } from './rng';
import { BALANCE_VERSION } from './balance';

// ── Types ──────────────────────────────────────────────────────────────────

/**
 * Persisted shape of a completed game (plan_data_storage D1): a seed + the two seats'
 * indices + the final box score, NOT the full `GameTheater` (possessions, substitutions,
 * quarter summaries, bonuses). The theater is re-derived on demand with
 * `simulateGame(homeTeamInfo, awayTeamInfo, { rng: createRng(seed) })` — see
 * `resolveMatchupReplay` below.
 *
 * Structurally identical to `StoredGameResult` in `@/storage/types` (the wave-0 storage
 * contract) but declared independently here rather than imported: `src/engine` must stay
 * free of any dependency on `src/storage` (storage already imports `Season` from this
 * file, so importing back would be circular and would also violate the engine-purity
 * rule enforced by `tests/unit/engine-purity.test.ts`). If the two shapes ever drift,
 * TypeScript's structural typing still accepts values that satisfy both — but they
 * should be kept in sync by hand.
 */
export interface StoredGameResult {
  /**
   * Absent only when `legacyTheater` is set (D8): a pre-Phase-1 game had no persisted
   * seed at all, so there's no real seed to fabricate for it. Always present otherwise
   * (every game created after this plan, and every migrated game that did have a seed).
   */
  seed?: number;
  /** engine/balance.ts BALANCE_VERSION at the time this game was simulated. Absent under
   *  the same condition as `seed`. */
  balanceVersion?: number;
  homeSeatIndex: number;
  awaySeatIndex: number;
  finalScore: [number, number];
  boxScore: { home: PlayerBoxScore[]; away: PlayerBoxScore[] };
  isOvertime: boolean;
  overtimePeriods: number;
  /**
   * D8: a game stored under the old shape (pre-Phase-1, no seed at all — the whole
   * object WAS the `GameTheater`) keeps its full theater here, read-only, instead of
   * being re-simulated. Absent on every game created after this plan. See
   * `normalizeSeason`/`normalizeMatchupResult` for how old saves get wrapped.
   */
  legacyTheater?: unknown;
}

export interface SeasonMatchup {
  homeSeatIndex: number;
  awaySeatIndex: number;
  result?: StoredGameResult;
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
  ownerId?: string;
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
  rng?: Rng,
  /** Human team/standings label (account display name); defaults to 'You'. */
  humanName: string = 'You'
): Season {
  const seasonRng = rng ?? createRng(randomSeed());
  const humanTeam = buildTeamInfo(session.seats[0], true, humanName);

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
    name: idx === 0 ? humanName : (seat.botProfile?.name || seat.id),
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
    const theater = simulateGame(homeTeam, awayTeam, { rng: gameRng });

    // D1: persist the slim result, not the full theater — it's re-simulated on view.
    // D6 (100 KB/season budget): a full round robin day plays 4 matchups, not just the
    // human's one, and the box score (24 players' worth) is what dominates the stored
    // size. Only the human's own matchup is ever replayed or its box score shown
    // (SeasonView only calls resolveMatchupReplay on the human's game) — bot-vs-bot
    // matchups keep the score/seed for standings and re-simulation but drop the box
    // score, cutting a season from ~130 KB to well under the budget.
    matchup.result = {
      seed: theater.seed,
      balanceVersion: BALANCE_VERSION,
      homeSeatIndex: matchup.homeSeatIndex,
      awaySeatIndex: matchup.awaySeatIndex,
      finalScore: theater.finalScore,
      boxScore: isHumanMatch ? theater.boxScore : { home: [], away: [] },
      isOvertime: theater.isOvertime,
      overtimePeriods: theater.overtimePeriods,
    };
    matchup.seed = theater.seed;

    if (isHumanMatch) {
      humanGameResult = theater;
    }

    // Update Standings
    const homeScore = theater.finalScore[0];
    const awayScore = theater.finalScore[1];
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

// ── Standings recomputation (accounts_cloud_saves D4) ──────────────────────

/**
 * Rebuild `standings` from `schedule` alone (every played matchup's `finalScore`),
 * rather than trusting an incrementally-updated `standings` array. Used by
 * `storage/merge.ts`'s `mergeSeason` after merging two divergent copies of a season's
 * schedule, so a cross-device merge can never leave standings out of sync with the
 * schedule that produced them. Pure and deterministic: same schedule + session always
 * produces the same standings, in the same sorted order `playNextGame` uses (wins desc,
 * then point differential desc).
 */
export function recomputeStandingsFromSchedule(
  schedule: SeasonScheduleEntry[],
  session: DraftSession,
  humanName: string = 'You'
): StandingsEntry[] {
  const standings: StandingsEntry[] = session.seats.map((seat, idx) => ({
    seatId: seat.id,
    name: idx === 0 ? humanName : (seat.botProfile?.name || seat.id),
    wins: 0,
    losses: 0,
    pointsFor: 0,
    pointsAgainst: 0,
    pointDiff: 0,
  }));

  for (const entry of schedule) {
    if (!entry.played) continue;
    for (const matchup of entry.matchups ?? []) {
      if (!matchup.result) continue;
      const [homeScore, awayScore] = matchup.result.finalScore;
      const homeWon = homeScore > awayScore;
      const homeStanding = standings.find((s) => s.seatId === session.seats[matchup.homeSeatIndex]?.id);
      const awayStanding = standings.find((s) => s.seatId === session.seats[matchup.awaySeatIndex]?.id);

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
  }

  standings.sort((a, b) => (b.wins !== a.wins ? b.wins - a.wins : b.pointDiff - a.pointDiff));
  return standings;
}

// ── Legacy shape upgrade ───────────────────────────────────────────────────

/** Schedule entry shape used before round-robin game days (one human game per entry). */
interface LegacyScheduleEntry {
  gameIndex: number;
  opponentSeatIndex: number;
  played: boolean;
  result?: GameTheater;
  seed?: number;
  matchups?: undefined;
}

/**
 * D8: a matchup's `result` may still be a full pre-plan `GameTheater` (recognizable by
 * its `possessions` array, which `StoredGameResult` never has) instead of the slim D1
 * shape. The discriminant matches the Dexie upgrade step's own conversion
 * (`convertMatchupResultToD1Shape` in `src/storage/indexedDb.ts`) so both code paths
 * produce identical output and running one after the other is a no-op:
 *  - a numeric `seed` on the old theater means it CAN be re-simulated — reduce it to
 *    the slim shape, tagged with the CURRENT `BALANCE_VERSION` (there is no earlier
 *    version to preserve; this is the first release that tracks one);
 *  - no seed at all (truly pre-Phase-1) means there's nothing to re-simulate from —
 *    keep the full theater read-only under `legacyTheater`, with `seed`/`balanceVersion`
 *    left unset rather than fabricated.
 * Returns unchanged when `raw` is already D1-shaped (or absent).
 */
function normalizeMatchupResult(
  raw: StoredGameResult | GameTheater | undefined,
  homeSeatIndex: number,
  awaySeatIndex: number
): { result: StoredGameResult | undefined; changed: boolean } {
  if (!raw) return { result: undefined, changed: false };
  if ('possessions' in raw) {
    const theater = raw as GameTheater;
    const hasSeed = typeof theater.seed === 'number';
    return {
      changed: true,
      result: {
        ...(hasSeed
          ? { seed: theater.seed, balanceVersion: BALANCE_VERSION }
          : { legacyTheater: theater }),
        homeSeatIndex,
        awaySeatIndex,
        finalScore: theater.finalScore,
        boxScore: theater.boxScore,
        isOvertime: !!theater.isOvertime,
        overtimePeriods: theater.overtimePeriods ?? 0,
      },
    };
  }
  return { result: raw as StoredGameResult, changed: false };
}

/**
 * Upgrade a season to the current shape. Handles two eras of legacy data:
 *  - schedule entries saved before round-robin game days (one human game per entry,
 *    `opponentSeatIndex` + `result`) become a game day with one matchup;
 *  - matchup results saved before this plan (D1) as a full `GameTheater` get wrapped
 *    into `legacyTheater` (D8) rather than the slim `{ seed, balanceVersion, ... }` shape.
 * Returns the same object when nothing needed changing.
 */
export function normalizeSeason(season: Season): { season: Season; changed: boolean } {
  let changed = false;

  // A matchup's `result` may still be an un-normalized `GameTheater` at this point
  // (D8) — normalized to `StoredGameResult` below before this function returns.
  type RawMatchup = Omit<SeasonMatchup, 'result'> & { result?: StoredGameResult | GameTheater };

  const schedule = (season.schedule ?? []).map((raw): SeasonScheduleEntry => {
    const entry = raw as SeasonScheduleEntry | LegacyScheduleEntry;
    let matchups: RawMatchup[];
    let played: boolean;

    if (Array.isArray(entry.matchups)) {
      matchups = entry.matchups;
      played = entry.played;
    } else {
      changed = true;
      const legacy = entry as LegacyScheduleEntry;
      const humanHome = legacy.gameIndex % 2 === 0;
      const opponent = legacy.opponentSeatIndex ?? 1;
      matchups = [{
        homeSeatIndex: humanHome ? 0 : opponent,
        awaySeatIndex: humanHome ? opponent : 0,
        result: legacy.result,
        seed: legacy.seed,
      }];
      played = !!legacy.played;
    }

    const normalizedMatchups = matchups.map((m): SeasonMatchup => {
      const { result, changed: resultChanged } = normalizeMatchupResult(
        m.result,
        m.homeSeatIndex,
        m.awaySeatIndex
      );
      if (resultChanged) changed = true;
      return { ...m, result };
    });

    return { gameIndex: entry.gameIndex, played, matchups: normalizedMatchups };
  });

  return changed ? { season: { ...season, schedule }, changed } : { season, changed };
}

/** The human's matchup on a game day, if any. */
export function humanMatchup(entry: SeasonScheduleEntry): SeasonMatchup | undefined {
  return (entry.matchups ?? []).find(m => m.homeSeatIndex === 0 || m.awaySeatIndex === 0);
}

// ── Replay (view-time re-simulation, D1/D8) ────────────────────────────────

/**
 * Full `TeamInfo` for a seat in a season, for re-simulating a past matchup. Only the
 * human gets a persisted snapshot (`season.humanTeam`) — bots don't need one since
 * their roster is deterministically rebuilt from the draft session (`session.seats`),
 * which already embeds each player's card.
 */
export function teamInfoForSeat(season: Season, session: DraftSession, seatIndex: number): TeamInfo {
  return seatIndex === 0 ? season.humanTeam : buildTeamInfo(session.seats[seatIndex], false);
}

export type MatchupReplay =
  | { kind: 'theater'; theater: GameTheater }
  | { kind: 'legacy'; theater: GameTheater }
  | { kind: 'versionMismatch'; result: StoredGameResult };

/**
 * Reconstruct a played matchup for viewing (D1/D8):
 *  - a pre-plan full theater (`legacyTheater`) is shown read-only as-is;
 *  - a D1 result whose `balanceVersion` doesn't match the current `BALANCE_VERSION`
 *    can't be safely re-simulated (engine rules changed under the same seed) — the
 *    caller should show the box score with a notice instead;
 *  - otherwise the theater is re-simulated fresh from the seed and the two TeamInfo
 *    snapshots.
 */
export function resolveMatchupReplay(
  result: StoredGameResult,
  homeTeam: TeamInfo,
  awayTeam: TeamInfo
): MatchupReplay {
  if (result.legacyTheater) {
    return { kind: 'legacy', theater: result.legacyTheater as GameTheater };
  }
  // `seed` is only ever absent alongside `legacyTheater` (see StoredGameResult) — this
  // check is defensive, not an expected path.
  if (result.balanceVersion !== BALANCE_VERSION || result.seed === undefined) {
    return { kind: 'versionMismatch', result };
  }
  const theater = simulateGame(homeTeam, awayTeam, { rng: createRng(result.seed) });
  return { kind: 'theater', theater };
}
