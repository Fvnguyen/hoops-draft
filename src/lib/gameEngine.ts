/**
 * Game Simulation Engine
 * 
 * Pre-computes a full game into a GameTheater object that the UI plays back.
 * 
 * Layers:
 *   1. Rotation Engine — NBA-style substitution patterns
 *   2. Possession Battle — defense + rebounding determines total possessions
 *   3. Scoring Engine — offense vs defense matchup per possession
 *   4. Synergy/Play bonuses applied as modifiers
 */

import { PlayerCardData, Play, DraftCard } from '../components/PlayerCard';
import { DraftSession, DraftSessionSeat, BuiltRoster } from './botDeckBuilder';
import { calcTeamBonuses, TeamBonuses, GameModifiers } from './synergies';

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
}

export interface SubstitutionEvent {
  possession: number;
  quarter: number;
  playerIn: string;       // Player ID entering
  playerOut: string;      // Player ID leaving
  position: string;       // Position column (PG, SG, etc.)
}

export interface PossessionEvent {
  index: number;
  quarter: number;
  team: 'home' | 'away';
  lineupOnCourt: string[];    // 5 player IDs on offense
  defenseOnCourt: string[];   // 5 player IDs on defense
  outcome: 'miss' | '2pt' | '3pt' | 'and1';
  scoringPlayerId?: string;
  assistPlayerId?: string;
  isPossessionWinEvent?: boolean;  // Steal, OREB, etc. that earned extra possession
  narrativeText: string;
  runningScore: [number, number]; // [home, away]
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
  substitutions: SubstitutionEvent[];
  quarterSummaries: QuarterSummary[];
  finalScore: [number, number];
  boxScore: { home: PlayerBoxScore[]; away: PlayerBoxScore[] };
  homeBonuses: TeamBonuses;
  awayBonuses: TeamBonuses;
  isOvertime: boolean;
  overtimePeriods: number;
}

export interface TeamInfo {
  seatId: string;
  name: string;              // Bot name or "You"
  players: PlayerCardData[];  // 12-man roster
  starters: string[];        // 5 starter IDs (one per position)
  plays: Play[];             // 3 active plays
  depthChart: Record<string, string[]>; // Position → ordered player IDs
}

// ── Rotation Engine ────────────────────────────────────────────────────────

interface RotationSlot {
  playerId: string;
  possStart: number; // Possession number this player enters
  possEnd: number;   // Possession number this player exits
  position: string;  // PG, SG, SF, PF, C
}

/**
 * Calculate possession shares for each player (0-1, how much of the game they play).
 * Used for team strength calculations and playstyle weighting.
 */
export function calcPossessionShares(
  depthChart: Record<string, string[]>,
  players: PlayerCardData[],
  totalPossessions: number
): Map<string, number> {
  const shares = new Map<string, number>();
  const playerMap = new Map(players.map(p => [p.id, p]));
  
  for (const [pos, ids] of Object.entries(depthChart)) {
    if (ids.length === 0) continue;
    
    const starter = playerMap.get(ids[0]);
    const backup = ids[1] ? playerMap.get(ids[1]) : null;
    const deep = ids[2] ? playerMap.get(ids[2]) : null;
    
    // Base shares
    let starterShare = 0.70;
    let backupShare = 0.25;
    let deepShare = 0.05;
    
    if (starter && backup) {
      const ovrGap = (starter.ratings?.overall ?? 70) - (backup.ratings?.overall ?? 50);
      
      // OVR gap modifier: smaller gap → more even distribution
      if (ovrGap < 5) {
        starterShare = 0.58; backupShare = 0.35; deepShare = 0.07;
      } else if (ovrGap < 10) {
        starterShare = 0.65; backupShare = 0.28; deepShare = 0.07;
      } else if (ovrGap > 15) {
        starterShare = 0.78; backupShare = 0.18; deepShare = 0.04;
      }
      
      // MPG anchor: blend with real MPG ratio
      if (starter.stats?.mpg && backup.stats?.mpg) {
        const totalMpg = starter.stats.mpg + backup.stats.mpg + (deep?.stats?.mpg || 0);
        if (totalMpg > 0) {
          const mpgStarter = starter.stats.mpg / totalMpg;
          const mpgBackup = backup.stats.mpg / totalMpg;
          // 60% formula, 40% MPG anchor
          starterShare = starterShare * 0.6 + mpgStarter * 0.4;
          backupShare = backupShare * 0.6 + mpgBackup * 0.4;
        }
      }
      
      // Age penalty for players 35+
      if (starter.player?.age >= 35) starterShare *= 0.92;
      if (backup?.player?.age >= 35) backupShare *= 0.92;
    }
    
    if (!backup) {
      starterShare = 1.0; backupShare = 0; deepShare = 0;
    } else if (!deep) {
      deepShare = 0;
      // Redistribute deep bench share
      starterShare += 0.03;
      backupShare += 0.02;
    }
    
    // Normalize
    const total = starterShare + backupShare + deepShare;
    shares.set(ids[0], (starterShare / total));
    if (ids[1]) shares.set(ids[1], (backupShare / total));
    if (ids[2]) shares.set(ids[2], (deepShare / total));
  }
  
  return shares;
}

/**
 * Generate NBA-style rotation timeline for a quarter.
 * Returns which player is on court at each possession for each position.
 */
