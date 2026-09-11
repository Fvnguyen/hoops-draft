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

export function generatePack(allPlayers: Player[], playsDB: Play[]): DraftCard[] {
  if (allPlayers.length === 0) return [];
  const packCards: DraftCard[] = [];

  const mythics = allPlayers.filter(p => p.rarity === 'Mythic');
  const rares = allPlayers.filter(p => p.rarity === 'Rare');
  const uncommons = allPlayers.filter(p => p.rarity === 'Uncommon');
  const commons = allPlayers.filter(p => p.rarity === 'Common');

  // 1 Rare/Mythic
  if (Math.random() < 0.125 && mythics.length > 0) {
    packCards.push(mythics[Math.floor(Math.random() * mythics.length)]);
  } else if (rares.length > 0) {
    packCards.push(rares[Math.floor(Math.random() * rares.length)]);
  }

  // 3 Uncommons
  const shuffledUncommons = [...uncommons].sort(() => Math.random() - 0.5);
  packCards.push(...shuffledUncommons.slice(0, 3));

  // 5 Guaranteed Positional Commons
  const positions = ['PG', 'SG', 'SF', 'PF', 'C'];
  positions.forEach(pos => {
    const posCommons = commons.filter(p => p.player.position.includes(pos));
    if (posCommons.length > 0) {
      packCards.push(posCommons[Math.floor(Math.random() * posCommons.length)]);
    }
  });

  // 2 Random Commons
  const usedCommonIds = new Set(packCards.map(c => c.id));
  const remainingCommons = commons.filter(c => !usedCommonIds.has(c.id));
  const shuffledCommons = [...remainingCommons].sort(() => Math.random() - 0.5);
  packCards.push(...shuffledCommons.slice(0, 2));

  // 1 Play Card
  const randomPlay = playsDB[Math.floor(Math.random() * playsDB.length)];
  packCards.push(randomPlay);

  // Sort
  const rarityValue: Record<string, number> = { Mythic: 4, Rare: 3, Uncommon: 2, Common: 1 };
  packCards.sort((a, b) => {
    // Systems (Rare/Mythic Plays) to the absolute front
    const aIsRarePlay = a.type === 'Play' && (a.rarity === 'Rare' || a.rarity === 'Mythic');
    const bIsRarePlay = b.type === 'Play' && (b.rarity === 'Rare' || b.rarity === 'Mythic');
    if (aIsRarePlay && !bIsRarePlay) return -1;
    if (bIsRarePlay && !aIsRarePlay) return 1;

    // Normal Plays (Common/Uncommon) to the absolute end
    const aIsNormPlay = a.type === 'Play' && (a.rarity === 'Common' || a.rarity === 'Uncommon');
    const bIsNormPlay = b.type === 'Play' && (b.rarity === 'Common' || b.rarity === 'Uncommon');
    if (aIsNormPlay && !bIsNormPlay) return 1;
    if (bIsNormPlay && !aIsNormPlay) return -1;

    // Normal rarity sort for players
    const rvA = rarityValue[a.rarity] || 1;
    const rvB = rarityValue[b.rarity] || 1;
    if (rvA !== rvB) return rvB - rvA;
    if (a.type !== b.type) return a.type === 'Player' ? -1 : 1;
    return 0;
  });

  return packCards;
}

export function scoreCardForBot(bot: DraftSeat, card: DraftCard, overallPickNum: number, currentPackCards: DraftCard[]): number {
  if (!bot.botProfile) return 0;
  
  // Base Value
  let baseScore = 0;
  if (card.type === 'Player') {
    // Rely on PER as a baseline value metric (usually ranges 10-30)
    baseScore = (card.stats.per || 15) * 10; 
  } else {
    // Play cards baseline value depending on rarity
    const rarityVals: Record<string, number> = { Common: 120, Uncommon: 150, Rare: 200, Mythic: 250 };
    baseScore = rarityVals[card.rarity] || 150;
  }

  // Apply hidden bot variance (15% variance per card)
  const noiseFloat = pseudoRandom(bot.botProfile.noiseSeed, card.id);
  const noiseMultiplier = 0.85 + (noiseFloat * 0.30); // 0.85 to 1.15
  let score = baseScore * noiseMultiplier;

  // Mid/Late Draft: Positional Needs Pivot
  if (card.type === 'Player' && overallPickNum >= 10) {
    const draftedPlayers = bot.drafted.filter(c => c.type === 'Player') as Player[];
    const samePositionDrafted = draftedPlayers.filter(p => p.player.position.includes(card.player.position)).length;
    
    if (samePositionDrafted === 0) {
      score *= 1.4; // High desperation for empty slots
    } else if (samePositionDrafted > 2) {
      score *= 0.6; // Diminishing returns if overcrowded
    }
  }

  // Synergy / Archetype Pivot
  if (overallPickNum > 5) {
    const draftedTraits = bot.drafted.flatMap(c => c.type === 'Player' ? c.traits.map(t => t.name) : c.badges);
    
    // Check if this card matches our most common drafted traits
    const cardTraits = card.type === 'Player' ? card.traits.map(t => t.name) : card.badges;
    let synergyMatches = 0;
    
    cardTraits.forEach((trait: string) => {
      const occurrences = draftedTraits.filter(t => t === trait).length;
      if (occurrences > 1) {
        synergyMatches += occurrences; // Scale score if we are heavy in this trait
      }
    });

    if (synergyMatches > 0) {
      score *= (1 + (synergyMatches * 0.1)); // e.g. 2 matches = 20% boost
    }
    
    // Personal Favored Trait Bias (Bot Personality)
    if (cardTraits.includes(bot.botProfile.favoredTrait)) {
      score *= 1.15;
    }
  }

  // Hate-Drafting Check (If this card is massively better than the rest of the pack, grab it to deny others)
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
