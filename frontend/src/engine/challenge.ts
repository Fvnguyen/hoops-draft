/**
 * 82:0 Challenge mode — pure engine half.
 *
 * Plan: `docs/plans/plan_challenge_mode_2026-09-17.md` (D3, D4, D6, D7, D9).
 *
 * One 82-game season for a drafted roster against all 30 real NBA teams, built from
 * our own card pool. Everything here is pure and seeded: a run's `seed` plus a game
 * index fully determines that game, so the reveal animation, its speed controls, a
 * skip and a browser reload can never shift a result. The reveal itself is pure
 * presentation over results this module already committed (D7).
 */

import type { PlayerCardData, Play, DraftCard, Rarity } from './types';
import { createRng, shuffle, type Rng } from './rng';
import { buildBotRoster, chooseBotArchetypes, type DraftSessionSeat } from './deckbuilder';
import {
  buildTeamInfo, simulateGame, emptyBoxScore,
  type EdgeTuning, type TeamInfo, type PlayerBoxScore,
} from './game';
import { PLAY_CATALOG } from './plays';
import { DEPTH_COLUMNS } from './positions';
import { NBA_ROSTER_POOL, CHALLENGE_GAMES, CHALLENGE_TUNING, TRADE_OFFERS, TRADE_RARITY_WEIGHTS, TRADE_DROPPED_RARITY_BOOST } from './balance';

// ── The 30 opponents ────────────────────────────────────────────────────────

export interface NbaTeam {
  /** basketball-reference abbreviation — matches `card.player.team` exactly. */
  abbr: string;
  city: string;
  name: string;
}

/**
 * Abbreviations are bref's, because that is what every card carries. Three of them
 * differ from the NBA feed's spelling (BRK/CHO/PHO vs BKN/CHA/PHX); `cardColors.ts`
 * carries aliases for both so colours and logos resolve either way.
 */
export const NBA_TEAMS: NbaTeam[] = [
  { abbr: 'ATL', city: 'Atlanta', name: 'Hawks' },
  { abbr: 'BOS', city: 'Boston', name: 'Celtics' },
  { abbr: 'BRK', city: 'Brooklyn', name: 'Nets' },
  { abbr: 'CHO', city: 'Charlotte', name: 'Hornets' },
  { abbr: 'CHI', city: 'Chicago', name: 'Bulls' },
  { abbr: 'CLE', city: 'Cleveland', name: 'Cavaliers' },
  { abbr: 'DAL', city: 'Dallas', name: 'Mavericks' },
  { abbr: 'DEN', city: 'Denver', name: 'Nuggets' },
  { abbr: 'DET', city: 'Detroit', name: 'Pistons' },
  { abbr: 'GSW', city: 'Golden State', name: 'Warriors' },
  { abbr: 'HOU', city: 'Houston', name: 'Rockets' },
  { abbr: 'IND', city: 'Indiana', name: 'Pacers' },
  { abbr: 'LAC', city: 'LA', name: 'Clippers' },
  { abbr: 'LAL', city: 'Los Angeles', name: 'Lakers' },
  { abbr: 'MEM', city: 'Memphis', name: 'Grizzlies' },
  { abbr: 'MIA', city: 'Miami', name: 'Heat' },
  { abbr: 'MIL', city: 'Milwaukee', name: 'Bucks' },
  { abbr: 'MIN', city: 'Minnesota', name: 'Timberwolves' },
  { abbr: 'NOP', city: 'New Orleans', name: 'Pelicans' },
  { abbr: 'NYK', city: 'New York', name: 'Knicks' },
  { abbr: 'OKC', city: 'Oklahoma City', name: 'Thunder' },
  { abbr: 'ORL', city: 'Orlando', name: 'Magic' },
  { abbr: 'PHI', city: 'Philadelphia', name: '76ers' },
  { abbr: 'PHO', city: 'Phoenix', name: 'Suns' },
  { abbr: 'POR', city: 'Portland', name: 'Trail Blazers' },
  { abbr: 'SAC', city: 'Sacramento', name: 'Kings' },
  { abbr: 'SAS', city: 'San Antonio', name: 'Spurs' },
  { abbr: 'TOR', city: 'Toronto', name: 'Raptors' },
  { abbr: 'UTA', city: 'Utah', name: 'Jazz' },
  { abbr: 'WAS', city: 'Washington', name: 'Wizards' },
];

