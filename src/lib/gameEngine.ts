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
  outcome: 'turnover' | 'miss' | '2pt' | '3pt' | 'and1';
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

function calcTeamStrength(
  players: PlayerCardData[],
  shares: Map<string, number>
): number {
  let strength = 0;
  let totalShare = 0;
  
  for (const p of players) {
    const share = shares.get(p.id) || 0;
    if (share <= 0) continue;
    totalShare += share;
    strength += share * (
      (p.ratings?.rebounding ?? 50) * 0.5 +
      (p.ratings?.perimeterDefense ?? 50) * 0.3 +
      (p.ratings?.postDefense ?? 50) * 0.2
    );
  }
  
  return totalShare > 0 ? strength / totalShare : 50;
}

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
  homeShares: Map<string, number>,
  awayShares: Map<string, number>,
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
  
  // Team strength shifts possessions: up to ±8% of baseline per side
  const homeStrength = calcTeamStrength(homePlayers, homeShares);
  const awayStrength = calcTeamStrength(awayPlayers, awayShares);
  const STRENGTH_SWING_PCT = 0.08;
  const strengthDelta = ((homeStrength - awayStrength) / 100) * BASE_PACE * STRENGTH_SWING_PCT;
  
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

// ── Scoring Engine ─────────────────────────────────────────────────────────

type Outcome = 'turnover' | 'miss' | '2pt' | '3pt' | 'and1';

function calcLineupOffense(lineup: PlayerCardData[]): number {
  if (lineup.length === 0) return 50;
  const sum = lineup.reduce((s, p) => s + (
    (p.ratings?.finishing ?? 50) * 0.30 +
    (p.ratings?.midRange ?? 50) * 0.25 +
    (p.ratings?.perimeter ?? 50) * 0.25 +
    (p.ratings?.playmaking ?? 50) * 0.20
  ), 0);
  return sum / lineup.length;
}

function calcLineupDefense(lineup: PlayerCardData[]): number {
  if (lineup.length === 0) return 50;
  const sum = lineup.reduce((s, p) => s + (
    (p.ratings?.perimeterDefense ?? 50) * 0.50 +
    (p.ratings?.postDefense ?? 50) * 0.50
  ), 0);
  return sum / lineup.length;
}

function resolvePossession(
  offenseLineup: PlayerCardData[],
  defenseLineup: PlayerCardData[],
  offenseMods: GameModifiers,
  defenseFromOpponent: GameModifiers
): { outcome: Outcome; scorerId?: string; assistId?: string } {
  const offRating = calcLineupOffense(offenseLineup);
  const defRating = calcLineupDefense(defenseLineup);
  const edge = (offRating - defRating) / 100;
  
  // Cap edge to prevent extreme score swings
  const clampedEdge = Math.max(-0.25, Math.min(0.25, edge));
  
  // Base probabilities + edge modifiers + team bonuses + opponent's defensive bonuses
  // NBA-realistic: ~38% FGA are 3s, ~62% are 2s. Base rates reflect this with TO as our
  // possession-variance mechanic (not comparable to real NBA TO%).
  let pTurnover = 0.12 - clampedEdge * 0.04 + offenseMods.turnoverRate + defenseFromOpponent.turnoverRate;
  let pMiss     = 0.34 - clampedEdge * 0.06 + offenseMods.missRate + defenseFromOpponent.missRate;
  let p2pt      = 0.30 + clampedEdge * 0.04 + offenseMods.twoPointRate + defenseFromOpponent.twoPointRate;
  let p3pt      = 0.16 + clampedEdge * 0.04 + offenseMods.threePointRate + defenseFromOpponent.threePointRate;
  let pAnd1     = 0.04 + clampedEdge * 0.02 + offenseMods.andOneRate + defenseFromOpponent.andOneRate;
  
  // Factor in lineup 3pt ability: teams with better perimeter players shoot more 3s
  const avgPerimeter = offenseLineup.reduce((s, p) => s + (p.ratings?.perimeter ?? 50), 0) / offenseLineup.length;
  const perimeterShift = (avgPerimeter - 55) / 500; // ±0.03 shift based on lineup perimeter rating
  p3pt += perimeterShift;
  p2pt -= perimeterShift;
  
  // Clamp all probabilities to [0.01, 0.80]
  pTurnover = Math.max(0.01, Math.min(0.80, pTurnover));
  pMiss     = Math.max(0.01, Math.min(0.80, pMiss));
  p2pt      = Math.max(0.01, Math.min(0.80, p2pt));
  p3pt      = Math.max(0.01, Math.min(0.80, p3pt));
  pAnd1     = Math.max(0.01, Math.min(0.80, pAnd1));
  
  // Normalize
  const total = pTurnover + pMiss + p2pt + p3pt + pAnd1;
  pTurnover /= total;
  pMiss /= total;
  p2pt /= total;
  p3pt /= total;
  pAnd1 /= total;
  
  // Roll
  const roll = Math.random();
  let outcome: Outcome;
  if (roll < pTurnover) outcome = 'turnover';
  else if (roll < pTurnover + pMiss) outcome = 'miss';
  else if (roll < pTurnover + pMiss + p2pt) outcome = '2pt';
  else if (roll < pTurnover + pMiss + p2pt + p3pt) outcome = '3pt';
  else outcome = 'and1';
  
  // Pick scorer and assist
  let scorerId: string | undefined;
  let assistId: string | undefined;
  
  if (outcome === '2pt' || outcome === '3pt' || outcome === 'and1') {
    // Weight scoring by offensive ratings
    const weights = offenseLineup.map(p => {
      if (outcome === '3pt') return (p.ratings?.perimeter ?? 50);
      if (outcome === '2pt') return (p.ratings?.finishing ?? 50) * 0.5 + (p.ratings?.midRange ?? 50) * 0.5;
      return (p.ratings?.finishing ?? 50); // and1
    });
    scorerId = weightedPick(offenseLineup, weights)?.id;
    
    // Assist from a different player, weighted by playmaking
    const assistCandidates = offenseLineup.filter(p => p.id !== scorerId);
    if (assistCandidates.length > 0 && Math.random() < 0.55) { // ~55% of baskets are assisted
      const assistWeights = assistCandidates.map(p => p.ratings?.playmaking ?? 50);
      assistId = weightedPick(assistCandidates, assistWeights)?.id;
    }
  }
  
  return { outcome, scorerId, assistId };
}

