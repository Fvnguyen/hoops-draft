/**
 * Synergy & Play Bonus System
 * 
 * Three tiers:
 *   1. Badges — on player cards, no direct bonus, act as requirements
 *   2. Plays — actively chosen (3 slots), conditional bonuses if badge requirements met
 *   3. Synergies — passive/emergent from roster composition (like MtG tribal)
 * 
 * Badges are summed raw across the 12-man roster (not weighted by lineup).
 */

import { PlayerCardData, Play } from '../components/PlayerCard';
import { BuiltRoster } from './botDeckBuilder';

// ── Types ──────────────────────────────────────────────────────────────────

/** Modifiers applied to game scoring probabilities */
export interface GameModifiers {
  turnoverRate: number;     // Additive % change to turnover probability
  missRate: number;         // Additive % change to miss probability  
  twoPointRate: number;     // Additive % change to 2pt probability
  threePointRate: number;   // Additive % change to 3pt probability
  andOneRate: number;       // Additive % change to and-1 probability
  possessionSwing: number;  // Extra possessions won/lost
  description: string[];    // Narrative descriptions of active bonuses
}

function emptyModifiers(): GameModifiers {
  return { turnoverRate: 0, missRate: 0, twoPointRate: 0, threePointRate: 0, andOneRate: 0, possessionSwing: 0, description: [] };
}

// ── Badge Counting ─────────────────────────────────────────────────────────

export interface BadgeTotals {
  [badgeName: string]: number;  // Total levels across the 12-man roster
}

/** Sum all badge levels across the full roster (not weighted by playing time) */
export function countBadges(players: PlayerCardData[]): BadgeTotals {
  const totals: BadgeTotals = {};
  for (const p of players) {
    for (const t of p.traits || []) {
      totals[t.name] = (totals[t.name] || 0) + t.level;
    }
  }
  return totals;
}

// ── Team Playstyle Base Rate Shifts ────────────────────────────────────────

/**
 * Shift base scoring rates based on team composition (ratings-based, not badge-based).
 * This gives each team a distinct identity: inside teams, shooting teams, etc.
 */
export function calcPlaystyleShift(players: PlayerCardData[], possShares: Map<string, number>): GameModifiers {
  const mods = emptyModifiers();
  
  // Weighted averages by possession share
  let totalShare = 0;
  let avgFinishing = 0, avgMidRange = 0, avgPerimeter = 0, avgPlaymaking = 0;
  
  for (const p of players) {
    const share = possShares.get(p.id) || 0;
    if (share <= 0) continue;
    totalShare += share;
    avgFinishing  += p.ratings.finishing  * share;
    avgMidRange   += p.ratings.midRange   * share;
    avgPerimeter  += p.ratings.perimeter  * share;
    avgPlaymaking += p.ratings.playmaking * share;
  }
  
  if (totalShare <= 0) return mods;
  avgFinishing  /= totalShare;
  avgMidRange   /= totalShare;
  avgPerimeter  /= totalShare;
  avgPlaymaking /= totalShare;
  
  // Inside vs. outside balance — shift probability between 2pt and 3pt
  const insideStrength = (avgFinishing + avgMidRange) / 2;
  const outsideStrength = avgPerimeter;
  const insideOutsideDiff = (insideStrength - outsideStrength) / 100; // -1 to +1 range
  
  // Inside-heavy team: more 2pt, fewer 3pt (max ±5%)
  mods.twoPointRate  += insideOutsideDiff * 0.05;
  mods.threePointRate -= insideOutsideDiff * 0.05;
  
  // High playmaking: fewer turnovers (max ~3%)
  const playmakingEdge = (avgPlaymaking - 60) / 100; // Normalized above average
  mods.turnoverRate -= playmakingEdge * 0.03;
  
  if (insideOutsideDiff > 0.05) {
    mods.description.push('Inside-first offense');
  } else if (insideOutsideDiff < -0.05) {
    mods.description.push('Perimeter-oriented offense');
  }
  if (playmakingEdge > 0.1) {
    mods.description.push('Elite ball movement');
  }
  
  return mods;
}

// ── Synergy Definitions ────────────────────────────────────────────────────

interface SynergyDef {
  id: string;
  name: string;
  category: 'stacking' | 'combo' | 'chemistry';
  description: string;
  /** Check if synergy is active and return the modifier */
  check: (badges: BadgeTotals, players: PlayerCardData[]) => GameModifiers | null;
}

