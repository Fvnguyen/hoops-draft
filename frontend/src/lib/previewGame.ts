/**
 * game_theater fixture: a real, seeded game between two bot-drafted rosters, shared by
 * /theater-preview (in-app review) and scripts/theater-shot.ts (static screenshots).
 * Seat 0 is "You" so the YOU chip and the summary's roster hints show.
 */
import { playsDB } from '@/components/DraftRoom';
import { getAllCards } from '@/engine/cards';
import { generateCubePool, getBotPick, createBotProfiles, type DraftSeat } from '@/engine/draft';
import { buildBotRoster, type DraftSessionSeat } from '@/engine/deckbuilder';
import { buildTeamInfo, simulateGame, type GameTheater } from '@/engine/game';
import { CUBE_PLAYER_CARDS_PER_PACK } from '@/engine/balance';
import { createRng } from '@/engine/rng';
import type { DraftCard } from '@/engine/types';
import type { GameContext } from '@/narration/types';

/** Headless cube draft (mirrors tests/unit/helpers.ts runHeadlessDraft). Seat 0 is
 *  bot-controlled like the rest but renamed "You" for the theater preview's UI. */
function headlessDraft(seed: number): DraftSessionSeat[] {
  const rng = createRng(seed);
  const allPacks = generateCubePool(getAllCards(), playsDB, rng);
  const profiles = createBotProfiles(rng, 8);
  profiles[0] = { ...profiles[0], id: 'human-0', name: 'You' };
  const seats: DraftSeat[] = [];
  for (let i = 0; i < 8; i++) {
    seats.push({ id: i === 0 ? 'human-0' : `bot-${i}`, isBot: true, botProfile: profiles[i], drafted: [], currentPack: allPacks[i] || [] });
  }
  let overallPick = 1;
  for (let packNumber = 1; packNumber <= 3; packNumber++) {
    for (let pickNumber = 1; pickNumber <= CUBE_PLAYER_CARDS_PER_PACK + 1; pickNumber++) {
      for (let i = 0; i < 8; i++) {
        const seat = seats[i];
        if (seat.currentPack.length === 0) continue;
        const pickId = getBotPick(seat, overallPick);
        const idx = seat.currentPack.findIndex(c => c.id === pickId);
        if (idx !== -1) seat.drafted.push(seat.currentPack.splice(idx, 1)[0]);
      }
      const dir = packNumber === 2 ? 1 : -1;
      const rotated: DraftCard[][] = new Array(8);
      for (let i = 0; i < 8; i++) { let t = (i + dir) % 8; if (t < 0) t += 8; rotated[t] = seats[i].currentPack; }
      for (let i = 0; i < 8; i++) seats[i].currentPack = rotated[i];
      overallPick++;
    }
    if (packNumber < 3) for (let i = 0; i < 8; i++) seats[i].currentPack = allPacks[packNumber * 8 + i] || [];
  }
  return seats.map(seat => ({ id: seat.id, isBot: true, botProfile: seat.botProfile, drafted: seat.drafted, builtRoster: buildBotRoster(seat.drafted, seat.botProfile) }));
}

export function buildPreviewGame(seed: number): GameTheater {
  const seats = headlessDraft(seed);
  const home = buildTeamInfo(seats[0], true, 'You');
  const away = buildTeamInfo(seats[3], false);
  return simulateGame(home, away, { rng: createRng(seed ^ 0x5bd1e995) });
}

export const PREVIEW_CONTEXT: GameContext = {
  userSeatId: 'human-0',
  home: { wins: 3, losses: 1, streak: 'W2', rank: 2, of: 8 },
  away: { wins: 2, losses: 2, streak: 'L1', rank: 4, of: 8 },
  headToHead: [1, 0],
};

