/**
 * pvp_draft T2: two-human replay sequencing, `pvpAutopick` and `validateReplay`.
 *
 * The server rule (from `frontend/supabase/migrations/202609220001_matches.sql` +
 * `202609220002_match_void.sql`) is: a seat may append pick index i only if
 * i === len(own picks) and len(own picks) <= len(other's picks) — nobody runs more than
 * one pick ahead. This file models that rule directly over a shared "row" (the two
 * humans' pick lists) and drives `replayDraft` the way both clients would: replay the row
 * as it stands after every single append.
 */
import { describe, it, expect } from 'vitest';
import { createRng } from '@/engine/rng';
import { replayDraft, pvpAutopick, validateReplay, type HumanPicks, type DraftState } from '@/engine/draftReplay';
import { CUBE_PACKS, CUBE_PLAYER_CARDS_PER_PACK } from '@/engine/balance';
import { loadPlayers, PLAYS } from './helpers';

const PICKS_PER_PACK = CUBE_PLAYER_CARDS_PER_PACK + 1; // 8
const TOTAL_PICKS = CUBE_PACKS * PICKS_PER_PACK; // 24
const HOST = 'human-0';
const GUEST = 'human-4';

const players = loadPlayers();

/** Seats among [HOST, GUEST] allowed to append the next pick, per the server rule. */
function eligibleSeats(row: HumanPicks): string[] {
  const hostLen = row[HOST].length;
  const guestLen = row[GUEST].length;
  const out: string[] = [];
  if (hostLen < TOTAL_PICKS && hostLen <= guestLen) out.push(HOST);
  if (guestLen < TOTAL_PICKS && guestLen <= hostLen) out.push(GUEST);
  return out;
}

/** The seats the row's next overall pick index is still owed by (same rule, restated as
 *  "whoever is at the current minimum length"), used as the independent expectation for
 *  `state.awaiting`. */
function expectedAwaiting(row: HumanPicks): string[] {
  const hostLen = row[HOST].length;
  const guestLen = row[GUEST].length;
  if (hostLen >= TOTAL_PICKS && guestLen >= TOTAL_PICKS) return [];
  const completed = Math.min(hostLen, guestLen);
  const out: string[] = [];
  if (hostLen === completed) out.push(HOST);
  if (guestLen === completed) out.push(GUEST);
  return out;
}

describe('pvp two-human sequencing (property test, 200 seeded interleavings)', () => {
  it('both clients converge, awaiting is exact, and the draft completes at 24+24', () => {
    for (let seed = 0; seed < 200; seed++) {
      const interleave = createRng((seed ^ 0x51ed270b) >>> 0);
      const chooser = createRng((seed ^ 0x2545f491) >>> 0);
      const row: HumanPicks = { [HOST]: [], [GUEST]: [] };

      let guard = 0;
      while (row[HOST].length < TOTAL_PICKS || row[GUEST].length < TOTAL_PICKS) {
        if (++guard > 10_000) throw new Error(`seed ${seed}: interleave loop did not terminate`);

        // Two "clients" replay the row exactly as it stands right now; they must agree.
        const hostClientState = replayDraft(seed, row, players, PLAYS);
        const guestClientState = replayDraft(seed, { [HOST]: [...row[HOST]], [GUEST]: [...row[GUEST]] }, players, PLAYS);
        expect(hostClientState).toEqual(guestClientState);

        const state = hostClientState;
        expect([...state.awaiting].sort()).toEqual(expectedAwaiting(row).sort());
        expect([...state.awaiting].sort()).toEqual(eligibleSeats(row).sort());

        if (state.phase === 'complete') break; // both reached 24; loop condition will exit next check

        const candidates = state.awaiting;
        const seatId = candidates[Math.floor(interleave.next() * candidates.length)];
        const seat = state.seats.find((s) => s.id === seatId)!;
        expect(seat.currentPack.length).toBeGreaterThan(0);

        // Mix a seeded random pick with pvpAutopick.
        const useAutopick = chooser.next() < 0.5;
        const cardId = useAutopick
          ? pvpAutopick(state, seatId)!
          : seat.currentPack[Math.floor(chooser.next() * seat.currentPack.length)].id;
        expect(cardId).toBeTruthy();
        expect(seat.currentPack.some((c) => c.id === cardId)).toBe(true);

        row[seatId].push(cardId);
      }

      expect(row[HOST].length).toBe(TOTAL_PICKS);
      expect(row[GUEST].length).toBe(TOTAL_PICKS);

      const finalState = replayDraft(seed, row, players, PLAYS);
      expect(finalState.phase).toBe('complete');
      expect(finalState.awaiting).toEqual([]);
      const hostSeat = finalState.seats.find((s) => s.id === HOST)!;
      const guestSeat = finalState.seats.find((s) => s.id === GUEST)!;
      expect(hostSeat.drafted.length).toBe(TOTAL_PICKS);
      expect(guestSeat.drafted.length).toBe(TOTAL_PICKS);

      // Replaying the final pick lists "in one go" (fresh object, built from the same
      // values) reproduces the exact same state.
      const oneGoRow: HumanPicks = { [HOST]: [...row[HOST]], [GUEST]: [...row[GUEST]] };
      const oneGoState = replayDraft(seed, oneGoRow, players, PLAYS);
      expect(oneGoState).toEqual(finalState);
    }
  }, 120_000);
});

