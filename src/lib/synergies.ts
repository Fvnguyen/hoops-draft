/**
 * Synergy & Play Bonus System (v2 — Channel-Based)
 * 
 * Three tiers:
 *   1. Badges — on player cards, no direct bonus, act as requirements
 *   2. Plays — actively chosen (3 slots), conditional bonuses if badge requirements met
 *   3. Synergies — passive/emergent from roster composition (like MtG tribal)
 * 
 * Badges are summed raw across the 12-man roster (not weighted by lineup).
 * 
 * Bonuses target channel-specific modifiers:
 *   - Shot distribution: rimShareBonus, midShareBonus, perShareBonus
 *   - Shot efficiency: rimEffBonus, midEffBonus, perEffBonus
 *   - Possession: possessionSwing
 *   - And-1: and1Bonus
 */

import { PlayerCardData, Play } from '../components/PlayerCard';
import { BuiltRoster } from './botDeckBuilder';

// ── Types ──────────────────────────────────────────────────────────────────

/** Channel-based modifiers applied to game scoring */
export interface GameModifiers {
  // Shot distribution shifts (additive to team shot profile)
  rimShareBonus: number;    // Shift rim attempt share (e.g., +0.03 = +3%)
  midShareBonus: number;    // Shift mid-range attempt share
  perShareBonus: number;    // Shift perimeter/3pt attempt share
  // Efficiency shifts (additive to base efficiency per channel)
  rimEffBonus: number;      // e.g., +0.02 = +2% rim FG
  midEffBonus: number;      // e.g., +0.02 = +2% mid FG
  perEffBonus: number;      // e.g., +0.02 = +2% 3pt FG
  // Other
  possessionSwing: number;  // Extra possessions won/lost
  and1Bonus: number;        // Additive and-1 chance (all channels)
  description: string[];    // Narrative descriptions of active bonuses
}

function emptyModifiers(): GameModifiers {
  return {
    rimShareBonus: 0, midShareBonus: 0, perShareBonus: 0,
    rimEffBonus: 0, midEffBonus: 0, perEffBonus: 0,
    possessionSwing: 0, and1Bonus: 0, description: [],
  };
}

