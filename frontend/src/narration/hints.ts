/**
 * Roster hints (plan D11): a priority-ordered rule table that turns a team's final box
 * score into at most MAX_HINTS one-sentence, data-backed roster suggestions.
 *
 * Product rule: hints cite box stats, badges, positions and real season averages only —
 * NEVER `ratings` / OVR (narration-summary.test.ts greps every hint text for it).
 */
import type { GameTheater, PlayerBoxScore, RosterHint, Side } from './types';
import { MAX_HINTS } from './types';
import type { TeamInfo } from '../engine/game';
import type { PlayerCardData } from '../engine/types';
import { naturalPositions } from '../engine/positions';

export interface HintContext {
  side: Side;
  team: TeamInfo;
  /** The side's final box rows (players with 0 possessions included). */
  box: PlayerBoxScore[];
  starters: Set<string>;
  playerById: Map<string, PlayerCardData>;
  won: boolean;
  /** Absolute final margin. */
  margin: number;
}

export interface HintRule {
  id: string;
  test: (ctx: HintContext) => RosterHint | null;
}

const pct = (made: number, att: number): number => (att > 0 ? Math.round((100 * made) / att) : 0);
const reb = (b: PlayerBoxScore): number => (b.offensiveRebounds ?? 0) + (b.defensiveRebounds ?? 0);
const min = (b: PlayerBoxScore): number => Math.round(b.minutes);
const signed = (n: number): string => (n > 0 ? `+${n}` : `${n}`);
const nameOf = (ctx: HintContext, b: PlayerBoxScore): string => ctx.playerById.get(b.playerId)?.player.name ?? b.playerName;

/** True when the player starts at PF or C: depth-chart column first, natural position as fallback. */
function startsInFrontcourt(ctx: HintContext, playerId: string): boolean {
  if (!ctx.starters.has(playerId)) return false;
  const depth = ctx.team.depthChart ?? {};
  if (depth.PF?.[0] === playerId || depth.C?.[0] === playerId) return true;
  if (depth.PG?.[0] === playerId || depth.SG?.[0] === playerId || depth.SF?.[0] === playerId) return false;
  const raw = ctx.playerById.get(playerId)?.player.position ?? '';
  const cols = naturalPositions(raw);
  return cols.includes('PF') || cols.includes('C');
}