export const SYNERGIES: SynergyDef[] = [
  // ── Category A: Badge Stacking (scales linearly) ────────────────────────
  {
    id: 'shooting-gallery',
    name: 'Shooting Gallery',
    category: 'stacking',
    description: '+1% 3pt rate per Sharpshooter level above 3',
    check: (badges) => {
      const lvl = badges['Sharpshooter'] || 0;
      if (lvl < 4) return null;
      const bonus = (lvl - 3) * 0.01;
      return { ...emptyModifiers(), threePointRate: bonus, description: [`Shooting Gallery (+${(bonus*100).toFixed(0)}% 3pt)`] };
    },
  },
  {
    id: 'paint-dominance',
    name: 'Paint Dominance',
    category: 'stacking',
    description: '+1% 2pt rate per Finisher level above 3',
    check: (badges) => {
      const lvl = badges['Finisher'] || 0;
      if (lvl < 4) return null;
      const bonus = (lvl - 3) * 0.01;
      return { ...emptyModifiers(), twoPointRate: bonus, description: [`Paint Dominance (+${(bonus*100).toFixed(0)}% 2pt)`] };
    },
  },
  {
    id: 'lockdown-squad',
    name: 'Lockdown Squad',
    category: 'stacking',
    description: '+1% opponent turnover rate per Lockdown Defender level above 3',
    check: (badges) => {
      const lvl = badges['Lockdown Defender'] || 0;
      if (lvl < 4) return null;
      const bonus = (lvl - 3) * 0.01;
      // This is OPPONENT modifier — applied in reverse during game
      return { ...emptyModifiers(), turnoverRate: bonus, description: [`Lockdown Squad (+${(bonus*100).toFixed(0)}% opp TO)`] };
    },
  },
  {
    id: 'boards-brigade',
    name: 'Boards Brigade',
    category: 'stacking',
    description: '+0.5 possession swing per Glass Cleaner level above 2',
    check: (badges) => {
      const lvl = badges['Glass Cleaner'] || 0;
      if (lvl < 3) return null;
      const bonus = (lvl - 2) * 0.5;
      return { ...emptyModifiers(), possessionSwing: bonus, description: [`Boards Brigade (+${bonus} poss)`] };
    },
  },
  {
    id: 'court-vision',
    name: 'Court Vision',
    category: 'stacking',
    description: '-1% turnover rate per Floor General level above 2',
    check: (badges) => {
      const lvl = badges['Floor General'] || 0;
      if (lvl < 3) return null;
      const bonus = (lvl - 2) * 0.01;
      return { ...emptyModifiers(), turnoverRate: -bonus, description: [`Court Vision (-${(bonus*100).toFixed(0)}% TO)`] };
    },
  },
  {
    id: 'midrange-money',
    name: 'Midrange Money',
    category: 'stacking',
    description: '+1% 2pt rate per Mid-Range Maestro level above 3',
    check: (badges) => {
      const lvl = badges['Mid-Range Maestro'] || 0;
      if (lvl < 4) return null;
      const bonus = (lvl - 3) * 0.01;
      return { ...emptyModifiers(), twoPointRate: bonus, description: [`Midrange Money (+${(bonus*100).toFixed(0)}% 2pt)`] };
    },
  },

  // ── Category B: Badge Combos (threshold on/off) ─────────────────────────
  {
    id: 'inside-out',
    name: 'Inside-Out',
    category: 'combo',
    description: '2+ Finisher AND 2+ Sharpshooter → +3% 2pt, +3% 3pt',
    check: (badges) => {
      if ((badges['Finisher'] || 0) >= 2 && (badges['Sharpshooter'] || 0) >= 2) {
        return { ...emptyModifiers(), twoPointRate: 0.03, threePointRate: 0.03, description: ['Inside-Out (+3% 2pt, +3% 3pt)'] };
      }
      return null;
    },
  },
  {
    id: 'two-way-terror',
    name: 'Two-Way Terror',
    category: 'combo',
    description: '2+ Lockdown Defender AND 2+ Volume Scorer → +2% scoring, +2% opp miss',
    check: (badges) => {
      if ((badges['Lockdown Defender'] || 0) >= 2 && (badges['Volume Scorer'] || 0) >= 2) {
        return { ...emptyModifiers(), twoPointRate: 0.02, threePointRate: 0.02, missRate: 0.02, description: ['Two-Way Terror (+2% scoring, +2% opp miss)'] };
      }
      return null;
    },
  },
  {
    id: 'point-god-system',
    name: 'Point God System',
    category: 'combo',
    description: '2+ Floor General AND 2+ Mid-Range Maestro → -4% TO, +3% 2pt',
    check: (badges) => {
      if ((badges['Floor General'] || 0) >= 2 && (badges['Mid-Range Maestro'] || 0) >= 2) {
        return { ...emptyModifiers(), turnoverRate: -0.04, twoPointRate: 0.03, description: ['Point God System (-4% TO, +3% 2pt)'] };
      }
      return null;
    },
  },
  {
    id: 'rim-protection',
    name: 'Rim Protection',
    category: 'combo',
    description: '2+ Paint Protector AND 2+ Glass Cleaner → +2 poss, +3% opp miss on 2pt',
    check: (badges) => {
      if ((badges['Paint Protector'] || 0) >= 2 && (badges['Glass Cleaner'] || 0) >= 2) {
        return { ...emptyModifiers(), possessionSwing: 2, missRate: 0.03, description: ['Rim Protection (+2 poss, +3% opp 2pt miss)'] };
      }
      return null;
    },
  },
  {
    id: 'two-way-wings',
    name: 'Two-Way Wings',
    category: 'combo',
    description: '2+ Two-Way Disruptor AND 2+ Sharpshooter → +2% 3pt, +2% opp TO',
    check: (badges) => {
      if ((badges['Two-Way Disruptor'] || 0) >= 2 && (badges['Sharpshooter'] || 0) >= 2) {
        return { ...emptyModifiers(), threePointRate: 0.02, turnoverRate: 0.02, description: ['Two-Way Wings (+2% 3pt, +2% opp TO)'] };
      }
      return null;
    },
  },

  // ── Category C: Team Chemistry (roster construction) ────────────────────
  {
    id: 'brotherhood',
    name: 'Brotherhood',
    category: 'chemistry',
    description: '3+ players from same NBA team → +2% all scoring per additional player',
    check: (_badges, players) => {
      const teamCounts: Record<string, number> = {};
      for (const p of players) teamCounts[p.player.team] = (teamCounts[p.player.team] || 0) + 1;
      const maxTeam = Math.max(...Object.values(teamCounts));
      if (maxTeam < 3) return null;
      const bonus = (maxTeam - 2) * 0.02;
      const teamName = Object.entries(teamCounts).find(([_, c]) => c === maxTeam)?.[0] || '';
      return { ...emptyModifiers(), twoPointRate: bonus, threePointRate: bonus, description: [`Brotherhood: ${teamName} (${maxTeam} players, +${(bonus*100).toFixed(0)}% scoring)`] };
    },
  },
  {
    id: 'veteran-core',
    name: 'Veteran Core',
    category: 'chemistry',
    description: '3+ players age 30+ → +2% Q4 clutch, -2% TO',
    check: (_badges, players) => {
      const vets = players.filter(p => p.player.age >= 30).length;
      if (vets < 3) return null;
      return { ...emptyModifiers(), turnoverRate: -0.02, description: [`Veteran Core (${vets} vets, -2% TO, +2% clutch)`] };
    },
  },
  {
    id: 'young-guns',
    name: 'Young Guns',
    category: 'chemistry',
    description: '3+ players age 24 or under → +2% transition scoring',
    check: (_badges, players) => {
      const young = players.filter(p => p.player.age <= 24).length;
      if (young < 3) return null;
      return { ...emptyModifiers(), twoPointRate: 0.02, description: [`Young Guns (${young} young players, +2% transition)`] };
    },
  },
];

