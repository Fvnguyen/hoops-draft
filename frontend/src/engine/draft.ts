import { DraftCard, Player, Play } from './types';
import { Rng, shuffle, pick } from './rng';
import {
  CUBE_SEATS, CUBE_PACKS, CUBE_PLAYER_CARDS_PER_PACK, BOT_NOISE_PCT,
  CARD_RARITY_VALUE_MULT, PLAY_RARITY_VALUE, BOMB_GAP_THRESHOLD, BOMB_PULL_MULT,
  PLAN_PULL, BOT_SYNERGY_AWARENESS_RANGE, DRAFT_POSITIONAL_SHORT_MULT,
  DRAFT_POSITIONAL_FULL_MULT, DRAFT_POSITIONAL_TARGETS, MAX_BOTS_PER_ARCHETYPE,
  MIN_DEFENSIVE_OR_GOLD_BOTS,
} from './balance';
import { ARCHETYPES, type ArchetypeDef, type Color } from './archetypes';
import { PLAYBOOK, isEligibleForRole } from './playbook';
import { DEPTH_COLUMNS, defaultColumn, naturalPositions, effectivePosition, type DepthColumn } from './positions';

export interface BotProfile {
  id: string;
  name: string;
  noiseSeed: number;
  /** The plan (from ARCHETYPES) this bot chases; drawn once at draft start (D1). */
  targetArchetypeId: string;
  /** A plan sharing a colour with the target — the bot's fallback pull (D1). */
  secondaryArchetypeId?: string;
  /** Fixed per-bot noise on how well it reads badge/play synergies, [0.5, 1.0] (D3b). */
  synergyAwareness: number;
}

/** Total picks a single seat makes over the whole cube draft (3 packs x 8 cards). */
export const TOTAL_DRAFT_PICKS = CUBE_PACKS * (CUBE_PLAYER_CARDS_PER_PACK + 1);

const BOT_NAMES = ['Astro', 'HoopsBot', 'DataDunk', 'SwishAI', 'DraftGPT', 'NetMaster', 'RimRunner', 'CourtSense'];

function colorsOf(def: ArchetypeDef): Color[] {
  return [def.colors.primary, def.colors.support, def.colors.tertiary].filter((c): c is Color => !!c);
}

/** Draws each bot's target plan honouring MAX_BOTS_PER_ARCHETYPE and
 *  MIN_DEFENSIVE_OR_GOLD_BOTS (D1). */
function assignTargetArchetypes(rng: Rng, botCount: number): string[] {
  const counts: Record<string, number> = {};
  const assignments: string[] = [];
  const defensiveOrGold = ARCHETYPES.filter(a => a.side === 'defense' || a.kind === 'gold');

  const drawFrom = (pool: ArchetypeDef[]): ArchetypeDef => {
    const eligible = pool.filter(a => (counts[a.id] ?? 0) < MAX_BOTS_PER_ARCHETYPE);
    const chosen = pick(rng, eligible.length > 0 ? eligible : pool);
    counts[chosen.id] = (counts[chosen.id] ?? 0) + 1;
    return chosen;
  };

  for (let i = 0; i < Math.min(MIN_DEFENSIVE_OR_GOLD_BOTS, botCount); i++) {
    assignments.push(drawFrom(defensiveOrGold).id);
  }
  for (let i = assignments.length; i < botCount; i++) {
    assignments.push(drawFrom(ARCHETYPES).id);
  }
  return shuffle(assignments, rng);
}

/** A plan that shares a colour with `target`, so the bot's pull has a fallback (D1). */
function pickSecondaryArchetype(rng: Rng, target: ArchetypeDef): string | undefined {
  const targetColors = colorsOf(target);
  const candidates = ARCHETYPES.filter(a => a.id !== target.id && colorsOf(a).some(c => targetColors.includes(c)));
  return candidates.length > 0 ? pick(rng, candidates).id : undefined;
}

/** Draws `count` bot profiles (in seat order), so the same draft seed reproduces the
 *  same target plans / noise / synergy awareness across replays (D1, D3b). */