function generateQuarterRotation(
  depthChart: Record<string, string[]>,
  players: PlayerCardData[],
  quarterPoss: number,
  quarter: number, // 1-4
  shares: Map<string, number>
): Map<string, string>[] {
  // Each entry = lineup at that possession index: Map<position, playerId>
  const timeline: Map<string, string>[] = [];
  const positions = ['PG', 'SG', 'SF', 'PF', 'C'];
  
  for (let p = 0; p < quarterPoss; p++) {
    const lineup = new Map<string, string>();
    
    for (const pos of positions) {
      const ids = depthChart[pos] || [];
      if (ids.length === 0) continue;
      
      if (ids.length === 1) {
        lineup.set(pos, ids[0]);
        continue;
      }
      
      // NBA rotation pattern per quarter
      const starterPoss = Math.round(quarterPoss * (shares.get(ids[0]) || 0.7));
      const progress = p / quarterPoss;
      
      if (quarter === 1 || quarter === 3) {
        // Starter starts, backup mid-quarter, starter closes
        if (p < starterPoss * 0.55) {
          lineup.set(pos, ids[0]); // Starter opens
        } else if (p < quarterPoss - starterPoss * 0.35) {
          lineup.set(pos, ids[1]); // Backup mid-quarter
        } else {
          lineup.set(pos, ids[0]); // Starter closes
        }
      } else {
        // Q2/Q4: Backup opens, starter re-enters for bulk
        if (p < quarterPoss * 0.25) {
          lineup.set(pos, ids[1]); // Backup opens
        } else if (p < quarterPoss * 0.85) {
          lineup.set(pos, ids[0]); // Starter bulk
        } else {
          // Deep bench gets a few possessions in Q2/Q4 if available
          lineup.set(pos, ids.length >= 3 ? ids[2] : ids[1]);
        }
      }
    }
    
    timeline.push(lineup);
  }
  
  return timeline;
}

/**
 * Extract substitution events from a rotation timeline.
 */
function extractSubstitutions(
  timeline: Map<string, string>[],
  startPossIndex: number,
  quarter: number
): SubstitutionEvent[] {
  const subs: SubstitutionEvent[] = [];
  const positions = ['PG', 'SG', 'SF', 'PF', 'C'];
  
  for (let i = 1; i < timeline.length; i++) {
    for (const pos of positions) {
      const prev = timeline[i - 1].get(pos);
      const curr = timeline[i].get(pos);
      if (prev && curr && prev !== curr) {
        subs.push({
          possession: startPossIndex + i,
          quarter,
          playerIn: curr,
          playerOut: prev,
          position: pos,
        });
      }
    }
  }
  
  return subs;
}

// ── Possession Battle ──────────────────────────────────────────────────────

// (calcTeamStrength removed — replaced by calcTeamPossRating in scoring engine v2)

interface PossessionSplit {
  homePoss: number;
  awayPoss: number;
  totalPoss: number;
  homeAdvantageEvents: number; // Extra possessions home must "earn" through events
  awayAdvantageEvents: number;
}

function calcPossessionSplit(
  homePlayers: PlayerCardData[],
  awayPlayers: PlayerCardData[],
  homeDepthChart: Record<string, string[]>,
  awayDepthChart: Record<string, string[]>,
  homeBonuses: TeamBonuses,
  awayBonuses: TeamBonuses
): PossessionSplit {
  // NBA pace baseline — all noise and swings are relative to this
  const BASE_PACE = 100;
  
  // Independent noise per team: ±5% of baseline
  const NOISE_PCT = 0.05;
  const homeNoise = (Math.random() - 0.5) * 2 * BASE_PACE * NOISE_PCT;
  const awayNoise = (Math.random() - 0.5) * 2 * BASE_PACE * NOISE_PCT;
  
  let homePoss = BASE_PACE + homeNoise;
  let awayPoss = BASE_PACE + awayNoise;
  
  // Team possession battle: playmaking + rebounding + defense (starters ×2, bench ×1)
  const homePossRating = calcTeamPossRating(homePlayers, homeDepthChart);
  const awayPossRating = calcTeamPossRating(awayPlayers, awayDepthChart);
  const STRENGTH_SWING_PCT = 0.08;
  const strengthDelta = ((homePossRating - awayPossRating) / 100) * BASE_PACE * STRENGTH_SWING_PCT;
  
  homePoss += strengthDelta;
  awayPoss -= strengthDelta;
  
  // Apply synergy/play possession swing (small fixed bonuses)
  homePoss += homeBonuses.possessionSwing;
  awayPoss += awayBonuses.possessionSwing;
  
  // Apply defensive possession swing (opponent loses possessions)
  homePoss -= awayBonuses.defenseMods.possessionSwing || 0;
  awayPoss -= homeBonuses.defenseMods.possessionSwing || 0;
  
  // Round and ensure minimum at 85% of baseline
  homePoss = Math.max(Math.round(BASE_PACE * 0.85), Math.round(homePoss));
  awayPoss = Math.max(Math.round(BASE_PACE * 0.85), Math.round(awayPoss));
  
  const totalPoss = homePoss + awayPoss;
  
  // Possession-winning events: the team with more possessions needs to "earn" the extras
  const basePoss = Math.min(homePoss, awayPoss);
  const homeAdvantageEvents = Math.max(0, homePoss - basePoss);
  const awayAdvantageEvents = Math.max(0, awayPoss - basePoss);
  
  return { homePoss, awayPoss, totalPoss, homeAdvantageEvents, awayAdvantageEvents };
}

