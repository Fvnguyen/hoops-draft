/**
 * draft_resume D1: a cube draft is a pure function of its seed and the human seats' picks.
 *
 * Bots are deterministic from the seed (`createBotProfiles(rng)` after
 * `generateCubePool(rng)`, then `getBotPick`, which hashes its own noise), so storing the
 * seed plus each human's card ids in pick order is enough to rebuild the exact room.
 * Solo drafts have one human seat (`'human-0'`); `pvp_draft` passes two
 * (`'human-0'` and `'human-4'`). Every other seat is `bot-<index>`.
 *
 * Pure: no React, no storage, no `Math.random()` (engine-purity.test.ts).
 */

import type { Player, Play } from './types';
import type { DraftSeat } from './draft';
import { generateCubePool, getBotPick, createBotProfiles } from './draft';
import type { DraftPickRecord } from './deckbuilder';
import { createRng } from './rng';
import { CUBE_SEATS, CUBE_PACKS, CUBE_PLAYER_CARDS_PER_PACK } from './balance';

/** Cards per pack (7 players + 1 play); picks per pack matches (one per card). */
const PICKS_PER_PACK = CUBE_PLAYER_CARDS_PER_PACK + 1;
/** Total picks a single seat makes over the whole cube draft. */
const TOTAL_PICKS = CUBE_PACKS * PICKS_PER_PACK;

/** Card ids a human seat picked, in pick order, keyed by seat id (`human-<seatIndex>`). */
export type HumanPicks = Record<string, string[]>;

export interface ReplayOptions {
  /** Per human seat, the 0-based pick indexes the pick clock took for them. Only sets
   *  `autoPicked: true` on the matching `DraftPickRecord`; never changes which card. */
  autoPicked?: Record<string, number[]>;
}

export interface DraftState {
  /** Eight seats in table order. `currentPack` is what each seat holds for the pick at
   *  `overallPick` (the dealt pack at a pack boundary; empty packs once complete). */
  seats: DraftSeat[];
  /** 1-3 while drafting; 4 once complete (matches the live hook's counters). */
  packNumber: number;
  /** 1-8 within the pack while drafting; 1 once complete. */
  pickNumber: number;
  /** 1-24 while drafting; 25 once complete. */
  overallPick: number;
  /** Every pick made so far, human and bot, in the same order the live hook appends them
   *  (per pick index: human seats first by seat index, then bots 1-7 by seat index). */
  pickLog: DraftPickRecord[];
  /** Human seat ids that still owe the pick at `overallPick`. Empty when complete. */
  awaiting: string[];
  phase: 'drafting' | 'complete';
}

/** Seat id for a table index: `human-<i>` if that seat is human, else `bot-<i>`. */
export function seatIdFor(index: number, humanSeatIds: readonly string[]): string {
  const human = `human-${index}`;
  return humanSeatIds.includes(human) ? human : `bot-${index}`;
}

/**
 * Rebuilds the draft from `seed` and the human picks. Stops at the first pick index a
 * human seat has not made and reports it in `awaiting`. Throws if a stored pick is not in
 * the pack that seat held (a corrupted or tampered log), naming the seat and index.
 */