/** Merge one modifier set into another (additive) */
function mergeModifiers(target: GameModifiers, source: GameModifiers): void {
  target.rimShareBonus += source.rimShareBonus;
  target.midShareBonus += source.midShareBonus;
  target.perShareBonus += source.perShareBonus;
  target.rimEffBonus += source.rimEffBonus;
  target.midEffBonus += source.midEffBonus;
  target.perEffBonus += source.perEffBonus;
  target.possessionSwing += source.possessionSwing;
  target.and1Bonus += source.and1Bonus;
  target.description.push(...source.description);
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
 * (DEPRECATED — shot profile is now computed in gameEngine.ts via calcTeamShotProfile)
 * Playstyle shift has been absorbed into the pre-game shot distribution calculation.
 * This function is kept for backward compatibility but returns empty modifiers.
 */
export function calcPlaystyleShift(players: PlayerCardData[], possShares: Map<string, number>): GameModifiers {
  return emptyModifiers();
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
    description: '+1% 3pt share and +0.5% 3pt eff per Sharpshooter level above 3',
    check: (badges) => {
      const lvl = badges['Sharpshooter'] || 0;
      if (lvl < 4) return null;
      const bonus = lvl - 3;
      return { ...emptyModifiers(), perShareBonus: bonus * 0.01, perEffBonus: bonus * 0.005, description: [`Shooting Gallery (+${bonus}% 3pt share, +${(bonus*0.5).toFixed(1)}% 3pt eff)`] };
    },
  },
  {
    id: 'paint-dominance',
    name: 'Paint Dominance',
    category: 'stacking',
    description: '+1% rim share and +0.5% rim eff per Finisher level above 3',
    check: (badges) => {
      const lvl = badges['Finisher'] || 0;
      if (lvl < 4) return null;
      const bonus = lvl - 3;
      return { ...emptyModifiers(), rimShareBonus: bonus * 0.01, rimEffBonus: bonus * 0.005, description: [`Paint Dominance (+${bonus}% rim share, +${(bonus*0.5).toFixed(1)}% rim eff)`] };
    },
  },
  {
    id: 'lockdown-squad',
    name: 'Lockdown Squad',
    category: 'stacking',
    description: '-0.5% opponent rim and mid eff per Lockdown Defender level above 3',
    check: (badges) => {
      const lvl = badges['Lockdown Defender'] || 0;
      if (lvl < 4) return null;
      const bonus = lvl - 3;
      // Defensive: reduces opponent efficiency
      return { ...emptyModifiers(), rimEffBonus: -bonus * 0.005, midEffBonus: -bonus * 0.005, description: [`Lockdown Squad (-${(bonus*0.5).toFixed(1)}% opp rim/mid eff)`] };
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
    description: '+0.5 possession swing per Floor General level above 2',
    check: (badges) => {
      const lvl = badges['Floor General'] || 0;
      if (lvl < 3) return null;
      const bonus = (lvl - 2) * 0.5;
      return { ...emptyModifiers(), possessionSwing: bonus, description: [`Court Vision (+${bonus} poss)`] };
    },
  },
  {
    id: 'midrange-money',
    name: 'Midrange Money',
    category: 'stacking',
    description: '+1% mid share and +0.5% mid eff per Mid-Range Maestro level above 3',
    check: (badges) => {
      const lvl = badges['Mid-Range Maestro'] || 0;
      if (lvl < 4) return null;
      const bonus = lvl - 3;
      return { ...emptyModifiers(), midShareBonus: bonus * 0.01, midEffBonus: bonus * 0.005, description: [`Midrange Money (+${bonus}% mid share, +${(bonus*0.5).toFixed(1)}% mid eff)`] };
    },
  },

  // ── Category B: Badge Combos (threshold on/off) ─────────────────────────
  {
    id: 'inside-out',
    name: 'Inside-Out',
    category: 'combo',
    description: '2+ Finisher AND 2+ Sharpshooter → +2% rim eff, +2% 3pt eff',
    check: (badges) => {
      if ((badges['Finisher'] || 0) >= 2 && (badges['Sharpshooter'] || 0) >= 2) {
        return { ...emptyModifiers(), rimEffBonus: 0.02, perEffBonus: 0.02, description: ['Inside-Out (+2% rim eff, +2% 3pt eff)'] };
      }
      return null;
    },
  },
  {
    id: 'two-way-terror',
    name: 'Two-Way Terror',
    category: 'combo',
    description: '2+ Lockdown Defender AND 2+ Volume Scorer → +1% all eff, -1% opp all eff',
    check: (badges) => {
      if ((badges['Lockdown Defender'] || 0) >= 2 && (badges['Volume Scorer'] || 0) >= 2) {
        return { ...emptyModifiers(), rimEffBonus: 0.01, midEffBonus: 0.01, perEffBonus: 0.01, description: ['Two-Way Terror (+1% all eff)'] };
      }
      return null;
    },
  },
  {
    id: 'point-god-system',
    name: 'Point God System',
    category: 'combo',
    description: '2+ Floor General AND 2+ Mid-Range Maestro → +1 poss, +2% mid share, +2% mid eff',
    check: (badges) => {
      if ((badges['Floor General'] || 0) >= 2 && (badges['Mid-Range Maestro'] || 0) >= 2) {
        return { ...emptyModifiers(), possessionSwing: 1, midShareBonus: 0.02, midEffBonus: 0.02, description: ['Point God System (+1 poss, +2% mid share/eff)'] };
      }
      return null;
    },
  },
  {
    id: 'rim-protection',
    name: 'Rim Protection',
    category: 'combo',
    description: '2+ Paint Protector AND 2+ Glass Cleaner → +2 poss, -2% opp rim eff',
    check: (badges) => {
      if ((badges['Paint Protector'] || 0) >= 2 && (badges['Glass Cleaner'] || 0) >= 2) {
        return { ...emptyModifiers(), possessionSwing: 2, rimEffBonus: -0.02, description: ['Rim Protection (+2 poss, -2% opp rim eff)'] };
      }
      return null;
    },
  },
  {
    id: 'two-way-wings',
    name: 'Two-Way Wings',
    category: 'combo',
    description: '2+ Two-Way Disruptor AND 2+ Sharpshooter → +2% 3pt share, -1% opp 3pt eff',
    check: (badges) => {
      if ((badges['Two-Way Disruptor'] || 0) >= 2 && (badges['Sharpshooter'] || 0) >= 2) {
        return { ...emptyModifiers(), perShareBonus: 0.02, perEffBonus: -0.01, description: ['Two-Way Wings (+2% 3pt share, -1% opp 3pt eff)'] };
      }
      return null;
    },
  },

  // ── Category C: Team Chemistry (roster construction) ────────────────────
  {
    id: 'brotherhood',
    name: 'Brotherhood',
    category: 'chemistry',
    description: '3+ players from same NBA team → +1% all eff per additional player',
    check: (_badges, players) => {
      const teamCounts: Record<string, number> = {};
      for (const p of players) teamCounts[p.player.team] = (teamCounts[p.player.team] || 0) + 1;
      const maxTeam = Math.max(...Object.values(teamCounts));
      if (maxTeam < 3) return null;
      const bonus = (maxTeam - 2) * 0.01;
      const teamName = Object.entries(teamCounts).find(([_, c]) => c === maxTeam)?.[0] || '';
      return { ...emptyModifiers(), rimEffBonus: bonus, midEffBonus: bonus, perEffBonus: bonus, description: [`Brotherhood: ${teamName} (${maxTeam} players, +${(bonus*100).toFixed(0)}% all eff)`] };
    },
  },
  {
    id: 'veteran-core',
    name: 'Veteran Core',
    category: 'chemistry',
    description: '3+ players age 30+ → +1 poss, +1% mid eff',
    check: (_badges, players) => {
      const vets = players.filter(p => p.player.age >= 30).length;
      if (vets < 3) return null;
      return { ...emptyModifiers(), possessionSwing: 1, midEffBonus: 0.01, description: [`Veteran Core (${vets} vets, +1 poss, +1% mid eff)`] };
    },
  },
  {
    id: 'young-guns',
    name: 'Young Guns',
    category: 'chemistry',
    description: '3+ players age 24 or under → +2% rim share, +1% rim eff',
    check: (_badges, players) => {
      const young = players.filter(p => p.player.age <= 24).length;
      if (young < 3) return null;
      return { ...emptyModifiers(), rimShareBonus: 0.02, rimEffBonus: 0.01, description: [`Young Guns (${young} young players, +2% rim share, +1% rim eff)`] };
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
    fullBonus: { ...emptyModifiers(), rimShareBonus: 0.03, midShareBonus: 0.04, rimEffBonus: 0.02, midEffBonus: 0.03, description: ['▲ Triangle Offense (+3% rim/+4% mid share, +2/+3% eff)'] },
    halfBonus: { ...emptyModifiers(), midShareBonus: 0.02, midEffBonus: 0.01, description: ['▲ Triangle Offense (partial, +2% mid share, +1% eff)'] },
  },
  'play-sys-2': { // 7 Seconds or Less
    requirements: [{ badge: 'Sharpshooter', levels: 3 }, { badge: 'Floor General', levels: 1 }],
    fullBonus: { ...emptyModifiers(), perShareBonus: 0.05, perEffBonus: 0.02, possessionSwing: 1, description: ['⚡ 7SOL (+5% 3pt share, +2% 3pt eff, +1 poss)'] },
    halfBonus: { ...emptyModifiers(), perShareBonus: 0.02, perEffBonus: 0.01, description: ['⚡ 7SOL (partial, +2% 3pt share, +1% eff)'] },
  },
  'play-sys-3': { // Grit and Grind (defensive)
    requirements: [{ badge: 'Lockdown Defender', levels: 2 }, { badge: 'Glass Cleaner', levels: 1 }],
    fullBonus: { ...emptyModifiers(), rimEffBonus: -0.03, midEffBonus: -0.02, possessionSwing: 1, description: ['🛡️ Grit and Grind (-3% opp rim eff, -2% opp mid eff, +1 poss)'] },
    halfBonus: { ...emptyModifiers(), rimEffBonus: -0.01, description: ['🛡️ Grit and Grind (partial, -1% opp rim eff)'] },
  },
  'play-sys-4': { // Motion Offense
    requirements: [{ badge: 'Floor General', levels: 2 }],
    fullBonus: { ...emptyModifiers(), rimEffBonus: 0.01, midEffBonus: 0.02, perEffBonus: 0.02, possessionSwing: 1, description: ['🔄 Motion Offense (+1/+2/+2% eff, +1 poss)'] },
    halfBonus: { ...emptyModifiers(), midEffBonus: 0.01, perEffBonus: 0.01, description: ['🔄 Motion Offense (partial, +1% mid/3pt eff)'] },
  },
  'play-std-1': { // High Pick & Roll
    requirements: [{ badge: 'Floor General', levels: 1 }, { badge: 'Finisher', levels: 1 }],
    fullBonus: { ...emptyModifiers(), rimShareBonus: 0.03, rimEffBonus: 0.02, and1Bonus: 0.02, description: ['🏀 High PnR (+3% rim share, +2% rim eff, +2% and-1)'] },
    halfBonus: { ...emptyModifiers(), rimShareBonus: 0.01, description: ['🏀 High PnR (partial, +1% rim share)'] },
  },
  'play-std-2': { // Iso Ball
    requirements: [{ badge: 'Volume Scorer', levels: 1 }],
    fullBonus: { ...emptyModifiers(), rimShareBonus: 0.02, midShareBonus: 0.02, rimEffBonus: 0.01, midEffBonus: 0.02, description: ['🎯 Iso Ball (+2% rim/mid share, +1/+2% eff)'] },
    halfBonus: { ...emptyModifiers(), midShareBonus: 0.01, description: ['🎯 Iso Ball (partial, +1% mid share)'] },
  },
  'play-std-3': { // Zone Defense (defensive)
    requirements: [{ badge: 'Lockdown Defender', levels: 1 }],
    fullBonus: { ...emptyModifiers(), perEffBonus: -0.03, midEffBonus: -0.01, description: ['🛡️ Zone Defense (-3% opp 3pt eff, -1% opp mid eff)'] },
    halfBonus: { ...emptyModifiers(), perEffBonus: -0.01, description: ['🛡️ Zone Defense (partial, -1% opp 3pt eff)'] },
  },
  'play-std-4': { // Fast Break
    requirements: [{ badge: 'Finisher', levels: 1 }],
    fullBonus: { ...emptyModifiers(), rimShareBonus: 0.03, rimEffBonus: 0.02, and1Bonus: 0.01, description: ['🏃 Fast Break (+3% rim share, +2% rim eff, +1% and-1)'] },
    halfBonus: { ...emptyModifiers(), rimShareBonus: 0.01, description: ['🏃 Fast Break (partial, +1% rim share)'] },
  },
  'play-std-5': { // 3-Point Barrage
    requirements: [{ badge: 'Sharpshooter', levels: 2 }],
    fullBonus: { ...emptyModifiers(), perShareBonus: 0.05, perEffBonus: 0.02, rimShareBonus: -0.02, description: ['☄️ 3-Point Barrage (+5% 3pt share, +2% 3pt eff, -2% rim share)'] },
    halfBonus: { ...emptyModifiers(), perShareBonus: 0.02, description: ['☄️ 3-Point Barrage (partial, +2% 3pt share)'] },
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
  
  // 1. Synergies
  for (const syn of SYNERGIES) {
    const result = syn.check(badges, rosterPlayers);
    if (result) {
      // Defensive synergies apply to opponent
      if (syn.id === 'lockdown-squad' || syn.id === 'rim-protection') {
        mergeModifiers(defenseMods, result);
        defenseMods.possessionSwing -= result.possessionSwing; // Opponent loses possessions
      } else if (syn.id === 'two-way-terror') {
        // +1% all eff (self), -1% opp all eff
        mergeModifiers(offenseMods, result);
        defenseMods.rimEffBonus -= 0.01;
        defenseMods.midEffBonus -= 0.01;
        defenseMods.perEffBonus -= 0.01;
      } else if (syn.id === 'two-way-wings') {
        // +2% 3pt share (self), -1% opp 3pt eff
        offenseMods.perShareBonus += result.perShareBonus || 0;
        defenseMods.perEffBonus += result.perEffBonus || 0;
      } else {
        mergeModifiers(offenseMods, result);
      }
      possessionSwing += result.possessionSwing;
      activeSynergies.push({ name: syn.name, description: syn.description });
    }
  }
  
  // 2. Plays
  for (const play of activePlays) {
    const result = checkPlayActivation(play, badges);
    if (result) {
      // Defensive plays (Grit and Grind, Zone Defense) apply to opponent
      if (play.id === 'play-sys-3' || play.id === 'play-std-3') {
        mergeModifiers(defenseMods, result);
        possessionSwing += result.possessionSwing;
      } else {
        mergeModifiers(offenseMods, result);
      }
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
    playstyle: [],
  };
}
