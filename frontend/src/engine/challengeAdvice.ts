/**
 * 82:0 Challenge — front-office advice (plan_challenge_mode D8, board 4).
 *
 * Pure: turns the FIRST half (games 1-41) plus the roster that played it into
 *   1. a pace band on the grade ladder — projected wins +/- `PACE_BAND_SPREAD`, snapped
 *      OUTWARD to grade-band edges, so the user reads "Contender to Dynasty" and never
 *      the raw record (the record stays sealed until game 82);
 *   2. a ranked catalogue of reasons over first-half data, each with an action chip, an
 *      evidence line built from season stats, and a severity;
 *   3. exactly three quotes — Coach, Owner, Fans — rendered from the pools in
 *      `src/narration/challenge/` over the top-ranked reasons.
 *
 * A band starting at Historic (A+ or better) suppresses the problem catalogue entirely
 * and yields Hold quotes: nothing on a roster that is winning at that rate is worth
 * touching at a deadline.
 *
 * PRODUCT RULES enforced by `tests/unit/challengeAdvice.test.ts`: no output string ever
 * contains a player's OVR or any of the seven engine ratings, and no output string ever
 * contains a win-loss record. Season averages (points, minutes, plus-minus, rates) and
 * badge/plan names are fair game.
 */

import type { TeamInfo } from './game';
import type { PlayerCardData } from './types';
import type { ChallengeGrade, ChallengeHalf, ChallengePlayerTotals } from './challenge';
import { CHALLENGE_GRADES, gradeForWins, mixSeed } from './challenge';
import {
  CHALLENGE_GAMES, PACE_BAND_SPREAD, HOLD_BAND_MIN_WINS, LEAGUE_FOUR_FACTORS,
  LEAGUE_POINTS_PER_GAME, ROTATION_MIN_MPG, BENCH_MIN_MPG, BENCH_SCORING_EDGE_PER36,
  WORST_PLUS_MINUS_MAX, PLAY_IDLE_MAX_MPG, IDENTITY_NEAR_PROGRESS,
} from './balance';
import { evaluateArchetypes } from './archetypes';
import { evaluatePlaybook } from './playbook';
import { createRng } from './rng';
import { CHALLENGE_QUOTES, CHALLENGE_SPEAKERS, type ChallengeSpeaker } from '../narration/challenge';

// ── Public shapes ───────────────────────────────────────────────────────────

/** The chip on a quote card (board 4). */
export type ChallengeAction = 'lineup' | 'plays' | 'trade' | 'hold';

export type ChallengeReasonId =
  | 'four-factor'
  | 'def-four-factor'
  | 'bench-over-starter'
  | 'worst-plus-minus'
  | 'play-unstaffed'
  | 'play-idle'
  | 'identity-near'
  | 'pace-band'
  | 'pace-hold'
  | 'form-hold'
  | 'deep-bench';

export interface ChallengePaceBand {
  /** Projected full-season wins at each end, already snapped outward to grade edges. */
  low: number;
  high: number;
  /** The grade at each end (`lowGrade` is the WORSE end). */
  lowGrade: ChallengeGrade;
  highGrade: ChallengeGrade;
  /** Every grade the band covers, best first — the ladder highlights exactly these. */
  grades: ChallengeGrade[];
  /** "Contender to Dynasty", or one title when both ends share it. */
  label: string;
  /** True when the band starts at Historic (A+) or better: everyone says Hold (D8). */
  hold: boolean;
}

/** Placeholder values for the quote templates; keys match `{name}` in a template. */
export type ChallengeReasonVars = Record<string, string>;

export interface ChallengeReason {
  id: ChallengeReasonId;
  action: ChallengeAction;
  /** 0-100, higher is more urgent. The ranking key. */
  severity: number;
  /** 1-based position after ranking (1 = most urgent). */
  rank: number;
  /** One sentence of season stats backing the reason (the muted line on the card). */
  evidence: string;
  vars: ChallengeReasonVars;
  /** The player the reason is about, when it is about one. */
  playerId?: string;
}

