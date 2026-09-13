/**
 * Tests for the Dexie schema-version upgrade (D3/D8 in
 * docs/plans/plan_data_storage_2026-09-13.md): `normalizeSeason` and
 * `normalizeBuiltRoster` becoming one-time `.upgrade()` steps instead of
 * load-time calls, the new `storageMeta` singleton row, and the D8
 * legacy-game-result handling.
 *
 * Fixtures are written through a Dexie instance that only knows about
 * version 1 of the schema (the exact shape a real browser install would
 * have before this plan), mimicking "a fixture in the old pre-migration
 * shape written directly into a fake IndexedDB instance". The real
 * `MagicBallDB` (which declares versions 1 and 2) is then opened against the
 * same database name, which makes Dexie run the version-2 `.upgrade()` step
 * exactly as it would in a user's browser.
 */
import 'fake-indexeddb/auto';
import Dexie, { type Table } from 'dexie';
import { describe, expect, it } from 'vitest';
import { MagicBallDB, SCHEMA_VERSION } from '@/storage/indexedDb';
import { CURRENT_CARD_SET_VERSION, type StorageMeta } from '@/storage/types';
import type { DraftSession } from '@/engine/deckbuilder';
import type { Season } from '@/engine/season';
import { BALANCE_VERSION } from '@/engine/balance';

let dbCounter = 0;
function nextDbName(): string {
  dbCounter += 1;
  return `migration-test-${dbCounter}`;
}

interface LegacyMetaRow {
  key: string;
  value: string;
}

/** The exact version-1 schema, so fixtures land in the DB the way a pre-plan browser would have written them. */
class LegacyDB extends Dexie {
  draftSessions!: Table<DraftSession, string>;
  rosters!: Table<unknown, string>;
  seasons!: Table<Season, string>;
  meta!: Table<LegacyMetaRow, string>;

  constructor(name: string) {
    super(name);
    this.version(1).stores({
      draftSessions: 'id, timestamp',
      rosters: 'id, sessionId',
      seasons: 'id, rosterId, sessionId',
      meta: 'key',
    });
  }
}

function legacyBuiltRoster() {
  // BuiltRoster v1: no `version`, no `playAssignments`, no `archetypes`.
  return {
    depthChart: { PG: ['p1'], SG: [], SF: [], PF: [], C: [] },
    activePlays: ['play1'],
    gLeaguePlayers: [],
    gLeaguePlays: [],
  };
}

/** A full old-shape GameTheater-like object, standing in for the pre-D1 fat result. */
function fatTheater(seed?: number) {
  const base: Record<string, unknown> = {
    possessions: [{ q: 1 }, { q: 2 }],
    substitutions: [],
    quarterSummaries: [{ q: 1 }],
    finalScore: [88, 81],
    boxScore: { home: [], away: [] },
    isOvertime: false,
    overtimePeriods: 0,
    playbook: { home: {}, away: {} },
  };
  if (seed !== undefined) base.seed = seed;
  return base;
}