const ovr = (p: PlayerCardData) => p.ratings?.overall ?? 0;

/**
 * Build one NBA team the same way a bot builds a drafted roster (D3): its top
 * `NBA_ROSTER_POOL` cards by OVR, handed to `buildBotRoster` together with the FULL play
 * catalog, so the team picks the three plays it can actually staff and an identity to
 * match. `buildBotRoster` then trims itself to the 12-man `TARGET_ROSTER`.
 *
 * Two corrections on top.
 *
 * `excludeIds` (the user's own cards) must be held out, because a card the user drafted is
 * still on its real team's list: draft a Celtic and Boston would field him against you in
 * the same game. That is not just cosmetically odd — `simulateGame` keys its box score by
 * player id in ONE map for both sides (game.ts), so a shared id merges into a single row
 * that is then emitted into BOTH box scores, and the two teams' totals stop reconciling
 * with the final score. Measured before this fix: 13 of 41 games off, by up to 32 points.
 * Holding the ids out removes the collision at its source. A team short of a full roster
 * afterwards is topped up with the best cards left in the league — opponent rosters are
 * never displayed in v1, so a borrowed twelfth man is invisible, while four-on-five is not.
 *
 * And a real NBA roster can leave a depth-chart column empty (MEM has no eligible centre),
 * which is also not a fair opponent. Any empty column is backfilled with the best active
 * player who isn't already a starter, taken out of the deepest column — the active twelve
 * never changes, so play roles stay valid; only the starting five moves, so the identity is
 * re-picked against it.
 */
export function buildNbaTeamRoster(
  cards: PlayerCardData[],
  abbr: string,
  plays: Play[] = PLAY_CATALOG,
  excludeIds: ReadonlySet<string> = new Set(),
): DraftSessionSeat {
  const available = cards.filter((c) => !excludeIds.has(c.id));
  const pool = available
    .filter((c) => c.player?.team === abbr)
    .sort((a, b) => ovr(b) - ovr(a))
    .slice(0, NBA_ROSTER_POOL);

  if (pool.length < NBA_ROSTER_POOL) {
    const own = new Set(pool.map((c) => c.id));
    const fill = available
      .filter((c) => !own.has(c.id))
      .sort((a, b) => ovr(b) - ovr(a))
      .slice(0, NBA_ROSTER_POOL - pool.length);
    pool.push(...fill);
  }

  const drafted: DraftCard[] = [...pool, ...plays];
  const roster = buildBotRoster(drafted);
  const byId = new Map(pool.map((p) => [p.id, p]));

  const depthChart: Record<string, string[]> = Object.fromEntries(
    DEPTH_COLUMNS.map((col) => [col, [...(roster.depthChart[col] ?? [])]])
  );

  for (const col of DEPTH_COLUMNS) {
    if (depthChart[col].length > 0) continue;
    // Deepest column with a spare non-starter; its best reserve moves over.
    const donor = DEPTH_COLUMNS
      .filter((c) => depthChart[c].length > 1)
      .sort((a, b) => depthChart[b].length - depthChart[a].length)[0];
    if (!donor) break;
    const reserves = depthChart[donor].slice(1);
    const best = reserves.sort((a, b) => ovr(byId.get(b)!) - ovr(byId.get(a)!))[0];
    depthChart[donor] = depthChart[donor].filter((id) => id !== best);
    depthChart[col] = [best];
  }

  const activePlayers = DEPTH_COLUMNS.flatMap((col) => depthChart[col]).map((id) => byId.get(id)!).filter(Boolean);
  const starterIds = new Set(DEPTH_COLUMNS.map((col) => depthChart[col][0]).filter(Boolean));

  return {
    id: `nba-${abbr}`,
    isBot: true,
    drafted,
    builtRoster: { ...roster, depthChart, archetypes: chooseBotArchetypes(activePlayers, starterIds) },
  };
}