export interface ChallengeQuote {
  speaker: ChallengeSpeaker;
  action: ChallengeAction;
  /** The spoken line, without quotation marks. */
  text: string;
  evidence: string;
  reasonId: ChallengeReasonId;
  playerId?: string;
}

export interface ChallengeAdviceInput {
  /** The user's team exactly as it played games 1-41. */
  team: TeamInfo;
  /** The first half. Only `half === 1` data is ever read. */
  half: ChallengeHalf;
  /** The run seed — quote variants are picked from it, so a reload reads the same. */
  seed?: number;
}

export interface ChallengeAdvice {
  band: ChallengePaceBand;
  /** Ranked, most urgent first. */
  reasons: ChallengeReason[];
  /** Exactly three, in board order: Coach, Owner, Fans. */
  quotes: ChallengeQuote[];
}

/** Team rates over the half, all per game except the four factors. */
export interface ChallengeTeamSplits {
  games: number;
  pointsFor: number;
  pointsAgainst: number;
  /** What YOU did. */
  efg: number;
  tovRate: number;
  orebRate: number;
  ftRate: number;
  /** What opponents did AGAINST you — the defensive four factors (board 4's coach line). */
  oppEfg: number;
  oppTovRate: number;
  oppOrebRate: number;
  oppFtRate: number;
}

// ── Pace band (D8) ──────────────────────────────────────────────────────────

const clampWins = (w: number) => Math.max(0, Math.min(CHALLENGE_GAMES, Math.round(w)));

/**
 * Projected wins are twice the first half, the band is that +/- `PACE_BAND_SPREAD`, and
 * each end is then snapped OUTWARD to the edge of the grade it lands in — so the band
 * always covers whole ladder segments and never implies a precision the sim does not have.
 */
export function challengePaceBand(firstHalfWins: number): ChallengePaceBand {
  const projected = 2 * firstHalfWins;
  const lowGrade = gradeForWins(clampWins(projected - PACE_BAND_SPREAD));
  const highGrade = gradeForWins(clampWins(projected + PACE_BAND_SPREAD));
  const hi = CHALLENGE_GRADES.indexOf(highGrade);
  const lo = CHALLENGE_GRADES.indexOf(lowGrade);
  const grades = CHALLENGE_GRADES.slice(hi, lo + 1);
  return {
    low: lowGrade.min,
    high: highGrade.max,
    lowGrade,
    highGrade,
    grades,
    label: lowGrade.title === highGrade.title ? lowGrade.title : `${lowGrade.title} to ${highGrade.title}`,
    hold: lowGrade.min >= HOLD_BAND_MIN_WINS,
  };
}

// ── First-half aggregates ───────────────────────────────────────────────────

/** Team four factors and scoring over the half, from the user's own box rows. */
export function challengeTeamSplits(half: ChallengeHalf): ChallengeTeamSplits {
  const games = Math.max(1, half.games.length);
  const sum = (pick: (t: ChallengePlayerTotals) => number) => half.playerTotals.reduce((s, t) => s + pick(t), 0);
  const fga = sum((t) => t.fieldGoalsAttempted);
  const fgm = sum((t) => t.fieldGoalsMade);
  const tpm = sum((t) => t.threesMade);
  const tov = sum((t) => t.turnovers);
  const oreb = sum((t) => t.offensiveRebounds);
  const fta = sum((t) => t.freeThrowsAttempted);
  const misses = Math.max(1, fga - fgm);

  const o = half.opponentTotals;
  const oppMisses = Math.max(1, o.fieldGoalsAttempted - o.fieldGoalsMade);
  const oppTovDen = o.fieldGoalsAttempted + 0.44 * o.freeThrowsAttempted + o.turnovers;

  return {
    games,
    pointsFor: half.games.reduce((s, g) => s + g.score[0], 0) / games,
    pointsAgainst: half.games.reduce((s, g) => s + g.score[1], 0) / games,
    efg: fga > 0 ? (fgm + 0.5 * tpm) / fga : 0,
    tovRate: fga + fta + tov > 0 ? tov / (fga + 0.44 * fta + tov) : 0,
    orebRate: oreb / misses,
    ftRate: fga > 0 ? fta / fga : 0,
    oppEfg: o.fieldGoalsAttempted > 0 ? (o.fieldGoalsMade + 0.5 * o.threesMade) / o.fieldGoalsAttempted : 0,
    oppTovRate: oppTovDen > 0 ? o.turnovers / oppTovDen : 0,
    oppOrebRate: o.offensiveRebounds / oppMisses,
    oppFtRate: o.fieldGoalsAttempted > 0 ? o.freeThrowsAttempted / o.fieldGoalsAttempted : 0,
  };
}

