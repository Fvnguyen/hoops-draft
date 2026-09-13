import { describe, it, expect } from 'vitest';
import {
  buildExportBundle,
  mergeImportedData,
  isLikelyExportBundle,
  EXPORT_SCHEMA_VERSION,
  type ExportBundle,
} from '@/storage/exportImport';
import { MemoryGameStore } from '@/storage/memory';
import type { DraftSession } from '@/engine/deckbuilder';
import type { Season } from '@/engine/season';
import type { SavedRoster } from '@/storage/types';

// Minimal fixtures — only the fields exportImport.ts's merge logic reads
// (id, timestamp) matter for these tests; the rest are placeholders to
// satisfy the real DraftSession/Season/SavedRoster shapes.
function makeSession(id: string, timestamp: string): DraftSession {
  return { id, timestamp, seats: [], pickLog: [] };
}

function makeRoster(id: string, timestamp: string): SavedRoster {
  return {
    id,
    name: `Roster ${id}`,
    timestamp,
    draftedCards: [],
    zones: {},
    depthChartOrder: {},
    activePlays: [],
    sessionId: null,
  };
}

function makeSeason(id: string, timestamp: string): Season {
  return {
    id,
    sessionId: 'session-1',
    rosterId: 'roster-1',
    timestamp,
    schedule: [],
    standings: [],
    currentGame: 0,
    humanTeam: {} as Season['humanTeam'],
    seed: 1,
  };
}

function emptyBundle(overrides: Partial<ExportBundle> = {}): ExportBundle {
  return {
    schemaVersion: EXPORT_SCHEMA_VERSION,
    exportedAt: new Date().toISOString(),
    sessions: [],
    seasons: [],
    rosters: [],
    ...overrides,
  };
}

describe('exportImport', () => {
  describe('mergeImportedData', () => {
    it('adds imported records whose id does not exist locally', () => {
      const current = { sessions: [], seasons: [], rosters: [makeRoster('r1', '2026-01-01T00:00:00.000Z')] };
      const imported = emptyBundle({ rosters: [makeRoster('r2', '2026-01-02T00:00:00.000Z')] });

      const result = mergeImportedData(current, imported);

      expect(result.rosters.map((r) => r.id).sort()).toEqual(['r1', 'r2']);
      expect(result.summary.rosters).toEqual({ added: 1, updated: 0, skipped: 0 });
    });

    it('keeps the local record and skips the import when the local timestamp is newer', () => {
      const current = { sessions: [makeSession('s1', '2026-02-01T00:00:00.000Z')], seasons: [], rosters: [] };
      const imported = emptyBundle({ sessions: [makeSession('s1', '2026-01-01T00:00:00.000Z')] });

      const result = mergeImportedData(current, imported);

      expect(result.sessions).toHaveLength(1);
      expect(result.sessions[0].timestamp).toBe('2026-02-01T00:00:00.000Z');
      expect(result.summary.sessions).toEqual({ added: 0, updated: 0, skipped: 1 });
    });

    it('replaces the local record when the imported timestamp is newer', () => {
      const current = { sessions: [], seasons: [makeSeason('sea1', '2026-01-01T00:00:00.000Z')], rosters: [] };
      const imported = emptyBundle({ seasons: [makeSeason('sea1', '2026-03-01T00:00:00.000Z')] });

      const result = mergeImportedData(current, imported);

      expect(result.seasons).toHaveLength(1);
      expect(result.seasons[0].timestamp).toBe('2026-03-01T00:00:00.000Z');
      expect(result.summary.seasons).toEqual({ added: 0, updated: 1, skipped: 0 });
    });

    it('never deletes a local record absent from the imported bundle', () => {
      const current = {
        sessions: [],
        seasons: [],
        rosters: [makeRoster('local-only', '2026-01-01T00:00:00.000Z')],
      };
      const imported = emptyBundle({ rosters: [makeRoster('other', '2026-01-05T00:00:00.000Z')] });

      const result = mergeImportedData(current, imported);

      const ids = result.rosters.map((r) => r.id).sort();
      expect(ids).toEqual(['local-only', 'other']);
      expect(result.summary.rosters).toEqual({ added: 1, updated: 0, skipped: 0 });
    });

    it('handles all three collections independently in one call', () => {
      const current = {
        sessions: [makeSession('s1', '2026-01-01T00:00:00.000Z')],
        seasons: [makeSeason('sea1', '2026-01-01T00:00:00.000Z')],
        rosters: [makeRoster('r1', '2026-01-01T00:00:00.000Z')],
      };
      const imported = emptyBundle({
        sessions: [makeSession('s2', '2026-01-01T00:00:00.000Z')],
        seasons: [makeSeason('sea1', '2026-06-01T00:00:00.000Z')],
        rosters: [makeRoster('r1', '2020-01-01T00:00:00.000Z')],
      });

      const result = mergeImportedData(current, imported);

      expect(result.sessions.map((s) => s.id).sort()).toEqual(['s1', 's2']);
      expect(result.seasons[0].timestamp).toBe('2026-06-01T00:00:00.000Z');
      expect(result.rosters[0].timestamp).toBe('2026-01-01T00:00:00.000Z'); // older import, skipped
    });
  });

  describe('buildExportBundle', () => {
    it('wraps GameStore.exportAll() output with a schemaVersion', async () => {
      const store = new MemoryGameStore();
      await store.saveRoster(makeRoster('r1', '2026-01-01T00:00:00.000Z'));
      await store.saveDraftSession(makeSession('s1', '2026-01-01T00:00:00.000Z'));

      const bundle = await buildExportBundle(store);

      expect(bundle.schemaVersion).toBe(EXPORT_SCHEMA_VERSION);
      expect(bundle.rosters.map((r) => r.id)).toEqual(['r1']);
      expect(bundle.sessions.map((s) => s.id)).toEqual(['s1']);
      expect(typeof bundle.exportedAt).toBe('string');
    });
  });

  describe('isLikelyExportBundle', () => {
    it('accepts a well-formed bundle', () => {
      expect(isLikelyExportBundle(emptyBundle())).toBe(true);
    });

    it('rejects garbage input', () => {
      expect(isLikelyExportBundle(null)).toBe(false);
      expect(isLikelyExportBundle({})).toBe(false);
      expect(isLikelyExportBundle({ sessions: [], seasons: [] })).toBe(false); // missing rosters
      expect(isLikelyExportBundle('not an object')).toBe(false);
    });
  });
});