/** Rules in priority order; the first MAX_HINTS that fire (one per player) become the hints. */
export const HINT_RULES: HintRule[] = [
  {
    id: 'volume-low-eff',
    test: ctx => {
      const b = ctx.box
        .filter(x => x.fieldGoalsAttempted >= 12 && x.fieldGoalsMade / x.fieldGoalsAttempted < 0.35)
        .sort((x, y) => y.fieldGoalsAttempted - x.fieldGoalsAttempted)[0];
      if (!b) return null;
      const p = pct(b.fieldGoalsMade, b.fieldGoalsAttempted);
      return {
        ruleId: 'volume-low-eff', playerId: b.playerId,
        text: `${nameOf(ctx, b)} took ${b.fieldGoalsAttempted} shots at ${p}%: the volume outruns the efficiency — a second creator would take shots off his plate.`,
      };
    },
  },
  {
    id: 'bench-closer',
    test: ctx => {
      const bestStarterPm = Math.max(-Infinity, ...ctx.box.filter(x => ctx.starters.has(x.playerId)).map(x => x.plusMinus));
      const b = ctx.box
        .filter(x => !ctx.starters.has(x.playerId) && x.minutes >= 12 && x.plusMinus >= 8 && x.plusMinus >= bestStarterPm)
        .sort((x, y) => y.plusMinus - x.plusMinus)[0];
      if (!b) return null;
      return {
        ruleId: 'bench-closer', playerId: b.playerId,
        text: `${nameOf(ctx, b)} was +${b.plusMinus} in ${min(b)} minutes off the bench: closing-five material, and a case for starting him.`,
      };
    },
  },
  {
    id: 'turnover-prone',
    test: ctx => {
      const b = ctx.box.filter(x => x.turnovers >= 4 && x.turnovers > x.assists).sort((x, y) => y.turnovers - x.turnovers)[0];
      if (!b) return null;
      return {
        ruleId: 'turnover-prone', playerId: b.playerId,
        text: `${nameOf(ctx, b)} coughed it up ${b.turnovers} times against ${b.assists} assists: the handling load needs a second ball-handler.`,
      };
    },
  },
  {
    id: 'rebound-hole',
    test: ctx => {
      const b = ctx.box
        .filter(x => startsInFrontcourt(ctx, x.playerId) && x.minutes >= 24 && reb(x) <= 3)
        .sort((x, y) => reb(x) - reb(y))[0];
      if (!b) return null;
      return {
        ruleId: 'rebound-hole', playerId: b.playerId,
        text: `${nameOf(ctx, b)} grabbed ${reb(b)} boards in ${min(b)} minutes: the frontcourt needs a glass-cleaner next draft.`,
      };
    },
  },
  {
    id: 'no-spacing',
    test: ctx => {
      const fga = ctx.box.reduce((s, x) => s + x.fieldGoalsAttempted, 0);
      const tpa = ctx.box.reduce((s, x) => s + x.threesAttempted, 0);
      if (fga <= 0 || tpa >= 0.2 * fga) return null;
      return {
        ruleId: 'no-spacing', playerId: '',
        text: `Only ${tpa} threes on ${fga} shots: the roster lacks spacing — draft shooters.`,
      };
    },
  },
  {
    id: 'cold-from-deep',
    test: ctx => {
      const tpa = ctx.box.reduce((s, x) => s + x.threesAttempted, 0);
      const tpm = ctx.box.reduce((s, x) => s + x.threesMade, 0);
      if (tpa < 25 || tpm / tpa >= 0.28) return null;
      return {
        ruleId: 'cold-from-deep', playerId: '',
        text: `${tpm} of ${tpa} from deep: plenty of attempts, not enough shooters who make them.`,
      };
    },
  },
  {
    id: 'assist-engine',
    test: ctx => {
      const b = ctx.box.filter(x => x.assists >= 8).sort((x, y) => y.assists - x.assists)[0];
      if (!b) return null;
      return {
        ruleId: 'assist-engine', playerId: b.playerId,
        text: `${nameOf(ctx, b)} dished ${b.assists}: the offence runs through him — protect that role when you build.`,
      };
    },
  },
  {
    id: 'starter-sunk',
    test: ctx => {
      if (ctx.won) return null;
      const b = ctx.box.filter(x => ctx.starters.has(x.playerId) && x.plusMinus <= -12).sort((x, y) => x.plusMinus - y.plusMinus)[0];
      if (!b) return null;
      return {
        ruleId: 'starter-sunk', playerId: b.playerId,
        text: `${nameOf(ctx, b)} was ${signed(b.plusMinus)} in the loss: the lineup around him is not covering his matchup.`,
      };
    },
  },
  {
    id: 'two-way-anchor',
    test: ctx => {
      const b = ctx.box
        .filter(x => x.steals + x.blocks >= 4 && x.points >= 10)
        .sort((x, y) => (y.steals + y.blocks + y.points) - (x.steals + x.blocks + x.points))[0];
      if (!b) return null;
      return {
        ruleId: 'two-way-anchor', playerId: b.playerId,
        text: `${nameOf(ctx, b)}: ${b.points} points, ${b.steals} steals, ${b.blocks} blocks — a two-way anchor worth building around.`,
      };
    },
  },
];

export function buildHintContext(theater: GameTheater, side: Side): HintContext {
  const team = side === 'home' ? theater.homeTeam : theater.awayTeam;
  const [h, a] = theater.finalScore;
  const own = side === 'home' ? h : a;
  const opp = side === 'home' ? a : h;
  return {
    side,
    team,
    box: theater.boxScore[side],
    starters: new Set(team.starters),
    playerById: new Map(team.players.map(p => [p.id, p])),
    won: own > opp,
    margin: Math.abs(own - opp),
  };
}

/** The first MAX_HINTS rules that fire, at most one hint per player (team-level hints have playerId ''). */
export function rosterHints(theater: GameTheater, side: Side): RosterHint[] {
  const ctx = buildHintContext(theater, side);
  const out: RosterHint[] = [];
  const seen = new Set<string>();
  for (const rule of HINT_RULES) {
    if (out.length >= MAX_HINTS) break;
    const hint = rule.test(ctx);
    if (!hint) continue;
    if (hint.playerId && seen.has(hint.playerId)) continue;
    if (hint.playerId) seen.add(hint.playerId);
    out.push(hint);
  }
  return out;
}