/** Per-game view of one player's half, plus the per-36 scoring rate used for comparisons. */
interface PlayerLine {
  id: string;
  name: string;
  mpg: number;
  ppg: number;
  pmPerGame: number;
  per36: number;
  isStarter: boolean;
}

const one = (n: number) => (Math.round(n * 10) / 10).toFixed(1);
const pct = (n: number) => `${Math.round(n * 100)}%`;
const signed = (n: number) => (n > 0 ? `+${one(n)}` : one(n));

/** "Ryan Sheppard" -> "R. Sheppard" (board 4 style); single-word names are left alone. */
export function shortName(name: string): string {
  const parts = name.trim().split(/\s+/);
  if (parts.length < 2) return name;
  return `${parts[0][0]}. ${parts.slice(1).join(' ')}`;
}

function playerLines(input: ChallengeAdviceInput): PlayerLine[] {
  const { team, half } = input;
  const games = Math.max(1, half.games.length);
  const starters = new Set(team.starters);
  const byId = new Map(team.players.map((p) => [p.id, p]));
  return half.playerTotals
    .map((t): PlayerLine => {
      const mpg = t.minutes / games;
      return {
        id: t.playerId,
        name: shortName(byId.get(t.playerId)?.player.name ?? t.playerName),
        mpg,
        ppg: t.points / games,
        pmPerGame: t.plusMinus / games,
        per36: t.minutes > 0 ? (t.points / t.minutes) * 36 : 0,
        isStarter: starters.has(t.playerId),
      };
    })
    .filter((l) => l.mpg > 0);
}

// ── Reason catalogue (D8) ───────────────────────────────────────────────────

interface Detected {
  id: ChallengeReasonId;
  action: ChallengeAction;
  severity: number;
  evidence: string;
  vars: ChallengeReasonVars;
  playerId?: string;
}

const clampSeverity = (n: number, lo = 5, hi = 95) => Math.max(lo, Math.min(hi, Math.round(n)));

/**
 * The weakest of the four factors against the league means. Always fires — when the team
 * is above the league everywhere it is simply the least comfortable of the four, and its
 * severity drops accordingly, which pushes it down the ranking rather than off it.
 */