// ── Play Activation ────────────────────────────────────────────────────────

interface PlayRequirement {
  badge: string;
  levels: number;
}

interface PlayEffect {
  requirements: PlayRequirement[];
  fullBonus: GameModifiers;
  halfBonus: GameModifiers;
}

/** 
 * Play effects keyed by play ID.
 * Full bonus if all requirements met, half bonus if ≥50% met, nothing if <50%.
 */
const PLAY_EFFECTS: Record<string, PlayEffect> = {
  'play-sys-1': { // Triangle Offense
    requirements: [{ badge: 'Finisher', levels: 2 }, { badge: 'Mid-Range Maestro', levels: 2 }],
    fullBonus: { ...emptyModifiers(), twoPointRate: 0.08, description: ['▲ Triangle Offense (+8% 2pt)'] },
    halfBonus: { ...emptyModifiers(), twoPointRate: 0.04, description: ['▲ Triangle Offense (partial, +4% 2pt)'] },
  },
  'play-sys-2': { // 7 Seconds or Less
    requirements: [{ badge: 'Sharpshooter', levels: 3 }, { badge: 'Floor General', levels: 1 }],
    fullBonus: { ...emptyModifiers(), threePointRate: 0.06, turnoverRate: -0.05, description: ['⚡ 7SOL (+6% 3pt, -5% TO)'] },
    halfBonus: { ...emptyModifiers(), threePointRate: 0.03, turnoverRate: -0.02, description: ['⚡ 7SOL (partial, +3% 3pt, -2% TO)'] },
  },
  'play-sys-3': { // Grit and Grind
    requirements: [{ badge: 'Lockdown Defender', levels: 2 }, { badge: 'Glass Cleaner', levels: 1 }],
    fullBonus: { ...emptyModifiers(), missRate: 0.07, possessionSwing: 1, description: ['🛡️ Grit and Grind (+7% opp miss, +1 poss)'] },
    halfBonus: { ...emptyModifiers(), missRate: 0.03, description: ['🛡️ Grit and Grind (partial, +3% opp miss)'] },
  },
  'play-sys-4': { // Motion Offense
    requirements: [{ badge: 'Floor General', levels: 2 }],
    fullBonus: { ...emptyModifiers(), twoPointRate: 0.04, threePointRate: 0.03, turnoverRate: -0.03, description: ['🔄 Motion Offense (+4% 2pt, +3% 3pt, -3% TO)'] },
    halfBonus: { ...emptyModifiers(), twoPointRate: 0.02, threePointRate: 0.01, description: ['🔄 Motion Offense (partial, +2% 2pt, +1% 3pt)'] },
  },
  'play-std-1': { // High Pick & Roll
    requirements: [{ badge: 'Floor General', levels: 1 }, { badge: 'Finisher', levels: 1 }],
    fullBonus: { ...emptyModifiers(), twoPointRate: 0.04, andOneRate: 0.03, description: ['🏀 High PnR (+4% 2pt, +3% and-1)'] },
    halfBonus: { ...emptyModifiers(), twoPointRate: 0.02, description: ['🏀 High PnR (partial, +2% 2pt)'] },
  },
  'play-std-2': { // Iso Ball
    requirements: [{ badge: 'Volume Scorer', levels: 1 }],
    fullBonus: { ...emptyModifiers(), twoPointRate: 0.03, threePointRate: 0.02, turnoverRate: 0.02, description: ['🎯 Iso Ball (+3% 2pt, +2% 3pt, +2% TO risk)'] },
    halfBonus: { ...emptyModifiers(), twoPointRate: 0.01, description: ['🎯 Iso Ball (partial, +1% 2pt)'] },
  },
  'play-std-3': { // Zone Defense
    requirements: [{ badge: 'Lockdown Defender', levels: 1 }],
    fullBonus: { ...emptyModifiers(), missRate: 0.05, twoPointRate: -0.03, description: ['🛡️ Zone Defense (+5% opp 3pt miss, -3% opp 2pt miss)'] },
    halfBonus: { ...emptyModifiers(), missRate: 0.02, description: ['🛡️ Zone Defense (partial, +2% opp miss)'] },
  },
  'play-std-4': { // Fast Break
    requirements: [{ badge: 'Finisher', levels: 1 }],
    fullBonus: { ...emptyModifiers(), twoPointRate: 0.03, turnoverRate: 0.01, description: ['🏃 Fast Break (+3% 2pt, +1% TO risk)'] },
    halfBonus: { ...emptyModifiers(), twoPointRate: 0.01, description: ['🏃 Fast Break (partial, +1% 2pt)'] },
  },
  'play-std-5': { // 3-Point Barrage
    requirements: [{ badge: 'Sharpshooter', levels: 2 }],
    fullBonus: { ...emptyModifiers(), threePointRate: 0.05, twoPointRate: -0.02, description: ['☄️ 3-Point Barrage (+5% 3pt, -2% 2pt)'] },
    halfBonus: { ...emptyModifiers(), threePointRate: 0.02, description: ['☄️ 3-Point Barrage (partial, +2% 3pt)'] },
  },
};