/**
 * All 30 opponents as game-ready `TeamInfo`s, keyed by abbreviation. Pass the user's own
 * card ids as `excludeIds` for a real run, so nobody suits up against himself.
 */
export function buildNbaTeams(
  cards: PlayerCardData[],
  plays: Play[] = PLAY_CATALOG,
  excludeIds: ReadonlySet<string> = new Set(),
): Map<string, TeamInfo> {
  const teams = new Map<string, TeamInfo>();
  for (const t of NBA_TEAMS) {
    const seat = buildNbaTeamRoster(cards, t.abbr, plays, excludeIds);
    const info = buildTeamInfo(seat, false);
    teams.set(t.abbr, { ...info, name: `${t.city} ${t.name}` });
  }
  return teams;
}

// ── Schedule and seeds (D4) ─────────────────────────────────────────────────

export interface ChallengeScheduleEntry {
  /** 0-based game number, 0..81. */
  index: number;
  opponent: string;
  /** The user is home on even indices. */
  isHome: boolean;
}

/**
 * 82 games: the 30 teams shuffled once by the run seed, that sequence repeated three
 * times, the first 82 taken. Every team therefore appears 2 or 3 times.
 */
export function buildChallengeSchedule(runSeed: number): ChallengeScheduleEntry[] {
  const order = shuffle(NBA_TEAMS.map((t) => t.abbr), createRng(mixSeed(runSeed, 'schedule')));
  const schedule: ChallengeScheduleEntry[] = [];
  for (let i = 0; i < CHALLENGE_GAMES; i++) {
    schedule.push({ index: i, opponent: order[i % order.length], isHome: i % 2 === 0 });
  }
  return schedule;
}

/**
 * Derive a sub-seed from the run seed and a label/index. Every game, the trade pack and
 * the schedule draw their own stream this way rather than sharing one, so results can
 * never depend on the order things are asked for (reveal speed, skip, reload).
 */
export function mixSeed(runSeed: number, label: string | number): number {
  let h = (runSeed ^ 0x9e3779b9) >>> 0;
  const s = String(label);
  for (let i = 0; i < s.length; i++) {
    h = Math.imul(h ^ s.charCodeAt(i), 0x01000193) >>> 0;
  }
  h = Math.imul(h ^ (h >>> 16), 0x85ebca6b) >>> 0;
  return (h ^ (h >>> 13)) >>> 0;
}

/** The seed game `index` of this run is simulated with. */
export function challengeGameSeed(runSeed: number, index: number): number {
  return mixSeed(runSeed, `game:${index}`);
}

// ── Grades (D6) ─────────────────────────────────────────────────────────────

export interface ChallengeGrade {
  grade: string;
  title: string;
  /** Inclusive win range. */
  min: number;
  max: number;
}

/** The reference ladder, best first. Contiguous and covering 0..82 with no gaps. */
export const CHALLENGE_GRADES: ChallengeGrade[] = [
  { grade: 'S+', title: 'Immortal',  min: 82, max: 82 },
  { grade: 'S',  title: 'Perfect',   min: 80, max: 81 },
  { grade: 'A+', title: 'Historic',  min: 72, max: 79 },
  { grade: 'A',  title: 'Dynasty',   min: 66, max: 71 },
  { grade: 'A-', title: 'Dynasty',   min: 62, max: 65 },
  { grade: 'B+', title: 'Contender', min: 61, max: 61 },
  { grade: 'B',  title: 'Contender', min: 59, max: 60 },
  { grade: 'B-', title: 'Contender', min: 57, max: 58 },
  { grade: 'C+', title: 'Playoff',   min: 55, max: 56 },
  { grade: 'C',  title: 'Playoff',   min: 52, max: 54 },
  { grade: 'C-', title: 'Playoff',   min: 50, max: 51 },
  { grade: 'D+', title: 'Lottery',   min: 47, max: 49 },
  { grade: 'D',  title: 'Lottery',   min: 43, max: 46 },
  { grade: 'D-', title: 'Lottery',   min: 40, max: 42 },
  { grade: 'F',  title: 'Tanking',   min: 0,  max: 39 },
];