function detectFourFactor(splits: ChallengeTeamSplits): Detected {
  const L = LEAGUE_FOUR_FACTORS;
  const candidates = [
    {
      key: 'efg', issue: 'shot quality', deficit: (L.efg - splits.efg) / L.efg,
      value: pct(splits.efg), league: pct(L.efg), action: 'lineup' as ChallengeAction,
      evidence: `You shoot ${pct(splits.efg)} effective from the field. The league shoots ${pct(L.efg)}.`,
    },
    {
      key: 'tov', issue: 'giving the ball away', deficit: (splits.tovRate - L.tovRate) / L.tovRate,
      value: pct(splits.tovRate), league: pct(L.tovRate), action: 'plays' as ChallengeAction,
      evidence: `You give the ball away on ${pct(splits.tovRate)} of possessions. The league gives it away on ${pct(L.tovRate)}.`,
    },
    {
      key: 'oreb', issue: 'second chances', deficit: (L.orebRate - splits.orebRate) / L.orebRate,
      value: pct(splits.orebRate), league: pct(L.orebRate), action: 'lineup' as ChallengeAction,
      evidence: `You chase down ${pct(splits.orebRate)} of your own misses. The league gets ${pct(L.orebRate)}.`,
    },
    {
      key: 'ft', issue: 'getting to the line', deficit: (L.ftRate - splits.ftRate) / L.ftRate,
      value: `${Math.round(splits.ftRate * 100)}`, league: `${Math.round(L.ftRate * 100)}`, action: 'plays' as ChallengeAction,
      evidence: `You earn ${Math.round(splits.ftRate * 100)} free throws per 100 shots. The league earns ${Math.round(L.ftRate * 100)}.`,
    },
  ];
  const worst = candidates.sort((a, b) => b.deficit - a.deficit)[0];
  return {
    id: 'four-factor',
    action: worst.action,
    severity: clampSeverity(40 + worst.deficit * 300),
    evidence: worst.evidence,
    vars: { issue: worst.issue, value: worst.value, league: worst.league },
  };
}

/**
 * The same four factors from the other side: what opponents manage AGAINST you. The league
 * means are the SAME constants — across the full NBA-vs-NBA set every team's offense is
 * another team's defense, so the two distributions coincide (measured: opponents grab 25.8%
 * of their misses, which is board 4's "league average is 25%"). Always fires, like its
 * offensive twin, so three quotes are always available.
 */
function detectDefFourFactor(splits: ChallengeTeamSplits): Detected {
  const L = LEAGUE_FOUR_FACTORS;
  const candidates = [
    {
      issue: 'the shots you allow', deficit: (splits.oppEfg - L.efg) / L.efg,
      value: pct(splits.oppEfg), league: pct(L.efg), action: 'lineup' as ChallengeAction,
      evidence: `Opponents shoot ${pct(splits.oppEfg)} effective against you. League average is ${pct(L.efg)}.`,
    },
    {
      issue: 'forcing mistakes', deficit: (L.tovRate - splits.oppTovRate) / L.tovRate,
      value: pct(splits.oppTovRate), league: pct(L.tovRate), action: 'plays' as ChallengeAction,
      evidence: `You force a turnover on ${pct(splits.oppTovRate)} of their possessions. League average is ${pct(L.tovRate)}.`,
    },
    {
      issue: 'the defensive glass', deficit: (splits.oppOrebRate - L.orebRate) / L.orebRate,
      value: pct(splits.oppOrebRate), league: pct(L.orebRate), action: 'lineup' as ChallengeAction,
      evidence: `Opponents rebound ${pct(splits.oppOrebRate)} of their misses against you. League average is ${pct(L.orebRate)}.`,
    },
    {
      issue: 'fouling', deficit: (splits.oppFtRate - L.ftRate) / L.ftRate,
      value: `${Math.round(splits.oppFtRate * 100)}`, league: `${Math.round(L.ftRate * 100)}`, action: 'plays' as ChallengeAction,
      evidence: `You send them to the line ${Math.round(splits.oppFtRate * 100)} times per 100 shots. League average is ${Math.round(L.ftRate * 100)}.`,
    },
  ];
  const worst = candidates.sort((a, b) => b.deficit - a.deficit)[0];
  return {
    id: 'def-four-factor',
    action: worst.action,
    severity: clampSeverity(40 + worst.deficit * 300),
    evidence: worst.evidence,
    vars: { issue: worst.issue, value: worst.value, league: worst.league },
  };
}

