/**
 * Shared headless-pipeline helpers for engine tests and the balance script.
 *
 * No test-framework imports here (no `vitest`) so this file can be used both
 * from vitest test files and from `scripts/balance.ts` via plain `tsx`.
 *
 * Pipeline: getAllCards() -> tag 'Player' -> generateCubePool() -> headless
 * pack-passing draft (mirrors src/hooks/useDraftEngine.ts without React) ->
 * buildBotRoster() -> DraftSessionSeat -> buildTeamInfo() -> simulateGame().
 */

import { getAllCards } from '@/engine/cards';
import type { PlayerCardData, Play, DraftCard } from '@/components/PlayerCard';
import { generateCubePool, getBotPick, type DraftSeat, type BotProfile } from '@/engine/draft';
import { buildBotRoster, type DraftSessionSeat } from '@/engine/deckbuilder';
import { type EdgeTuning, buildTeamInfo, simulateGame, type TeamInfo, type GameTheater } from '@/engine/game';
import { CUBE_PLAYER_CARDS_PER_PACK } from '@/engine/balance';
import { createRng, randomSeed, type Rng } from '@/engine/rng';
import { PLAYS } from './fixtures/plays';

export { PLAYS };

// ── Card loading (memoised) ─────────────────────────────────────────────────

let cachedPlayers: PlayerCardData[] | null = null;

/** getAllCards() from the build-time card artifact (already tagged `type: 'Player'`). */
export function loadPlayers(): PlayerCardData[] {
  if (cachedPlayers) return cachedPlayers;
  cachedPlayers = getAllCards();
  return cachedPlayers;
}

// ── Headless draft (mirrors useDraftEngine.ts without React) ───────────────

const BOT_NAMES = ['Astro', 'HoopsBot', 'DataDunk', 'SwishAI', 'DraftGPT', 'NetMaster', 'RimRunner', 'CourtSense'];
const TRAITS_POOL = ['Sharpshooter', 'Lockdown Defender', 'Playmaker', 'Finisher', 'Rebounder'];

function makeBotProfile(seatIndex: number, rng: Rng): BotProfile {
  return {
    id: seatIndex === 0 ? 'human-0' : `bot-${seatIndex}`,
    name: BOT_NAMES[seatIndex % BOT_NAMES.length],
    noiseSeed: Math.floor(rng.next() * 1_000_000),
    favoredTrait: TRAITS_POOL[seatIndex % TRAITS_POOL.length],
  };
}

/**
 * Run a full 8-seat / 3-pack / 12-pick cube draft headlessly (no React), then
 * auto-build a roster for every seat (all bots — seat 0 gets a botProfile too
 * so it can pick for itself).
 *
 * Replicates the pack-passing loop in src/hooks/useDraftEngine.ts:
 * 12 picks per pack, rotate packs (pack 2 passes right, packs 1 & 3 pass
 * left), 3 packs dealt from the pre-generated 24-pack cube pool.
 */
export function runHeadlessDraft(players: PlayerCardData[], plays: Play[] = PLAYS, seed?: number): DraftSessionSeat[] {
  const rng = createRng(seed ?? randomSeed());
  const allPacks = generateCubePool(players, plays, rng); // 24 packs (8 seats x 3 rounds), pack size from engine/balance

  const seats: DraftSeat[] = [];
  for (let i = 0; i < 8; i++) {
    seats.push({
      id: i === 0 ? 'human-0' : `bot-${i}`,
      isBot: true,
      botProfile: makeBotProfile(i, rng),
      drafted: [],
      currentPack: allPacks[i] || [],
    });
  }

  let overallPick = 1;
  for (let packNumber = 1; packNumber <= 3; packNumber++) {
    for (let pickNumber = 1; pickNumber <= CUBE_PLAYER_CARDS_PER_PACK + 1; pickNumber++) {
      // Every seat picks from its own current pack.
      for (let i = 0; i < 8; i++) {
        const seat = seats[i];
        if (seat.currentPack.length === 0) continue;
        const pickId = getBotPick(seat, overallPick);
        const idx = seat.currentPack.findIndex((c) => c.id === pickId);
        if (idx !== -1) {
          const card = seat.currentPack.splice(idx, 1)[0];
          seat.drafted.push(card);
        }
      }

      // Pass packs: pack 2 passes right (+1), packs 1 & 3 pass left (-1).
      const packDirection = packNumber === 2 ? 1 : -1;
      const rotated: DraftCard[][] = new Array(8);
      for (let i = 0; i < 8; i++) {
        let target = (i + packDirection) % 8;
        if (target < 0) target += 8;
        rotated[target] = seats[i].currentPack;
      }
      for (let i = 0; i < 8; i++) seats[i].currentPack = rotated[i];

      overallPick++;
    }

    // Deal the next round's pre-generated packs (round 2: packs 8-15, round 3: packs 16-23).
    if (packNumber < 3) {
      const packOffset = packNumber * 8;
      for (let i = 0; i < 8; i++) seats[i].currentPack = allPacks[packOffset + i] || [];
    }
  }

  return seats.map((seat): DraftSessionSeat => ({
    id: seat.id,
    isBot: true,
    botProfile: seat.botProfile,
    drafted: seat.drafted,
    builtRoster: buildBotRoster(seat.drafted, seat.botProfile),
  }));
}

