'use client';

import { useState, useEffect } from 'react';
import { DraftCard, PlayerCard, PlayCard, Play, PlayerCardData } from './PlayerCard';
import { motion, AnimatePresence } from 'framer-motion';
import { useRouter } from 'next/navigation';
import { ChevronDown, ChevronRight, X } from 'lucide-react';
import { updateHumanRosterInSession } from '../lib/legacyStorage';
import { calcRosterIdentity, calcRosterShotDiet } from '../engine/rosterStats';
import { calcTeamBonuses } from '../engine/synergies';
import { TopKPIBand } from './TopKPIBand';
import { safeGetJSON, safeSetJSON, StorageQuotaError } from '../lib/storage';

const rarityValue: Record<string, number> = {
  'Mythic': 4,
  'Rare': 3,
  'Uncommon': 2,
  'Common': 1,
};

export function DeckBuilder({ draftedCards, initialZones, existingRosterName, rosterId, initialDepthOrder, initialPlaysOrder, sessionId }: { draftedCards: DraftCard[], initialZones: Record<string, 'Roster' | 'GLeague'>, existingRosterName?: string, rosterId?: string, initialDepthOrder?: Record<string, string[]>, initialPlaysOrder?: string[], sessionId?: string }) {
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
    initGPlayers.sort((a, b) => rarityValue[b.rarity] - rarityValue[a.rarity]);
    setDepthChart(initDepth);
    setGLeaguePlayers(initGPlayers);
    setGLeaguePlays(initGPlays);
  }, [draftedCards, initialZones, initialDepthOrder, initialPlaysOrder]);


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
      setGLeaguePlayers(prev => [...prev, card as PlayerCardData].sort((a, b) => rarityValue[b.rarity] - rarityValue[a.rarity]));
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
      setGLeaguePlayers(prev => [...prev, card as PlayerCardData].sort((a, b) => rarityValue[b.rarity] - rarityValue[a.rarity]));
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

  const handleCardClick = (card: DraftCard, currentZone: string) => {
    if (card.type === 'Play') {
      if (currentZone.startsWith('ActivePlay')) {
        removeCardFromSource(card.id, currentZone);
        if (!card.id.startsWith('basic-')) {
          setGLeaguePlays(prev => [...prev, card as Play]);
        }
      } else {
        const emptyIdx = activePlays.findIndex(p => p === null);
        if (emptyIdx !== -1) {
          removeCardFromSource(card.id, currentZone);
          setActivePlays(prev => {
            const next = [...prev];
            next[emptyIdx] = card as Play;
            return next;
          });
        } else {
          alert("Maximum 3 Active Plays allowed! Drag to swap.");
        }
      }
    } else {
      if (currentZone === 'GLeaguePlayers') {
        // G-League → Depth Chart: remove from G-League, add to depth chart
        const col = getDefaultCol((card as PlayerCardData).player.position);
        setGLeaguePlayers(prev => prev.filter(p => p.id !== card.id));
        setDepthChart(prev => ({ ...prev, [col]: [...prev[col], card as PlayerCardData] }));
      } else if (['PG', 'SG', 'SF', 'PF', 'C'].includes(currentZone)) {
        // Depth Chart → G-League: remove from depth chart, add to G-League
        setDepthChart(prev => ({ ...prev, [currentZone]: prev[currentZone].filter(p => p.id !== card.id) }));
        setGLeaguePlayers(prev => [...prev, card as PlayerCardData].sort((a, b) => rarityValue[b.rarity] - rarityValue[a.rarity]));
      }
    }
  };

  // Mechanics validation
  const playersInRoster = Object.values(depthChart).reduce((acc, col) => acc + col.length, 0);
  const activePlaysCount = activePlays.filter(p => p !== null).length;
  const validActivePlays = activePlays.filter(p => p !== null) as Play[];
  const identity = calcRosterIdentity(depthChart);
  const shotDiet = calcRosterShotDiet(depthChart, validActivePlays);
  const allPlayers = Object.values(depthChart).flat();
  const bonuses = calcTeamBonuses(allPlayers, validActivePlays, new Map());
  const missingPos = ['PG', 'SG', 'SF', 'PF', 'C'].find(pos => depthChart[pos].length === 0);
  
  const isComplete = playersInRoster === 12 && !missingPos && activePlaysCount === 3;
  
  let statusText = 'Save Roster';
  if (playersInRoster < 12) statusText = `Need ${12 - playersInRoster} Player(s)`;
  else if (playersInRoster > 12) statusText = `Drop ${playersInRoster - 12} Player(s)`;
  else if (missingPos) statusText = `Need ${missingPos} Starter`;
  else if (activePlaysCount < 3) statusText = `Need ${3 - activePlaysCount} Play(s)`;

  const handleSaveRoster = () => {
    try {
      setSaveError(null);
      const finalZones: Record<string, 'Roster'|'GLeague'> = {};
      draftedCards.forEach(c => finalZones[c.id] = 'GLeague');

      activePlays.forEach(p => { if (p && finalZones[p.id]) finalZones[p.id] = 'Roster'; });
      Object.values(depthChart).forEach(col => col.forEach(p => finalZones[p.id] = 'Roster'));

      const saveId = rosterId || `roster_${Date.now()}`;
      const depthChartOrder = Object.fromEntries(Object.entries(depthChart).map(([k, v]) => [k, v.map(p => p.id)]));
      const activePlayIds = activePlays.map(p => p ? p.id : null).filter(id => id !== null);

      const newRosterData = {
        id: saveId,
        name: rosterName,
        timestamp: new Date().toISOString(),
        draftedCards,
        zones: finalZones,
        depthChartOrder,
        activePlays: activePlayIds,
        sessionId: sessionId ?? null,
      };

      interface RosterData {
        id: string;
        name: string;
        timestamp: string;
        draftedCards: DraftCard[];
        zones: Record<string, 'Roster' | 'GLeague'>;
        depthChartOrder: Record<string, string[]>;
        activePlays: string[];
        sessionId: string | null;
      }
      const stored = safeGetJSON<RosterData[]>('myRosters', []);
      const existingIndex = stored.findIndex((r: RosterData) => r.id === saveId);
      if (existingIndex >= 0) stored[existingIndex] = newRosterData;
      else stored.push(newRosterData);

      safeSetJSON('myRosters', stored);

      // Update the human's built roster in the draft session so opponents can be retrieved
      if (sessionId) {
        const gLeaguePlayerIds = draftedCards
          .filter(c => c.type === 'Player' && finalZones[c.id] === 'GLeague')
          .map(c => c.id);
        const gLeaguePlayIds = draftedCards
          .filter(c => c.type === 'Play' && finalZones[c.id] === 'GLeague')
          .map(c => c.id);

        updateHumanRosterInSession(sessionId, {
          depthChart: depthChartOrder,
          activePlays: activePlayIds as string[],
          gLeaguePlayers: gLeaguePlayerIds,
          gLeaguePlays: gLeaguePlayIds,
        });
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
    <div className="h-screen pt-[60px] text-stone-800 flex flex-col overflow-hidden relative bg-stone-50">
      <TopKPIBand identity={identity} shotDiet={shotDiet} bonuses={bonuses} />
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
                  <span className={`px-2 py-1 rounded bg-stone-50 border text-[10px] font-bold uppercase tracking-widest ${playersInRoster === 12 ? 'border-emerald-500/50 text-emerald-400' : 'border-red-500/50 text-red-400'}`}>
                    Players: {playersInRoster}/12
                  </span>
                  <span className={`px-2 py-1 rounded bg-stone-50 border text-[10px] font-bold uppercase tracking-widest ${activePlaysCount === 3 ? 'border-blue-500/50 text-blue-400' : 'border-red-500/50 text-red-400'}`}>
                    Plays: {activePlaysCount}/3
                  </span>
               </div>
            </div>
            
            <button 
              onClick={() => setShowSaveModal(true)}
              disabled={!isComplete}
              className={`px-6 py-2 text-xs rounded-lg font-black uppercase tracking-widest transition-all ${
                isComplete 
                ? 'bg-gradient-to-r from-emerald-600 to-emerald-500 hover:from-emerald-500 hover:to-emerald-400 text-white shadow-[0_0_15px_rgba(16,185,129,0.3)] shadow-emerald-500/30' 
                : 'bg-stone-100 text-stone-400 cursor-not-allowed border border-stone-200'
              }`}
            >
              {statusText}
            </button>
          </div>
          
          <div className="flex flex-row gap-3 flex-1 min-h-0">
            {/* Left Column: Active Plays */}
            <div className="w-[120px] shrink-0 flex flex-col">
              <h3 className="text-xs font-bold uppercase tracking-widest text-stone-500 mb-2">Plays (Max 3)</h3>
              <div className="flex flex-col gap-3 h-full">
                {[0, 1, 2].map(slotIndex => {
                  const play = activePlays[slotIndex];
                  const zoneId = `ActivePlay-${slotIndex}`;
                  return (
                    <div 
                      key={slotIndex} 
                      className={`w-full h-[60px] rounded-xl border-2 border-dashed ${draggedItem?.card.type === 'Play' ? 'border-blue-500/50 bg-blue-50' : 'border-stone-300/50 bg-stone-50'} flex items-center justify-center relative transition-colors`}
                      onDragOver={handleDragOver}
                      onDrop={(e) => handleDropOnZone(e, zoneId)}
                    >
                      <AnimatePresence>
                        {play && (
                          <motion.div 
                            layoutId={`play-${play.id}`} 
                            initial={{ opacity: 0, scale: 0.8 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0, scale: 0.8 }} 
                            className="absolute inset-0 w-full h-full cursor-grab active:cursor-grabbing"
                            draggable
                            // eslint-disable-next-line @typescript-eslint/no-explicit-any
                            onDragStart={(e: any) => handleDragStart(e, play, zoneId)}
                          >
                             <PlayCard play={play} compact popupDirection="right" onClick={() => handleCardClick(play, zoneId)} />
                          </motion.div>
                        )}
                      </AnimatePresence>
                      {!play && <span className="text-stone-600 font-bold uppercase text-[10px] pointer-events-none">Empty</span>}
                    </div>
                  );
                })}
              </div>
            </div>

            {/* Right Area: Depth Chart */}
            <div className="flex-1 flex flex-col min-w-0">
              <h3 className="text-xs font-bold uppercase tracking-widest text-stone-500 mb-2">Depth Chart (Starters at Top)</h3>
              <div className="grid grid-cols-5 gap-2 flex-1 min-h-0 overflow-y-auto pr-1 pb-4">
                {['PG', 'SG', 'SF', 'PF', 'C'].map(pos => {
                  const players = depthChart[pos];
                  const isEligibleHover = draggedItem?.card.type === 'Player' && canPlace((draggedItem.card as PlayerCardData).player.position, pos);
                  const isAdjacentHover = draggedItem?.card.type === 'Player' && isAdjacentEligible((draggedItem.card as PlayerCardData).player.position, pos);
                  const isInvalidHover = draggedItem?.card.type === 'Player' && !isEligibleHover;

                  return (
                    <div 
                      key={pos} 
                      className={`flex flex-col gap-2 rounded-lg p-2 border transition-colors min-h-[300px] ${
                        isAdjacentHover ? 'bg-amber-50 border-amber-400' :
                        isEligibleHover ? 'bg-emerald-50 border-emerald-400' : 
                        isInvalidHover ? 'bg-red-50 border-red-300' : 
                        'bg-stone-50 border-stone-200'
                      }`}
                      onDragOver={isEligibleHover ? handleDragOver : undefined}
                      onDrop={(e) => handleDropOnZone(e, pos)}
                    >
                      <div className="text-center font-black text-stone-600 text-sm border-b border-stone-200 pb-2 mb-2">{pos}</div>
                      
                      <AnimatePresence>
                        {players.map((p, idx) => {
                          const isStarter = idx === 0;
                          return (
                            <motion.div 
                              key={p.id} layout initial={{ opacity: 0, y: -20 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, scale: 0.8 }} 
                              className="relative shrink-0 w-full flex justify-center group/card cursor-grab active:cursor-grabbing"
                              draggable
                              // eslint-disable-next-line @typescript-eslint/no-explicit-any
                              onDragStart={(e: any) => handleDragStart(e, p, pos, idx)}
                              onDragOver={handleDragOver}
                              // eslint-disable-next-line @typescript-eslint/no-explicit-any
                              onDrop={(e: any) => {
                                e.stopPropagation();
                                handleDropOnZone(e, pos, idx);
                              }}
                            >
                              {isStarter ? (
                                <div className="w-full relative" style={{ aspectRatio: '5 / 7' }}>
                                  <div className="absolute inset-0 pointer-events-none">
                                    <PlayerCard player={p} />
                                  </div>
                                  <div className="absolute -top-3 left-1/2 -translate-x-1/2 z-30 bg-emerald-600 text-white text-[9px] font-black px-2 py-0.5 rounded shadow-lg tracking-widest uppercase pointer-events-none whitespace-nowrap">
                                    Starter
                                  </div>
                                </div>
                              ) : (
                                <div className="w-full">
                                  <PlayerCard player={p} compact popupDirection="down" onClick={() => handleCardClick(p, pos)} />
                                </div>
                              )}
                            </motion.div>
                          );
                        })}
                        {players.length === 0 && (
                          <div className="flex-1 flex flex-col items-center justify-center border-2 border-dashed border-stone-800/50 rounded-lg opacity-50 p-2 text-center text-stone-600 text-[10px] font-bold uppercase pointer-events-none min-h-[100px]">
                            Drop {pos} here
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
              <button onClick={() => setIsPlayersOpen(!isPlayersOpen)} className="w-full flex justify-between items-center bg-stone-50 p-3 hover:bg-stone-100 transition-colors">
                <h3 className="text-xs font-bold uppercase tracking-widest text-stone-400">Players ({gLeaguePlayers.length})</h3>
                {isPlayersOpen ? <ChevronDown className="w-4 h-4 text-stone-500" /> : <ChevronRight className="w-4 h-4 text-stone-500" />}
              </button>
              
              <AnimatePresence>
                {isPlayersOpen && (
                  <motion.div initial={{ height: 0 }} animate={{ height: 'auto' }} exit={{ height: 0 }} className="overflow-hidden">
                    <div className="p-3 flex flex-col gap-2 min-h-[80px]">
                      {gLeaguePlayers.map(player => (
                        <div key={player.id} draggable onDragStart={(e) => handleDragStart(e, player, 'GLeaguePlayers')} className="cursor-grab active:cursor-grabbing w-full">
                           <PlayerCard player={player} compact popupDirection="down" onClick={() => handleCardClick(player, 'GLeaguePlayers')} />
                        </div>
                      ))}
                      {gLeaguePlayers.length === 0 && <div className="text-center text-xs text-stone-600 italic py-4 pointer-events-none">No players on bench.</div>}
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
              <button onClick={() => setIsPlaysOpen(!isPlaysOpen)} className="w-full flex justify-between items-center bg-stone-50 p-3 hover:bg-stone-100 transition-colors">
                <h3 className="text-xs font-bold uppercase tracking-widest text-stone-400">Plays ({gLeaguePlays.length})</h3>
                {isPlaysOpen ? <ChevronDown className="w-4 h-4 text-stone-500" /> : <ChevronRight className="w-4 h-4 text-stone-500" />}
              </button>
              
              <AnimatePresence>
                {isPlaysOpen && (
                  <motion.div initial={{ height: 0 }} animate={{ height: 'auto' }} exit={{ height: 0 }} className="overflow-hidden">
                    <div className="p-3 flex flex-col gap-2 min-h-[80px]">
                      {gLeaguePlays.map(play => (
                        <div key={play.id} draggable onDragStart={(e) => handleDragStart(e, play, 'GLeaguePlays')} className="cursor-grab active:cursor-grabbing w-full">
                           <PlayCard play={play as Play} compact popupDirection="down" onClick={() => handleCardClick(play, 'GLeaguePlays')} />
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
                className="flex-1 bg-stone-50 border border-stone-200 hover:border-orange-500 hover:bg-stone-100 transition-colors p-2.5 rounded-lg flex items-center justify-center gap-1.5 group cursor-grab active:cursor-grabbing"
              >
                <span className="text-orange-500 font-black pointer-events-none">+</span>
                <span className="text-stone-500 font-bold uppercase text-[10px] group-hover:text-stone-800 pointer-events-none">Offense</span>
              </div>
              <div 
                draggable 
                onDragStart={(e) => handleDragStart(e, { type: 'Play', id: `basic-defense-${Date.now()}`, name: 'Basic Defense', rarity: 'Common', playCategory: 'basic', mechanicText: 'Minor boost to all Defensive Badges.', badges: [], imageUrl: '' } as Play, 'InfinitePlays')}
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
          >
            <motion.div 
              initial={{ scale: 0.9, y: 20 }} animate={{ scale: 1, y: 0 }} exit={{ scale: 0.9, y: 20 }}
              className="bg-white border border-stone-200 rounded-2xl p-6 shadow-xl w-full max-w-md shadow-2xl relative"
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
    </div>
  );
}
