import { describe, it, expect } from 'vitest';
import { createSeason, playNextGame, recomputeStandingsFromSchedule } from '@/engine/season';
import type { DraftPickRecord, DraftSession } from '@/engine/deckbuilder';
import { mergeChallengeRun, mergeDraftSession, mergeSeason, mergeRoster } from '@/storage/merge';
import { loadPlayers, PLAYS, runHeadlessDraft } from '../unit/helpers';
import { makeChallengeRun, makeDraftSession, makeSavedRoster } from './fixtures';

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
  const at = (iso: string) => iso;

  it('takes the newer edit and never prompts', () => {
    const local = makeSavedRoster({ activePlays: ['play-a'], timestamp: at('2026-09-18T10:00:00.000Z') });
    const remote = makeSavedRoster({ id: local.id, activePlays: ['play-b'], timestamp: at('2026-09-18T10:30:00.000Z') });

    const { merged, conflict } = mergeRoster(local, remote);
    expect(conflict).toBe(false);
    expect(merged.activePlays).toEqual(['play-b']);
  });

  it('keeps local when local is the newer edit', () => {
    const local = makeSavedRoster({ activePlays: ['play-a'], timestamp: at('2026-09-18T11:00:00.000Z') });
    const remote = makeSavedRoster({ id: local.id, activePlays: ['play-b'], timestamp: at('2026-09-18T10:30:00.000Z') });

    expect(mergeRoster(local, remote).merged.activePlays).toEqual(['play-a']);
  });

  it('never splices the two arrangements together', () => {
    // A lineup is atomic: the result must be exactly one side, not a union that neither
    // device chose (which could put a player in two slots).
    const local = makeSavedRoster({
      activePlays: ['play-a'], depthChartOrder: { PG: ['p1'], SG: ['p2'] }, timestamp: at('2026-09-18T10:00:00.000Z'),
    });
    const remote = makeSavedRoster({
      id: local.id, activePlays: ['play-b'], depthChartOrder: { PG: ['p3'], SG: ['p4'] }, timestamp: at('2026-09-18T10:30:00.000Z'),
    });

    const { merged } = mergeRoster(local, remote);
    expect(merged.depthChartOrder).toEqual(remote.depthChartOrder);
    expect(merged.activePlays).toEqual(remote.activePlays);
  });

  it('falls back to local rather than guessing when a timestamp is malformed', () => {
    const local = makeSavedRoster({ activePlays: ['play-a'], timestamp: at('2026-09-18T10:00:00.000Z') });
    const broken = makeSavedRoster({ id: local.id, activePlays: ['play-b'], timestamp: 'not a date' });

    expect(mergeRoster(local, broken).merged.activePlays).toEqual(['play-a']);
    expect(mergeRoster(local, broken).conflict).toBe(false);
  });

  it('is a no-op when both sides already agree', () => {
    const local = makeSavedRoster({ activePlays: ['play-a'], timestamp: at('2026-09-18T10:00:00.000Z') });
    const same = makeSavedRoster({ ...local });

    const { merged, conflict } = mergeRoster(local, same);
    expect(conflict).toBe(false);
    expect(merged.activePlays).toEqual(['play-a']);
  });
});

describe('mergeChallengeRun', () => {
  it('takes remote when it is further along the first -> break -> second -> done ladder', () => {
    const local = makeChallengeRun({ phase: 'first' });
    const remote = makeChallengeRun({ id: local.id, phase: 'break' });

    const { merged, conflict } = mergeChallengeRun(local, remote);
    expect(conflict).toBe(false);
    expect(merged).toBe(remote);
  });

  it('takes local when it is further along than remote', () => {
    const local = makeChallengeRun({ phase: 'done' });
    const remote = makeChallengeRun({ id: local.id, phase: 'second' });

    const { merged, conflict } = mergeChallengeRun(local, remote);
    expect(conflict).toBe(false);
    expect(merged).toBe(local);
  });

  it('keeps local on a tie (same phase both sides)', () => {
    const local = makeChallengeRun({ phase: 'second' });
    const remote = makeChallengeRun({ id: local.id, phase: 'second' });

    const { merged, conflict } = mergeChallengeRun(local, remote);
    expect(conflict).toBe(false);
    expect(merged).toBe(local);
  });

  it('never reports a conflict, even across the full ladder', () => {
    const phases = ['first', 'break', 'second', 'done'] as const;
    for (const a of phases) {
      for (const b of phases) {
        const local = makeChallengeRun({ phase: a });
        const remote = makeChallengeRun({ id: local.id, phase: b });
        expect(mergeChallengeRun(local, remote).conflict).toBe(false);
      }
    }
  });
});