/** Check a single play's activation against the team's badge totals */
function checkPlayActivation(play: Play, badges: BadgeTotals): GameModifiers | null {
  const effect = PLAY_EFFECTS[play.id];
  if (!effect) return null;
  
  let metCount = 0;
  for (const req of effect.requirements) {
    if ((badges[req.badge] || 0) >= req.levels) metCount++;
  }
  
  const ratio = effect.requirements.length > 0 ? metCount / effect.requirements.length : 1;
  
  if (ratio >= 1.0) return effect.fullBonus;
  if (ratio >= 0.5) return effect.halfBonus;
  return null;
}

// ── Main: Compute All Bonuses ──────────────────────────────────────────────

export interface TeamBonuses {
  /** Modifiers for THIS team's offense */
  offenseMods: GameModifiers;
  /** Modifiers applied to OPPONENT's offense (defensive bonuses) */
  defenseMods: GameModifiers;
  /** Extra possessions won from synergies/plays */
  possessionSwing: number;
  /** All active synergies and plays for display */
  activeSynergies: { name: string; description: string }[];
  activePlays: { name: string; description: string; activated: 'full' | 'partial' | 'none' }[];
  /** Playstyle description */
  playstyle: string[];
}

/**
 * Calculate all bonuses for a team.
 * 
 * @param rosterPlayers - All 12 players in the active roster
 * @param activePlays - The 3 active Play cards
 * @param possShares - Map of playerId → possession share (from rotation engine)
 */