export function createBotProfiles(rng: Rng, count: number = CUBE_SEATS - 1): BotProfile[] {
  const targetIds = assignTargetArchetypes(rng, count);
  return targetIds.map((targetArchetypeId, idx) => {
    const target = ARCHETYPES.find(a => a.id === targetArchetypeId)!;
    const [lo, hi] = BOT_SYNERGY_AWARENESS_RANGE;
    return {
      id: `bot-${idx + 1}`,
      name: BOT_NAMES[idx % BOT_NAMES.length],
      noiseSeed: Math.floor(rng.next() * 1_000_000),
      targetArchetypeId,
      secondaryArchetypeId: pickSecondaryArchetype(rng, target),
      synergyAwareness: lo + rng.next() * (hi - lo),
    };
  });
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

/** D2 / D5 raw value: a player's rarity-weighted overall, a play's rarity base. Never
 *  scaled by noise or `planWeight` — this is what the bomb-pull gap compares. */
function rawBaseValue(card: DraftCard): number {
  return card.type === 'Player'
    ? card.ratings.overall * (CARD_RARITY_VALUE_MULT[card.rarity] ?? 1)
    : (PLAY_RARITY_VALUE[card.rarity] ?? 150);
}

/** D2b: 0 at pick 1, ramping linearly to 1.0 at the final pick of the whole draft. */
function planWeight(overallPickNum: number): number {
  return Math.max(0, Math.min(1, (overallPickNum - 1) / (TOTAL_DRAFT_PICKS - 1)));
}

/** D2 bomb pull: the pack's clear best card (by `rawBaseValue`) gets a bonus scaled by
 *  how far it leads the second-best, uncapped by `planWeight`. */
function bombBonus(card: DraftCard, currentPackCards: DraftCard[]): number {
  const values = currentPackCards.map(rawBaseValue).sort((a, b) => b - a);
  const [best, secondBest = best] = values;
  if (rawBaseValue(card) !== best) return 0;
  const gap = best - secondBest;
  return gap >= BOMB_GAP_THRESHOLD ? BOMB_PULL_MULT * (gap - BOMB_GAP_THRESHOLD) : 0;
}

/** A card's preferred depth-chart column — same natural-fit logic `buildBotRoster` uses
 *  to place bots (`positions.ts`, natural-only), so the pull steers toward the columns
 *  that placement actually needs, not a coarser G/F/C bucket that could leave a column
 *  (e.g. PG) empty while its bucket (G) looks "full" of SGs. */
function positionColumnOf(player: Player): DepthColumn {
  return defaultColumn(effectivePosition(player.player.position, player.traits));
}

/** D4: positional-need multiplier, ramping toward the full x1.15 / x0.8 spread as
 *  `planWeight` grows — ignored entirely at pick 1. */
function positionalMultiplier(bot: DraftSeat, card: Player, pw: number): number {
  const column = positionColumnOf(card);
  const draftedPlayers = bot.drafted.filter((c): c is Player => c.type === 'Player');
  const have = draftedPlayers.filter(p => positionColumnOf(p) === column).length;
  const target = DRAFT_POSITIONAL_TARGETS[column];
  return have < target
    ? 1 + DRAFT_POSITIONAL_SHORT_MULT * pw
    : 1 - DRAFT_POSITIONAL_FULL_MULT * pw;
}

/** D3: badge-colour pull toward the bot's target plan (full weight) and secondary plan
 *  (half weight), scaled by `planWeight` and the bot's `synergyAwareness` (D3b). */
function planPull(bot: DraftSeat, card: Player, pw: number): number {
  const profile = bot.botProfile!;
  const target = ARCHETYPES.find(a => a.id === profile.targetArchetypeId);
  const secondary = ARCHETYPES.find(a => a.id === profile.secondaryArchetypeId);
  const targetColors = target ? colorsOf(target) : [];
  const secondaryColors = secondary ? colorsOf(secondary) : [];

  let pull = 0;
  for (const trait of card.traits) {
    if (targetColors.includes(trait.name as Color)) {
      pull += PLAN_PULL * trait.level;
    } else if (secondaryColors.includes(trait.name as Color)) {
      pull += 0.5 * PLAN_PULL * trait.level;
    }
  }
  return pull * pw * profile.synergyAwareness;
}

/** D5: share of `card`'s roles the bot's drafted players could staff today. A card
 *  outside the known playbook (or with no roles) is treated as fully staffed. */
function playStaffability(bot: DraftSeat, card: Play): number {
  const def = PLAYBOOK[card.playId ?? card.id];
  if (!def || def.roles.length === 0) return 1;
  const draftedPlayers = bot.drafted.filter((c): c is Player => c.type === 'Player');
  const filled = def.roles.filter(role => draftedPlayers.some(p => isEligibleForRole(p, role))).length;
  return filled / def.roles.length;
}

function playMatchesTargetSide(bot: DraftSeat, card: Play): boolean {
  const def = PLAYBOOK[card.playId ?? card.id];
  const target = ARCHETYPES.find(a => a.id === bot.botProfile!.targetArchetypeId);
  if (!def || !target) return false;
  return target.side === 'both' || target.side === def.side;
}

export function scoreCardForBot(bot: DraftSeat, card: DraftCard, overallPickNum: number, currentPackCards: DraftCard[]): number {
  if (!bot.botProfile) return 0;

  const pw = planWeight(overallPickNum);
  const noiseFloat = pseudoRandom(bot.botProfile.noiseSeed, card.id);
  const noiseMultiplier = (1 - BOT_NOISE_PCT) + (noiseFloat * (2 * BOT_NOISE_PCT));
  const bonus = bombBonus(card, currentPackCards);

  if (card.type === 'Player') {
    let score = rawBaseValue(card) * noiseMultiplier + bonus;
    score *= positionalMultiplier(bot, card, pw);
    score += planPull(bot, card, pw);
    return score;
  }

  const staffability = playStaffability(bot, card);
  const blend = (1 - pw) + pw * staffability * bot.botProfile.synergyAwareness;
  let score = rawBaseValue(card) * blend * noiseMultiplier + bonus;
  if (playMatchesTargetSide(bot, card)) {
    score *= 1 + 0.2 * pw;
  }
  return score;
}

/** Depth-chart columns with zero naturally-eligible players among what the bot has
 *  drafted so far — the state `buildBotRoster` can't cover without going off-position. */
function missingNaturalColumns(bot: DraftSeat): DepthColumn[] {
  const draftedPlayers = bot.drafted.filter((c): c is Player => c.type === 'Player');
  return DEPTH_COLUMNS.filter(col =>
    !draftedPlayers.some(p => naturalPositions(effectivePosition(p.player.position, p.traits)).includes(col))
  );
}

/** Pack 3 safety net: if the roster still has an uncovered column, take the pack's best
 *  naturally-eligible card for it over whatever the normal value/plan score would pick —
 *  never leave a column to the deck builder's off-position fallback (and its penalty)
 *  when a natural fit was sitting right there in the pack. */
function forcedPositionPick(bot: DraftSeat): string | null {
  const missing = missingNaturalColumns(bot);
  if (missing.length === 0) return null;

  let best: DraftCard | null = null;
  let bestValue = -1;
  for (const card of bot.currentPack) {
    if (card.type !== 'Player') continue;
    const cols = naturalPositions(effectivePosition(card.player.position, card.traits));
    if (!missing.some(col => cols.includes(col))) continue;
    const value = rawBaseValue(card);
    if (value > bestValue) { bestValue = value; best = card; }
  }
  return best?.id ?? null;
}

export function getBotPick(bot: DraftSeat, overallPickNum: number): string {
  if (!bot.currentPack || bot.currentPack.length === 0) return '';

  if (overallPickNum > 2 * (CUBE_PLAYER_CARDS_PER_PACK + 1)) {
    const forced = forcedPositionPick(bot);
    if (forced) return forced;
  }

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