/** The grade for a final win total. Clamped, so out-of-range input still grades. */
export function gradeForWins(wins: number): ChallengeGrade {
  const w = Math.max(0, Math.min(CHALLENGE_GAMES, Math.round(wins)));
  return CHALLENGE_GRADES.find((g) => w >= g.min && w <= g.max) ?? CHALLENGE_GRADES[CHALLENGE_GRADES.length - 1];
}

// ── Simulating a half (D7) ──────────────────────────────────────────────────

export interface ChallengeTopPerformer {
  playerId: string;
  playerName: string;
  points: number;
  rebounds: number;
  assists: number;
}

export interface ChallengeGameResult {
  index: number;
  opponent: string;
  isHome: boolean;
  seed: number;
  won: boolean;
  /** [user, opponent]. */
  score: [number, number];
  topPerformer: ChallengeTopPerformer;
}

export interface ChallengePlayerTotals extends PlayerBoxScore {
  gamesPlayed: number;
}

/**
 * The OPPONENTS' box rows summed across a half, as one team line — no per-player rows,
 * because nothing shows an opposing player and storing 41 opposing benches would dwarf the
 * run. This is what makes the DEFENSIVE four factors computable (board 4's coach talks
 * about what opponents do against you), which the user's own `playerTotals` cannot answer.
 */
export interface ChallengeTeamTotals {
  points: number;
  possessions: number;
  fieldGoalsMade: number;
  fieldGoalsAttempted: number;
  threesMade: number;
  threesAttempted: number;
  freeThrowsMade: number;
  freeThrowsAttempted: number;
  turnovers: number;
  assists: number;
  offensiveRebounds: number;
  defensiveRebounds: number;
  steals: number;
  blocks: number;
}

const emptyTeamTotals = (): ChallengeTeamTotals => ({
  points: 0, possessions: 0, fieldGoalsMade: 0, fieldGoalsAttempted: 0,
  threesMade: 0, threesAttempted: 0, freeThrowsMade: 0, freeThrowsAttempted: 0,
  turnovers: 0, assists: 0, offensiveRebounds: 0, defensiveRebounds: 0, steals: 0, blocks: 0,
});

function addTeamRows(totals: ChallengeTeamTotals, rows: PlayerBoxScore[]): void {
  for (const r of rows ?? []) {
    totals.points += r.points ?? 0;
    totals.possessions += r.possessions ?? 0;
    totals.fieldGoalsMade += r.fieldGoalsMade ?? 0;
    totals.fieldGoalsAttempted += r.fieldGoalsAttempted ?? 0;
    totals.threesMade += r.threesMade ?? 0;
    totals.threesAttempted += r.threesAttempted ?? 0;
    totals.freeThrowsMade += r.freeThrowsMade ?? 0;
    totals.freeThrowsAttempted += r.freeThrowsAttempted ?? 0;
    totals.turnovers += r.turnovers ?? 0;
    totals.assists += r.assists ?? 0;
    totals.offensiveRebounds += r.offensiveRebounds ?? 0;
    totals.defensiveRebounds += r.defensiveRebounds ?? 0;
    totals.steals += r.steals ?? 0;
    totals.blocks += r.blocks ?? 0;
  }
}

export interface ChallengeHalf {
  /** 1 = games 1-41, 2 = games 42-82. */
  half: 1 | 2;
  /** One 'W'/'L' per game, in order — the flip clock reads straight off this. */
  results: string;
  games: ChallengeGameResult[];
  wins: number;
  losses: number;
  playerTotals: ChallengePlayerTotals[];
  /** Everything the 41 opponents did, as one team line (see `ChallengeTeamTotals`). */
  opponentTotals: ChallengeTeamTotals;
}

/** Games 1-41 are half 1, 42-82 are half 2. */
export function halfRange(half: 1 | 2): { start: number; end: number } {
  const mid = CHALLENGE_GAMES / 2;
  return half === 1 ? { start: 0, end: Math.floor(mid) } : { start: Math.floor(mid), end: CHALLENGE_GAMES };
}

