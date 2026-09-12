import { DraftCard, Player, Play } from '../components/PlayerCard';

export interface BotProfile {
  id: string;
  name: string;
  noiseSeed: number; 
  favoredTrait: string;
}

export interface DraftSeat {
  id: string;
  isBot: boolean;
  botProfile?: BotProfile;
  drafted: DraftCard[];
  currentPack: DraftCard[];
}

// Simple pseudo-random hash generator based on two strings
function pseudoRandom(seed: number, stringSeed: string) {
  let h = 0xdeadbeef ^ seed;
  for(let i = 0; i < stringSeed.length; i++) {
    h = Math.imul(h ^ stringSeed.charCodeAt(i), 2654435761);
  }
  return ((h ^ h >>> 16) >>> 0) / 4294967296;
}

/**
 * Fisher-Yates shuffle — returns a new shuffled copy, uniformly at random.
 * `arr.sort(() => Math.random() - 0.5)` (the old approach here and in seasonEngine.ts)
 * is NOT a uniform shuffle: comparator-based sorts make biased, engine-dependent
 * numbers of comparisons per element, so some permutations are far likelier than others.
 */
export function shuffle<T>(arr: T[]): T[] {
  const result = [...arr];
  for (let i = result.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [result[i], result[j]] = [result[j], result[i]];
  }
  return result;
}

// ── Cube-Style Draft Pool ──────────────────────────────────────────────────

/**
 * Generate a complete cube draft pool upfront:
 * 8 seats × 3 packs × 12 cards = 288 cards needed.
 * Each player card appears AT MOST ONCE across the entire draft.
 * Play cards can repeat (they're from a shared pool).
 * 
 * Returns 24 packs of 12 cards (8 seats × 3 packs).
 */
export function generateCubePool(allPlayers: Player[], playsDB: Play[]): DraftCard[][] {
  if (allPlayers.length === 0) return [];
  
  const SEATS = 8;
  const PACKS = 3;
  const TOTAL_PACKS = SEATS * PACKS;
  const PLAYER_CARDS_PER_PACK = 11;  // 11 players + 1 play per pack
  const TOTAL_PLAYERS_NEEDED = TOTAL_PACKS * PLAYER_CARDS_PER_PACK; // 264

  // Shuffle the entire player pool
  const shuffledPlayers = shuffle(allPlayers);
  
  // If we don't have enough unique players, cycle through with unique IDs
  const playerPool: Player[] = [];
  let copyIdx = 0;
  while (playerPool.length < TOTAL_PLAYERS_NEEDED) {
    const base = shuffledPlayers[copyIdx % shuffledPlayers.length];
    if (copyIdx < shuffledPlayers.length) {
      // First pass: use original cards
      playerPool.push(base);
    } else {
      // Need more cards: create copies with unique IDs (rare — only if < 264 players)
      playerPool.push({ ...base, id: `${base.id}_copy${Math.floor(copyIdx / shuffledPlayers.length)}` });
    }
    copyIdx++;
  }
  
  // Re-shuffle the full pool
  const shuffledPool = shuffle(playerPool);

  // Build packs
  const packs: DraftCard[][] = [];
  let poolIdx = 0;

  for (let p = 0; p < TOTAL_PACKS; p++) {
    const packCards: DraftCard[] = [];

    // Take 11 players from the pool (guaranteed unique across all packs)
    for (let c = 0; c < PLAYER_CARDS_PER_PACK; c++) {
      packCards.push(shuffledPool[poolIdx++]);
    }

    // Add 1 play card (plays can repeat — give each a unique ID for React keys).
    // `playId` keeps the base effect id so synergies.ts can look up PLAY_EFFECTS
    // even though `id` carries the `_pack{N}` suffix (P0-2 fix).
    const randomPlay = playsDB[Math.floor(Math.random() * playsDB.length)];
    packCards.push({ ...randomPlay, id: `${randomPlay.id}_pack${p}`, playId: randomPlay.id });
    
    // Sort: rare/mythic first, commons last, plays at the end
    const rarityValue: Record<string, number> = { Mythic: 4, Rare: 3, Uncommon: 2, Common: 1 };
    packCards.sort((a, b) => {
      const aIsRarePlay = a.type === 'Play' && (a.rarity === 'Rare' || a.rarity === 'Mythic');
      const bIsRarePlay = b.type === 'Play' && (b.rarity === 'Rare' || b.rarity === 'Mythic');
      if (aIsRarePlay && !bIsRarePlay) return -1;
      if (bIsRarePlay && !aIsRarePlay) return 1;
      
      const aIsNormPlay = a.type === 'Play' && (a.rarity === 'Common' || a.rarity === 'Uncommon');
      const bIsNormPlay = b.type === 'Play' && (b.rarity === 'Common' || b.rarity === 'Uncommon');
      if (aIsNormPlay && !bIsNormPlay) return 1;
      if (bIsNormPlay && !aIsNormPlay) return -1;
      
      const rvA = rarityValue[a.rarity] || 1;
      const rvB = rarityValue[b.rarity] || 1;
      if (rvA !== rvB) return rvB - rvA;
      if (a.type !== b.type) return a.type === 'Player' ? -1 : 1;
      return 0;
    });
    
    packs.push(packCards);
  }
  
  return packs;
}

