'use client';
import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { DraftCard, PlayerCard, PlayCard, PlayerCardData } from '@/components/PlayerCard';
import { motion } from 'framer-motion';
import { Pencil, Swords, Trash2 } from 'lucide-react';
import { getGameStore, SavedRoster } from '@/storage';
import { useStorageReady } from '@/components/StorageProvider';

export default function RostersPage() {
  const router = useRouter();
  const ready = useStorageReady();
  const [rosters, setRosters] = useState<SavedRoster[]>([]);
  const [loaded, setLoaded] = useState(false);

  const refresh = useCallback(async () => {
    const store = getGameStore();
    const saved = await store.listRosters();
    setRosters(saved.sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime()));
    setLoaded(true);
  }, []);

  useEffect(() => {
    if (!ready) return;
    // eslint-disable-next-line react-hooks/set-state-in-effect
    refresh();
  }, [ready, refresh]);

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
    <div className="min-h-screen p-8 pt-[70px] text-stone-800 overflow-y-auto">
      {!ready || !loaded ? (
        <div className="flex flex-col items-center justify-center h-64 opacity-50">
          <div className="text-6xl mb-4">🏀</div>
          <h2 className="text-xl font-bold uppercase tracking-widest">Loading Rosters...</h2>
        </div>
      ) : rosters.length === 0 ? (
        <div className="flex flex-col items-center justify-center h-64 opacity-50">
          <div className="text-6xl mb-4">🏀</div>
          <h2 className="text-xl font-bold uppercase tracking-widest">No Rosters Saved</h2>
          <p className="mt-2 text-stone-400">Complete a draft and build a deck to see it here.</p>
        </div>
      ) : (
        <div className="space-y-8 pb-10">
          {rosters.map((rosterObj, i) => {
            const date = new Date(rosterObj.timestamp).toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' });
            
            return (
              <motion.div 
                key={rosterObj.id} 
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: i * 0.1 }}
                className="bg-white border border-stone-200 rounded-xl overflow-hidden shadow-sm"
              >
                <div className="bg-stone-50 px-6 py-4 border-b border-stone-200 flex justify-between items-center">
                  <div>
                    <h2 className="text-xl font-black uppercase tracking-wider flex items-center gap-3">
                      <span className="text-stone-500 text-sm font-normal">#{rosters.length - i}</span>
                      {rosterObj.name || 'Drafted Roster'}
                    </h2>
                    <div className="text-xs font-bold text-stone-500 uppercase tracking-widest mt-1">
                      {date}
                    </div>
                  </div>
                  <div className="flex items-center gap-4">
                    <Link
                      href={`/deckbuilder-test?rosterId=${rosterObj.id}${rosterObj.sessionId ? `&sessionId=${rosterObj.sessionId}` : ''}`}
                      className="p-3 bg-white hover:bg-stone-50 text-stone-500 hover:text-stone-700 rounded-lg transition-colors border border-stone-700"
                      title="Edit Roster"
                    >
                      <Pencil className="w-5 h-5" />
                    </Link>

                    {rosterObj.sessionId && (
                      <button
                        onClick={() => router.push(`/season?rosterId=${rosterObj.id}&sessionId=${rosterObj.sessionId}`)}
                        className="flex items-center gap-2 px-5 py-3 bg-emerald-600 hover:bg-emerald-500 text-white rounded-lg font-black uppercase tracking-widest transition-colors shadow-[0_0_15px_rgba(16,185,129,0.3)] hover:shadow-[0_0_20px_rgba(16,185,129,0.5)]"
                      >
                        <Swords className="w-4 h-4" /> Play Season
                      </button>
                    )}

                    <button
                      onClick={() => handleDelete(rosterObj.id)}
                      className="p-3 bg-white hover:bg-red-50 text-stone-500 hover:text-red-600 rounded-lg transition-colors border border-stone-700"
                      title="Delete Roster"
                    >
                      <Trash2 className="w-5 h-5" />
                    </button>
                  </div>
                </div>

                <div className="p-6">
                  <div className="flex gap-6">
                    {/* Active Plays */}
                    <div className="w-36 shrink-0">
                      <h3 className="text-xs font-bold uppercase tracking-widest text-stone-500 mb-4 text-center">Plays</h3>
                      <div className="flex flex-col gap-2">
                        {rosterObj.activePlays?.map((playId: string, idx: number) => {
                          const play = rosterObj.draftedCards.find((c: DraftCard) => c.id === playId);
                          // Key by slot as well as id: rosters saved from an older pack builder can
                          // hold two copies of the same play id.
                          return play && play.type === 'Play' ? <PlayCard key={`${play.id}-${idx}`} play={play} compact /> : null;
                        })}
                        {(!rosterObj.activePlays || rosterObj.activePlays.length === 0) && (
                          <div className="text-stone-400 text-[10px] uppercase font-bold text-center py-4 border border-stone-300 border-dashed rounded-lg bg-stone-900/50">No Plays</div>
                        )}
                      </div>
                    </div>

                    <div className="w-px bg-stone-200" />

                    {/* Starting Lineup */}
                    <div className="flex-1">
                      <h3 className="text-xs font-bold uppercase tracking-widest text-stone-500 mb-4 text-center">Starting Lineup</h3>
                      <div className="grid grid-cols-5 gap-4">
                        {['PG', 'SG', 'SF', 'PF', 'C'].map(pos => {
                          const starter = getStarter(rosterObj, pos);
                          return (
                            <div key={pos} className="flex flex-col gap-2 relative">
                              <div className="text-center font-black text-stone-700 text-sm">{pos}</div>
                              {starter ? (
                                <PlayerCard player={starter} />
                              ) : (
                                <div className="aspect-[2.5/3.5] bg-stone-50 rounded-lg border border-stone-300 border-dashed flex items-center justify-center text-stone-700 font-bold uppercase text-xs">
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