/** Resolve every drafted seat into a game-ready TeamInfo. */
export function buildTeams(seats: DraftSessionSeat[]): TeamInfo[] {
  return seats.map((seat) => buildTeamInfo(seat, false));
}

/**
 * Assemble a single ad-hoc TeamInfo from an arbitrary list of real players
 * and plays, without running a full draft. Useful for synergy/play unit
 * tests that need a specific badge composition.
 */
export function buildTestTeam(players: PlayerCardData[], plays: Play[] = [], seatId = 'test-team'): TeamInfo {
  const drafted: DraftCard[] = [...players, ...plays];
  const builtRoster = buildBotRoster(drafted);
  const seat: DraftSessionSeat = { id: seatId, isBot: true, drafted, builtRoster };
  return buildTeamInfo(seat, false);
}

// ── Bulk simulation ──────────────────────────────────────────────────────────

/**
 * Simulate `n` games. Each game drafts a fresh 8-team pod (headless) and
 * plays a random pairing from it, so results sample many different roster
 * constructions rather than always the same 8 teams.
 *
 * Pass `seed` to make the entire run (draft + pairing + game) reproducible:
 * the same seed always yields the same sequence of games.
 */
export function simulateMany(n: number, players?: PlayerCardData[], plays?: Play[], seed?: number, gameOpts?: { tuning?: EdgeTuning }): GameTheater[] {
  const pool = players ?? loadPlayers();
  const playPool = plays ?? PLAYS;
  const rng = createRng(seed ?? randomSeed());
  const games: GameTheater[] = [];

  for (let i = 0; i < n; i++) {
    const draftSeed = Math.floor(rng.next() * 4294967296);
    const seats = runHeadlessDraft(pool, playPool, draftSeed);
    const teams = buildTeams(seats);

    const a = Math.floor(rng.next() * teams.length);
    let b = Math.floor(rng.next() * teams.length);
    while (b === a) b = Math.floor(rng.next() * teams.length);

    const home = rng.next() < 0.5 ? teams[a] : teams[b];
    const away = home === teams[a] ? teams[b] : teams[a];

    games.push(simulateGame(home, away, { rng, tuning: gameOpts?.tuning }));
  }

  return games;
}

// ── Stats helpers ────────────────────────────────────────────────────────────

/** Points per possession, aggregated over every possession in every game (both sides pooled). */
export function ppp(games: GameTheater[]): number {
  let totalPoints = 0;
  let totalPoss = 0;
  for (const g of games) {
    totalPoints += g.finalScore[0] + g.finalScore[1];
    totalPoss += g.possessions.length;
  }
  return totalPoss > 0 ? totalPoints / totalPoss : 0;
}

/** Fraction of TEAM final scores (2 per game) that fall within [lo, hi]. */
export function scoreInRange(games: GameTheater[], lo: number, hi: number): number {
  let count = 0;
  let total = 0;
  for (const g of games) {
    for (const s of g.finalScore) {
      total++;
      if (s >= lo && s <= hi) count++;
    }
  }
  return total > 0 ? count / total : 0;
}

export interface ActivationRates {
  synergyCounts: Record<string, number>;
  playCounts: Record<string, { full: number; partial: number; none: number }>;
  /** Number of team-bonus samples (2 per game: home + away). */
  teamSamples: number;
}

/** Synergy/play activation counts across every team-side in every game. */
export function activationRates(games: GameTheater[]): ActivationRates {
  const synergyCounts: Record<string, number> = {};
  const playCounts: Record<string, { full: number; partial: number; none: number }> = {};
  let teamSamples = 0;

  for (const g of games) {
    for (const bonuses of [g.homeBonuses, g.awayBonuses]) {
      teamSamples++;
      for (const syn of bonuses.activeSynergies) {
        synergyCounts[syn.name] = (synergyCounts[syn.name] || 0) + 1;
      }
      for (const play of bonuses.activePlays) {
        if (!playCounts[play.name]) playCounts[play.name] = { full: 0, partial: 0, none: 0 };
        playCounts[play.name][play.activated]++;
      }
    }
  }

  return { synergyCounts, playCounts, teamSamples };
}
