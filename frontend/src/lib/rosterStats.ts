import { PlayerCardData, Play } from '../components/PlayerCard';
import { calcTeamShotProfile } from './gameEngine';
import { countBadges, SYNERGIES, emptyModifiers, calcTeamBonuses } from './synergies';

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

export function calcRosterShotDiet(depthChart: Record<string, PlayerCardData[]>, activePlays: Play[]) {
  const allPlayers: PlayerCardData[] = [];
  for (const pos in depthChart) {
    allPlayers.push(...depthChart[pos]);
  }
  
  // To show shot diet in vacuum, we calculate bonuses with no opponent defense
  const fakePossShares = new Map<string, number>(); 
  const bonuses = calcTeamBonuses(allPlayers, activePlays, fakePossShares);

  // calcTeamShotProfile needs players array and depthChart
  const depthChartIds: Record<string, string[]> = {};
  for (const pos in depthChart) {
    depthChartIds[pos] = depthChart[pos].map(p => p.id);
  }
  return calcTeamShotProfile(allPlayers, depthChartIds, bonuses.offenseMods, emptyModifiers());
}

export function getBadgeTally(depthChart: Record<string, PlayerCardData[]>) {
  const allPlayers: PlayerCardData[] = [];
  for (const pos in depthChart) {
    allPlayers.push(...depthChart[pos]);
  }
  const badges = countBadges(allPlayers);
  
  const teasers = [];
  for (const syn of SYNERGIES) {
    // For teasers, we look at synergies that require a single badge (stacking) or multiple (combo)
    if (syn.id === 'shooting-gallery') {
       const lvl = badges['Sharpshooter'] || 0;
       if (lvl > 0 && lvl < 4) teasers.push({ text: `Sharpshooter ${lvl}/4`, progress: lvl/4 });
    }
    else if (syn.id === 'paint-dominance') {
       const lvl = badges['Finisher'] || 0;
       if (lvl > 0 && lvl < 4) teasers.push({ text: `Finisher ${lvl}/4`, progress: lvl/4 });
    }
    else if (syn.id === 'lockdown-squad') {
       const lvl = badges['Lockdown Defender'] || 0;
       if (lvl > 0 && lvl < 4) teasers.push({ text: `Lockdown Def ${lvl}/4`, progress: lvl/4 });
    }
    else if (syn.id === 'boards-brigade') {
       const lvl = badges['Glass Cleaner'] || 0;
       if (lvl > 0 && lvl < 3) teasers.push({ text: `Glass Cleaner ${lvl}/3`, progress: lvl/3 });
    }
    else if (syn.id === 'court-vision') {
       const lvl = badges['Floor General'] || 0;
       if (lvl > 0 && lvl < 3) teasers.push({ text: `Floor General ${lvl}/3`, progress: lvl/3 });
    }
    else if (syn.id === 'midrange-money') {
       const lvl = badges['Mid-Range Maestro'] || 0;
       if (lvl > 0 && lvl < 4) teasers.push({ text: `Mid-Range Maestro ${lvl}/4`, progress: lvl/4 });
    }
  }
  
  return {
    badges,
    teasers
  };
}
