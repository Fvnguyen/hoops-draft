import { PlayerCardData, Play } from './types';
import { calcLineupShotProfile } from './game';
import { countBadges, emptyModifiers, calcTeamBonuses } from './synergies';
import { evaluateArchetypes, MONO_THRESHOLDS, type ArchetypeSelection } from './archetypes';

export interface RosterIdentity {
  finishing: number;
  midRange: number;
  perimeter: number;
  playmaking: number;
  rebounding: number;
  perDef: number;
  postDef: number;
}

export function resolveDepthChart(players: PlayerCardData[], depthChartIds: Record<string, string[]>): Record<string, PlayerCardData[]> {
  const result: Record<string, PlayerCardData[]> = { PG: [], SG: [], SF: [], PF: [], C: [] };
  const playerMap = new Map(players.map(p => [p.id, p]));
  for (const pos in depthChartIds) {
    if (result[pos] !== undefined) {
      result[pos] = depthChartIds[pos].map(id => playerMap.get(id)).filter(p => !!p) as PlayerCardData[];
    }
  }
  return result;
}

export function calcRosterIdentity(depthChart: Record<string, PlayerCardData[]>): RosterIdentity {
  const totals = { finishing: 0, midRange: 0, perimeter: 0, playmaking: 0, rebounding: 0, perDef: 0, postDef: 0 };
  let totalWeight = 0;

  for (const pos of ['PG', 'SG', 'SF', 'PF', 'C']) {
    const players = depthChart[pos];
    players.forEach((p, idx) => {
      const weight = idx === 0 ? 2.0 : 1.0;
      totalWeight += weight;

      const r = p.ratings;
      if (r) {
        totals.finishing += (r.finishing ?? 50) * weight;
        totals.midRange += (r.midRange ?? 50) * weight;
        totals.perimeter += (r.perimeter ?? 50) * weight;
        totals.playmaking += (r.playmaking ?? 50) * weight;
        totals.rebounding += (r.rebounding ?? 50) * weight;
        totals.perDef += (r.perimeterDefense ?? 50) * weight;
        totals.postDef += (r.postDefense ?? 50) * weight;
      } else {
        totals.finishing += 50 * weight;
        totals.midRange += 50 * weight;
        totals.perimeter += 50 * weight;
        totals.playmaking += 50 * weight;
        totals.rebounding += 50 * weight;
        totals.perDef += 50 * weight;
        totals.postDef += 50 * weight;
      }
    });
  }

  if (totalWeight > 0) {
    totals.finishing /= totalWeight;
    totals.midRange /= totalWeight;
    totals.perimeter /= totalWeight;
    totals.playmaking /= totalWeight;
    totals.rebounding /= totalWeight;
    totals.perDef /= totalWeight;
    totals.postDef /= totalWeight;
  }

  return totals;
}

/**
 * v3 (2026-09-13): `activePlays` no longer feeds team bonuses (Plays are resolved
 * per-possession in game.ts against playbook.ts) — kept as a parameter only so
 * existing UI callers (FranchiseDashboard.tsx, DraftRoom.tsx, GameView.tsx) that still
 * pass `team.plays` keep compiling. Pass `selection` to preview a chosen archetype's
 * effect on the shot diet; omitted, the diet reflects no archetype (identical to the
 * roster's raw depth-chart tendency).
 */
export function calcRosterShotDiet(
  depthChart: Record<string, PlayerCardData[]>,
  // Kept for call-signature compatibility with existing UI callers; plays no longer feed calcTeamBonuses.
  activePlays: Play[],
  selection?: ArchetypeSelection,
) {
  const allPlayers: PlayerCardData[] = [];
  for (const pos in depthChart) {
    allPlayers.push(...depthChart[pos]);
  }

  // To show shot diet in vacuum, we calculate bonuses with no opponent defense
  const fakePossShares = new Map<string, number>();
  const bonuses = calcTeamBonuses(allPlayers, [], fakePossShares, selection ? { archetypes: selection } : undefined);

  // engine_possession_model D4: the engine's profile is per on-court five, so the deck
  // builder previews the starting five (depth-chart index 0 per position).
  const starters: PlayerCardData[] = [];
  for (const pos in depthChart) {
    if (depthChart[pos][0]) starters.push(depthChart[pos][0]);
  }
  return calcLineupShotProfile(starters.length > 0 ? starters : allPlayers, bonuses.offenseMods, emptyModifiers());
}

/**
 * Badge totals plus "teaser" progress toward each MONO archetype's Online tier (the
 * roster-builder UI shows these while a plan is still out of reach — two-colour and
 * Gold plans are more involved to preview inline, so they're left to the full
 * archetype-selection screen). Starters are taken as each position's depth-chart index 0
 * (mirrors calcRosterIdentity's own starter weighting).
 */
export function getBadgeTally(depthChart: Record<string, PlayerCardData[]>) {
  const allPlayers: PlayerCardData[] = [];
  const starterIds = new Set<string>();
  for (const pos in depthChart) {
    const players = depthChart[pos];
    allPlayers.push(...players);
    if (players[0]) starterIds.add(players[0].id);
  }
  const badges = countBadges(allPlayers);

  const statuses = evaluateArchetypes(allPlayers, starterIds);
  const teasers = statuses
    .filter(s => s.def.kind === 'mono' && s.tier === 'none')
    .map(s => {
      const t = s.tally[s.def.colors.primary]!;
      return { text: `${s.def.colors.primary} ${t.carriers}/${MONO_THRESHOLDS.online.carriers} carriers`, progress: s.progress };
    })
    .filter(t => t.progress > 0);

  return {
    badges,
    teasers
  };
}

/**
 * League-mean values for each identity axis, computed over the full card pool
 * (see docs/ROADMAP.md P1-1). Used only as a visual reference (radar outline,
 * ticks) — never rendered as a number (product rule: no ratings shown).
 */
export const LEAGUE_AVG_IDENTITY: RosterIdentity = {
  finishing: 55.5,
  midRange: 49.0,
  perimeter: 57.5,
  playmaking: 35.3,
  rebounding: 41.1,
  perDef: 53.5,
  postDef: 46.4,
};