/**
 * Play one half in a single call (~3 ms per game), so the result is committed before
 * any animation starts. Each game's RNG comes from `challengeGameSeed`, never from a
 * shared stream — calling this twice, or only for half 2, gives the same games.
 */
export function simulateHalf(
  userTeam: TeamInfo,
  opponents: Map<string, TeamInfo>,
  schedule: ChallengeScheduleEntry[],
  half: 1 | 2,
  runSeed: number,
  tuning: EdgeTuning = CHALLENGE_TUNING,
): ChallengeHalf {
  const { start, end } = halfRange(half);
  const games: ChallengeGameResult[] = [];
  const totals = new Map<string, ChallengePlayerTotals>();
  const opponentTotals = emptyTeamTotals();

  for (let i = start; i < end; i++) {
    const entry = schedule[i];
    const opponent = opponents.get(entry.opponent);
    if (!opponent) continue;
    const seed = challengeGameSeed(runSeed, i);
    const home = entry.isHome ? userTeam : opponent;
    const away = entry.isHome ? opponent : userTeam;
    const theater = simulateGame(home, away, { rng: createRng(seed), tuning });

    const userScore = entry.isHome ? theater.finalScore[0] : theater.finalScore[1];
    const oppScore = entry.isHome ? theater.finalScore[1] : theater.finalScore[0];
    const rows = entry.isHome ? theater.boxScore.home : theater.boxScore.away;
    const oppRows = entry.isHome ? theater.boxScore.away : theater.boxScore.home;
    accumulate(totals, rows);
    addTeamRows(opponentTotals, oppRows);

    games.push({
      index: i,
      opponent: entry.opponent,
      isHome: entry.isHome,
      seed,
      won: userScore > oppScore,
      score: [userScore, oppScore],
      topPerformer: topPerformerOf(rows),
    });
  }

  const wins = games.filter((g) => g.won).length;
  return {
    half,
    results: games.map((g) => (g.won ? 'W' : 'L')).join(''),
    games,
    wins,
    losses: games.length - wins,
    playerTotals: Array.from(totals.values()).sort((a, b) => b.points - a.points),
    opponentTotals,
  };
}

/** Game score (Hollinger-lite) picks the standout rather than raw points. */
function topPerformerOf(rows: PlayerBoxScore[]): ChallengeTopPerformer {
  let best: PlayerBoxScore | undefined;
  let bestScore = -Infinity;
  for (const r of rows) {
    const rebounds = (r.offensiveRebounds ?? 0) + (r.defensiveRebounds ?? 0);
    const score = (r.points ?? 0) + 1.2 * rebounds + 1.5 * (r.assists ?? 0)
      + 2 * ((r.steals ?? 0) + (r.blocks ?? 0)) - 1.5 * (r.turnovers ?? 0);
    if (score > bestScore) { bestScore = score; best = r; }
  }
  return {
    playerId: best?.playerId ?? '',
    playerName: best?.playerName ?? '',
    points: best?.points ?? 0,
    rebounds: (best?.offensiveRebounds ?? 0) + (best?.defensiveRebounds ?? 0),
    assists: best?.assists ?? 0,
  };
}

/**
 * Add one box-score row into a running total. `gamesDelta` is the caller's business: a
 * single game contributes 1 if the player was on the floor, while merging two halves
 * contributes that half's own `gamesPlayed` — counting it as 1 here would silently make
 * every season total read "2 games played".
 */