/** A bench player whose scoring rate beats a starter's by `BENCH_SCORING_EDGE_PER36`. */
function detectBenchOverStarter(lines: PlayerLine[]): Detected | null {
  const bench = lines.filter((l) => !l.isStarter && l.mpg >= BENCH_MIN_MPG);
  const starters = lines.filter((l) => l.isStarter && l.mpg > 0);
  if (bench.length === 0 || starters.length === 0) return null;
  const weakest = starters.sort((a, b) => a.per36 - b.per36)[0];
  const best = bench.sort((a, b) => b.per36 - a.per36)[0];
  const gap = best.per36 - weakest.per36;
  if (gap < BENCH_SCORING_EDGE_PER36) return null;
  return {
    id: 'bench-over-starter',
    action: 'lineup',
    severity: clampSeverity(45 + gap * 4, 45, 90),
    playerId: best.id,
    evidence: `${best.name}: ${one(best.ppg)} points in ${one(best.mpg)} minutes off the bench, ahead of ${weakest.name}'s ${one(weakest.ppg)} in ${one(weakest.mpg)}.`,
    vars: { player: best.name, other: weakest.name, points: one(best.ppg), minutes: one(best.mpg) },
  };
}

/** The rotation player the scoreboard hates most. */
function detectWorstPlusMinus(lines: PlayerLine[]): Detected | null {
  const rotation = lines.filter((l) => l.mpg >= ROTATION_MIN_MPG);
  if (rotation.length === 0) return null;
  const worst = rotation.sort((a, b) => a.pmPerGame - b.pmPerGame)[0];
  if (worst.pmPerGame > WORST_PLUS_MINUS_MAX) return null;
  return {
    id: 'worst-plus-minus',
    action: 'trade',
    severity: clampSeverity(45 + -worst.pmPerGame * 6, 45, 92),
    playerId: worst.id,
    evidence: `Lowest plus-minus per game in the rotation: ${worst.name}, ${signed(worst.pmPerGame)} in ${one(worst.mpg)} minutes.`,
    vars: { player: worst.name, value: signed(worst.pmPerGame), minutes: one(worst.mpg) },
  };
}

/**
 * Two play problems, most serious first: a play that never ran at all (a role is
 * unassigned or its player is ineligible), and a staffed play drawn up for somebody who
 * barely sees the floor — the allocation is spent either way.
 */
function detectPlays(team: TeamInfo, lines: PlayerLine[]): Detected[] {
  const assignments = team.playAssignments ?? [];
  if (assignments.length === 0) return [];
  const status = evaluatePlaybook(assignments, team.players);
  const out: Detected[] = [];

  const dead = status.plays.find((p) => !p.active);
  if (dead) {
    const role = dead.roles.find((r) => !r.filled);
    const missing = role ? `The ${role.role.name.toLowerCase()} role ${(role.reason ?? 'is unfilled').toLowerCase()}` : 'A role is unfilled';
    out.push({
      id: 'play-unstaffed',
      action: 'plays',
      severity: 80,
      evidence: `${dead.def.name} never ran a possession: ${role?.role.name ?? 'a role'} — ${role?.reason ?? 'unfilled'}.`,
      vars: { play: dead.def.name, missing },
    });
  }

  const mpgById = new Map(lines.map((l) => [l.id, l]));
  let idle: { play: string; line: PlayerLine } | null = null;
  for (const p of status.plays) {
    if (!p.active) continue;
    for (const id of p.playerIds) {
      const line = mpgById.get(id);
      if (!line || line.mpg >= PLAY_IDLE_MAX_MPG) continue;
      if (!idle || line.mpg < idle.line.mpg) idle = { play: p.def.name, line };
    }
  }
  if (idle) {
    out.push({
      id: 'play-idle',
      action: 'plays',
      severity: clampSeverity(65 + (PLAY_IDLE_MAX_MPG - idle.line.mpg) * 2, 50, 85),
      playerId: idle.line.id,
      evidence: `${idle.play} runs through ${idle.line.name}, who is on the floor ${one(idle.line.mpg)} minutes a game.`,
      vars: { play: idle.play, player: idle.line.name, minutes: one(idle.line.mpg) },
    });
  }
  return out;
}