/// ── Scoring Engine (v2 — Multi-Channel) ───────────────────────────────────
//
// Architecture:
//   PRE-GAME (team-wide):
//     1. calcTeamPossRating → possession battle delta
//     2. calcTeamShotProfile → team shot distribution [rim%, mid%, per%]
//
//   PER-POSSESSION (lineup-specific):
//     3. Roll shot type from team distribution
//     4. Compute channel edge (lineup offense vs opponent lineup defense)
//     5. Roll efficiency (base + edge × SCALE, clamped ±10pp)
//     6. Points + and-1 check

type ShotChannel = 'rim' | 'mid' | 'three';

// NBA baseline shot distribution and efficiency
const NBA_BASELINE = {
  rim:   { share: 0.35, efficiency: 0.65 },  // 65% FG at rim
  mid:   { share: 0.25, efficiency: 0.42 },  // 42% FG mid-range
  three: { share: 0.40, efficiency: 0.36 },  // 36% FG from 3
};

// And-1 probability per channel (descending by distance)
const AND1_BASE: Record<ShotChannel, number> = {
  rim:   0.08,   // 8% of rim makes → and-1
  mid:   0.03,   // 3% of mid makes → and-1 (foul on jumper)
  three: 0.01,   // 1% of 3pt makes → and-1 (4-point play, very rare)
};

// Efficiency scaling: how much the edge shifts base efficiency
// Edge clamped to [-0.25, +0.25], max shift clamped to ±10pp
const EFFICIENCY_SCALE = 0.30;
const MAX_EFF_SHIFT = 0.10;  // ±10 percentage points max

// Profile blending: 50% NBA baseline, 50% team tendency
const PROFILE_WEIGHT = 0.50;

/**
 * Pre-game: Calculate team possession rating for the possession battle.
 * Uses weighted averages (starters ×2, bench ×1).
 */
export function calcTeamPossRating(
  players: PlayerCardData[],
  depthChart: Record<string, string[]>
): number {
  const starterIds = new Set<string>();
  for (const ids of Object.values(depthChart)) {
    if (ids.length > 0) starterIds.add(ids[0]);
  }

  let totalWeight = 0;
  let totalRating = 0;

  for (const p of players) {
    const weight = starterIds.has(p.id) ? 2.0 : 1.0;
    const avgDef = ((p.ratings?.perimeterDefense ?? 50) + (p.ratings?.postDefense ?? 50)) / 2;
    const possRating =
      (p.ratings?.playmaking ?? 50) * 0.40 +
      (p.ratings?.rebounding ?? 50) * 0.35 +
      avgDef * 0.25;
    totalWeight += weight;
    totalRating += weight * possRating;
  }

  return totalWeight > 0 ? totalRating / totalWeight : 50;
}

/** Shot profile: [rim%, mid%, per%] pre-computed per team */
export interface TeamShotProfile {
  rim: number;
  mid: number;
  per: number;
}

/**
 * Pre-game: Calculate team shot distribution blending NBA baseline with team's
 * offensive rating profile. Starters weighted ×2, bench ×1.
 */
export function calcTeamShotProfile(
  players: PlayerCardData[],
  depthChart: Record<string, string[]>,
  offenseMods: GameModifiers,
  defenseFromOpponent: GameModifiers
): TeamShotProfile {
  const starterIds = new Set<string>();
  for (const ids of Object.values(depthChart)) {
    if (ids.length > 0) starterIds.add(ids[0]);
  }

  let totalWeight = 0;
  let teamFinishing = 0, teamMidRange = 0, teamPerimeter = 0;

  for (const p of players) {
    const weight = starterIds.has(p.id) ? 2.0 : 1.0;
    totalWeight += weight;
    teamFinishing += weight * (p.ratings?.finishing ?? 50);
    teamMidRange += weight * (p.ratings?.midRange ?? 50);
    teamPerimeter += weight * (p.ratings?.perimeter ?? 50);
  }

  if (totalWeight > 0) {
    teamFinishing /= totalWeight;
    teamMidRange /= totalWeight;
    teamPerimeter /= totalWeight;
  }

  // Team tendency from offensive ratings
  const total = teamFinishing + teamMidRange + teamPerimeter;
  const rimTendency = total > 0 ? teamFinishing / total : 0.333;
  const midTendency = total > 0 ? teamMidRange / total : 0.333;
  const perTendency = total > 0 ? teamPerimeter / total : 0.334;

  // Blend 50/50 with NBA baseline
  let rim = (1 - PROFILE_WEIGHT) * NBA_BASELINE.rim.share + PROFILE_WEIGHT * rimTendency;
  let mid = (1 - PROFILE_WEIGHT) * NBA_BASELINE.mid.share + PROFILE_WEIGHT * midTendency;
  let per = (1 - PROFILE_WEIGHT) * NBA_BASELINE.three.share + PROFILE_WEIGHT * perTendency;

  // Apply synergy/play shot distribution bonuses
  rim += offenseMods.rimShareBonus - (defenseFromOpponent.rimShareBonus || 0);
  mid += offenseMods.midShareBonus - (defenseFromOpponent.midShareBonus || 0);
  per += offenseMods.perShareBonus - (defenseFromOpponent.perShareBonus || 0);

  // Ensure no negative shares before normalizing
  rim = Math.max(0, rim);
  mid = Math.max(0, mid);
  per = Math.max(0, per);
  
  // Normalize to sum to 1.0
  const sum = rim + mid + per;
  if (sum > 0) { rim /= sum; mid /= sum; per /= sum; }

  return { rim, mid, per };
}

