/**
 * Types for the game simulation engine (plan render_and_engine_perf D6 — split out of
 * game.ts so game.ts itself stays under its line budget). Interfaces/types only; game.ts
 * re-exports all of them (`export * from './gameTypes'`), so no importer anywhere needs
 * to change its import path.
 */

import type { PlayerCardData, Play } from './types';
import type { TeamBonuses } from './synergies';
import type { PlayAssignment, PlaybookStatus } from './playbook';
import type { ArchetypeSelection } from './archetypes';
import type { Rng } from './rng';
import type { CHANNEL_CENTRE } from './balance';

/** Edge-size knobs resolvePossession reads (balance script sweeps them; defaults in balance.ts). */
export interface EdgeTuning { efficiencyScale?: number; maxEffShift?: number }

// ── Types ──────────────────────────────────────────────────────────────────

export interface PlayerBoxScore {
  playerId: string;
  playerName: string;
  minutes: number;        // Approximate minutes played
  possessions: number;    // Possessions on court
  points: number;
  twoPointers: number;
  threePointers: number;
  andOnes: number;
  turnovers: number;
  assists: number;
  /** engine_possession_model D6: boards that kept a possession alive. */
  offensiveRebounds: number;
  /** game_theater D9 — traditional + shooting + plus/minus. */
  defensiveRebounds: number;
  steals: number;
  blocks: number;
  fieldGoalsMade: number;
  fieldGoalsAttempted: number;
  threesMade: number;
  threesAttempted: number;
  freeThrowsMade: number;
  freeThrowsAttempted: number;
  plusMinus: number;
}

// ── game_theater contracts (plan D1, D9, D10) ───────────────────────────────

export type ShotChannel = 'rim' | 'mid' | 'three';

/** D1: what happened, as data. Prose is rendered outside the engine (src/narration). */
export type NarrativeKind = 'miss' | 'block' | 'turnover' | 'steal' | 'rim_make' | 'rim_ft' | 'mid_make' | 'three_make' | 'and1';

export interface PossessionNarrative {
  kind: NarrativeKind;
  /** Shot channel of the last shot; absent on turnover/steal. */
  channel?: ShotChannel;
  /** Shooter, or the ball-handler charged with the turnover. */
  actorId: string;
  assistId?: string;
  /** Credited stealer / blocker / defensive rebounder (D9 attribution). */
  defenderId?: string;
  calledPlayId?: string;
  coverageId?: string;
  isAnd1: boolean;
  isPossessionWin: boolean;
  /** The last shot came after at least one offensive rebound. */
  isSecondChance: boolean;
  /** Creator steer moved the shot profile toward this channel by >= STEER_NARRATE_MIN share. */
  steeredTo?: ShotChannel;
  /** Free throws on this possession (rim_ft trip: 2 attempts; and1: 1/1). */
  ftMade: number;
  ftAttempted: number;
  tags: string[];
}

/** D9: one field-goal attempt. A possession has 0 (turnover) to 1 + OREB_MAX_CHAIN of them. */
export interface ShotAttempt {
  shooterId: string;
  channel: ShotChannel;
  made: boolean;
  /** Set when the miss is credited as a block. */
  blockerId?: string;
}

export interface PossessionEvent {
  index: number;
  quarter: number;
  /** T6 code review follow-up (2026-09-14): a coach-mode hook, not yet read anywhere —
   *  see SEGMENTS_PER_GAME in balance.ts. */
  segment: number;
  team: 'home' | 'away';
  lineupOnCourt: string[];    // 5 player IDs on offense
  defenseOnCourt: string[];   // 5 player IDs on defense
  outcome: 'miss' | '2pt' | '3pt' | 'and1';
  scoringPlayerId?: string;
  assistPlayerId?: string;
  isPossessionWinEvent?: boolean;  // play/identity possessionSwing extra possession
  /** D6: the ball-handler charged with a turnover — possession ended before a shot. */
  turnoverPlayerId?: string;
  /** D6: players who grabbed an offensive rebound on this possession, in order. */
  offensiveRebounders?: string[];
  /** Pre-game_theater prose; only present on legacy theaters saved before D1 (the
   *  renderer falls back to it, D7). New events never carry it. */
  narrativeText?: string;
  /** D1 structured narration (T1). */
  narrative: PossessionNarrative;
  /** D9 every field-goal attempt in order (misses included), for FGA/3PA and blocks. */
  shots: ShotAttempt[];
  /** D9 credited defender on a turnover (steal), absent for an unforced turnover. */
  stealPlayerId?: string;
  /** D9 defender credited with the board that ended a missed possession. */
  defensiveRebounderId?: string;
  /** D10 inside the crunch-time window (closing fives on the floor). */
  isClutch?: boolean;
  runningScore: [number, number]; // [home, away]
  /** Assigned-player plays that applied to this possession (§7): an offense entry when
   *  the offense team called one of its plays, a defense entry when the defending team's
   *  coverage play also hit this possession. Both may be present on the same possession. */
  calledPlays?: Array<{ playId: string; name: string; side: 'offense' | 'defense'; teamSide: 'home' | 'away' }>;
}

export interface QuarterSummary {
  quarter: number;
  homeScore: number;
  awayScore: number;
  homePossessions: number;
  awayPossessions: number;
}

export interface GameTheater {
  homeTeam: TeamInfo;
  awayTeam: TeamInfo;
  possessions: PossessionEvent[];
  quarterSummaries: QuarterSummary[];
  finalScore: [number, number];
  boxScore: { home: PlayerBoxScore[]; away: PlayerBoxScore[] };
  homeBonuses: TeamBonuses;
  awayBonuses: TeamBonuses;
  isOvertime: boolean;
  overtimePeriods: number;
  /** RNG seed this game was simulated with — replay it via simulateGame(..., { rng: createRng(seed) }). */
  seed: number;
  /** Playbook evaluation for each team, as computed at game start (see evaluatePlaybook). */
  playbook: { home: PlaybookStatus; away: PlaybookStatus };
}

export interface TeamInfo {
  seatId: string;
  name: string;              // Bot name or "You"
  players: PlayerCardData[];  // 12-man roster
  starters: string[];        // 5 starter IDs (one per position)
  plays: Play[];             // 3 active plays
  depthChart: Record<string, string[]>; // Position → ordered player IDs
  /** Assigned-player play roles (v2 roster shape) — see playbook.ts. */
  playAssignments?: PlayAssignment[];
  /** Chosen roster identity (v2 roster shape) — see archetypes.ts. */
  archetypes?: ArchetypeSelection;
}

/** Shot profile: [rim%, mid%, per%] for the five on the floor */
export interface TeamShotProfile {
  rim: number;
  mid: number;
  per: number;
}

export interface SimulateGameOptions {
  rng?: Rng;
  centre?: typeof CHANNEL_CENTRE;
  tuning?: EdgeTuning;
  /**
   * plan render_and_engine_perf D2. `false` = do not build the play-by-play (`possessions`, narrative events, shots): the
   * 82:0 challenge simulates 82 games (41 more for the ghost) only for their scores and box
   * scores, and throws ~110 KB of events per game away. It must consume the RNG exactly as
   * `true` does, so the same seed gives the same final score and box score either way.
   * Default true.
   */
  events?: boolean;
}