/** The locked plan closest to Online, with the one condition it is short of. */
function detectIdentityNear(team: TeamInfo): Detected | null {
  const active: PlayerCardData[] = team.players;
  const starters = new Set(team.starters);
  const chosen = new Set(Object.values(team.archetypes ?? {}).filter(Boolean) as string[]);
  const near = evaluateArchetypes(active, starters, team.archetypes)
    .filter((s) => s.tier === 'none' && !chosen.has(s.def.id) && s.missing.length > 0 && s.progress >= IDENTITY_NEAR_PROGRESS)
    .sort((a, b) => b.progress - a.progress)[0];
  if (!near) return null;
  const missing = near.missing[0].replace(/\.$/, '');
  return {
    id: 'identity-near',
    action: 'lineup',
    severity: clampSeverity(35 + near.progress * 30, 35, 68),
    evidence: `${near.def.name} is one step from online: ${missing}.`,
    vars: { plan: near.def.name, missing },
  };
}

/** The last man in the rotation — the piece a deadline gamble costs nothing to spend. */
function detectDeepBench(lines: PlayerLine[]): Detected | null {
  const bench = lines.filter((l) => !l.isStarter);
  if (bench.length === 0) return null;
  const last = bench.sort((a, b) => a.mpg - b.mpg)[0];
  return {
    id: 'deep-bench',
    action: 'trade',
    severity: 20,
    playerId: last.id,
    evidence: `${last.name}: ${one(last.mpg)} minutes a game, last in the rotation.`,
    vars: { player: last.name, minutes: one(last.mpg) },
  };
}

/** Catalogue order, used as the tie-break when two reasons share a severity. */
const CATALOGUE_ORDER: ChallengeReasonId[] = [
  'four-factor', 'def-four-factor', 'bench-over-starter', 'worst-plus-minus', 'play-unstaffed',
  'play-idle', 'identity-near', 'pace-band', 'pace-hold', 'form-hold', 'deep-bench',
];

/**
 * The ranked catalogue. Ranking rule: severity descending, ties broken by catalogue
 * order. `four-factor`, `pace-band` and `deep-bench` always fire, so there are always at
 * least three reasons for the three speakers.
 *
 * A Hold band replaces the catalogue outright with its three hold-side reasons — the
 * board's Historic variant (board 4) is exactly that: Hold, Hold, and one free gamble at
 * the end of the bench.
 */
export function challengeReasons(input: ChallengeAdviceInput): ChallengeReason[] {
  const band = challengePaceBand(input.half.wins);
  const splits = challengeTeamSplits(input.half);
  const lines = playerLines(input);
  const detected: Array<Detected | null> = [];

  if (band.hold) {
    detected.push({
      id: 'pace-hold', action: 'hold', severity: 95,
      evidence: `Pace band starts at ${band.lowGrade.title}. A trade is a gamble on a roster that is not losing.`,
      vars: { band: band.label, low: band.lowGrade.title },
    });
    detected.push({
      id: 'form-hold', action: 'hold', severity: 90,
      evidence: `You score ${one(splits.pointsFor)} a game and allow ${one(splits.pointsAgainst)}. The league scores ${one(LEAGUE_POINTS_PER_GAME)}.`,
      vars: { points: one(splits.pointsFor), allowed: one(splits.pointsAgainst) },
    });
    detected.push(detectDeepBench(lines));
  } else {
    detected.push(detectFourFactor(splits));
    detected.push(detectDefFourFactor(splits));
    detected.push(detectBenchOverStarter(lines));
    detected.push(detectWorstPlusMinus(lines));
    detected.push(...detectPlays(input.team, lines));
    detected.push(detectIdentityNear(input.team));
    detected.push({
      id: 'pace-band', action: 'trade',
      severity: clampSeverity(20 + (55 - band.high) * 2, 15, 75),
      evidence: `The pace band runs from ${band.lowGrade.title} to ${band.highGrade.title} over a full season.`,
      vars: { band: band.label, low: band.lowGrade.title, high: band.highGrade.title },
    });
    detected.push(detectDeepBench(lines));
  }

  return detected
    .filter((d): d is Detected => d !== null)
    .sort((a, b) => b.severity - a.severity || CATALOGUE_ORDER.indexOf(a.id) - CATALOGUE_ORDER.indexOf(b.id))
    .map((d, i) => ({ ...d, rank: i + 1 }));
}