/**
 * Per-possession: Resolve a single possession using multi-channel shot engine.
 * 
 * Flow:
 *   1. Roll shot type from team distribution
 *   2. Compute channel-specific edge (offense rating vs defense rating)
 *   3. Roll efficiency = base + edge × SCALE (clamped ±10pp)
 *   4. If make → points + and-1 check
 *   5. If miss → narrated as turnover/block/miss for variety
 */
function resolvePossession(
  offenseLineup: PlayerCardData[],
  defenseLineup: PlayerCardData[],
  shotProfile: TeamShotProfile,
  offenseMods: GameModifiers,
  defenseFromOpponent: GameModifiers
): { outcome: 'miss' | 'rim' | 'mid' | 'three'; points: number; isAnd1: boolean; channel: ShotChannel; scorerId?: string; assistId?: string; narrativeHint: string } {

  // Step 1: Roll shot type from team distribution
  const roll = Math.random();
  let channel: ShotChannel;
  if (roll < shotProfile.rim)                          channel = 'rim';
  else if (roll < shotProfile.rim + shotProfile.mid)   channel = 'mid';
  else                                                 channel = 'three';

  // Step 2: Compute channel-specific edge from lineup ratings
  const avgRating = (lineup: PlayerCardData[], fn: (p: PlayerCardData) => number) =>
    lineup.length > 0 ? lineup.reduce((s, p) => s + fn(p), 0) / lineup.length : 50;

  let offRating: number, defRating: number;
  switch (channel) {
    case 'rim':
      offRating = avgRating(offenseLineup, p => p.ratings?.finishing ?? 50);
      defRating = avgRating(defenseLineup, p => p.ratings?.postDefense ?? 50);
      break;
    case 'mid':
      offRating = avgRating(offenseLineup, p => p.ratings?.midRange ?? 50);
      defRating = avgRating(defenseLineup, p =>
        (p.ratings?.perimeterDefense ?? 50) * 0.4 + (p.ratings?.postDefense ?? 50) * 0.6
      );
      break;
    case 'three':
      offRating = avgRating(offenseLineup, p => p.ratings?.perimeter ?? 50);
      defRating = avgRating(defenseLineup, p => p.ratings?.perimeterDefense ?? 50);
      break;
  }

  const edge = (offRating - defRating) / 100;
  const clampedEdge = Math.max(-0.25, Math.min(0.25, edge));

  // Step 3: Roll efficiency
  const baseEff = NBA_BASELINE[channel].efficiency;
  const effShift = Math.max(-MAX_EFF_SHIFT, Math.min(MAX_EFF_SHIFT, clampedEdge * EFFICIENCY_SCALE));

  // Apply synergy/play efficiency bonuses
  let channelEffBonus = 0;
  if (channel === 'rim')   channelEffBonus = offenseMods.rimEffBonus - (defenseFromOpponent.rimEffBonus || 0);
  if (channel === 'mid')   channelEffBonus = offenseMods.midEffBonus - (defenseFromOpponent.midEffBonus || 0);
  if (channel === 'three') channelEffBonus = offenseMods.perEffBonus - (defenseFromOpponent.perEffBonus || 0);

  const efficiency = Math.max(0.15, Math.min(0.85, baseEff + effShift + channelEffBonus));

  // Pick scorer/actor (weighted by channel-relevant rating)
  const scorerWeights = offenseLineup.map(p => {
    if (channel === 'three') return p.ratings?.perimeter ?? 50;
    if (channel === 'mid') return p.ratings?.midRange ?? 50;
    return p.ratings?.finishing ?? 50; // rim
  });
  const scorer = weightedRandom(offenseLineup, scorerWeights);
  const scorerId = scorer?.id;

  const made = Math.random() < efficiency;

  if (!made) {
    return { outcome: 'miss', points: 0, isAnd1: false, channel, scorerId, narrativeHint: 'miss' };
  }

  // Step 4: Points + and-1 check
  let points: number;
  let narrativeHint: string;

  if (channel === 'rim') {
    // Rim makes: 50% → 2pts (clean make), 50% → 1pt (foul/FTs) → avg 1.5
    points = Math.random() < 0.5 ? 2 : 1;
    narrativeHint = points === 2 ? 'rim_make' : 'rim_ft';
  } else if (channel === 'mid') {
    points = 2;
    narrativeHint = 'mid_make';
  } else {
    points = 3;
    narrativeHint = 'three_make';
  }

  // And-1 check (only possible on clean field goals, not free throw events)
  let isAnd1 = false;
  if (points >= 2) {
    const and1Base = AND1_BASE[channel];
    const and1Chance = and1Base + offenseMods.and1Bonus;
    if (Math.random() < and1Chance) {
      isAnd1 = true;
      points += 1;
      narrativeHint = 'and1';
    }
  }

  // Assist: playmaking-weighted, excluding scorer, only on clean field goals
  let assistId: string | undefined;
  if (points >= 2) {
    const assistCandidates = offenseLineup.filter(p => p.id !== scorerId);
    if (assistCandidates.length > 0 && Math.random() < 0.65) {
      const assistWeights = assistCandidates.map(p => p.ratings?.playmaking ?? 50);
      const assister = weightedRandom(assistCandidates, assistWeights);
      assistId = assister?.id;
    }
  }

  return { outcome: channel, points, isAnd1, channel, scorerId, assistId, narrativeHint };
}

