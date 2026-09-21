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
import { createRng, shuffle, mixSeed, type Rng } from './rng';
import { buildBotRoster, chooseBotArchetypes, type DraftSessionSeat } from './deckbuilder';
import {
  buildTeamInfo, simulateGame, emptyBoxScore,
  type EdgeTuning, type TeamInfo, type PlayerBoxScore,
} from './game';
import { accumulateBoxRow } from './boxscore';
import { PLAY_CATALOG } from './plays';
import { DEPTH_COLUMNS } from './positions';
import { NBA_ROSTER_POOL, CHALLENGE_GAMES, CHALLENGE_TUNING, TRADE_OFFERS, TRADE_RARITY_WEIGHTS, TRADE_DROPPED_RARITY_BOOST } from './balance';
// Type-only: `rosterChanged` (D3) needs the `SavedRoster` shape to compare pre/post
// break rosters. A type-only import is erased at build time, so this does not make the
// engine depend on `src/storage` at runtime (`tests/unit/engine-purity.test.ts` only
// forbids react/next/fs/sqlite/`@/components`/`@/app`, not `@/storage`) and does not
// create a real circular dependency even though `storage/types.ts` itself imports
// `ChallengeHalf` from this file — both sides of the cycle are erased before bundling.
import type { SavedRoster } from '@/storage/types';

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
 * NBA rosters are LOCKED IN: a team fields its real players, full stop. A card the user
 * drafted is still on its real team's list, so a drafted Luka faces Lakers Luka — that is
 * the intended behaviour (owner, 2026-09-17), not a case to design around. It does mean a
 * player can legitimately appear on both sides of the same game, which is why
 * `simulateGame` keys its box score by side AND player id; see the note there.
 *
 * One correction on top: a real NBA roster can leave a depth-chart column empty (MEM has no
 * eligible centre in the current pool), and five-on-four is not a fair opponent. Any empty
 * column is backfilled with the best active player who isn't already a starter, taken out of
 * the deepest column — the active twelve never changes, so play roles stay valid; only the
 * starting five moves, so the identity is re-picked against it.
 */
export function buildNbaTeamRoster(cards: PlayerCardData[], abbr: string, plays: Play[] = PLAY_CATALOG): DraftSessionSeat {
  const pool = cards
    .filter((c) => c.player?.team === abbr)
    .sort((a, b) => ovr(b) - ovr(a))
    .slice(0, NBA_ROSTER_POOL);

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
 * Memoized by the REFERENCE of `cards` (and, nested, of `plays`) — building all 30
 * opponents is ~5ms (`NBA_ROSTER_POOL` filtering + `buildBotRoster` x30), and D3
 * measured it happening again on EVERY half (`page.tsx` rebuilds `cards` fresh off
 * `getAllCards()` each time, even though the static card pool never actually changes
 * mid-run). Two different arrays with equal contents still miss: that is intentional —
 * a cache keyed on structural equality would have to hash all ~450 cards to save 5ms,
 * and nothing in the challenge flow ever passes two distinct-but-equal card arrays. The
 * returned Map and its `TeamInfo`s must be treated as READ-ONLY by every caller —
 * `simulateHalf`/`simulateGame`/`buildTeamInfo` only ever read `TeamInfo` fields (no
 * assignment into `team.*`/`.players`/`.depthChart` anywhere in `game.ts`,
 * `possession.ts`, `rotation.ts`, `shot.ts` or `teamInfo.ts` — verified by grep), so a
 * cache hit is safe; a caller that starts mutating a returned `TeamInfo` would silently
 * corrupt every later half that shares this cache entry.
 */
const nbaTeamsCache = new WeakMap<PlayerCardData[], WeakMap<Play[], Map<string, TeamInfo>>>();

/** All 30 opponents as game-ready `TeamInfo`s, keyed by abbreviation. */
export function buildNbaTeams(cards: PlayerCardData[], plays: Play[] = PLAY_CATALOG): Map<string, TeamInfo> {
  let byPlays = nbaTeamsCache.get(cards);
  if (!byPlays) {
    byPlays = new WeakMap<Play[], Map<string, TeamInfo>>();
    nbaTeamsCache.set(cards, byPlays);
  }
  const cached = byPlays.get(plays);
  if (cached) return cached;

  const teams = new Map<string, TeamInfo>();
  for (const t of NBA_TEAMS) {
    const seat = buildNbaTeamRoster(cards, t.abbr, plays);
    const info = buildTeamInfo(seat, false);
    teams.set(t.abbr, { ...info, name: `${t.city} ${t.name}` });
  }
  byPlays.set(plays, teams);
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
 *
 * The implementation now lives in `engine/rng.ts` (seasons derive their per-matchup
 * seeds the same way, and `season.ts` must not import this module); re-exported here
 * unchanged so every existing importer keeps working.
 */
export { mixSeed } from './rng';

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
  points: 0, fieldGoalsMade: 0, fieldGoalsAttempted: 0,
  threesMade: 0, threesAttempted: 0, freeThrowsMade: 0, freeThrowsAttempted: 0,
  turnovers: 0, assists: 0, offensiveRebounds: 0, defensiveRebounds: 0, steals: 0, blocks: 0,
});

