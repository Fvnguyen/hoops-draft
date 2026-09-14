import { describe, it, expect } from 'vitest';
import { createSeason, playNextGame, recomputeStandingsFromSchedule } from '@/engine/season';
import type { DraftPickRecord, DraftSession } from '@/engine/deckbuilder';
import { mergeDraftSession, mergeSeason, mergeRoster } from '@/storage/merge';
import { loadPlayers, PLAYS, runHeadlessDraft } from '../unit/helpers';
import { makeDraftSession, makeSavedRoster } from './fixtures';

function pick(overallPick: number, pickedCardId: string, seatId = 'human-0'): DraftPickRecord {
  return { packNumber: 1, pickNumber: overallPick, overallPick, seatId, packContents: [pickedCardId], pickedCardId };
}

describe('mergeDraftSession', () => {
  it('takes the longer pickLog when the shorter is a prefix of it (resumed on device B)', () => {
    const local = makeDraftSession({ pickLog: [pick(1, 'a'), pick(2, 'b')] });
    const remote = makeDraftSession({ id: local.id, pickLog: [pick(1, 'a'), pick(2, 'b'), pick(3, 'c')] });

    const { merged, conflict } = mergeDraftSession(local, remote);
    expect(conflict).toBe(false);
    expect(merged.pickLog).toHaveLength(3);
    expect(merged).toBe(remote);
  });

  it('prefers local when both sides have equal-length matching logs', () => {
    const log = [pick(1, 'a')];
    const local = makeDraftSession({ pickLog: [...log] });
    const remote = makeDraftSession({ id: local.id, pickLog: [...log] });

    const { merged, conflict } = mergeDraftSession(local, remote);
    expect(conflict).toBe(false);
    expect(merged).toBe(local);
  });

  it('flags a conflict when the logs diverge at the same position', () => {
    const local = makeDraftSession({ pickLog: [pick(1, 'a'), pick(2, 'b')] });
    const remote = makeDraftSession({ id: local.id, pickLog: [pick(1, 'a'), pick(2, 'x')] });

    const { conflict } = mergeDraftSession(local, remote);
    expect(conflict).toBe(true);
  });
});

describe('mergeSeason', () => {
  function makeSession(): DraftSession {
    const players = loadPlayers();
    const seats = runHeadlessDraft(players, PLAYS);
    return { id: 'test-session', timestamp: new Date().toISOString(), seats, pickLog: [] };
  }

  it('unions monotonic per-entry progress and recomputes standings from the merged schedule', () => {
    const session = makeSession();
    let full = createSeason(session, 'test-roster');
    for (let i = 0; i < 3; i++) full = playNextGame(full, session)!.season;

    // local only has game 0 played, remote has games 0-2 (a second device played ahead).
    const local = { ...full, schedule: full.schedule.map((e, i) => (i === 0 ? e : { ...e, played: false, matchups: e.matchups.map((m) => ({ ...m, result: undefined })) })), currentGame: 1 };
    const remote = full;

    const { merged, conflict } = mergeSeason(local, remote, session);
    expect(conflict).toBe(false);
    expect(merged.currentGame).toBe(3);
    expect(merged.schedule.filter((e) => e.played)).toHaveLength(3);

    const expectedStandings = recomputeStandingsFromSchedule(merged.schedule, session, merged.humanTeam.name);
    expect(merged.standings).toEqual(expectedStandings);
  });

  it('takes currentGame as the max of both sides even when schedules already match', () => {
    const session = makeSession();
    let full = createSeason(session, 'test-roster');
    full = playNextGame(full, session)!.season;

    const { merged } = mergeSeason(full, { ...full, currentGame: 0 }, session);
    expect(merged.currentGame).toBe(1);
  });
});

describe('mergeRoster', () => {
  it('always flags a conflict — no auto-merge for depth-chart edits', () => {
    const local = makeSavedRoster({ activePlays: ['play-a'] });
    const remote = makeSavedRoster({ id: local.id, activePlays: ['play-b'] });

    const { conflict } = mergeRoster(local, remote);
    expect(conflict).toBe(true);
  });
});