// ── Quotes (D8) ─────────────────────────────────────────────────────────────

/**
 * Which action chips a speaker reaches for first. Each speaker takes the highest-ranked
 * unclaimed reason it prefers, falling back to the highest-ranked unclaimed reason of any
 * kind — so the coach talks about the floor, the owner about the deadline, and the fans
 * about whoever is not playing.
 */
const SPEAKER_PREFERENCE: Record<ChallengeSpeaker, ChallengeAction[]> = {
  coach: ['lineup', 'plays', 'hold'],
  owner: ['trade', 'hold'],
  fans: ['lineup', 'trade', 'plays'],
};

const PLACEHOLDER_RE = /\{(\w+)\}/g;

/** Every placeholder a template needs must be in `vars`, else the template is skipped. */
function fillable(template: string, vars: ChallengeReasonVars): boolean {
  return Array.from(template.matchAll(PLACEHOLDER_RE)).every(([, key]) => Boolean(vars[key]));
}

function fill(template: string, vars: ChallengeReasonVars): string {
  return template
    .replace(PLACEHOLDER_RE, (_, key: string) => vars[key] ?? '')
    .replace(/\s{2,}/g, ' ')
    // A shortened name can already end in a period ("M. Porter Jr."), so a template that
    // closes its own sentence renders "Jr..". Collapse the doubled stop wherever a
    // substitution created one, including before a closing quote or comma.
    .replace(/\.\.(?=$|[\s,"”'’])/g, '.')
    .trim();
}

/**
 * One quote. The variant is drawn from a stream keyed on (seed, speaker, reason), never
 * from a shared one, so re-rendering the break — or reloading it — reads the same.
 */
function quoteFor(speaker: ChallengeSpeaker, reason: ChallengeReason, seed: number): ChallengeQuote {
  const pool = (CHALLENGE_QUOTES[speaker] as Record<ChallengeReasonId, string[]>)[reason.id] ?? [];
  const usable = pool.filter((t) => fillable(t, reason.vars));
  const candidates = usable.length > 0 ? usable : pool;
  const rng = createRng(mixSeed(seed, `quote:${speaker}:${reason.id}`));
  const text = candidates.length > 0 ? fill(candidates[Math.floor(rng.next() * candidates.length)], reason.vars) : '';
  return {
    speaker,
    action: reason.action,
    text,
    evidence: reason.evidence,
    reasonId: reason.id,
    playerId: reason.playerId,
  };
}

/** Exactly three quotes in board order, one reason each where the catalogue allows it. */
export function challengeQuotes(reasons: ChallengeReason[], seed = 0): ChallengeQuote[] {
  const remaining = [...reasons];
  const quotes: ChallengeQuote[] = [];
  for (const speaker of CHALLENGE_SPEAKERS) {
    if (remaining.length === 0) {
      // Fewer than three reasons fired (an empty half): the last reason speaks twice,
      // with its own variant per speaker rather than a repeated line.
      const fallback = reasons[reasons.length - 1];
      if (!fallback) break;
      quotes.push(quoteFor(speaker, fallback, seed));
      continue;
    }
    const prefs = SPEAKER_PREFERENCE[speaker];
    let idx = remaining.findIndex((r) => prefs.includes(r.action));
    if (idx < 0) idx = 0;
    quotes.push(quoteFor(speaker, remaining[idx], seed));
    remaining.splice(idx, 1);
  }
  return quotes;
}

/** The whole board-4 payload: pace band, ranked reasons, three quotes. */
export function challengeAdvice(input: ChallengeAdviceInput): ChallengeAdvice {
  const band = challengePaceBand(input.half.wins);
  const reasons = challengeReasons(input);
  return { band, reasons, quotes: challengeQuotes(reasons, input.seed ?? 0) };
}