describe('pvpAutopick', () => {
  const seed = 55;

  function partialRow(): HumanPicks {
    // Host has made 3 picks, guest has made 3 (equal), so both are awaiting pick index 3
    // (0-based) next; then advance guest one further? No — server rule forbids guest
    // running ahead unless host is behind. So build: host 3, guest 3 -> both awaiting.
    return { [HOST]: [], [GUEST]: [] };
  }

  function buildAwaitingState(): { state: DraftState; row: HumanPicks } {
    const row = partialRow();
    // Drive 3 rounds forward using pvpAutopick itself so we land on a real mid-draft state
    // with both seats in `awaiting`.
    for (let round = 0; round < 3; round++) {
      for (const seatId of [HOST, GUEST]) {
        const state = replayDraft(seed, row, players, PLAYS);
        const card = pvpAutopick(state, seatId);
        expect(card).toBeTruthy();
        row[seatId].push(card!);
      }
    }
    const state = replayDraft(seed, row, players, PLAYS);
    return { state, row };
  }

  it('is deterministic across repeated calls on the same state', () => {
    const { state } = buildAwaitingState();
    const first = pvpAutopick(state, HOST);
    const second = pvpAutopick(state, HOST);
    const third = pvpAutopick(state, HOST);
    expect(first).toBeTruthy();
    expect(first).toBe(second);
    expect(second).toBe(third);
  });

  it('is deterministic across two independently built states', () => {
    const { row } = buildAwaitingState();
    const stateA = replayDraft(seed, { [HOST]: [...row[HOST]], [GUEST]: [...row[GUEST]] }, players, PLAYS);
    const stateB = replayDraft(seed, { [HOST]: [...row[HOST]], [GUEST]: [...row[GUEST]] }, players, PLAYS);
    expect(pvpAutopick(stateA, HOST)).toBe(pvpAutopick(stateB, HOST));
    expect(pvpAutopick(stateA, GUEST)).toBe(pvpAutopick(stateB, GUEST));
  });

  it('returns a card that is in the seat\'s current pack', () => {
    const { state } = buildAwaitingState();
    for (const seatId of [HOST, GUEST]) {
      const card = pvpAutopick(state, seatId);
      const seat = state.seats.find((s) => s.id === seatId)!;
      expect(seat.currentPack.some((c) => c.id === card)).toBe(true);
    }
  });

  it('returns null for a seat not in awaiting', () => {
    const { row } = buildAwaitingState();
    // Advance HOST one pick ahead of GUEST so GUEST alone is awaiting.
    const state1 = replayDraft(seed, row, players, PLAYS);
    const hostCard = pvpAutopick(state1, HOST)!;
    row[HOST].push(hostCard);
    const state2 = replayDraft(seed, row, players, PLAYS);
    expect(state2.awaiting).toEqual([GUEST]);
    expect(pvpAutopick(state2, HOST)).toBeNull();
    // An unrelated / bot seat id is never in awaiting either.
    expect(pvpAutopick(state2, 'bot-1')).toBeNull();
    expect(pvpAutopick(state2, 'nonexistent-seat')).toBeNull();
  });

  it('returns null once the draft is complete', () => {
    const row: HumanPicks = { [HOST]: [], [GUEST]: [] };
    let state = replayDraft(seed, row, players, PLAYS);
    while (state.phase !== 'complete') {
      const seatId = state.awaiting[0];
      const card = pvpAutopick(state, seatId)!;
      row[seatId].push(card);
      state = replayDraft(seed, row, players, PLAYS);
    }
    expect(pvpAutopick(state, HOST)).toBeNull();
    expect(pvpAutopick(state, GUEST)).toBeNull();
  });
});