function weightedRandom<T>(items: T[], weights: number[]): T {
  const total = weights.reduce((a, b) => a + b, 0);
  if (total <= 0) return items[0];
  let roll = Math.random() * total;
  for (let i = 0; i < items.length; i++) {
    roll -= weights[i];
    if (roll <= 0) return items[i];
  }
  return items[items.length - 1];
}

// ── Narrative Generator ────────────────────────────────────────────────────

// Miss narratives include turnovers/blocks/steals for possession flavor
const MISS_TEXTS = [
  '{player} misses the jumper.',
  'Contested shot by {player} — no good.',
  'Blocked! Shot rejected.',
  '{player} rattles it out.',
  'Stolen by the defense!',
  'Bad pass — turnover!',
  '{player} loses the handle.',
  '{player} can\'t connect.',
];

const RIM_MAKE_TEXTS = [
  '{player} scores on a layup!',
  '{player} drives and finishes!',
  '{player} with the floater — bucket!',
  'Dunk by {player}!',
  '{player} powers through to the rim!',
];

const RIM_FT_TEXTS = [
  '{player} is fouled going to the basket — to the line.',
  '{player} draws the foul driving in.',
  'Shooting foul on {player} — free throws.',
];

const MID_MAKE_TEXTS = [
  '{player} with the mid-range jumper — cash!',
  '{player} pulls up from the elbow — money!',
  '{player} with the fadeaway — bucket!',
  '{player} hits the turnaround jumper!',
  '{player} from mid-range — got it!',
];

const THREE_MAKE_TEXTS = [
  '{player} drains the three!',
  '{player} from downtown — BANG!',
  '{player} for three... got it!',
  '{player} pulls up from deep — splash!',
  'Corner three by {player} — nothing but net!',
  '{player} catches and shoots — three ball!',
];

const AND1_TEXTS = [
  '{player} scores AND the foul!',
  '{player} finishes through contact — and one!',
  '{player} powers through for the and-one!',
  'Tough finish by {player} — plus the free throw!',
];

const ASSIST_TEXTS = [
  ' (assist: {assist})',
  ' ({assist} with the dime)',
  ' (feed from {assist})',
];

const POSSESSION_WIN_TEXTS = [
  'Offensive rebound!',
  'Steal by the defense!',
  'Block leads to a fast break!',
  'Loose ball recovered!',
];

function generateNarrative(
  narrativeHint: string,
  scorerName: string,
  assistName?: string,
  isPossWin?: boolean
): string {
  let prefix = '';
  if (isPossWin) {
    prefix = POSSESSION_WIN_TEXTS[Math.floor(Math.random() * POSSESSION_WIN_TEXTS.length)] + ' ';
  }
  
  let texts: string[];
  switch (narrativeHint) {
    case 'miss': texts = MISS_TEXTS; break;
    case 'rim_make': texts = RIM_MAKE_TEXTS; break;
    case 'rim_ft': texts = RIM_FT_TEXTS; break;
    case 'mid_make': texts = MID_MAKE_TEXTS; break;
    case 'three_make': texts = THREE_MAKE_TEXTS; break;
    case 'and1': texts = AND1_TEXTS; break;
    default: texts = MISS_TEXTS;
  }
  
  let text = texts[Math.floor(Math.random() * texts.length)].replace('{player}', scorerName);
  
  if (assistName && narrativeHint !== 'miss') {
    const assistText = ASSIST_TEXTS[Math.floor(Math.random() * ASSIST_TEXTS.length)].replace('{assist}', assistName);
    text += assistText;
  }
  
  return prefix + text;
}

// ── Team Builder Helper ────────────────────────────────────────────────────