function accumulate(totals: Map<string, ChallengePlayerTotals>, rows: PlayerBoxScore[], gamesDelta?: (row: PlayerBoxScore) => number): void {
  for (const row of rows ?? []) {
    let t = totals.get(row.playerId);
    if (!t) { t = { ...emptyBoxScore(row.playerId, row.playerName), gamesPlayed: 0 }; totals.set(row.playerId, t); }
    const minutes = row.minutes ?? 0;
    t.gamesPlayed += gamesDelta ? gamesDelta(row) : (minutes > 0 ? 1 : 0);
    t.minutes = Math.round((t.minutes + minutes) * 10) / 10;
    t.possessions += row.possessions ?? 0;
    t.points += row.points ?? 0;
    t.twoPointers += row.twoPointers ?? 0;
    t.threePointers += row.threePointers ?? 0;
    t.andOnes += row.andOnes ?? 0;
    t.turnovers += row.turnovers ?? 0;
    t.assists += row.assists ?? 0;
    t.offensiveRebounds += row.offensiveRebounds ?? 0;
    t.defensiveRebounds += row.defensiveRebounds ?? 0;
    t.steals += row.steals ?? 0;
    t.blocks += row.blocks ?? 0;
    t.fieldGoalsMade += row.fieldGoalsMade ?? 0;
    t.fieldGoalsAttempted += row.fieldGoalsAttempted ?? 0;
    t.threesMade += row.threesMade ?? 0;
    t.threesAttempted += row.threesAttempted ?? 0;
    t.freeThrowsMade += row.freeThrowsMade ?? 0;
    t.freeThrowsAttempted += row.freeThrowsAttempted ?? 0;
    t.plusMinus += row.plusMinus ?? 0;
  }
}

/** Sum two halves into one set of season totals (results screen, season MVP). */
export function mergePlayerTotals(halves: ChallengeHalf[]): ChallengePlayerTotals[] {
  const totals = new Map<string, ChallengePlayerTotals>();
  for (const h of halves) {
    accumulate(totals, h.playerTotals, (row) => (row as ChallengePlayerTotals).gamesPlayed);
  }
  return Array.from(totals.values()).sort((a, b) => b.points - a.points);
}

// ── Trade pack (D9) ─────────────────────────────────────────────────────────

/**
 * Five offers drawn without replacement from every card the user doesn't own, weighted
 * by rarity, with the DROPPED card's rarity weighted `TRADE_DROPPED_RARITY_BOOST`x and
 * the whole table renormalised — drop a Mythic and you are meaningfully likely to be
 * offered one back, drop a Common and you are not.
 */
export function drawTradeOffers(
  allCards: PlayerCardData[],
  ownedIds: Set<string>,
  droppedRarity: Rarity,
  rng: Rng,
  count = TRADE_OFFERS,
): PlayerCardData[] {
  // Weights are per RARITY CLASS, not per card: a class is drawn first, then a card
  // uniformly inside it. Weighting each card instead would hand the Common class its 253
  // cards' worth of mass and bury Mythics at ~1.5% instead of D9's 3%.
  const byRarity = new Map<Rarity, PlayerCardData[]>();
  for (const c of allCards) {
    if (ownedIds.has(c.id)) continue;
    const bucket = byRarity.get(c.rarity);
    if (bucket) bucket.push(c); else byRarity.set(c.rarity, [c]);
  }

  const offers: PlayerCardData[] = [];
  for (let n = 0; n < count; n++) {
    const classes = (Object.keys(TRADE_RARITY_WEIGHTS) as Rarity[])
      .filter((r) => (byRarity.get(r)?.length ?? 0) > 0)
      .map((r) => ({
        rarity: r,
        weight: TRADE_RARITY_WEIGHTS[r] * (r === droppedRarity ? TRADE_DROPPED_RARITY_BOOST : 1),
      }));
    if (classes.length === 0) break;

    const total = classes.reduce((a, c) => a + c.weight, 0);
    let r = rng.next() * total;
    let chosen = classes[classes.length - 1];
    for (const c of classes) { r -= c.weight; if (r <= 0) { chosen = c; break; } }

    // Without replacement: the card leaves the pool, so no offer repeats.
    const bucket = byRarity.get(chosen.rarity)!;
    const idx = Math.floor(rng.next() * bucket.length);
    offers.push(bucket[idx]);
    bucket.splice(idx, 1);
  }
  return offers;
}

/** The trade pack's own stream, so it cannot be shifted by how the reveal ran. */
export function tradeSeed(runSeed: number): number {
  return mixSeed(runSeed, 'trade');
}