export function replayDraft(
  seed: number,
  humanPicks: HumanPicks,
  allPlayers: Player[],
  playsDB: Play[],
  options?: ReplayOptions,
): DraftState {
  const humanSeatIds = Object.keys(humanPicks);
  const autoPicked = options?.autoPicked ?? {};

  // Same generation order the live hook runs: pool first, then bot profiles, from one rng.
  const rng = createRng(seed);
  const allPacks = generateCubePool(allPlayers, playsDB, rng);
  const botProfiles = createBotProfiles(rng);

  const seats: DraftSeat[] = [];
  for (let i = 0; i < CUBE_SEATS; i++) {
    const id = seatIdFor(i, humanSeatIds);
    const isHuman = humanSeatIds.includes(id);
    seats.push({
      id,
      isBot: !isHuman,
      // Profile index tracks table index exactly like the live hook (seats 1-7 draw
      // botProfiles[i-1]); a human at that seat simply never reads its profile.
      botProfile: i === 0 ? undefined : botProfiles[i - 1],
      drafted: [],
      currentPack: allPacks[i] ?? [],
    });
  }

  const pickCounts: Record<string, number> = Object.fromEntries(humanSeatIds.map((id) => [id, 0]));
  const pickLog: DraftPickRecord[] = [];

  let packNumber = 1;
  let pickNumber = 1;
  let overallPick = 1;

  for (let overall = 1; overall <= TOTAL_PICKS; overall++) {
    const awaiting = humanSeatIds.filter((id) => (humanPicks[id]?.length ?? 0) <= pickCounts[id]);
    if (awaiting.length > 0) {
      return { seats, packNumber, pickNumber, overallPick, pickLog, awaiting, phase: 'drafting' };
    }

    const records: DraftPickRecord[] = [];

    // 1. Human picks, seat-index order.
    for (let i = 0; i < CUBE_SEATS; i++) {
      const seat = seats[i];
      if (!humanSeatIds.includes(seat.id)) continue;
      const idx = pickCounts[seat.id];
      const cardId = humanPicks[seat.id][idx];
      const packSnapshot = seat.currentPack.map((c) => c.id);
      const cardIdx = seat.currentPack.findIndex((c) => c.id === cardId);
      if (cardIdx === -1) {
        throw new Error(
          `replayDraft: seat ${seat.id} pick ${idx} ("${cardId}") is not in its pack at overall pick ${overall}`,
        );
      }
      const card = seat.currentPack.splice(cardIdx, 1)[0];
      seat.drafted.push(card);
      records.push({
        packNumber,
        pickNumber,
        overallPick: overall,
        seatId: seat.id,
        packContents: packSnapshot,
        pickedCardId: cardId,
        ...(autoPicked[seat.id]?.includes(idx) ? { autoPicked: true } : {}),
      });
      pickCounts[seat.id] = idx + 1;
    }

    // 2. Bot picks, seat-index order.
    for (let i = 0; i < CUBE_SEATS; i++) {
      const seat = seats[i];
      if (!seat.isBot || seat.currentPack.length === 0) continue;
      const packSnapshot = seat.currentPack.map((c) => c.id);
      const pickId = getBotPick(seat, overall);
      const idx = seat.currentPack.findIndex((c) => c.id === pickId);
      if (idx === -1) continue;
      const card = seat.currentPack.splice(idx, 1)[0];
      seat.drafted.push(card);
      records.push({
        packNumber,
        pickNumber,
        overallPick: overall,
        seatId: seat.id,
        packContents: packSnapshot,
        pickedCardId: pickId,
      });
    }

    pickLog.push(...records);

    // 3. Pass packs (pack 2 passes right, packs 1 & 3 pass left).
    const direction = packNumber === 2 ? 1 : -1;
    const rotated: DraftSeat['currentPack'][] = new Array(CUBE_SEATS);
    for (let i = 0; i < CUBE_SEATS; i++) {
      let target = (i + direction) % CUBE_SEATS;
      if (target < 0) target += CUBE_SEATS;
      rotated[target] = seats[i].currentPack;
    }
    for (let i = 0; i < CUBE_SEATS; i++) seats[i].currentPack = rotated[i];

    // 4. Advance counters / deal the next pack at a boundary.
    pickNumber += 1;
    if (pickNumber > PICKS_PER_PACK) {
      pickNumber = 1;
      packNumber += 1;
      if (packNumber > CUBE_PACKS) {
        overallPick = overall + 1;
        return { seats, packNumber, pickNumber, overallPick, pickLog, awaiting: [], phase: 'complete' };
      }
      const packOffset = (packNumber - 1) * CUBE_SEATS;
      for (let i = 0; i < CUBE_SEATS; i++) seats[i].currentPack = allPacks[packOffset + i] ?? [];
    }
    overallPick = overall + 1;
  }

  return { seats, packNumber, pickNumber, overallPick, pickLog, awaiting: [], phase: 'complete' };
}
