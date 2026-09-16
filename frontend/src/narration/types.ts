/**
 * game_theater wave-0 contracts (plan D1, D2, D4, D9-D11). Everything the renderer,
 * beats, summary and GameView agree on lives here. The engine owns the event shape
 * (`PossessionNarrative` / `ShotAttempt` are declared in engine/game.ts and re-exported
 * here so UI code has one import); this module never imports React or the engine's
 * simulation entry points — it is pure data + types.
 */
import type { GameTheater, PossessionEvent, PossessionNarrative, NarrativeKind, ShotChannel, PlayerBoxScore } from '../engine/game';

export type { GameTheater, PossessionEvent, PossessionNarrative, NarrativeKind, ShotChannel, PlayerBoxScore };

// ── Renderer (D2, D3) ───────────────────────────────────────────────────────

/** Names the renderer substitutes into templates. All optional except actor. */
export interface RenderContext {
  actor: string;
  assist?: string;
  defender?: string;
  /** Name of the offensive play called this possession (from event.calledPlays), if any. */
  play?: string;
  /** Name of the defensive coverage play, if any. */
  coverage?: string;
  /** Offense team name (for identity lines). */
  team: string;
  /** Last offensive rebounder's name (second-chance prefix). */
  rebounder?: string;
}

/**
 * Deterministic variant picker: returns an index in [0, n). Implementations seed from
 * game seed + possession index so the same game renders the same text every time.
 */
export type Pick = (n: number, salt: number) => number;

/**
 * Template file format (one file per kind under templates/kinds, one per play under
 * templates/plays, one per coverage under templates/coverages). Placeholders:
 * {actor} {assist} {defender} {play} {coverage} {team} {rebounder}.
 * A `channel` key narrows a pool; `any` applies to every channel.
 */
export interface KindTemplates {
  kind: NarrativeKind;
  pools: Partial<Record<ShotChannel | 'any', string[]>>;
  /** Appended when event.narrative.assistId is set (kind is a make). */
  assistSuffixes?: string[];
}
export interface PlayTemplates {
  playId: string;
  /** Play-aware variants per kind (at least 3 per play across kinds; see D3). */
  pools: Partial<Record<NarrativeKind, string[]>>;
}
export interface CoverageTemplates {
  playId: string;
  /** Coverage-aware variants for defensive outcomes: miss, block, turnover, steal. */
  pools: Partial<Record<NarrativeKind, string[]>>;
}

// ── Beats (D4, D10) ─────────────────────────────────────────────────────────

export type Side = 'home' | 'away';

export type Beat =
  | { type: 'run'; atIndex: number; side: Side; points: number; opponentPoints: number; score: [number, number] }
  | { type: 'run_answered'; atIndex: number; side: Side; runPoints: number; score: [number, number] }
  | { type: 'lead_change'; atIndex: number; side: Side; score: [number, number] }
  | { type: 'tie'; atIndex: number; score: [number, number] }
  | { type: 'largest_lead'; atIndex: number; side: Side; margin: number; score: [number, number] }
  | { type: 'quarter_end'; atIndex: number; quarter: number; score: [number, number]; quarterScore: [number, number]; topScorer: { side: Side; playerId: string; name: string; points: number } | null; shooting: Record<Side, { fgm: number; fga: number; tpm: number; tpa: number }> }
  | { type: 'clutch_start'; atIndex: number; quarter: number; score: [number, number] }
  | { type: 'ot_start'; atIndex: number; period: number; score: [number, number] }
  | { type: 'identity'; atIndex: number; side: Side; identityName: string; text: string }
  | { type: 'game_winner'; atIndex: number; side: Side; playerId: string; name: string; score: [number, number] }
  | { type: 'final'; atIndex: number; side: Side; score: [number, number]; margin: number; largestComeback: number };

export type BeatType = Beat['type'];

/** `computeBeats(theater)` returns beats sorted by atIndex; ties keep insertion order.
 *  A beat with atIndex i is shown AFTER possession i in the play-by-play. */
export type ComputeBeats = (theater: GameTheater) => Beat[];

// ── Summary + hints (D11) ───────────────────────────────────────────────────

export interface GameScoreLine { playerId: string; name: string; side: Side; gameScore: number; box: PlayerBoxScore }

export interface RosterHint {
  /** Stable id of the rule that fired (tests assert on it). */
  ruleId: string;
  playerId: string;
  /** One sentence, box stats / badges / positions only — never OVR or ratings. */
  text: string;
}

export interface GameSummary {
  playerOfTheGame: GameScoreLine;
  /** Absent when the user team is not in this game (bot vs bot replay). */
  userTeam?: {
    side: Side;
    top: GameScoreLine;
    /** Worst game score among players with >= SUMMARY_MIN_POSSESSIONS possessions. */
    low: GameScoreLine | null;
    hints: RosterHint[]; // at most 2
  };
}

export const SUMMARY_MIN_POSSESSIONS = 15;
export const MAX_HINTS = 2;

// ── GameView context (D11) ──────────────────────────────────────────────────

export interface TeamSeasonLine { wins: number; losses: number; streak: string; rank: number; of: number }
export interface GameContext {
  userSeatId?: string;
  home?: TeamSeasonLine;
  away?: TeamSeasonLine;
  /** Season head-to-head before this game, [homeWins, awayWins]. */
  headToHead?: [number, number];
  /** Absent context or absent lines => "Exhibition". */
}