describe('MagicBallDB schema upgrade (v1 -> v2)', () => {
  it('creates the storageMeta singleton row for a brand-new database', async () => {
    const db = new MagicBallDB(nextDbName());
    await db.open();

    const meta = await db.storageMeta.get('meta');
    expect(meta).toEqual<StorageMeta>({
      id: 'meta',
      schemaVersion: SCHEMA_VERSION,
      cardSetVersion: CURRENT_CARD_SET_VERSION,
    });

    db.close();
  });

  it('stamps storageMeta on an existing (pre-meta-table) database and preserves an existing cardSetVersion', async () => {
    const name = nextDbName();
    const legacy = new LegacyDB(name);
    await legacy.open();
    await legacy.meta.put({ key: 'someOtherFlag', value: 'x' });
    legacy.close();

    const db = new MagicBallDB(name);
    await db.open();

    const meta = await db.storageMeta.get('meta');
    expect(meta).toEqual<StorageMeta>({
      id: 'meta',
      schemaVersion: SCHEMA_VERSION,
      cardSetVersion: CURRENT_CARD_SET_VERSION,
    });
    // The old key/value flags table survives the upgrade untouched.
    expect(await db.meta.get('someOtherFlag')).toEqual({ key: 'someOtherFlag', value: 'x' });

    db.close();
  });

  it('normalizes a v1 draft session (BuiltRoster) exactly once, at open', async () => {
    const name = nextDbName();
    const legacy = new LegacyDB(name);
    await legacy.open();
    await legacy.draftSessions.put({
      id: 'session-1',
      timestamp: new Date().toISOString(),
      seats: [
        { id: 'human-0', isBot: false, drafted: [], builtRoster: legacyBuiltRoster() },
        { id: 'bot-1', isBot: true, drafted: [], builtRoster: legacyBuiltRoster() },
      ],
      pickLog: [],
    } as unknown as DraftSession);
    legacy.close();

    const db = new MagicBallDB(name);
    await db.open();

    const session = await db.draftSessions.get('session-1');
    expect(session).not.toBeUndefined();
    for (const seat of session!.seats) {
      expect(seat.builtRoster.version).toBe(2);
      expect(Array.isArray(seat.builtRoster.playAssignments)).toBe(true);
      expect(seat.builtRoster.archetypes).toEqual({});
    }

    db.close();
  });

  it('upgrades a legacy per-game season schedule to game-day matchups', async () => {
    const name = nextDbName();
    const legacy = new LegacyDB(name);
    await legacy.open();
    await legacy.seasons.put({
      id: 'season-legacy-schedule',
      sessionId: 'sess-1',
      rosterId: 'roster-1',
      timestamp: new Date().toISOString(),
      schedule: [
        { gameIndex: 0, opponentSeatIndex: 1, played: true, seed: 55, result: fatTheater(55) },
        { gameIndex: 1, opponentSeatIndex: 2, played: false },
      ],
      standings: [],
      currentGame: 1,
      humanTeam: {},
      seed: 1,
    } as unknown as Season);
    legacy.close();

    const db = new MagicBallDB(name);
    await db.open();

    const season = await db.seasons.get('season-legacy-schedule');
    expect(season).not.toBeUndefined();
    expect(Array.isArray(season!.schedule[0].matchups)).toBe(true);
    const played = season!.schedule[0].matchups[0];
    expect(played).toMatchObject({ homeSeatIndex: 0, awaySeatIndex: 1 });
    // D1: seeded games are reduced to the slim shape, not left as a full theater.
    const playedResult = played.result as unknown as Record<string, unknown>;
    expect(playedResult.seed).toBe(55);
    expect(playedResult.possessions).toBeUndefined();
    expect(playedResult.legacyTheater).toBeUndefined();

    expect(Array.isArray(season!.schedule[1].matchups)).toBe(true);

    db.close();
  });

  it('converts a played game with a seed to the slim D1 result shape', async () => {
    const name = nextDbName();
    const legacy = new LegacyDB(name);
    await legacy.open();
    await legacy.seasons.put({
      id: 'season-d1',
      sessionId: 'sess-1',
      rosterId: 'roster-1',
      timestamp: new Date().toISOString(),
      schedule: [
        {
          gameIndex: 0,
          played: true,
          matchups: [
            { homeSeatIndex: 0, awaySeatIndex: 1, seed: 123, result: fatTheater(123) },
          ],
        },
      ],
      standings: [],
      currentGame: 1,
      humanTeam: {},
      seed: 1,
    } as unknown as Season);
    legacy.close();

    const db = new MagicBallDB(name);
    await db.open();

    const season = await db.seasons.get('season-d1');
    const result = season!.schedule[0].matchups[0].result as unknown as Record<string, unknown>;
    expect(result.seed).toBe(123);
    expect(result.balanceVersion).toBe(BALANCE_VERSION);
    expect(result.finalScore).toEqual([88, 81]);
    expect(result.boxScore).toEqual({ home: [], away: [] });
    expect(result.possessions).toBeUndefined();
    expect(result.quarterSummaries).toBeUndefined();
    expect(result.legacyTheater).toBeUndefined();

    db.close();
  });

  it('keeps a played game with no seed at all as a read-only legacyTheater (D8)', async () => {
    const name = nextDbName();
    const legacy = new LegacyDB(name);
    await legacy.open();
    await legacy.seasons.put({
      id: 'season-no-seed',
      sessionId: 'sess-1',
      rosterId: 'roster-1',
      timestamp: new Date().toISOString(),
      schedule: [
        {
          gameIndex: 0,
          played: true,
          matchups: [
            { homeSeatIndex: 0, awaySeatIndex: 1, result: fatTheater(undefined) },
          ],
        },
      ],
      standings: [],
      currentGame: 1,
      humanTeam: {},
      seed: 1,
    } as unknown as Season);
    legacy.close();

    const db = new MagicBallDB(name);
    await db.open();

    const season = await db.seasons.get('season-no-seed');
    const result = season!.schedule[0].matchups[0].result as unknown as Record<string, unknown>;
    expect(result.seed).toBeUndefined();
    expect(result.balanceVersion).toBeUndefined();
    expect(result.legacyTheater).toBeDefined();
    expect((result.legacyTheater as Record<string, unknown>).possessions).toBeDefined();
    // Still exposes the box score/final score at the top level for a read-only view.
    expect(result.finalScore).toEqual([88, 81]);

    db.close();
  });

  it('is idempotent: re-opening an already-upgraded database a second time does not re-wrap legacyTheater or change storageMeta', async () => {
    const name = nextDbName();

    // First open: a real v1 -> v2 upgrade, exactly like the earlier tests.
    const legacy = new LegacyDB(name);
    await legacy.open();
    await legacy.seasons.put({
      id: 'season-no-seed',
      sessionId: 'sess-1',
      rosterId: 'roster-1',
      timestamp: new Date().toISOString(),
      schedule: [
        {
          gameIndex: 0,
          played: true,
          matchups: [{ homeSeatIndex: 0, awaySeatIndex: 1, result: fatTheater(undefined) }],
        },
      ],
      standings: [],
      currentGame: 1,
      humanTeam: {},
      seed: 1,
    } as unknown as Season);
    legacy.close();

    const first = new MagicBallDB(name);
    await first.open();
    const afterFirstOpen = await first.seasons.get('season-no-seed');
    const firstResult = afterFirstOpen!.schedule[0].matchups[0].result as unknown as Record<string, unknown>;
    expect(firstResult.legacyTheater).toBeDefined();
    const metaAfterFirstOpen = await first.storageMeta.get('meta');
    first.close();

    // Second open: already at SCHEMA_VERSION, so Dexie's `.upgrade()` does not
    // run again — the already-migrated data and meta row must be unchanged.
    const second = new MagicBallDB(name);
    await second.open();
    const afterSecondOpen = await second.seasons.get('season-no-seed');
    const secondResult = afterSecondOpen!.schedule[0].matchups[0].result as unknown as Record<string, unknown>;
    expect(secondResult).toEqual(firstResult);
    expect(await second.storageMeta.get('meta')).toEqual(metaAfterFirstOpen);

    second.close();
  });
});