// ── Bot Pick Logic ─────────────────────────────────────────────────────────

export function scoreCardForBot(bot: DraftSeat, card: DraftCard, overallPickNum: number, currentPackCards: DraftCard[]): number {
  if (!bot.botProfile) return 0;
  
  // Base Value
  let baseScore = 0;
  if (card.type === 'Player') {
    baseScore = (card.stats.per || 15) * 10; 
  } else {
    const rarityVals: Record<string, number> = { Common: 120, Uncommon: 150, Rare: 200, Mythic: 250 };
    baseScore = rarityVals[card.rarity] || 150;
  }

  // Apply hidden bot variance (15% variance per card)
  const noiseFloat = pseudoRandom(bot.botProfile.noiseSeed, card.id);
  const noiseMultiplier = 0.85 + (noiseFloat * 0.30);
  let score = baseScore * noiseMultiplier;

  // Mid/Late Draft: Positional Needs Pivot
  if (card.type === 'Player' && overallPickNum >= 10) {
    const draftedPlayers = bot.drafted.filter(c => c.type === 'Player') as Player[];
    const samePositionDrafted = draftedPlayers.filter(p => p.player?.position?.includes(card.player.position)).length;
    
    if (samePositionDrafted === 0) {
      score *= 1.4;
    } else if (samePositionDrafted > 2) {
      score *= 0.6;
    }
  }

  // Synergy / Archetype Pivot
  if (overallPickNum > 5) {
    const draftedTraits = bot.drafted.flatMap(c => c.type === 'Player' ? c.traits.map(t => t.name) : c.badges);
    const cardTraits = card.type === 'Player' ? card.traits.map(t => t.name) : card.badges;
    let synergyMatches = 0;
    
    cardTraits.forEach((trait: string) => {
      const occurrences = draftedTraits.filter(t => t === trait).length;
      if (occurrences > 1) {
        synergyMatches += occurrences;
      }
    });

    if (synergyMatches > 0) {
      score *= (1 + (synergyMatches * 0.1));
    }
    
    if (cardTraits.includes(bot.botProfile.favoredTrait)) {
      score *= 1.15;
    }
  }

  // Hate-Drafting
  if (card.type === 'Player' && card.stats.per > 25 && score < 250) {
      score = 250 * noiseMultiplier;
  }

  return score;
}

export function getBotPick(bot: DraftSeat, overallPickNum: number): string {
  if (!bot.currentPack || bot.currentPack.length === 0) return '';
  
  let bestCard = bot.currentPack[0];
  let bestScore = -1;

  for (const card of bot.currentPack) {
    const score = scoreCardForBot(bot, card, overallPickNum, bot.currentPack);
    if (score > bestScore) {
      bestScore = score;
      bestCard = card;
    }
  }
  return bestCard.id;
}