export function buildTeamInfo(
  seat: DraftSessionSeat,
  isHuman: boolean
): TeamInfo {
  const roster = seat.builtRoster;
  const allCards = seat.drafted;
  const playerMap = new Map<string, PlayerCardData>();
  const playMap = new Map<string, Play>();
  
  for (const card of allCards) {
    if (card.type === 'Player') playerMap.set(card.id, card as PlayerCardData);
    else if (card.type === 'Play') playMap.set(card.id, card as Play);
  }
  
  // Position natural eligibility check
  const isNaturalPosition = (rawPos: string, col: string): boolean => {
    if (rawPos === 'ALL') return true;
    if (rawPos === 'G' && (col === 'PG' || col === 'SG')) return true;
    if (rawPos === 'F' && (col === 'SF' || col === 'PF')) return true;
    if ((rawPos === 'G-F' || rawPos === 'F-G') && ['PG','SG','SF','PF'].includes(col)) return true;
    if (rawPos.includes(col)) return true;
    const parts = rawPos.split(/[-/]/);
    if (parts.includes(col)) return true;
    if (parts.includes('G') && (col === 'PG' || col === 'SG')) return true;
    if (parts.includes('F') && (col === 'SF' || col === 'PF')) return true;
    return false;
  };
  
  // Apply -10% penalty for out-of-position players
  const applyOOPPenalty = (player: PlayerCardData): PlayerCardData => {
    const penalty = 0.9; // -10%
    return {
      ...player,
      ratings: {
        overall: Math.round(player.ratings.overall * penalty),
        finishing: Math.round(player.ratings.finishing * penalty),
        midRange: Math.round(player.ratings.midRange * penalty),
        perimeter: Math.round(player.ratings.perimeter * penalty),
        playmaking: Math.round(player.ratings.playmaking * penalty),
        rebounding: Math.round(player.ratings.rebounding * penalty),
        perimeterDefense: Math.round(player.ratings.perimeterDefense * penalty),
        postDefense: Math.round(player.ratings.postDefense * penalty),
      },
    };
  };
  
  // Collect active roster players, applying OOP penalty where needed
  const activePlayers: PlayerCardData[] = [];
  const starters: string[] = [];
  
  for (const [pos, ids] of Object.entries(roster.depthChart)) {
    for (const id of ids) {
      const player = playerMap.get(id);
      if (player && !activePlayers.find(p => p.id === id)) {
        if (!isNaturalPosition(player.player.position, pos)) {
          activePlayers.push(applyOOPPenalty(player));
        } else {
          activePlayers.push(player);
        }
      }
    }
    if (ids.length > 0) starters.push(ids[0]);
  }
  
  // Collect active plays
  const activePlays: Play[] = [];
  for (const id of roster.activePlays) {
    const play = playMap.get(id);
    if (play) activePlays.push(play);
  }
  
  return {
    seatId: seat.id,
    name: isHuman ? 'You' : (seat.botProfile?.name || seat.id),
    players: activePlayers,
    starters,
    plays: activePlays,
    depthChart: roster.depthChart,
  };
}

// ── Main Simulation ────────────────────────────────────────────────────────

