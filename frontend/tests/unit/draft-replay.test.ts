/**
 * draft_resume T2 (D6): `replayDraft` must reproduce EXACTLY what the live hook
 * (`src/hooks/useDraftEngine.ts`'s `applyPick`/`startNewDraft`/`startNextRound`) does.
 *
 * `runReference` below is a headless transcription of that hook's pick/pass mechanics —
 * written BEFORE T3 refactors the hook onto `replayDraft`, so this test compares the
 * live behaviour against the new pure function independently of the refactor. A
 * deterministic "human chooser" (seeded, card-value-blind) stands in for the player and
 * also flags some picks as clock-timeout auto-picks, to exercise `ReplayOptions.autoPicked`.
 */
import { describe, it, expect } from 'vitest';
import { createRng } from '@/engine/rng';
import { generateCubePool, getBotPick, createBotProfiles, type DraftSeat } from '@/engine/draft';
import { replayDraft, seatIdFor, type HumanPicks } from '@/engine/draftReplay';
import type { DraftPickRecord } from '@/engine/deckbuilder';
import { CUBE_SEATS, CUBE_PACKS, CUBE_PLAYER_CARDS_PER_PACK } from '@/engine/balance';
import { loadPlayers, PLAYS } from './helpers';

const PICKS_PER_PACK = CUBE_PLAYER_CARDS_PER_PACK + 1; // 8
const TOTAL_PICKS = CUBE_PACKS * PICKS_PER_PACK; // 24

type PackCard = DraftSeat['currentPack'][number];

interface ReferenceResult {
  seats: DraftSeat[];
  pickLog: DraftPickRecord[];
  humanPicks: HumanPicks;
  humanAutoPicks: Record<string, number[]>;
}

/** Headless reference simulator — see file header. Mirrors `applyPick`'s pick-record
 *  shape, pass direction (pack 2 right, else left) and pack-boundary dealing exactly. */