export function calcTeamBonuses(
  rosterPlayers: PlayerCardData[],
  activePlays: Play[],
  possShares: Map<string, number>
): TeamBonuses {
  const badges = countBadges(rosterPlayers);
  
  const offenseMods = emptyModifiers();
  const defenseMods = emptyModifiers();
  let possessionSwing = 0;
  const activeSynergies: { name: string; description: string }[] = [];
  const activePlayResults: { name: string; description: string; activated: 'full' | 'partial' | 'none' }[] = [];
  
  // 1. Playstyle shift (ratings-based, NOT badge-based)
  const playstyle = calcPlaystyleShift(rosterPlayers, possShares);
  offenseMods.turnoverRate += playstyle.turnoverRate;
  offenseMods.twoPointRate += playstyle.twoPointRate;
  offenseMods.threePointRate += playstyle.threePointRate;
  
  // 2. Synergies
  for (const syn of SYNERGIES) {
    const result = syn.check(badges, rosterPlayers);
    if (result) {
      // Lockdown Squad and defensive synergies apply to opponent
      if (syn.id === 'lockdown-squad' || syn.id === 'two-way-terror' || syn.id === 'two-way-wings' || syn.id === 'rim-protection') {
        defenseMods.turnoverRate += result.turnoverRate;
        defenseMods.missRate += result.missRate;
        defenseMods.possessionSwing -= result.possessionSwing; // Opponent loses possessions
      } else {
        offenseMods.turnoverRate += result.turnoverRate;
        offenseMods.twoPointRate += result.twoPointRate;
        offenseMods.threePointRate += result.threePointRate;
        offenseMods.andOneRate += result.andOneRate;
      }
      possessionSwing += result.possessionSwing;
      offenseMods.description.push(...result.description);
      activeSynergies.push({ name: syn.name, description: syn.description });
    }
  }
  
  // 3. Plays
  for (const play of activePlays) {
    const result = checkPlayActivation(play, badges);
    if (result) {
      // Defensive plays (Grit and Grind, Zone Defense) apply to opponent
      if (play.id === 'play-sys-3' || play.id === 'play-std-3') {
        defenseMods.missRate += result.missRate;
        defenseMods.twoPointRate += result.twoPointRate; // Could be negative (Zone D)
        possessionSwing += result.possessionSwing;
      } else {
        offenseMods.turnoverRate += result.turnoverRate;
        offenseMods.twoPointRate += result.twoPointRate;
        offenseMods.threePointRate += result.threePointRate;
        offenseMods.andOneRate += result.andOneRate;
      }
      offenseMods.description.push(...result.description);
      const effect = PLAY_EFFECTS[play.id];
      const activation = result === effect?.fullBonus ? 'full' : 'partial';
      activePlayResults.push({ name: play.name, description: result.description.join(', '), activated: activation });
    } else {
      activePlayResults.push({ name: play.name, description: 'Requirements not met', activated: 'none' });
    }
  }
  
  return {
    offenseMods,
    defenseMods,
    possessionSwing,
    activeSynergies,
    activePlays: activePlayResults,
    playstyle: playstyle.description,
  };
}