function weightedPick<T>(items: T[], weights: number[]): T {
  const total = weights.reduce((s, w) => s + w, 0);
  let roll = Math.random() * total;
  for (let i = 0; i < items.length; i++) {
    roll -= weights[i];
    if (roll <= 0) return items[i];
  }
  return items[items.length - 1];
}

// ── Narrative Generator ────────────────────────────────────────────────────

const TURNOVER_TEXTS = [
  '{player} turns it over!',
  'Stolen by the defense!',
  'Bad pass by {player} — turnover.',
  'Shot clock violation!',
  '{player} loses the handle.',
  'Stripped! Turnover on {player}.',
];

const MISS_TEXTS = [
  '{player} misses the jumper.',
  'Contested shot by {player} — no good.',
  '{player} can\'t connect from mid-range.',
  'Blocked! Shot rejected.',
  '{player} rattles it out.',
  'Airball by {player}!',
];

const TWO_PT_TEXTS = [
  '{player} scores on a layup!',
  '{player} with the mid-range jumper — cash!',
  '{player} drives and finishes!',
  '{player} with the floater — bucket!',
  '{player} backs down and scores!',
  'Dunk by {player}!',
  '{player} with the fadeaway — money!',
];

const THREE_PT_TEXTS = [
  '{player} drains the three!',
  '{player} from downtown — BANG!',
  '{player} for three... got it!',
  '{player} pulls up from deep — splash!',
  'Corner three by {player} — nothing but net!',
  '{player} catches and shoots — three ball!',
];

