import { DraftCard, Player, Play } from './types';
import { Rng, shuffle } from './rng';
import { CUBE_SEATS, CUBE_PACKS, CUBE_PLAYER_CARDS_PER_PACK, BOT_NOISE_PCT, HATE_DRAFT_FLOOR } from './balance';

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

// Simple pseudo-random hash generator based on two strings. This is its own
// deterministic hash (not routed through Rng) — it is already seeded by
// `bot.botProfile.noiseSeed` plus the card id, so the same bot facing the
// same card always scores it identically.
function pseudoRandom(seed: number, stringSeed: string) {
  let h = 0xdeadbeef ^ seed;
  for (let i = 0; i < stringSeed.length; i++) {
    h = Math.imul(h ^ stringSeed.charCodeAt(i), 2654435761);
  }
  return ((h ^ h >>> 16) >>> 0) / 4294967296;
}

// ── Cube-Style Draft Pool ──────────────────────────────────────────────────

export function generateCubePool(allPlayers: Player[], playsDB: Play[], rng: Rng): DraftCard[][] {
  if (allPlayers.length === 0) return [];

  const SEATS = CUBE_SEATS;
  const PACKS = CUBE_PACKS;
  const TOTAL_PACKS = SEATS * PACKS;
  const PLAYER_CARDS_PER_PACK = CUBE_PLAYER_CARDS_PER_PACK;
  const TARGET_PACK_SIZE = PLAYER_CARDS_PER_PACK + 1; // 7 players + 1 play = 8

  // 1. Segregate pools
  const rarePlusPool: DraftCard[] = [];
  const uncommonPlayers: Player[] = [];
  const commonPlayers: Player[] = [];
  const commonUncommonPlays: Play[] = [];

  for (const p of allPlayers) {
    if (p.rarity === 'Mythic' || p.rarity === 'Rare') rarePlusPool.push(p);
    else if (p.rarity === 'Uncommon') uncommonPlayers.push(p);
    else commonPlayers.push(p);
  }

  for (const play of playsDB) {
    const playWithId = { ...play, playId: play.playId || play.id };
    if (play.rarity === 'Mythic' || play.rarity === 'Rare') rarePlusPool.push(playWithId);
    else commonUncommonPlays.push(playWithId);
  }

  // 2. Shuffle pools
  const shuffledRarePlus = shuffle(rarePlusPool, rng);
  const shuffledUncommon = shuffle(uncommonPlayers, rng);
  const shuffledCommon = shuffle(commonPlayers, rng);
  const shuffledPlays = shuffle(commonUncommonPlays, rng);

  // Helper to safely pop from a pool, cycling with unique IDs if empty
  function popPool<T extends DraftCard>(pool: T[], idxRef: { current: number }): T {
    if (pool.length === 0) throw new Error("Empty pool");
    const item = pool[idxRef.current % pool.length];
    if (idxRef.current >= pool.length) {
      const copyNum = Math.floor(idxRef.current / pool.length);
      idxRef.current++;
      return { ...item, id: `${item.id}_copy${copyNum}` };
    }
    idxRef.current++;
    return item;
  }

  const rareRef = { current: 0 };
  const uncRef = { current: 0 };
  const comRef = { current: 0 };
  const playRef = { current: 0 };

  const packs: DraftCard[][] = [];

  // 3. Build packs
  for (let p = 0; p < TOTAL_PACKS; p++) {
    const packCards: DraftCard[] = [];
    
    // Rares: 85% chance for 1 Rare+, 15% chance for 2 Rare+
    const isDoubleRare = rng.next() > 0.85;
    const rareCount = isDoubleRare ? 2 : 1;
    let playAllocated = false;

    for (let i = 0; i < rareCount; i++) {
      const rareCard = popPool(shuffledRarePlus, rareRef);
      if (rareCard.type === 'Play') {
        packCards.push({ ...rareCard, id: `${rareCard.id}_pack${p}`, playId: rareCard.playId || rareCard.id });
        playAllocated = true; // The pack got its play slot filled by a rare play
      } else {
        packCards.push(rareCard);
      }
    }

    // Uncommons: 2 per pack
    for (let i = 0; i < 2; i++) {
      packCards.push(popPool(shuffledUncommon, uncRef));
    }

    // Play slot: if not already filled by a rare play
    if (!playAllocated) {
      const playCard = popPool(shuffledPlays, playRef) as Play;
      packCards.push({ ...playCard, id: `${playCard.id}_pack${p}`, playId: playCard.playId || playCard.id });
    }

    // Commons: fill remaining slots up to TARGET_PACK_SIZE
    while (packCards.length < TARGET_PACK_SIZE) {
      packCards.push(popPool(shuffledCommon, comRef));
    }

    // 4. Sort by rarity (Mythic > Rare > Uncommon > Common); within a rarity tier,
    // the play sorts after players of that same tier, not after every player overall.
    const rarityValue: Record<string, number> = { Mythic: 4, Rare: 3, Uncommon: 2, Common: 1 };
    packCards.sort((a, b) => {
      const rvA = rarityValue[a.rarity] || 1;
      const rvB = rarityValue[b.rarity] || 1;
      if (rvA !== rvB) return rvB - rvA;

      if (a.type === 'Play' && b.type !== 'Play') return 1;
      if (b.type === 'Play' && a.type !== 'Play') return -1;

      // Secondary sort to keep deterministic ordering for same rarities
      return a.id.localeCompare(b.id);
    });

    packs.push(packCards);
  }

  return packs;
}

// ── Bot Pick Logic ─────────────────────────────────────────────────────────

// eslint-disable-next-line @typescript-eslint/no-unused-vars -- kept for call-site parity with the original signature
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

  // Apply hidden bot variance (±BOT_NOISE_PCT per card)
  const noiseFloat = pseudoRandom(bot.botProfile.noiseSeed, card.id);
  const noiseMultiplier = (1 - BOT_NOISE_PCT) + (noiseFloat * (2 * BOT_NOISE_PCT));
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
  if (card.type === 'Player' && card.stats.per > 25 && score < HATE_DRAFT_FLOOR) {
    score = HATE_DRAFT_FLOOR * noiseMultiplier;
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