describe('validateReplay', () => {
  const seed = 77;

  function playToCompletion(): { row: HumanPicks; autoPicked: Record<string, number[]> } {
    const row: HumanPicks = { [HOST]: [], [GUEST]: [] };
    const autoPicked: Record<string, number[]> = { [HOST]: [], [GUEST]: [] };
    const chooser = createRng(9001);
    let state = replayDraft(seed, row, players, PLAYS);
    while (state.phase !== 'complete') {
      const seatId = state.awaiting[Math.floor(chooser.next() * state.awaiting.length)];
      const seat = state.seats.find((s) => s.id === seatId)!;
      const useAutopick = chooser.next() < 0.5;
      const card = useAutopick
        ? pvpAutopick(state, seatId)!
        : seat.currentPack[Math.floor(chooser.next() * seat.currentPack.length)].id;
      if (useAutopick) autoPicked[seatId].push(row[seatId].length);
      row[seatId].push(card);
      state = replayDraft(seed, row, players, PLAYS, { autoPicked });
    }
    return { row, autoPicked };
  }

  it('returns ok:true for a fully legal pick list', () => {
    const { row, autoPicked } = playToCompletion();
    const result = validateReplay(seed, row, players, PLAYS, { autoPicked });
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.state.phase).toBe('complete');
    }
  });

  it('marks autoPicked:true on exactly the recorded indexes, for both seats', () => {
    const { row, autoPicked } = playToCompletion();
    // Only run this assertion when the run actually exercised some autopicks (with a
    // fixed seed it deterministically does, but guard rather than assume).
    const totalAuto = autoPicked[HOST].length + autoPicked[GUEST].length;
    expect(totalAuto).toBeGreaterThan(0);

    const result = validateReplay(seed, row, players, PLAYS, { autoPicked });
    expect(result.ok).toBe(true);
    if (!result.ok) return;

    for (const seatId of [HOST, GUEST]) {
      const seatRecords = result.state.pickLog
        .filter((r) => r.seatId === seatId)
        .sort((a, b) => a.overallPick - b.overallPick);
      const expectedSet = new Set(autoPicked[seatId]);
      seatRecords.forEach((rec, idx) => {
        if (expectedSet.has(idx)) {
          expect(rec.autoPicked).toBe(true);
        } else {
          expect(rec.autoPicked).toBeUndefined();
        }
      });
    }
  });

  it('returns ok:false naming the seat when a card is foreign to its own pack history', () => {
    const { row } = playToCompletion();
    const corrupted: HumanPicks = { [HOST]: [...row[HOST]], [GUEST]: [...row[GUEST]] };
    // Swap in a card id that GUEST drafted at the same index — legal for GUEST's pack at
    // that point in the draft, never legal for HOST's.
    corrupted[HOST][10] = row[GUEST][10];

    const result = validateReplay(seed, corrupted, players, PLAYS);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.reason).toMatch(new RegExp(`seat ${HOST}`));
    }
  });

  it('returns ok:false naming the seat for a wholly made-up card id', () => {
    const { row } = playToCompletion();
    const corrupted: HumanPicks = { [HOST]: [...row[HOST]], [GUEST]: [...row[GUEST]] };
    corrupted[GUEST][3] = 'not-a-real-card-id';

    const result = validateReplay(seed, corrupted, players, PLAYS);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.reason).toMatch(new RegExp(`seat ${GUEST}`));
    }
  });
});
