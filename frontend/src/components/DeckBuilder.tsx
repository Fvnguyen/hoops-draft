'use client';

import { useState, useEffect, useMemo } from 'react';
import { DraftCard, PlayerCard, PlayCard, CardListRow, Play, PlayerCardData, getPosColors } from './PlayerCard';
import { motion, AnimatePresence } from 'framer-motion';
import { useRouter } from 'next/navigation';
import { ChevronDown, ChevronRight, X } from 'lucide-react';
import { calcRosterIdentity, calcRosterShotDiet } from '../engine/rosterStats';
import type { RosterIdentity } from '../engine/rosterStats';
import { calcTeamBonuses, evaluatePlay, countBadges } from '../engine/synergies';
import { TopKPIBand } from './TopKPIBand';
import { getGameStore } from '@/storage';
import { StorageQuotaError, type SavedRoster } from '@/storage/types';

const rarityValue: Record<string, number> = {
  'Mythic': 4,
  'Rare': 3,
  'Uncommon': 2,
  'Common': 1,
};

// Sort order used for the G-League player list: rarity desc, then position, then name.
const posOrder: Record<string, number> = { PG: 0, SG: 1, SF: 2, PF: 3, C: 4, G: 5, F: 6, 'G-F': 7, 'F-G': 7, ALL: 8, STAR: 8 };

const sortGLeaguePlayers = (a: PlayerCardData, b: PlayerCardData) => {
  const rarityDiff = rarityValue[b.rarity] - rarityValue[a.rarity];
  if (rarityDiff !== 0) return rarityDiff;
  const posA = posOrder[a.player.position] ?? 9;
  const posB = posOrder[b.player.position] ?? 9;
  if (posA !== posB) return posA - posB;
  return a.player.name.localeCompare(b.player.name);
};

type PosFilter = 'All' | 'G' | 'F' | 'C';