export function simulateGame(homeTeam: TeamInfo, awayTeam: TeamInfo): GameTheater {
  const playerNameMap = new Map<string, string>();
  for (const p of [...homeTeam.players, ...awayTeam.players]) {
    playerNameMap.set(p.id, p.player?.name || p.id);
  }
  
  // 1. Calculate possession shares
  const homeShares = calcPossessionShares(homeTeam.depthChart, homeTeam.players, 200);
  const awayShares = calcPossessionShares(awayTeam.depthChart, awayTeam.players, 200);
  
  // 2. Calculate bonuses (synergies + plays)
  const homeBonuses = calcTeamBonuses(homeTeam.players, homeTeam.plays, homeShares);
  const awayBonuses = calcTeamBonuses(awayTeam.players, awayTeam.plays, awayShares);
  
  // 3. Possession battle (uses new calcTeamPossRating: playmaking + rebounding + defense)
  const split = calcPossessionSplit(
    homeTeam.players, awayTeam.players,
    homeTeam.depthChart, awayTeam.depthChart,
    homeBonuses, awayBonuses
  );
  
  // 4. Pre-game shot profiles (team-wide, blended with NBA baseline)
  const homeShotProfile = calcTeamShotProfile(
    homeTeam.players, homeTeam.depthChart,
    homeBonuses.offenseMods, awayBonuses.defenseMods
  );
  const awayShotProfile = calcTeamShotProfile(
    awayTeam.players, awayTeam.depthChart,
    awayBonuses.offenseMods, homeBonuses.defenseMods
  );
  
  // 4. Distribute possessions across 4 quarters with noise
  const quarterPoss = distributeQuarters(split.homePoss, split.awayPoss);
  
  // 5. Generate rotation timelines per quarter
  const allPossessions: PossessionEvent[] = [];
  const allSubs: SubstitutionEvent[] = [];
  const quarterSummaries: QuarterSummary[] = [];
  
  let homeScore = 0, awayScore = 0;
  let possIndex = 0;
  
  // Box score tracking
  const boxStats = new Map<string, PlayerBoxScore>();
  for (const p of [...homeTeam.players, ...awayTeam.players]) {
    boxStats.set(p.id, {
      playerId: p.id, playerName: p.player?.name || p.id,
      minutes: 0, possessions: 0, points: 0,
      twoPointers: 0, threePointers: 0, andOnes: 0,
      turnovers: 0, assists: 0,
    });
  }
  
  // Possession-winning events to distribute
  let homeExtraPoss = split.homeAdvantageEvents;
  let awayExtraPoss = split.awayAdvantageEvents;
  
  for (let q = 0; q < 4; q++) {
    const quarter = q + 1;
    const homeQ = quarterPoss[q].home;
    const awayQ = quarterPoss[q].away;
    const totalQ = homeQ + awayQ;
    
    // Generate rotation for this quarter
    const homeRotation = generateQuarterRotation(homeTeam.depthChart, homeTeam.players, homeQ, quarter, homeShares);
    const awayRotation = generateQuarterRotation(awayTeam.depthChart, awayTeam.players, awayQ, quarter, awayShares);
    
    // Extract subs
    const homeSubs = extractSubstitutions(homeRotation, possIndex, quarter);
    const awaySubs = extractSubstitutions(awayRotation, possIndex, quarter);
    allSubs.push(...homeSubs, ...awaySubs);
    
    const qStartScore: [number, number] = [homeScore, awayScore];
    let homePossCount = 0, awayPossCount = 0;
    
    // Interleave possessions: alternate home/away
    let homeIdx = 0, awayIdx = 0;
    let isHomeTurn = Math.random() < 0.5; // Random first possession per quarter
    
    while (homeIdx < homeQ || awayIdx < awayQ) {
      let team: 'home' | 'away';
      
      if (homeIdx >= homeQ) { team = 'away'; }
      else if (awayIdx >= awayQ) { team = 'home'; }
      else { team = isHomeTurn ? 'home' : 'away'; isHomeTurn = !isHomeTurn; }
      
      const isHome = team === 'home';
      const rotIdx = isHome ? homeIdx : awayIdx;
      const rotation = isHome ? homeRotation : awayRotation;
      const offenseTeam = isHome ? homeTeam : awayTeam;
      const defenseTeam = isHome ? awayTeam : homeTeam;
      const offenseMods = isHome ? homeBonuses.offenseMods : awayBonuses.offenseMods;
      const defFromOpp = isHome ? awayBonuses.defenseMods : homeBonuses.defenseMods;
      
      // Get current lineup from rotation
      const lineupMap = rotation[Math.min(rotIdx, rotation.length - 1)];
      const offenseIds = Array.from(lineupMap.values());
      
      // Get defense lineup (use the other team's rotation at their current index)
      const defRotation = isHome ? awayRotation : homeRotation;
      const defIdx = isHome ? awayIdx : homeIdx;
      const defLineupMap = defRotation[Math.min(defIdx, defRotation.length - 1)];
      const defenseIds = Array.from(defLineupMap.values());
      
      // Resolve lineup to player objects
      const offenseLineup = offenseIds.map(id => offenseTeam.players.find(p => p.id === id)).filter(Boolean) as PlayerCardData[];
      const defenseLineup = defenseIds.map(id => defenseTeam.players.find(p => p.id === id)).filter(Boolean) as PlayerCardData[];
      
      // Check if this is a possession-winning event
      let isPossWin = false;
      if (isHome && homeExtraPoss > 0 && Math.random() < homeExtraPoss / (homeQ - homeIdx)) {
        isPossWin = true; homeExtraPoss--;
      } else if (!isHome && awayExtraPoss > 0 && Math.random() < awayExtraPoss / (awayQ - awayIdx)) {
        isPossWin = true; awayExtraPoss--;
      }
      
      // Resolve the possession (multi-channel: shot type → edge → efficiency)
      const shotProfile = isHome ? homeShotProfile : awayShotProfile;
      const result = resolvePossession(offenseLineup, defenseLineup, shotProfile, offenseMods, defFromOpp);
      
      if (isHome) homeScore += result.points; else awayScore += result.points;
      
      // Update box score
      for (const id of offenseIds) {
        const bs = boxStats.get(id);
        if (bs) { bs.possessions++; bs.minutes += 0.24; } // ~48 min / 200 poss
      }
      if (result.scorerId && result.points > 0) {
        const bs = boxStats.get(result.scorerId);
        if (bs) {
          bs.points += result.points;
          if (result.channel === 'rim' && result.points >= 2) bs.twoPointers++;
          if (result.channel === 'mid' && result.points >= 2) bs.twoPointers++;
          if (result.channel === 'three') bs.threePointers++;
          if (result.isAnd1) bs.andOnes++;
        }
      }
      if (result.assistId && result.points > 0) {
        const bs = boxStats.get(result.assistId);
        if (bs) bs.assists++;
      }
      
      const scorerName = result.scorerId ? (playerNameMap.get(result.scorerId) || '???') : offenseLineup[0]?.player?.name || '???';
      const assistName = result.assistId ? playerNameMap.get(result.assistId) : undefined;
      
      // Map channel result to PossessionEvent outcome format
      const outcomeForEvent = result.outcome === 'miss' ? 'miss' as const
        : result.channel === 'three' ? '3pt' as const
        : result.isAnd1 ? 'and1' as const
        : '2pt' as const;
      
      allPossessions.push({
        index: possIndex,
        quarter,
        team,
        lineupOnCourt: offenseIds,
        defenseOnCourt: defenseIds,
        outcome: outcomeForEvent,
        scoringPlayerId: result.scorerId,
        assistPlayerId: result.assistId,
        isPossessionWinEvent: isPossWin,
        narrativeText: generateNarrative(result.narrativeHint, scorerName, assistName, isPossWin),
        runningScore: [homeScore, awayScore],
      });
      
      possIndex++;
      if (isHome) { homeIdx++; homePossCount++; } else { awayIdx++; awayPossCount++; }
    }
    
    quarterSummaries.push({
      quarter,
      homeScore: homeScore - qStartScore[0],
      awayScore: awayScore - qStartScore[1],
      homePossessions: homePossCount,
      awayPossessions: awayPossCount,
    });
  }
  
  // Overtime if tied
  let isOvertime = false;
  let overtimePeriods = 0;
  
  while (homeScore === awayScore) {
    isOvertime = true;
    overtimePeriods++;
    const otPoss = 10; // 5 per team + noise
    const homeOTPoss = 5 + Math.round((Math.random() - 0.5) * 2);
    const awayOTPoss = otPoss - homeOTPoss;
    const otQuarter = 4 + overtimePeriods;
    
    // OT: starters only
    const otStartScore: [number, number] = [homeScore, awayScore];
    let homeOTIdx = 0, awayOTIdx = 0;
    let otHomeTurn = Math.random() < 0.5;
    
    while (homeOTIdx < homeOTPoss || awayOTIdx < awayOTPoss) {
      let team: 'home' | 'away';
      if (homeOTIdx >= homeOTPoss) team = 'away';
      else if (awayOTIdx >= awayOTPoss) team = 'home';
      else { team = otHomeTurn ? 'home' : 'away'; otHomeTurn = !otHomeTurn; }
      
      const isHome = team === 'home';
      const offenseTeam = isHome ? homeTeam : awayTeam;
      const defenseTeam = isHome ? awayTeam : homeTeam;
      
      // Starters only in OT
      const offenseLineup = offenseTeam.starters.map(id => offenseTeam.players.find(p => p.id === id)).filter(Boolean) as PlayerCardData[];
      const defenseLineup = defenseTeam.starters.map(id => defenseTeam.players.find(p => p.id === id)).filter(Boolean) as PlayerCardData[];
      
      const offenseMods = isHome ? homeBonuses.offenseMods : awayBonuses.offenseMods;
      const defFromOpp = isHome ? awayBonuses.defenseMods : homeBonuses.defenseMods;
      const otShotProfile = isHome ? homeShotProfile : awayShotProfile;
      
      const result = resolvePossession(offenseLineup, defenseLineup, otShotProfile, offenseMods, defFromOpp);
      if (isHome) homeScore += result.points; else awayScore += result.points;
      
      // Box score
      for (const p of offenseLineup) {
        const bs = boxStats.get(p.id);
        if (bs) { bs.possessions++; bs.minutes += 0.48; }
      }
      if (result.scorerId && result.points > 0) {
        const bs = boxStats.get(result.scorerId);
        if (bs) {
          bs.points += result.points;
          if (result.channel === 'rim' && result.points >= 2) bs.twoPointers++;
          if (result.channel === 'mid' && result.points >= 2) bs.twoPointers++;
          if (result.channel === 'three') bs.threePointers++;
          if (result.isAnd1) bs.andOnes++;
        }
      }
      if (result.assistId && result.points > 0) { const bs = boxStats.get(result.assistId); if (bs) bs.assists++; }
      
      const scorerName = result.scorerId ? (playerNameMap.get(result.scorerId) || '???') : offenseLineup[0]?.player?.name || '???';
      
      const otOutcomeForEvent = result.outcome === 'miss' ? 'miss' as const
        : result.channel === 'three' ? '3pt' as const
        : result.isAnd1 ? 'and1' as const
        : '2pt' as const;
      
      allPossessions.push({
        index: possIndex++,
        quarter: otQuarter,
        team,
        lineupOnCourt: offenseLineup.map(p => p.id),
        defenseOnCourt: defenseLineup.map(p => p.id),
        outcome: otOutcomeForEvent,
        scoringPlayerId: result.scorerId,
        assistPlayerId: result.assistId,
        narrativeText: generateNarrative(result.narrativeHint, scorerName, result.assistId ? playerNameMap.get(result.assistId) : undefined),
        runningScore: [homeScore, awayScore],
      });
      
      if (isHome) homeOTIdx++; else awayOTIdx++;
    }
    
    quarterSummaries.push({
      quarter: otQuarter,
      homeScore: homeScore - otStartScore[0],
      awayScore: awayScore - otStartScore[1],
      homePossessions: homeOTPoss,
      awayPossessions: awayOTPoss,
    });
  }
  
  // Round minutes
  for (const bs of boxStats.values()) {
    bs.minutes = Math.round(bs.minutes * 10) / 10;
  }
  
  // Split box scores
  const homeIds = new Set(homeTeam.players.map(p => p.id));
  const homeBox = Array.from(boxStats.values())
    .filter(bs => homeIds.has(bs.playerId))
    .sort((a, b) => b.points - a.points);
  const awayBox = Array.from(boxStats.values())
    .filter(bs => !homeIds.has(bs.playerId))
    .sort((a, b) => b.points - a.points);
  
  return {
    homeTeam,
    awayTeam,
    possessions: allPossessions,
    substitutions: allSubs,
    quarterSummaries,
    finalScore: [homeScore, awayScore],
    boxScore: { home: homeBox, away: awayBox },
    homeBonuses,
    awayBonuses,
    isOvertime,
    overtimePeriods,
  };
}

// ── Helpers ────────────────────────────────────────────────────────────────

function distributeQuarters(
  homePoss: number,
  awayPoss: number
): { home: number; away: number }[] {
  const quarters: { home: number; away: number }[] = [];
  let homeRemaining = homePoss;
  let awayRemaining = awayPoss;
  
  for (let q = 0; q < 4; q++) {
    const remaining = 4 - q;
    const homeBase = Math.round(homeRemaining / remaining);
    const awayBase = Math.round(awayRemaining / remaining);
    
    // Add noise ±1
    const homeNoise = q < 3 ? Math.round((Math.random() - 0.5) * 2) : 0;
    const awayNoise = q < 3 ? Math.round((Math.random() - 0.5) * 2) : 0;
    
    const homeQ = q < 3 ? Math.max(20, homeBase + homeNoise) : homeRemaining;
    const awayQ = q < 3 ? Math.max(20, awayBase + awayNoise) : awayRemaining;
    
    quarters.push({ home: homeQ, away: awayQ });
    homeRemaining -= homeQ;
    awayRemaining -= awayQ;
  }
  
  return quarters;
}