function runReference(seed: number, humanSeatIds: string[]): ReferenceResult {
  const rng = createRng(seed);
  const allPacks = generateCubePool(loadPlayers(), PLAYS, rng);
  const botProfiles = createBotProfiles(rng);
  // A separate seeded stream for the "human": deterministic, but not derived from the
  // draft's own rng (a real human isn't part of the cube-generation randomness either).
  const chooserRng = createRng((seed ^ 0x9e3779b9) >>> 0);

  const seats: DraftSeat[] = [];
  for (let i = 0; i < CUBE_SEATS; i++) {
    const id = seatIdFor(i, humanSeatIds);
    const isHuman = humanSeatIds.includes(id);
    seats.push({
      id,
      isBot: !isHuman,
      botProfile: i === 0 ? undefined : botProfiles[i - 1],
      drafted: [],
      currentPack: allPacks[i] ?? [],
    });
  }

  const pickLog: DraftPickRecord[] = [];
  const humanPicks: HumanPicks = Object.fromEntries(humanSeatIds.map((id) => [id, []]));
  const humanAutoPicks: Record<string, number[]> = Object.fromEntries(humanSeatIds.map((id) => [id, []]));

  let packNumber = 1;
  let pickNumber = 1;

  for (let overall = 1; overall <= TOTAL_PICKS; overall++) {
    const records: DraftPickRecord[] = [];

    // 1. Human picks, seat-index order.
    for (let i = 0; i < CUBE_SEATS; i++) {
      const seat = seats[i];
      if (!humanSeatIds.includes(seat.id)) continue;
      const packSnapshot = seat.currentPack.map((c) => c.id);
      const chosenIdx = Math.floor(chooserRng.next() * seat.currentPack.length);
      const card = seat.currentPack.splice(chosenIdx, 1)[0];
      seat.drafted.push(card);
      const idxInHumanPicks = humanPicks[seat.id].length;
      const autoPicked = idxInHumanPicks % 7 === 6; // exercise the autoPicked flag periodically
      humanPicks[seat.id].push(card.id);
      if (autoPicked) humanAutoPicks[seat.id].push(idxInHumanPicks);
      records.push({
        packNumber,
        pickNumber,
        overallPick: overall,
        seatId: seat.id,
        packContents: packSnapshot,
        pickedCardId: card.id,
        ...(autoPicked ? { autoPicked: true } : {}),
      });
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

    // 3. Pass packs.
    const direction = packNumber === 2 ? 1 : -1;
    const rotated: PackCard[][] = new Array(CUBE_SEATS);
    for (let i = 0; i < CUBE_SEATS; i++) {
      let target = (i + direction) % CUBE_SEATS;
      if (target < 0) target += CUBE_SEATS;
      rotated[target] = seats[i].currentPack;
    }
    for (let i = 0; i < CUBE_SEATS; i++) seats[i].currentPack = rotated[i];

    // 4. Advance counters / deal at a boundary.
    pickNumber += 1;
    if (pickNumber > PICKS_PER_PACK) {
      pickNumber = 1;
      packNumber += 1;
      if (packNumber <= CUBE_PACKS) {
        const packOffset = (packNumber - 1) * CUBE_SEATS;
        for (let i = 0; i < CUBE_SEATS; i++) seats[i].currentPack = allPacks[packOffset + i] ?? [];
      }
    }
  }

  return { seats, pickLog, humanPicks, humanAutoPicks };
}

function sortedIds(cards: PackCard[]): string[] {
  return cards.map((c) => c.id).sort();
}

describe('replayDraft (D6 equivalence)', () => {
  it('matches the reference simulator over 200 seeded solo drafts', () => {
    for (let seed = 0; seed < 200; seed++) {
      const reference = runReference(seed, ['human-0']);
      const replay = replayDraft(seed, reference.humanPicks, loadPlayers(), PLAYS, {
        autoPicked: reference.humanAutoPicks,
      });

      expect(replay.phase).toBe('complete');
      expect(replay.awaiting).toEqual([]);
      expect(replay.packNumber).toBe(4);
      expect(replay.pickNumber).toBe(1);
      expect(replay.overallPick).toBe(TOTAL_PICKS + 1);
      expect(replay.pickLog).toEqual(reference.pickLog);
      expect(replay.seats.map((s) => s.id)).toEqual(reference.seats.map((s) => s.id));
      for (let i = 0; i < CUBE_SEATS; i++) {
        expect(sortedIds(replay.seats[i].drafted)).toEqual(sortedIds(reference.seats[i].drafted));
      }
    }
  }, 60_000);

  it('matches the reference simulator with two human seats (pvp_draft shape)', () => {
    const humanSeatIds = ['human-0', 'human-4'];
    for (const seed of [1, 42, 999]) {
      const reference = runReference(seed, humanSeatIds);
      const replay = replayDraft(seed, reference.humanPicks, loadPlayers(), PLAYS, {
        autoPicked: reference.humanAutoPicks,
      });

      expect(replay.phase).toBe('complete');
      expect(replay.pickLog).toEqual(reference.pickLog);
      for (let i = 0; i < CUBE_SEATS; i++) {
        expect(sortedIds(replay.seats[i].drafted)).toEqual(sortedIds(reference.seats[i].drafted));
        expect(replay.seats[i].isBot).toBe(reference.seats[i].isBot);
      }
    }
  });

  it('reports the awaiting seat and correct pack contents over 50 random truncation points', () => {
    const seed = 7;
    const reference = runReference(seed, ['human-0']);
    const humanPickLog = reference.pickLog.filter((r) => r.seatId === 'human-0').sort((a, b) => a.overallPick - b.overallPick);
    expect(humanPickLog.length).toBe(TOTAL_PICKS);

    const rng = createRng(31337);
    for (let t = 0; t < 50; t++) {
      const k = Math.floor(rng.next() * (TOTAL_PICKS + 1)); // 0..24 inclusive
      const truncated: HumanPicks = { 'human-0': reference.humanPicks['human-0'].slice(0, k) };
      const replay = replayDraft(seed, truncated, loadPlayers(), PLAYS, { autoPicked: reference.humanAutoPicks });

      if (k === TOTAL_PICKS) {
        expect(replay.phase).toBe('complete');
        expect(replay.awaiting).toEqual([]);
      } else {
        expect(replay.phase).toBe('drafting');
        expect(replay.awaiting).toEqual(['human-0']);
        const humanSeat = replay.seats.find((s) => s.id === 'human-0')!;
        expect(sortedIds(humanSeat.currentPack)).toEqual([...humanPickLog[k].packContents].sort());
        // Every pick already supplied replayed identically to the reference.
        expect(replay.pickLog).toEqual(reference.pickLog.filter((r) => r.overallPick <= k));
      }
    }
  });

  it('throws when a stored pick is not in the seat it was recorded for', () => {
    const seed = 123;
    const reference = runReference(seed, ['human-0']);
    const corrupted: HumanPicks = { 'human-0': [...reference.humanPicks['human-0']] };
    corrupted['human-0'][5] = 'not-a-real-card-id';

    expect(() => replayDraft(seed, corrupted, loadPlayers(), PLAYS)).toThrow(/seat human-0 pick 5/);
  });
});
