'use client';
import { useCallback, useEffect, useRef, useState } from 'react';
import { motion } from 'framer-motion';
import { Download, Pencil, Swords, Trash2, Upload } from 'lucide-react';
import { getGameStore, SavedRoster, CURRENT_CARD_SET_VERSION } from '@/storage';
import { useStorageReady } from '@/components/StorageProvider';
import { getSeasonPhase, HUMAN_SEAT_ID, type Season, type SeasonPhase } from '@/engine/season';
import { DraftCard, PlayerCard, PlayCard, PlayerCardData } from '@/components/PlayerCard';
import { useRouter } from 'next/navigation';
import { Button, IconButton } from '@/components/ui';
import {
  buildExportBundle,
  isLikelyExportBundle,
  mergeImportedData,
  type MergeSummary,
} from '@/storage/exportImport';

const PHASE_LABEL: Record<SeasonPhase, string> = {
  preseason: 'Pre-Season',
  live: 'Live Season',
  completed: 'Completed',
};

const PHASE_CLASS: Record<SeasonPhase, string> = {
  preseason: 'bg-surface-muted text-ink-muted',
  live: 'bg-positive-soft text-positive',
  completed: 'bg-info-soft text-info',
};

export default function RostersPage() {
  const router = useRouter();
  const ready = useStorageReady();
  const [rosters, setRosters] = useState<SavedRoster[]>([]);
  const [seasonsByRoster, setSeasonsByRoster] = useState<Record<string, Season>>({});
  const [loaded, setLoaded] = useState(false);
  const [importError, setImportError] = useState<string | null>(null);
  const [importSummary, setImportSummary] = useState<MergeSummary | null>(null);
  const [busy, setBusy] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const refresh = useCallback(async () => {
    const store = getGameStore();
    const saved = await store.listRosters();
    const sorted = saved.sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());
    setRosters(sorted);

    const seasonEntries = await Promise.all(
      sorted.map(async (r) => [r.id, await store.getSeasonByRoster(r.id)] as const)
    );
    const seasonsMap: Record<string, Season> = {};
    for (const [rosterId, season] of seasonEntries) {
      if (season) seasonsMap[rosterId] = season;
    }
    setSeasonsByRoster(seasonsMap);
    setLoaded(true);
  }, []);

  useEffect(() => {
    if (!ready) return;
    // eslint-disable-next-line react-hooks/set-state-in-effect
    refresh();
  }, [ready, refresh]);

  const handleExport = async () => {
    setBusy(true);
    try {
      const store = getGameStore();
      const bundle = await buildExportBundle(store);
      const blob = new Blob([JSON.stringify(bundle, null, 2)], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      const date = new Date().toISOString().slice(0, 10);
      a.href = url;
      a.download = `magic-ball-backup-${date}.json`;
      a.click();
      URL.revokeObjectURL(url);
    } finally {
      setBusy(false);
    }
  };

  const handleImportClick = () => {
    setImportError(null);
    setImportSummary(null);
    fileInputRef.current?.click();
  };

  const handleImportFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = ''; // allow re-selecting the same file later
    if (!file) return;

    setBusy(true);
    setImportError(null);
    setImportSummary(null);
    try {
      const text = await file.text();
      let parsed: unknown;
      try {
        parsed = JSON.parse(text);
      } catch {
        setImportError('That file is not valid JSON.');
        return;
      }
      if (!isLikelyExportBundle(parsed)) {
        setImportError("That doesn't look like a Magic Ball backup file (missing sessions/seasons/rosters).");
        return;
      }

      const store = getGameStore();
      const current = await store.exportAll();
      const result = mergeImportedData(current, parsed);

      await Promise.all([
        ...result.sessions.map((s) => store.saveDraftSession(s)),
        ...result.seasons.map((s) => store.saveSeason(s)),
        ...result.rosters.map((r) => store.saveRoster(r)),
      ]);

      setImportSummary(result.summary);
      await refresh();
    } catch (err) {
      setImportError(err instanceof Error ? err.message : 'Import failed.');
    } finally {
      setBusy(false);
    }
  };

  const handleDelete = async (rosterId: string) => {
    if (!confirm('Delete this roster? This also removes any season played with it.')) return;
    const store = getGameStore();
    const season = await store.getSeasonByRoster(rosterId);
    if (season) await store.deleteSeason(season.id);
    await store.deleteRoster(rosterId);
    await refresh();
  };

  const getStarter = (rosterData: SavedRoster, targetPos: string): PlayerCardData | null => {
    // If the depth chart order is saved, use the first ID in the array for that position
    const orderedIds = rosterData.depthChartOrder?.[targetPos];
    if (orderedIds && orderedIds.length > 0) {
      const starterId = orderedIds[0];
      return rosterData.draftedCards.find((c: DraftCard) => c.id === starterId) as PlayerCardData;
    }
    return null;
  };

  return (
    <div className="min-h-dvh overflow-y-auto p-8 pt-nav text-ink">
      <input
        ref={fileInputRef}
        type="file"
        accept="application/json"
        className="hidden"
        onChange={handleImportFile}
      />
      <div className="mb-6 flex flex-wrap justify-end gap-3">
        <Button variant="secondary" onClick={handleExport} disabled={busy} icon={<Download className="h-4 w-4" />}>
          Export my data
        </Button>
        <Button variant="secondary" onClick={handleImportClick} disabled={busy} icon={<Upload className="h-4 w-4" />}>
          Import
        </Button>
      </div>

      {importError && (
        <div className="mb-6 rounded-panel border border-danger-line bg-danger-soft px-4 py-3 text-sm text-danger">
          {importError}
        </div>
      )}
      {importSummary && (
        <div className="mb-6 rounded-panel border border-positive/30 bg-positive-soft px-4 py-3 text-sm text-positive">
          Import complete — sessions: {importSummary.sessions.added} added, {importSummary.sessions.updated} updated,{' '}
          {importSummary.sessions.skipped} skipped; rosters: {importSummary.rosters.added} added,{' '}
          {importSummary.rosters.updated} updated, {importSummary.rosters.skipped} skipped; seasons:{' '}
          {importSummary.seasons.added} added, {importSummary.seasons.updated} updated, {importSummary.seasons.skipped}{' '}
          skipped.
        </div>
      )}

      {!ready || !loaded ? (
        <div className="flex h-64 flex-col items-center justify-center opacity-50">
          <div className="mb-4 text-6xl">🏀</div>
          <h2 className="text-xl font-bold uppercase tracking-widest">Loading Rosters...</h2>
        </div>
      ) : rosters.length === 0 ? (
        <div className="flex h-64 flex-col items-center justify-center opacity-50">
          <div className="mb-4 text-6xl">🏀</div>
          <h2 className="text-xl font-bold uppercase tracking-widest">No Rosters Saved</h2>
          <p className="mt-2 text-ink-subtle">Complete a draft and build a deck to see it here.</p>
        </div>
      ) : (
        <div className="space-y-8 pb-10">
          {rosters.map((rosterObj, i) => {
            const date = new Date(rosterObj.timestamp).toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' });
            const season = seasonsByRoster[rosterObj.id] ?? null;
            const phase = getSeasonPhase(season);
            const humanStanding = season?.standings.find((s) => s.seatId === HUMAN_SEAT_ID);
            const isLocked = phase === 'completed';

            return (
              <motion.div
                key={rosterObj.id}
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: i * 0.1 }}
                className="rounded-xl border border-line bg-surface-raised shadow-sm"
              >
                <div className="flex flex-wrap items-center justify-between gap-3 rounded-t-xl border-b border-line bg-surface-sunken px-6 py-4">
                  <div className="min-w-0">
                    <h2 className="flex items-center gap-3 truncate text-xl font-black uppercase tracking-wider">
                      <span className="text-sm font-normal text-ink-muted">#{rosters.length - i}</span>
                      {rosterObj.name || 'Drafted Roster'}
                    </h2>
                    <div className="mt-1 flex flex-wrap items-center gap-2 text-xs font-bold uppercase tracking-widest text-ink-muted">
                      {date}
                      {season && (
                        <span className={`rounded-full px-2 py-0.5 normal-case tracking-normal font-semibold ${PHASE_CLASS[phase]}`}>
                          {PHASE_LABEL[phase]}
                        </span>
                      )}
                      {humanStanding && (humanStanding.wins + humanStanding.losses > 0) && (
                        <span className="normal-case tracking-normal font-semibold text-ink-muted">
                          {humanStanding.wins}-{humanStanding.losses}
                        </span>
                      )}
                      {rosterObj.cardSetVersion && rosterObj.cardSetVersion !== CURRENT_CARD_SET_VERSION && (
                        <span
                          className="rounded-full bg-warn-soft px-2 py-0.5 normal-case tracking-normal font-semibold text-warn"
                          title={`Built from an older card set (${rosterObj.cardSetVersion}); ratings may have changed since.`}
                        >
                          older card set
                        </span>
                      )}
                    </div>
                  </div>
                  <div className="flex flex-wrap items-center gap-3">
                    <IconButton
                      href={`/roster/${rosterObj.id}${rosterObj.sessionId ? `?sessionId=${rosterObj.sessionId}` : ''}`}
                      variant="raised"
                      label={isLocked ? 'View Roster (locked — season complete)' : 'Edit Roster'}
                    >
                      <Pencil className="h-5 w-5" />
                    </IconButton>

                    {rosterObj.sessionId && (
                      <Button
                        onClick={() => router.push(`/season?rosterId=${rosterObj.id}&sessionId=${rosterObj.sessionId}`)}
                        icon={<Swords className="h-4 w-4" />}
                        className="bg-positive text-white shadow-sm hover:bg-positive-strong"
                      >
                        {isLocked ? 'View Season' : 'Play Season'}
                      </Button>
                    )}

                    <IconButton
                      label="Delete Roster"
                      variant="raised"
                      className="hover:bg-danger-soft hover:text-danger"
                      onClick={() => handleDelete(rosterObj.id)}
                    >
                      <Trash2 className="h-5 w-5" />
                    </IconButton>
                  </div>
                </div>

                <div className="p-6">
                  <div className="flex gap-6 overflow-x-auto">
                    {/* Active Plays */}
                    <div className="w-36 shrink-0">
                      <h3 className="mb-4 text-center text-xs font-bold uppercase tracking-widest text-ink-muted">Plays</h3>
                      <div className="flex flex-col gap-2">
                        {rosterObj.activePlays?.map((playId: string, idx: number) => {
                          const play = rosterObj.draftedCards.find((c: DraftCard) => c.id === playId);
                          // Key by slot as well as id: rosters saved from an older pack builder can
                          // hold two copies of the same play id.
                          return play && play.type === 'Play' ? <PlayCard key={`${play.id}-${idx}`} play={play} compact /> : null;
                        })}
                        {(!rosterObj.activePlays || rosterObj.activePlays.length === 0) && (
                          <div className="rounded-lg border border-dashed border-line-strong bg-surface-sunken py-4 text-center text-xs font-bold uppercase text-ink-subtle">No Plays</div>
                        )}
                      </div>
                    </div>

                    <div className="w-px shrink-0 bg-line" />

                    {/* Starting Lineup */}
                    <div className="min-w-[320px] flex-1">
                      <h3 className="mb-4 text-center text-xs font-bold uppercase tracking-widest text-ink-muted">Starting Lineup</h3>
                      <div className="flex gap-4">
                        {['PG', 'SG', 'SF', 'PF', 'C'].map(pos => {
                          const starter = getStarter(rosterObj, pos);
                          return (
                            <div key={pos} className="relative flex flex-1 min-w-[148px] flex-col gap-2">
                              <div className="text-center text-sm font-black text-ink">{pos}</div>
                              {starter ? (
                                <PlayerCard player={starter} />
                              ) : (
                                <div className="flex aspect-[2.5/3.5] items-center justify-center rounded-lg border border-dashed border-line-strong bg-surface-sunken text-xs font-bold uppercase text-ink-muted">
                                  Empty
                                </div>
                              )}
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  </div>
                </div>
              </motion.div>
            );
          })}
        </div>
      )}
    </div>
  );
}