/**
 * `possessions` is deliberately NOT summed here (D3/T6, was `ChallengeTeamTotals.
 * possessions` until this change): it summed each opponent PLAYER's on-court possession
 * count, which is ~5x the team's real possession count (5 players on court every team
 * possession) and nothing ever read it — grepped across `src/`, `tests/`, `scripts/`.
 * A saved run from before this change still carries the old key in IndexedDB; nothing
 * validates against an exact key set (`storage/safeLoad.ts`), so it still loads fine,
 * just with one extra ignored field.
 */
function addTeamRows(totals: ChallengeTeamTotals, rows: PlayerBoxScore[]): void {
  for (const r of rows ?? []) {
    totals.points += r.points ?? 0;
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
 * Play one half in a single call (~2.3 ms per game, ~90 ms per half on a desktop: `npm run
 * bench`; a phone is 3-5x slower), so the result is committed before
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
    // D2: a half needs 41 scores and box scores, not 41 play-by-plays. Nothing replays an
    // 82:0 game today; if that is ever built, re-simulate it from `challengeGameSeed` with
    // events on — it is the same game (tests/unit/game-events-option.test.ts).
    const theater = simulateGame(home, away, { rng: createRng(seed), tuning, events: false });

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
    accumulateBoxRow(t, row);
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

// ── Roster-change detection (D3) ─────────────────────────────────────────────

/**
 * PURE structural comparison of the parts of a `SavedRoster` that can actually change a
 * simulated game (`buildTeamInfo` -> `TeamInfo` -> `simulateGame`), so `page.tsx` can
 * decide whether the D10 ghost half is worth simulating. Deliberately narrower than a
 * deep-equal on the whole roster, and deliberately not a `===` reference check: the
 * front-office lineup editor (`FrontOffice.tsx`'s `handleEditorSave`) writes a brand-new
 * `SavedRoster` object on every save even when nothing in it changed, and after a
 * store round-trip `rosterPre`/`rosterPost` are separate IndexedDB clones that can never
 * be `===` again — the previous reference-equality guard ghosted on every break, wasting
 * a 41-game simulation and drawing a dashed line exactly on top of the solid one.
 *
 * What's compared, and why:
 *  - `depthChartOrder`, per `DEPTH_COLUMNS` column, IN ORDER: index 0 is the starter
 *    (`buildTeamInfo`'s `starters`), and the whole column feeds `activePlayers` — a
 *    reorder within a column (a bench swap to starter) changes who's on the floor even
 *    when no player actually moved column.
 *  - `activePlays`, IN SLOT ORDER: falls straight into `TeamInfo.plays`, and a
 *    pre-v2 roster's `playAssignments` are re-derived from this exact order
 *    (`normalizeBuiltRoster`).
 *  - `playAssignments`, AS AN ORDERED LIST of `(cardId, playId, roles)`: the array order
 *    is not incidental. `scaledPlayAllocations` preserves it and `rollCalledPlay`
 *    (`possession.ts`) walks it as a cumulative-probability roll on every possession —
 *    reordering two equally-allocated active plays can change which one is called on a
 *    given possession even though no card or role changed. Each assignment's `roles` map
 *    IS compared order-independently (`Record<string, string>`, plain lookups, no
 *    iteration order anywhere downstream) — sorted by role id below before stringifying.
 *  - `archetypes.offense` / `.defense` / `.gold`: the only three fields; order is moot.
 *
 * `draftedCards` (the full pool, bench included) is deliberately NOT compared as a
 * whole. Anything drafted but sitting outside every depth-chart column and every play's
 * roles is a bench card `buildTeamInfo` never looks at, so swapping one bench card for
 * another (or reordering the drafted list) cannot change a game and must not trigger a
 * ghost; a trade that touches the ACTIVE roster is already caught above, because the
 * swapped card's id shows up in `depthChartOrder` or a role. `name`, `timestamp`, `id`,
 * `ownerId`, `cardSetVersion`, `version` and `sessionId` never reach `TeamInfo` at all, so
 * none of them are compared; a field that's `undefined` on one side and simply missing on
 * the other is treated as identical (`?? []`/`?? {}`/`?? null` below), matching how
 * `buildTeamInfo`/`seatFromRoster` already read these fields.
 */
export function rosterChanged(pre: SavedRoster, post: SavedRoster): boolean {
  return rosterFingerprint(pre) !== rosterFingerprint(post);
}

/** Small canonical projection + stable stringify — not a whole-object `JSON.stringify`,
 *  which would lie in both directions: irrelevant fields (name, timestamp, …) would
 *  make an unchanged roster look changed, and source-object key order (`depthChartOrder`
 *  column order, a `playAssignments[].roles` insertion order) would make an unchanged
 *  roster look changed one run and unchanged the next. */
function rosterFingerprint(roster: SavedRoster): string {
  const depthChart = DEPTH_COLUMNS.map((col) => roster.depthChartOrder?.[col] ?? []);
  const activePlays = roster.activePlays ?? [];
  const playAssignments = (roster.playAssignments ?? []).map((a) => ({
    cardId: a.cardId,
    playId: a.playId,
    roles: Object.entries(a.roles ?? {}).sort(([x], [y]) => x.localeCompare(y)),
  }));
  const archetypes = {
    offense: roster.archetypes?.offense ?? null,
    defense: roster.archetypes?.defense ?? null,
    gold: roster.archetypes?.gold ?? null,
  };
  return JSON.stringify({ depthChart, activePlays, playAssignments, archetypes });
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
