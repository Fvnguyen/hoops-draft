/**
 * In-memory GameStore implementation.
 *
 * Used for SSR (there is no IndexedDB on the server) and for unit tests that
 * don't want to exercise the real Dexie/IndexedDB backend. Data does not
 * survive a page reload or process restart.
 */

import type { DraftSession } from '@/engine/deckbuilder';
import type { Season } from '@/engine/season';
import type { GameStore, SavedRoster } from './types';
import { safeParseDraftSession, safeParseSavedRoster, safeParseSeason } from './safeLoad';

export class MemoryGameStore implements GameStore {
  private sessions = new Map<string, DraftSession>();
  private rosters = new Map<string, SavedRoster>();
  private seasons = new Map<string, Season>();
  private meta = new Map<string, string>();

  /** Not part of GameStore — used by migrate.ts to record the one-time migration flag. */
  async getMeta(key: string): Promise<string | null> {
    return this.meta.get(key) ?? null;
  }

  async setMeta(key: string, value: string): Promise<void> {
    this.meta.set(key, value);
  }

  async listDraftSessions(): Promise<DraftSession[]> {
    return [...this.sessions.values()].map(safeParseDraftSession).filter((s): s is DraftSession => s !== null);
  }

  async getDraftSession(id: string): Promise<DraftSession | null> {
    const row = this.sessions.get(id) ?? null;
    return row ? safeParseDraftSession(row) : null;
  }

  async saveDraftSession(s: DraftSession): Promise<void> {
    this.sessions.set(s.id, s);
  }

  async deleteDraftSession(id: string): Promise<void> {
    this.sessions.delete(id);
  }

  async listRosters(): Promise<SavedRoster[]> {
    return [...this.rosters.values()].map(safeParseSavedRoster).filter((r): r is SavedRoster => r !== null);
  }

  async getRoster(id: string): Promise<SavedRoster | null> {
    const row = this.rosters.get(id) ?? null;
    return row ? safeParseSavedRoster(row) : null;
  }

  async saveRoster(r: SavedRoster): Promise<void> {
    this.rosters.set(r.id, r);
  }

  async deleteRoster(id: string): Promise<void> {
    this.rosters.delete(id);
  }

  async listSeasons(): Promise<Season[]> {
    return [...this.seasons.values()].map(safeParseSeason).filter((s): s is Season => s !== null);
  }

  async getSeason(id: string): Promise<Season | null> {
    const row = this.seasons.get(id) ?? null;
    return row ? safeParseSeason(row) : null;
  }

  async getSeasonByRoster(rosterId: string): Promise<Season | null> {
    const row = [...this.seasons.values()].find((s) => s.rosterId === rosterId) ?? null;
    return row ? safeParseSeason(row) : null;
  }

  async saveSeason(s: Season): Promise<void> {
    this.seasons.set(s.id, s);
  }

  async deleteSeason(id: string): Promise<void> {
    this.seasons.delete(id);
  }

  async exportAll(): Promise<{ sessions: DraftSession[]; seasons: Season[]; rosters: SavedRoster[] }> {
    return {
      sessions: [...this.sessions.values()],
      seasons: [...this.seasons.values()],
      rosters: [...this.rosters.values()],
    };
  }

  async clearAll(): Promise<void> {
    this.sessions.clear();
    this.rosters.clear();
    this.seasons.clear();
  }

  async usage(): Promise<{ sessions: number; seasons: number; rosters: number; bytesEstimate: number }> {
    const all = await this.exportAll();
    const bytesEstimate =
      JSON.stringify(all.sessions).length + JSON.stringify(all.seasons).length + JSON.stringify(all.rosters).length;
    return {
      sessions: all.sessions.length,
      seasons: all.seasons.length,
      rosters: all.rosters.length,
      bytesEstimate,
    };
  }
}