export function DeckBuilder({ draftedCards, initialZones, existingRosterName, rosterId, initialDepthOrder, initialPlaysOrder, sessionId, podAverageIdentity }: { draftedCards: DraftCard[], initialZones: Record<string, 'Roster' | 'GLeague'>, existingRosterName?: string, rosterId?: string, initialDepthOrder?: Record<string, string[]>, initialPlaysOrder?: string[], sessionId?: string, podAverageIdentity?: RosterIdentity }) {
  const router = useRouter();

  // Adjacency map: one position over is allowed (with OVR penalty in game sim)
  const ADJACENT_POSITIONS: Record<string, string[]> = {
    PG: ['SG'], SG: ['PG', 'SF'], SF: ['SG', 'PF'], PF: ['SF', 'C'], C: ['PF'],
  };

  const isEligible = (rawPos: string, targetCol: string): boolean => {
    if (rawPos === 'ALL') return true;
    if (rawPos === 'G' && (targetCol === 'PG' || targetCol === 'SG')) return true;
    if (rawPos === 'F' && (targetCol === 'SF' || targetCol === 'PF')) return true;
    if ((rawPos === 'G-F' || rawPos === 'F-G') && (targetCol === 'PG' || targetCol === 'SG' || targetCol === 'SF' || targetCol === 'PF')) return true;
    if (rawPos.includes(targetCol)) return true;

    const parts = rawPos.split(/[-/]/);
    if (parts.includes(targetCol)) return true;
    if (parts.includes('G') && (targetCol === 'PG' || targetCol === 'SG')) return true;
    if (parts.includes('F') && (targetCol === 'SF' || targetCol === 'PF')) return true;

    return false;
  };

  /** Check if a player can play out of position (one position over) */
  const isAdjacentEligible = (rawPos: string, targetCol: string): boolean => {
    if (isEligible(rawPos, targetCol)) return false; // Already naturally eligible
    const parts = rawPos.split(/[-/]/);
    // Check if any natural position is adjacent to the target
    for (const naturalPos of parts) {
      const mapped = naturalPos === 'G' ? ['PG', 'SG'] : naturalPos === 'F' ? ['SF', 'PF'] : [naturalPos];
      for (const mp of mapped) {
        if (ADJACENT_POSITIONS[mp]?.includes(targetCol)) return true;
      }
    }
    return false;
  };

  /** Can this player be placed in this position (naturally OR adjacent)? */
  const canPlace = (rawPos: string, targetCol: string): boolean => {
    return isEligible(rawPos, targetCol) || isAdjacentEligible(rawPos, targetCol);
  };

  /** Position filter chips (All / G / F / C) above the G-League list */
  const matchesPosFilter = (rawPos: string, filter: PosFilter): boolean => {
    if (filter === 'All') return true;
    if (filter === 'G') return isEligible(rawPos, 'PG') || isEligible(rawPos, 'SG');
    if (filter === 'F') return isEligible(rawPos, 'SF') || isEligible(rawPos, 'PF');
    return isEligible(rawPos, 'C');
  };

  const getDefaultCol = (pos: string) => {
    if (pos.includes('PG')) return 'PG';
    if (pos.includes('C')) return 'C';
    if (pos.includes('PF')) return 'PF';
    if (pos.includes('SG')) return 'SG';
    if (pos === 'G') return 'PG';
    if (pos === 'F') return 'SF';
    if (pos === 'G-F' || pos === 'F-G') return 'SG';
    return 'SF';
  };

  const [depthChart, setDepthChart] = useState<Record<string, PlayerCardData[]>>({
    PG: [], SG: [], SF: [], PF: [], C: []
  });
  const [activePlays, setActivePlays] = useState<(Play | null)[]>([null, null, null]);
  const [gLeaguePlayers, setGLeaguePlayers] = useState<PlayerCardData[]>([]);
  const [gLeaguePlays, setGLeaguePlays] = useState<Play[]>([]);
  const [draggedItem, setDraggedItem] = useState<{ card: DraftCard, sourceZone: string, sourceIndex?: number } | null>(null);

  // Click-to-place selection state
  const [selectedGLeaguePlayer, setSelectedGLeaguePlayer] = useState<PlayerCardData | null>(null);
  const [selectedPlacedPlayer, setSelectedPlacedPlayer] = useState<{ id: string; col: string } | null>(null);
  const [posFilter, setPosFilter] = useState<PosFilter>('All');
  const [showClearConfirm, setShowClearConfirm] = useState(false);

  const [isPlaysOpen, setIsPlaysOpen] = useState(true);
  const [isPlayersOpen, setIsPlayersOpen] = useState(true);
  const [showSaveModal, setShowSaveModal] = useState(false);
  const [rosterName, setRosterName] = useState(existingRosterName || `Draft Roster - ${new Date().toLocaleString()}`);
  const [saveError, setSaveError] = useState<string | null>(null);

  useEffect(() => {
    const initDepth: Record<string, PlayerCardData[]> = { PG: [], SG: [], SF: [], PF: [], C: [] };
    const initGPlayers: PlayerCardData[] = [];
    const initRPlays: Play[] = [];
    const initGPlays: Play[] = [];

    draftedCards.forEach(card => {
      const zone = initialZones[card.id] || 'GLeague';
      if (card.type === 'Play') {
        if (zone === 'Roster') initRPlays.push(card as Play);
        else initGPlays.push(card as Play);
      } else {
        const player = card as PlayerCardData;
        if (zone === 'Roster') {
          if (!initialDepthOrder) {
            initDepth[getDefaultCol(player.player.position)].push(player);
          }
        } else {
          initGPlayers.push(player);
        }
      }
    });

    if (initialDepthOrder) {
      const assignedIds = new Set<string>();
      for (const pos in initDepth) {
        if (initialDepthOrder[pos]) {
           const orderedCol: PlayerCardData[] = [];
           initialDepthOrder[pos].forEach(id => {
              const found = draftedCards.find(p => p.id === id) as PlayerCardData;
              if (found) {
                orderedCol.push(found);
                assignedIds.add(id);
              }
           });
           initDepth[pos] = orderedCol;
        }
      }
      draftedCards.forEach(c => {
        if (c.type === 'Player' && initialZones[c.id] === 'Roster' && !assignedIds.has(c.id)) {
          initDepth[getDefaultCol((c as PlayerCardData).player.position)].push(c as PlayerCardData);
        }
      });
    } else {
      for (const pos in initDepth) {
        initDepth[pos].sort((a, b) => (b.ratings?.overall || 0) - (a.ratings?.overall || 0));
      }
    }

    const newActivePlays: (Play | null)[] = [null, null, null];
    if (initialPlaysOrder) {
      initialPlaysOrder.forEach((id, idx) => {
         if (idx < 3) {
            const found = initRPlays.find(p => p.id === id);
            if (found) newActivePlays[idx] = found;
         }
      });
    } else {
      initRPlays.slice(0, 3).forEach((p, i) => { newActivePlays[i] = p; });
    }
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setActivePlays(newActivePlays);
    initGPlayers.sort(sortGLeaguePlayers);
    setDepthChart(initDepth);
    setGLeaguePlayers(initGPlayers);
    setGLeaguePlays(initGPlays);
  }, [draftedCards, initialZones, initialDepthOrder, initialPlaysOrder]);

  // Escape clears whatever is selected (bench player or placed player)
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setSelectedGLeaguePlayer(null);
        setSelectedPlacedPlayer(null);
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, []);

  const clearSelection = () => {
    setSelectedGLeaguePlayer(null);
    setSelectedPlacedPlayer(null);
  };

  const handleDragStart = (e: React.DragEvent, card: DraftCard, sourceZone: string, sourceIndex?: number) => {
    e.dataTransfer.setData('text/plain', card.id);
    e.dataTransfer.effectAllowed = 'move';
    setDraggedItem({ card, sourceZone, sourceIndex });
  };

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
  };

  const removeCardFromSource = (cardId: string, sourceZone: string) => {
    if (sourceZone === 'GLeaguePlayers') {
      setGLeaguePlayers(prev => prev.filter(p => p.id !== cardId));
    } else if (sourceZone === 'GLeaguePlays') {
      setGLeaguePlays(prev => prev.filter(p => p.id !== cardId));
    } else if (sourceZone.startsWith('ActivePlay')) {
      const idx = parseInt(sourceZone.split('-')[1]);
      setActivePlays(prev => {
        const next = [...prev];
        next[idx] = null;
        return next;
      });
    } else if (['PG', 'SG', 'SF', 'PF', 'C'].includes(sourceZone)) {
      setDepthChart(prev => ({
        ...prev,
        [sourceZone]: prev[sourceZone].filter(p => p.id !== cardId)
      }));
    }
  };

  const handleDropOnZone = (e: React.DragEvent, targetZone: string, targetIndex?: number) => {
    e.preventDefault();
    if (!draggedItem) return;

    const { card, sourceZone, sourceIndex: srcIdx } = draggedItem;

    if (card.type === 'Play' && !targetZone.includes('Play')) return;
    if (card.type === 'Player' && targetZone.includes('Play')) return;
    if (targetZone === sourceZone && targetIndex === srcIdx) {
      setDraggedItem(null);
      return;
    }
    if (['PG', 'SG', 'SF', 'PF', 'C'].includes(targetZone)) {
      if (!canPlace((card as PlayerCardData).player.position, targetZone)) {
        setDraggedItem(null);
        return;
      }
    }

    const sourceIsDepth = ['PG', 'SG', 'SF', 'PF', 'C'].includes(sourceZone);
    const targetIsDepth = ['PG', 'SG', 'SF', 'PF', 'C'].includes(targetZone);

    // CASE 1: Both source and target are depth chart columns → single atomic update
    if (sourceIsDepth && targetIsDepth) {
      setDepthChart(prev => {
        const updated = { ...prev };
        // Remove from source column
        updated[sourceZone] = prev[sourceZone].filter(p => p.id !== card.id);
        // Add to target column
        const targetCol = [...updated[targetZone]];
        if (targetIndex !== undefined) {
          targetCol.splice(targetIndex, 0, card as PlayerCardData);
        } else {
          targetCol.push(card as PlayerCardData);
        }
        updated[targetZone] = targetCol;
        return updated;
      });
      setDraggedItem(null);
      return;
    }

    // CASE 2: Source is depth chart, target is G-League → atomic: remove from depth + add to G-League
    if (sourceIsDepth && targetZone === 'GLeaguePlayers') {
      setDepthChart(prev => ({ ...prev, [sourceZone]: prev[sourceZone].filter(p => p.id !== card.id) }));
      setGLeaguePlayers(prev => [...prev, card as PlayerCardData].sort(sortGLeaguePlayers));
      setDraggedItem(null);
      return;
    }

    // CASE 3: Source is G-League, target is depth chart
    if (sourceZone === 'GLeaguePlayers' && targetIsDepth) {
      setGLeaguePlayers(prev => prev.filter(p => p.id !== card.id));
      setDepthChart(prev => {
        const col = [...prev[targetZone]];
        if (targetIndex !== undefined) {
          col.splice(targetIndex, 0, card as PlayerCardData);
        } else {
          col.push(card as PlayerCardData);
        }
        return { ...prev, [targetZone]: col };
      });
      setDraggedItem(null);
      return;
    }

    // CASE 4: All other cases (plays, etc.)
    removeCardFromSource(card.id, sourceZone);

    if (targetZone === 'GLeaguePlayers') {
      setGLeaguePlayers(prev => [...prev, card as PlayerCardData].sort(sortGLeaguePlayers));
    } else if (targetZone === 'GLeaguePlays') {
      if (!card.id.startsWith('basic-')) {
        setGLeaguePlays(prev => [...prev, card as Play]);
      }
    } else if (targetZone.startsWith('ActivePlay')) {
      const idx = parseInt(targetZone.split('-')[1]);
      setActivePlays(prev => {
        const next = [...prev];
        const existing = next[idx];
        if (existing && !existing.id.startsWith('basic-')) {
          setGLeaguePlays(g => [...g, existing]);
        }
        next[idx] = card as Play;
        return next;
      });
    } else if (targetIsDepth) {
      setDepthChart(prev => {
        const col = [...prev[targetZone]];
        if (targetIndex !== undefined) {
          col.splice(targetIndex, 0, card as PlayerCardData);
        } else {
          col.push(card as PlayerCardData);
        }
        return { ...prev, [targetZone]: col };
      });
    }

    setDraggedItem(null);
  };

  /** Click handling for Play cards keeps its old immediate behaviour: click a
   *  G-League play to fill the first empty slot, click a filled slot to send
   *  it back to the G-League. (Only Player click behaviour changes to the new
   *  select → highlight → place model below.) */
  const handlePlayClick = (play: Play, currentZone: string) => {
    if (currentZone.startsWith('ActivePlay')) {
      removeCardFromSource(play.id, currentZone);
      if (!play.id.startsWith('basic-')) {
        setGLeaguePlays(prev => [...prev, play]);
      }
    } else {
      const emptyIdx = activePlays.findIndex(p => p === null);
      if (emptyIdx !== -1) {
        removeCardFromSource(play.id, currentZone);
        setActivePlays(prev => {
          const next = [...prev];
          next[emptyIdx] = play;
          return next;
        });
      } else {
        alert("Maximum 3 Active Plays allowed! Drag to swap.");
      }
    }
  };

  const handleGLeaguePlayerClick = (player: PlayerCardData) => {
    setSelectedPlacedPlayer(null);
    setSelectedGLeaguePlayer(prev => (prev?.id === player.id ? null : player));
  };

  const handlePlacedPlayerClick = (player: PlayerCardData, col: string) => {
    setSelectedGLeaguePlayer(null);
    setSelectedPlacedPlayer(prev => (prev?.id === player.id ? null : { id: player.id, col }));
  };

  const placeSelectedInColumn = (col: string) => {
    if (!selectedGLeaguePlayer) return;
    if (!canPlace(selectedGLeaguePlayer.player.position, col)) return;
    const player = selectedGLeaguePlayer;
    setGLeaguePlayers(prev => prev.filter(p => p.id !== player.id));
    setDepthChart(prev => ({ ...prev, [col]: [...prev[col], player] }));
    setSelectedGLeaguePlayer(null);
  };

  const promotePlayer = (col: string, idx: number) => {
    if (idx <= 0) return;
    setDepthChart(prev => {
      const arr = [...prev[col]];
      const tmp = arr[idx - 1];
      arr[idx - 1] = arr[idx];
      arr[idx] = tmp;
      return { ...prev, [col]: arr };
    });
  };

  const demotePlayer = (col: string, idx: number) => {
    setDepthChart(prev => {
      const arr = prev[col];
      if (idx >= arr.length - 1) return prev;
      const next = [...arr];
      const tmp = next[idx + 1];
      next[idx + 1] = next[idx];
      next[idx] = tmp;
      return { ...prev, [col]: next };
    });
  };

  const sendPlacedToGLeague = (player: PlayerCardData, col: string) => {
    setDepthChart(prev => ({ ...prev, [col]: prev[col].filter(p => p.id !== player.id) }));
    setGLeaguePlayers(prev => [...prev, player].sort(sortGLeaguePlayers));
    setSelectedPlacedPlayer(null);
  };

  const handleClearRoster = () => {
    const allPlaced = Object.values(depthChart).flat();
    setGLeaguePlayers(prev => [...prev, ...allPlaced].sort(sortGLeaguePlayers));
    setDepthChart({ PG: [], SG: [], SF: [], PF: [], C: [] });
    const returningPlays = activePlays.filter((p): p is Play => p !== null && !p.id.startsWith('basic-'));
    setGLeaguePlays(prev => [...prev, ...returningPlays]);
    setActivePlays([null, null, null]);
    setSelectedGLeaguePlayer(null);
    setSelectedPlacedPlayer(null);
    setShowClearConfirm(false);
  };

  // Mechanics validation
  const playersInRoster = Object.values(depthChart).reduce((acc, col) => acc + col.length, 0);
  const activePlaysCount = activePlays.filter(p => p !== null).length;
  const validActivePlays = activePlays.filter(p => p !== null) as Play[];
  const identity = calcRosterIdentity(depthChart);
  const shotDiet = calcRosterShotDiet(depthChart, validActivePlays);
  const allPlayers = Object.values(depthChart).flat();
  // Badge totals across the current depth chart (starters + bench), recomputed
  // whenever the roster changes — feeds evaluatePlay() so play cards can show
  // live requirement status without exposing any OVR/rating numbers.
  const badgeTotals = useMemo(() => countBadges(Object.values(depthChart).flat()), [depthChart]);
  const bonuses = calcTeamBonuses(allPlayers, validActivePlays, new Map());
  const missingPos = ['PG', 'SG', 'SF', 'PF', 'C'].find(pos => depthChart[pos].length === 0);

  const isComplete = playersInRoster === 12 && !missingPos && activePlaysCount === 3;

  let statusText = 'Roster is valid';
  if (playersInRoster < 12) statusText = `Need ${12 - playersInRoster} more Player(s)`;
  else if (playersInRoster > 12) statusText = `Drop ${playersInRoster - 12} Player(s)`;
  else if (missingPos) statusText = `Need a ${missingPos} Starter`;
  else if (activePlaysCount < 3) statusText = `Need ${3 - activePlaysCount} more Play(s)`;

  // Map each filled play slot to its full/partial/none activation, in slot order.
  const activePlayStatus = new Map<string, 'full' | 'partial' | 'none'>();
  validActivePlays.forEach((p, i) => {
    const result = bonuses.activePlays[i];
    if (result) activePlayStatus.set(p.id, result.activated);
  });

  const filteredGLeaguePlayers = gLeaguePlayers.filter(p => matchesPosFilter(p.player.position, posFilter));

  const handleSaveRoster = async () => {
    try {
      setSaveError(null);
      const finalZones: Record<string, 'Roster'|'GLeague'> = {};
      draftedCards.forEach(c => finalZones[c.id] = 'GLeague');

      activePlays.forEach(p => { if (p && finalZones[p.id]) finalZones[p.id] = 'Roster'; });
      Object.values(depthChart).forEach(col => col.forEach(p => finalZones[p.id] = 'Roster'));

      const saveId = rosterId || `roster_${Date.now()}`;
      const depthChartOrder = Object.fromEntries(Object.entries(depthChart).map(([k, v]) => [k, v.map(p => p.id)]));
      const activePlayIds = activePlays.map(p => p ? p.id : null).filter((id): id is string => id !== null);

      const newRosterData: SavedRoster = {
        id: saveId,
        name: rosterName,
        timestamp: new Date().toISOString(),
        draftedCards,
        zones: finalZones,
        depthChartOrder,
        activePlays: activePlayIds,
        sessionId: sessionId ?? null,
      };

      const store = getGameStore();
      await store.saveRoster(newRosterData);

      // Update the human's built roster in the draft session so opponents can be retrieved
      if (sessionId) {
        const gLeaguePlayerIds = draftedCards
          .filter(c => c.type === 'Player' && finalZones[c.id] === 'GLeague')
          .map(c => c.id);
        const gLeaguePlayIds = draftedCards
          .filter(c => c.type === 'Play' && finalZones[c.id] === 'GLeague')
          .map(c => c.id);

        const session = await store.getDraftSession(sessionId);
        if (session) {
          session.seats[0].builtRoster = {
            depthChart: depthChartOrder,
            activePlays: activePlayIds,
            gLeaguePlayers: gLeaguePlayerIds,
            gLeaguePlays: gLeaguePlayIds,
          };
          await store.saveDraftSession(session);
        }
      }

      router.push('/rosters');
    } catch (error) {
      if (error instanceof StorageQuotaError) {
        setSaveError(error.message);
      } else {
        setSaveError('Failed to save roster. Please try again.');
      }
    }
  };

  return (
    <div className="h-screen pt-[60px] text-stone-800 flex flex-col overflow-hidden relative bg-stone-50" onClick={clearSelection}>
      <TopKPIBand identity={identity} shotDiet={shotDiet} bonuses={bonuses} depthChart={depthChart} average={podAverageIdentity} />
      {saveError && (
        <div className="bg-red-50 border-b border-red-200 px-4 py-3">
          <p className="text-sm text-red-700 font-semibold">{saveError}</p>
        </div>
      )}
      <div className="flex-1 p-4 flex flex-col lg:flex-row gap-4 overflow-hidden relative">
        {/* ACTIVE ROSTER */}
        <div className="flex-1 flex flex-col bg-white rounded-xl border border-stone-200 shadow-sm p-4 min-h-0">
          <div className="flex justify-between items-center mb-4 shrink-0">
            <div className="flex items-center gap-4">
               <h2 className="text-lg font-bold uppercase text-stone-800 tracking-wider flex items-center gap-2">
                 <span className="w-2 h-2 rounded-full bg-emerald-500"></span>
                 Active Roster
               </h2>
               <div className="flex gap-2">
                  <span className={`px-2 py-1 rounded bg-stone-50 border text-[10px] font-bold uppercase tracking-widest ${playersInRoster === 12 && !missingPos ? 'border-emerald-500/50 text-emerald-600' : 'border-amber-500/50 text-amber-600'}`}>
                    Players {playersInRoster}/12
                  </span>
                  <span className={`px-2 py-1 rounded bg-stone-50 border text-[10px] font-bold uppercase tracking-widest ${activePlaysCount === 3 ? 'border-emerald-500/50 text-emerald-600' : 'border-amber-500/50 text-amber-600'}`}>
                    Plays {activePlaysCount}/3
                  </span>
               </div>
            </div>

            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={(e) => { e.stopPropagation(); setShowClearConfirm(true); }}
                className="px-4 py-2 text-xs rounded-lg font-black uppercase tracking-widest border border-stone-300 text-stone-500 hover:text-red-600 hover:border-red-300 transition-colors"
              >
                Clear
              </button>
              <button
                onClick={(e) => { e.stopPropagation(); setShowSaveModal(true); }}
                disabled={!isComplete}
                title={!isComplete ? statusText : undefined}
                className={`px-6 py-2 text-xs rounded-lg font-black uppercase tracking-widest transition-all ${
                  isComplete
                  ? 'bg-gradient-to-r from-emerald-600 to-emerald-500 hover:from-emerald-500 hover:to-emerald-400 text-white shadow-[0_0_15px_rgba(16,185,129,0.3)] shadow-emerald-500/30'
                  : 'bg-stone-100 text-stone-400 cursor-not-allowed border border-stone-200'
                }`}
              >
                Save Roster
              </button>
            </div>
          </div>

          <div className="flex flex-row gap-3 flex-1 min-h-0">
            {/* Left Column: Active Plays — full-size cards so requirements/mechanics
                are actually readable (was a 60px compact row). */}
            <div className="w-[170px] shrink-0 flex flex-col min-h-0">
              <h3 className="text-xs font-bold uppercase tracking-widest text-stone-500 mb-2 shrink-0">Plays (Max 3)</h3>
              <div className="flex flex-col gap-3 overflow-y-auto px-2 pb-1 items-center">
                {[0, 1, 2].map(slotIndex => {
                  const play = activePlays[slotIndex];
                  const zoneId = `ActivePlay-${slotIndex}`;
                  const status = play ? activePlayStatus.get(play.id) : undefined;
                  const evaluation = play ? evaluatePlay(play, badgeTotals) : undefined;
                  if (!play) {
                    return (
                      <div
                        key={slotIndex}
                        className={`w-[140px] aspect-[5/7] rounded-xl border-2 border-dashed ${draggedItem?.card.type === 'Play' ? 'border-blue-500/50 bg-blue-50' : 'border-stone-300/50 bg-stone-50'} flex items-center justify-center relative transition-colors`}
                        onDragOver={handleDragOver}
                        onDrop={(e) => handleDropOnZone(e, zoneId)}
                      >
                        <span className="text-stone-500 font-bold uppercase text-[10px] pointer-events-none text-center px-2">Empty play slot</span>
                      </div>
                    );
                  }
                  return (
                    <div
                      key={slotIndex}
                      className="relative w-[140px]"
                      onDragOver={handleDragOver}
                      onDrop={(e) => handleDropOnZone(e, zoneId)}
                    >
                      <motion.div
                        layoutId={`play-${play.id}`}
                        initial={{ opacity: 0, scale: 0.8 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0, scale: 0.8 }}
                        className="w-full cursor-grab active:cursor-grabbing"
                        draggable
                        // framer-motion's motion.div overloads onDragStart for its own drag
                        // gesture (PointerEvent/MouseEvent/TouchEvent), which conflicts with the
                        // native HTML5 DragEvent this handler actually needs — `any` bridges that.
                        // eslint-disable-next-line @typescript-eslint/no-explicit-any
                        onDragStart={(e: any) => handleDragStart(e, play, zoneId)}
                        onClick={(e) => { e.stopPropagation(); handlePlayClick(play, zoneId); }}
                      >
                        <PlayCard play={play} evaluation={evaluation} />
                      </motion.div>
                      {status && (
                        <span
                          title={status === 'full' ? 'Fully activated' : status === 'partial' ? 'Partially activated' : 'Not activated'}
                          className={`absolute -top-1.5 -right-1.5 w-3 h-3 rounded-full border-2 border-white z-30 pointer-events-none ${
                            status === 'full' ? 'bg-emerald-500' : status === 'partial' ? 'bg-amber-500' : 'bg-stone-400'
                          }`}
                        />
                      )}
                    </div>
                  );
                })}
              </div>
            </div>

            {/* Right Area: Depth Chart — starters get the full card at the top of
                each column, 2nd/3rd string are medium compact cards below. */}
            <div className="flex-1 flex flex-col min-w-0 min-h-0">
              <h3 className="text-xs font-bold uppercase tracking-widest text-stone-500 mb-2 shrink-0">Depth Chart (Starters at Top)</h3>
              <div className="grid grid-cols-5 gap-4 flex-1 min-h-0 overflow-y-auto overflow-x-hidden pr-1 pb-4">
                {['PG', 'SG', 'SF', 'PF', 'C'].map(pos => {
                  const players = depthChart[pos];
                  const [posC1, posC2] = getPosColors(pos);
                  const isEligibleHover = draggedItem?.card.type === 'Player' && canPlace((draggedItem.card as PlayerCardData).player.position, pos);
                  const isAdjacentHover = draggedItem?.card.type === 'Player' && isAdjacentEligible((draggedItem.card as PlayerCardData).player.position, pos);
                  const isInvalidHover = draggedItem?.card.type === 'Player' && !isEligibleHover;
                  const isClickEligible = !!selectedGLeaguePlayer && canPlace(selectedGLeaguePlayer.player.position, pos);
                  const isClickAdjacent = !!selectedGLeaguePlayer && isAdjacentEligible(selectedGLeaguePlayer.player.position, pos);

                  return (
                    <div
                      key={pos}
                      className={`flex flex-col gap-2 rounded-lg p-2 border transition-colors min-h-[320px] min-w-0 ${
                        isAdjacentHover || isClickAdjacent ? 'bg-amber-50 border-amber-400 ring-1 ring-amber-300' :
                        isEligibleHover || isClickEligible ? 'bg-emerald-50 border-emerald-400 ring-1 ring-emerald-300' :
                        isInvalidHover ? 'bg-red-50 border-red-300' :
                        'bg-stone-50 border-stone-200'
                      } ${selectedGLeaguePlayer ? 'cursor-pointer' : ''}`}
                      onDragOver={isEligibleHover ? handleDragOver : undefined}
                      onDrop={(e) => handleDropOnZone(e, pos)}
                      onClick={(e) => { e.stopPropagation(); placeSelectedInColumn(pos); }}
                    >
                      {/* 3px position-colour accent + column header */}
                      <div className="h-[3px] w-full rounded-full shrink-0 pointer-events-none" style={{ background: `linear-gradient(to right, ${posC1}, ${posC2})` }} />
                      <div className="text-center font-black text-stone-600 text-sm pb-1 pointer-events-none shrink-0">{pos}</div>

                      <AnimatePresence>
                        {players.map((p, idx) => {
                          const isStarter = idx === 0;
                          const isSelected = selectedPlacedPlayer?.id === p.id;
                          return (
                            <motion.div
                              key={p.id} layout initial={{ opacity: 0, y: -20 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, scale: 0.8 }}
                              className="relative shrink-0 w-full"
                              draggable
                              // See the framer-motion onDragStart note above — same conflict.
                              // eslint-disable-next-line @typescript-eslint/no-explicit-any
                              onDragStart={(e: any) => handleDragStart(e, p, pos, idx)}
                              onDragOver={handleDragOver}
                              onDrop={(e: React.DragEvent) => {
                                e.stopPropagation();
                                handleDropOnZone(e, pos, idx);
                              }}
                            >
                              {isStarter && (
                                <div className="text-center text-[9px] font-bold uppercase tracking-widest text-stone-400 mb-1 pointer-events-none">
                                  Starter
                                </div>
                              )}
                              <div
                                className="group relative w-full cursor-grab active:cursor-grabbing"
                                onClick={(e) => { e.stopPropagation(); handlePlacedPlayerClick(p, pos); }}
                              >
                                {isStarter ? (
                                  /* Starter = the full 5:7 card, sized by the column width. */
                                  <PlayerCard player={p} isSelected={isSelected} />
                                ) : (
                                  /* 2nd/3rd string = the medium (60px) compact card, with its
                                     own hover pop-up showing the full card. */
                                  <PlayerCard player={p} compact popupDirection="down" isSelected={isSelected} />
                                )}
                              </div>
                              {/* Selection control strip lives BELOW the card (not an overlay tag). */}
                              {isSelected && (
                                <div
                                  className="flex items-center justify-center gap-1 mt-1"
                                  onClick={(e) => e.stopPropagation()}
                                >
                                  <button
                                    type="button"
                                    disabled={idx === 0}
                                    onClick={() => promotePlayer(pos, idx)}
                                    title="Promote"
                                    className="w-6 h-6 flex items-center justify-center rounded-full bg-stone-800 border border-white text-white text-[11px] leading-none disabled:opacity-30 hover:bg-stone-700 shadow"
                                  >▲</button>
                                  <button
                                    type="button"
                                    disabled={idx === players.length - 1}
                                    onClick={() => demotePlayer(pos, idx)}
                                    title="Demote"
                                    className="w-6 h-6 flex items-center justify-center rounded-full bg-stone-800 border border-white text-white text-[11px] leading-none disabled:opacity-30 hover:bg-stone-700 shadow"
                                  >▼</button>
                                  <button
                                    type="button"
                                    onClick={() => sendPlacedToGLeague(p, pos)}
                                    title="Send to G-League"
                                    className="w-6 h-6 flex items-center justify-center rounded-full bg-red-600 border border-white text-white text-[11px] leading-none hover:bg-red-500 shadow"
                                  >✕</button>
                                </div>
                              )}
                            </motion.div>
                          );
                        })}
                        {players.length === 0 && (
                          <div className="flex-1 flex flex-col items-center justify-center border-2 border-dashed border-stone-800/50 rounded-lg opacity-50 p-2 text-center text-stone-600 text-[10px] font-bold uppercase pointer-events-none min-h-[100px]">
                            Drop a {pos} here
                          </div>
                        )}
                      </AnimatePresence>
                    </div>
                  );
                })}
              </div>
            </div>
          </div>
        </div>

        {/* G-LEAGUE / SIDEBOARD */}
        <div
          className="w-full lg:w-[350px] flex flex-col bg-white rounded-xl border border-stone-200 shadow-sm p-4 min-h-0 shrink-0"
        >
          <h2 className="text-xl font-bold italic uppercase text-stone-400 mb-4 tracking-wider flex items-center gap-2">
            <span className="w-2 h-2 rounded-full bg-stone-500"></span>
            G-League
          </h2>

          <div className="flex-1 overflow-y-auto pr-2 space-y-4">

            {/* G-League Players Lane (Moved above Plays) */}
            <div
              className={`border rounded-lg overflow-hidden transition-colors ${draggedItem?.card.type === 'Player' ? 'border-orange-500 bg-orange-50' : 'border-stone-200 bg-white'}`}
              onDragOver={handleDragOver}
              onDrop={(e) => handleDropOnZone(e, 'GLeaguePlayers')}
            >
              <button onClick={(e) => { e.stopPropagation(); setIsPlayersOpen(!isPlayersOpen); }} className="w-full flex justify-between items-center bg-stone-50 p-3 hover:bg-stone-100 transition-colors">
                <h3 className="text-xs font-bold uppercase tracking-widest text-stone-400">Players ({gLeaguePlayers.length})</h3>
                {isPlayersOpen ? <ChevronDown className="w-4 h-4 text-stone-500" /> : <ChevronRight className="w-4 h-4 text-stone-500" />}
              </button>

              <AnimatePresence>
                {isPlayersOpen && (
                  <motion.div initial={{ height: 0 }} animate={{ height: 'auto' }} exit={{ height: 0 }} className="overflow-hidden">
                    <div className="px-3 pt-3 flex gap-1" onClick={(e) => e.stopPropagation()}>
                      {(['All', 'G', 'F', 'C'] as const).map(f => (
                        <button
                          key={f}
                          type="button"
                          onClick={() => setPosFilter(f)}
                          className={`px-2 py-0.5 rounded text-[9px] font-bold uppercase tracking-widest border transition-colors ${
                            posFilter === f ? 'bg-stone-800 text-white border-stone-800' : 'bg-white text-stone-500 border-stone-200 hover:border-stone-400'
                          }`}
                        >
                          {f}
                        </button>
                      ))}
                    </div>
                    <div className="p-3 pt-2 flex flex-col gap-2 min-h-[80px]">
                      {filteredGLeaguePlayers.map(player => (
                        <div
                          key={player.id}
                          draggable
                          onDragStart={(e: React.DragEvent) => handleDragStart(e, player, 'GLeaguePlayers')}
                          onClick={(e) => { e.stopPropagation(); handleGLeaguePlayerClick(player); }}
                          className="group relative cursor-grab active:cursor-grabbing w-full"
                        >
                           <CardListRow card={player} selected={selectedGLeaguePlayer?.id === player.id} />
                           <div className="hidden group-hover:block absolute z-50 pointer-events-none top-full left-1/2 -translate-x-1/2 mt-2 origin-top">
                             <div className="w-[160px] shadow-2xl">
                               <PlayerCard player={player} />
                             </div>
                           </div>
                        </div>
                      ))}
                      {filteredGLeaguePlayers.length === 0 && <div className="text-center text-xs text-stone-600 italic py-4 pointer-events-none">No players match this filter.</div>}
                    </div>
                  </motion.div>
                )}
              </AnimatePresence>
            </div>

            {/* G-League Plays Lane */}
            <div
              className={`border rounded-lg overflow-hidden transition-colors ${draggedItem?.card.type === 'Play' ? 'border-blue-500 bg-blue-50' : 'border-stone-200 bg-white'}`}
              onDragOver={handleDragOver}
              onDrop={(e) => handleDropOnZone(e, 'GLeaguePlays')}
            >
              <button onClick={(e) => { e.stopPropagation(); setIsPlaysOpen(!isPlaysOpen); }} className="w-full flex justify-between items-center bg-stone-50 p-3 hover:bg-stone-100 transition-colors">
                <h3 className="text-xs font-bold uppercase tracking-widest text-stone-400">Plays ({gLeaguePlays.length})</h3>
                {isPlaysOpen ? <ChevronDown className="w-4 h-4 text-stone-500" /> : <ChevronRight className="w-4 h-4 text-stone-500" />}
              </button>

              <AnimatePresence>
                {isPlaysOpen && (
                  <motion.div initial={{ height: 0 }} animate={{ height: 'auto' }} exit={{ height: 0 }} className="overflow-hidden">
                    <div className="p-3 flex flex-col gap-2 min-h-[80px]">
                      {gLeaguePlays.map(play => (
                        <div
                          key={play.id}
                          draggable
                          onDragStart={(e: React.DragEvent) => handleDragStart(e, play, 'GLeaguePlays')}
                          onClick={(e) => { e.stopPropagation(); handlePlayClick(play, 'GLeaguePlays'); }}
                          className="cursor-grab active:cursor-grabbing w-full"
                        >
                           <PlayCard play={play as Play} compact popupDirection="down" evaluation={evaluatePlay(play, badgeTotals)} />
                        </div>
                      ))}
                      {gLeaguePlays.length === 0 && <div className="text-center text-xs text-stone-600 italic py-4 pointer-events-none">No plays on bench.</div>}
                    </div>
                  </motion.div>
                )}
              </AnimatePresence>
            </div>

          </div>

          {/* Basic Plays */}
          <div className="shrink-0 mt-4 pt-4 border-t border-stone-200">
            <h3 className="text-sm font-bold uppercase tracking-widest text-stone-500 mb-3">Basic Plays</h3>
            <div className="flex gap-2">
              <div
                draggable
                onDragStart={(e) => handleDragStart(e, { type: 'Play', id: `basic-offense-${Date.now()}`, name: 'Basic Offense', rarity: 'Common', playCategory: 'basic', mechanicText: 'Minor boost to all Offensive Badges.', badges: [], imageUrl: '' } as Play, 'InfinitePlays')}
                title="Adds a basic play card with no requirements"
                className="flex-1 bg-stone-50 border border-stone-200 hover:border-orange-500 hover:bg-stone-100 transition-colors p-2.5 rounded-lg flex items-center justify-center gap-1.5 group cursor-grab active:cursor-grabbing"
              >
                <span className="text-orange-500 font-black pointer-events-none">+</span>
                <span className="text-stone-500 font-bold uppercase text-[10px] group-hover:text-stone-800 pointer-events-none">Offense</span>
              </div>
              <div
                draggable
                onDragStart={(e) => handleDragStart(e, { type: 'Play', id: `basic-defense-${Date.now()}`, name: 'Basic Defense', rarity: 'Common', playCategory: 'basic', mechanicText: 'Minor boost to all Defensive Badges.', badges: [], imageUrl: '' } as Play, 'InfinitePlays')}
                title="Adds a basic play card with no requirements"
                className="flex-1 bg-stone-50 border border-stone-200 hover:border-blue-500 hover:bg-stone-100 transition-colors p-2.5 rounded-lg flex items-center justify-center gap-1.5 group cursor-grab active:cursor-grabbing"
              >
                <span className="text-blue-500 font-black pointer-events-none">+</span>
                <span className="text-stone-500 font-bold uppercase text-[10px] group-hover:text-stone-800 pointer-events-none">Defense</span>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Save Modal */}
      <AnimatePresence>
        {showSaveModal && (
          <motion.div
            initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            className="fixed inset-0 z-[60] bg-black/40 backdrop-blur-sm flex items-center justify-center p-4"
            onClick={(e) => { e.stopPropagation(); setShowSaveModal(false); }}
          >
            <motion.div
              initial={{ scale: 0.9, y: 20 }} animate={{ scale: 1, y: 0 }} exit={{ scale: 0.9, y: 20 }}
              className="bg-white border border-stone-200 rounded-2xl p-6 shadow-xl w-full max-w-md shadow-2xl relative"
              onClick={(e) => e.stopPropagation()}
            >
              <button onClick={() => setShowSaveModal(false)} className="absolute top-4 right-4 text-stone-400 hover:text-stone-600">
                <X className="w-5 h-5" />
              </button>

              <h2 className="text-2xl font-bold uppercase text-stone-800 mb-2">Save Roster</h2>
              <p className="text-stone-400 text-sm mb-6">Give your active roster a name. You can edit this later from the My Rosters menu.</p>

              <div className="mb-6">
                <label className="block text-xs font-bold uppercase tracking-widest text-stone-500 mb-2">Roster Name</label>
                <input
                  type="text"
                  value={rosterName}
                  onChange={e => setRosterName(e.target.value)}
                  className="w-full bg-stone-50 border border-stone-200 rounded-lg px-4 py-3 text-stone-800 focus:outline-none focus:border-stone-400 transition-colors"
                  placeholder="e.g. 2025 Championship Run"
                  autoFocus
                />
              </div>

              <div className="flex justify-end gap-3">
                <button
                  onClick={() => setShowSaveModal(false)}
                  className="px-6 py-2 rounded-lg font-bold text-stone-400 hover:text-stone-600 hover:bg-stone-100 transition-colors"
                >
                  Cancel
                </button>
                <button
                  onClick={handleSaveRoster}
                  disabled={!rosterName.trim()}
                  className="px-6 py-2 rounded-lg font-black uppercase tracking-widest bg-orange-600 hover:bg-orange-500 text-white disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                >
                  Save to Collection
                </button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Clear Confirmation Modal */}
      <AnimatePresence>
        {showClearConfirm && (
          <motion.div
            initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            className="fixed inset-0 z-[60] bg-black/40 backdrop-blur-sm flex items-center justify-center p-4"
            onClick={(e) => { e.stopPropagation(); setShowClearConfirm(false); }}
          >
            <motion.div
              initial={{ scale: 0.9, y: 20 }} animate={{ scale: 1, y: 0 }} exit={{ scale: 0.9, y: 20 }}
              className="bg-white border border-stone-200 rounded-2xl p-6 shadow-xl w-full max-w-sm shadow-2xl relative"
              onClick={(e) => e.stopPropagation()}
            >
              <h2 className="text-xl font-bold uppercase text-stone-800 mb-2">Clear Roster?</h2>
              <p className="text-stone-400 text-sm mb-6">This sends every player and play back to the G-League and cannot be undone.</p>
              <div className="flex justify-end gap-3">
                <button
                  onClick={() => setShowClearConfirm(false)}
                  className="px-6 py-2 rounded-lg font-bold text-stone-400 hover:text-stone-600 hover:bg-stone-100 transition-colors"
                >
                  Cancel
                </button>
                <button
                  onClick={handleClearRoster}
                  className="px-6 py-2 rounded-lg font-black uppercase tracking-widest bg-red-600 hover:bg-red-500 text-white transition-colors"
                >
                  Clear Roster
                </button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