const AND1_TEXTS = [
  '{player} drives, scores AND the foul!',
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
  outcome: Outcome,
  scorerName: string,
  assistName?: string,
  isPossWin?: boolean
): string {
  let prefix = '';
  if (isPossWin) {
    prefix = POSSESSION_WIN_TEXTS[Math.floor(Math.random() * POSSESSION_WIN_TEXTS.length)] + ' ';
  }
  
  let texts: string[];
  switch (outcome) {
    case 'turnover': texts = TURNOVER_TEXTS; break;
    case 'miss': texts = MISS_TEXTS; break;
    case '2pt': texts = TWO_PT_TEXTS; break;
    case '3pt': texts = THREE_PT_TEXTS; break;
    case 'and1': texts = AND1_TEXTS; break;
  }
  
  let text = texts[Math.floor(Math.random() * texts.length)].replace('{player}', scorerName);
  
  if (assistName && (outcome === '2pt' || outcome === '3pt' || outcome === 'and1')) {
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

function pointsForOutcome(outcome: Outcome): number {
  switch (outcome) {
    case '2pt': return 2;
    case '3pt': return 3;
    case 'and1': return 1;
    default: return 0;
  }
}

export function simulateGame(homeTeam: TeamInfo, awayTeam: TeamInfo): GameTheater {
  const playerNameMap = new Map<string, string>();
  for (const p of [...homeTeam.players, ...awayTeam.players]) {
    playerNameMap.set(p.id, p.player?.name || p.id);
  }
  
  // 1. Calculate possession shares
  const homeShares = calcPossessionShares(homeTeam.depthChart, homeTeam.players, 200);
  const awayShares = calcPossessionShares(awayTeam.depthChart, awayTeam.players, 200);
  
  // 2. Calculate bonuses
  const homeBonuses = calcTeamBonuses(homeTeam.players, homeTeam.plays, homeShares);
  const awayBonuses = calcTeamBonuses(awayTeam.players, awayTeam.plays, awayShares);
  
  // 3. Possession battle
  const split = calcPossessionSplit(
    homeTeam.players, awayTeam.players,
    homeShares, awayShares,
    homeBonuses, awayBonuses
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
      
      // Resolve the possession
      const result = resolvePossession(offenseLineup, defenseLineup, offenseMods, defFromOpp);
      const points = pointsForOutcome(result.outcome);
      
      if (isHome) homeScore += points; else awayScore += points;
      
      // Update box score
      for (const id of offenseIds) {
        const bs = boxStats.get(id);
        if (bs) { bs.possessions++; bs.minutes += 0.24; } // ~48 min / 200 poss
      }
      if (result.scorerId) {
        const bs = boxStats.get(result.scorerId);
        if (bs) {
          bs.points += points;
          if (result.outcome === '2pt') bs.twoPointers++;
          if (result.outcome === '3pt') bs.threePointers++;
          if (result.outcome === 'and1') bs.andOnes++;
        }
      }
      if (result.assistId) {
        const bs = boxStats.get(result.assistId);
        if (bs) bs.assists++;
      }
      if (result.outcome === 'turnover') {
        // Attribute turnover to a random offensive player
        const tovPlayer = offenseLineup[Math.floor(Math.random() * offenseLineup.length)];
        const bs = boxStats.get(tovPlayer.id);
        if (bs) bs.turnovers++;
      }
      
      const scorerName = result.scorerId ? (playerNameMap.get(result.scorerId) || '???') : offenseLineup[0]?.player?.name || '???';
      const assistName = result.assistId ? playerNameMap.get(result.assistId) : undefined;
      
      allPossessions.push({
        index: possIndex,
        quarter,
        team,
        lineupOnCourt: offenseIds,
        defenseOnCourt: defenseIds,
        outcome: result.outcome,
        scoringPlayerId: result.scorerId,
        assistPlayerId: result.assistId,
        isPossessionWinEvent: isPossWin,
        narrativeText: generateNarrative(result.outcome, scorerName, assistName, isPossWin),
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
      
      const result = resolvePossession(offenseLineup, defenseLineup, offenseMods, defFromOpp);
      const points = pointsForOutcome(result.outcome);
      if (isHome) homeScore += points; else awayScore += points;
      
      // Box score
      for (const p of offenseLineup) {
        const bs = boxStats.get(p.id);
        if (bs) { bs.possessions++; bs.minutes += 0.48; }
      }
      if (result.scorerId) {
        const bs = boxStats.get(result.scorerId);
        if (bs) {
          bs.points += points;
          if (result.outcome === '2pt') bs.twoPointers++;
          if (result.outcome === '3pt') bs.threePointers++;
          if (result.outcome === 'and1') bs.andOnes++;
        }
      }
      if (result.assistId) { const bs = boxStats.get(result.assistId); if (bs) bs.assists++; }
      
      const scorerName = result.scorerId ? (playerNameMap.get(result.scorerId) || '???') : offenseLineup[0]?.player?.name || '???';
      
      allPossessions.push({
        index: possIndex++,
        quarter: otQuarter,
        team,
        lineupOnCourt: offenseLineup.map(p => p.id),
        defenseOnCourt: defenseLineup.map(p => p.id),
        outcome: result.outcome,
        scoringPlayerId: result.scorerId,
        assistPlayerId: result.assistId,
        narrativeText: generateNarrative(result.outcome, scorerName, result.assistId ? playerNameMap.get(result.assistId) : undefined),
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
