'use client';

import { useState, useEffect } from 'react';
import { PlayerCard, PlayCard, Player, Play, DraftCard, PositionIcon } from './PlayerCard';
import { motion, AnimatePresence } from 'framer-motion';
import { ChevronRight, ChevronLeft, Users, LayoutList } from 'lucide-react';
import { useDraftEngine } from '../hooks/useDraftEngine';
import { DeckBuilder } from './DeckBuilder';

// Plays database (Systems = Rare/Mythic, Plays = Uncommon/Common)
const playsDB: Play[] = [
  { type: 'Play', id: 'play-sys-1', name: 'Triangle Offense', rarity: 'Mythic', playCategory: 'system', badges: ['Post Scorer', 'Mid-Range'], mechanicText: 'Requires elite post and mid-range scoring. Grants massive +25% efficiency to half-court offense.' },
  { type: 'Play', id: 'play-sys-2', name: '7 Seconds or Less', rarity: 'Mythic', playCategory: 'system', badges: ['Floor General', 'Sharpshooter'], mechanicText: 'Requires a Floor General and 3 Sharpshooters. Grants legendary transition scoring boost.' },
  { type: 'Play', id: 'play-sys-3', name: 'Grit and Grind', rarity: 'Rare', playCategory: 'system', badges: ['Lockdown Defender', 'Glass Cleaner'], mechanicText: 'Requires 2 Lockdown Defenders and 1 Glass Cleaner. Opponent efficiency drops by 20%.' },
  { type: 'Play', id: 'play-sys-4', name: 'Motion Offense', rarity: 'Rare', playCategory: 'system', badges: ['Floor General'], mechanicText: 'Requires high team Playmaking. +15% assist rate and team shooting boost.' },
  { type: 'Play', id: 'play-std-1', name: 'High Pick & Roll', rarity: 'Uncommon', playCategory: 'special', badges: ['Floor General', 'Finisher'], mechanicText: 'Boosts effectiveness of Floor Generals running the PnR.' },
  { type: 'Play', id: 'play-std-2', name: 'Box-and-One', rarity: 'Uncommon', playCategory: 'special', badges: ['Lockdown Defender'], mechanicText: 'Reduces opponent star player impact by 30%. Requires Lockdown Defender.' },
  { type: 'Play', id: 'play-std-3', name: 'Horns', rarity: 'Common', playCategory: 'special', badges: [], mechanicText: 'Provides small scoring boost to PFs and Cs.' },
  { type: 'Play', id: 'play-std-4', name: 'Full Court Press', rarity: 'Common', playCategory: 'special', badges: ['Lockdown Defender'], mechanicText: 'Increases forced turnovers. Costs high stamina.' },
  { type: 'Play', id: 'play-std-5', name: 'Four Out One In', rarity: 'Common', playCategory: 'special', badges: ['Sharpshooter', 'Glass Cleaner'], mechanicText: 'Boosts Sharpshooter effectiveness when paired with a Glass Cleaner.' }
];

function RarityDot({ rarity }: { rarity: DraftCard['rarity'] }) {
  const colors = {
    Common: 'bg-black border-stone-500',
    Uncommon: 'bg-stone-300 border-white',
    Rare: 'bg-yellow-400 border-yellow-200',
    Mythic: 'bg-orange-500 border-orange-300'
  };
  return <div className={`w-2 h-2 rounded-full border ${colors[rarity]} shrink-0`} />;
}

function DraftSidebar({ 
  drafted, humanZones, isOpen, toggle, activeZone, setActiveZone, onDrop 
}: { 
  drafted: DraftCard[], 
  humanZones: Record<string, 'Roster' | 'GLeague'>,
  isOpen: boolean, 
  toggle: () => void,
  activeZone: 'Roster' | 'GLeague',
  setActiveZone: (z: 'Roster' | 'GLeague') => void,
  onDrop: (cardId: string, zone: 'Roster' | 'GLeague') => void
}) {
  const roster = drafted.filter(c => humanZones[c.id] !== 'GLeague');
  const gleague = drafted.filter(c => humanZones[c.id] === 'GLeague');

  const handleDragOver = (e: React.DragEvent) => { e.preventDefault(); };
  const handleDrop = (e: React.DragEvent, zone: 'Roster' | 'GLeague') => {
    e.preventDefault();
    const cardId = e.dataTransfer.getData('text/plain');
    if (cardId) onDrop(cardId, zone);
  };

  return (
    <div className="relative h-full shrink-0 z-40 transition-all duration-300" style={{ width: isOpen ? 320 : 64 }}>
      {/* 
        The sidebar uses absolute positioning so the inner 320px container never gets crushed.
        We just slide it horizontally.
      */}
      <div 
        className="absolute top-0 right-0 h-full w-[320px] bg-white border-l border-stone-200 flex flex-col shadow-xl transition-transform duration-300 ease-out"
        style={{ transform: isOpen ? 'translateX(0)' : 'translateX(256px)' }}
      >
        <button 
          onClick={toggle} 
          className="absolute top-4 -left-3 bg-white border border-stone-200 p-1 rounded-full text-stone-400 hover:text-stone-600 z-50 shadow-md"
        >
          {isOpen ? <ChevronRight size={16} /> : <ChevronLeft size={16} />}
        </button>

        {/* Collapsed Strip Overlay (Always lives in the leftmost 64px) */}
        <div className={`absolute top-0 left-0 w-[64px] h-full flex flex-col items-center pt-16 gap-6 z-20 transition-opacity duration-200 ${isOpen ? 'opacity-0 pointer-events-none' : 'opacity-100'}`}>
          <div 
            className={`p-3 rounded-xl border-2 flex flex-col items-center gap-1 cursor-pointer transition-colors ${activeZone === 'Roster' ? 'bg-stone-100 border-stone-800' : 'border-transparent hover:bg-stone-50'}`}
            onClick={() => { setActiveZone('Roster'); toggle(); }}
            onDragOver={handleDragOver}
            onDrop={(e) => handleDrop(e, 'Roster')}
          >
             <Users size={20} className={activeZone === 'Roster' ? 'text-stone-800' : 'text-stone-400'} />
             <span className="text-[10px] font-black text-stone-700">{roster.length}</span>
          </div>
          <div 
            className={`p-3 rounded-xl border-2 flex flex-col items-center gap-1 cursor-pointer transition-colors ${activeZone === 'GLeague' ? 'bg-stone-100 border-stone-800' : 'border-transparent hover:bg-stone-50'}`}
            onClick={() => { setActiveZone('GLeague'); toggle(); }}
            onDragOver={handleDragOver}
            onDrop={(e) => handleDrop(e, 'GLeague')}
          >
             <LayoutList size={20} className={activeZone === 'GLeague' ? 'text-stone-800' : 'text-stone-400'} />
             <span className="text-[10px] font-black text-stone-700">{gleague.length}</span>
          </div>
        </div>

        {/* Expanded UI */}
        <div className={`flex-1 flex flex-col w-full h-full z-10 transition-opacity duration-200 ${isOpen ? 'opacity-100' : 'opacity-0 pointer-events-none'}`}>
          <div className="p-4 border-b border-stone-200 bg-stone-50 flex items-center gap-3">
            <div className="w-8 h-8 shrink-0 bg-white rounded-md flex items-center justify-center border border-stone-200 cursor-pointer hover:bg-stone-50" onClick={toggle}>
               <LayoutList className="text-stone-600" size={18} />
            </div>
            <div className="whitespace-nowrap">
              <h2 className="text-stone-800 font-bold uppercase tracking-wider text-lg leading-tight">My Team</h2>
              <div className="text-stone-400 text-xs font-medium uppercase tracking-widest">{drafted.length}/36 Drafted</div>
            </div>
          </div>

          <div className="flex-1 overflow-y-auto p-4 flex flex-col gap-6 custom-scrollbar">
            {/* Roster */}
            <div 
              onClick={() => setActiveZone('Roster')}
              onDragOver={handleDragOver}
              onDrop={(e) => handleDrop(e, 'Roster')}
              className={`p-2 -m-2 rounded-lg transition-colors border-2 ${activeZone === 'Roster' ? 'bg-stone-50 border-stone-300' : 'border-transparent hover:border-stone-200'}`}
            >
              <div className="flex items-center justify-between mb-3 px-2">
                <h3 className={`font-bold uppercase tracking-widest text-sm flex items-center gap-2 ${activeZone === 'Roster' ? 'text-stone-800' : 'text-stone-500'}`}>
                  <Users size={16} /> Roster
                </h3>
                <span className="text-stone-400 text-xs font-bold">{roster.length}</span>
              </div>
              <div className="flex flex-col gap-1.5 min-h-[50px]">
                {roster.length === 0 && <div className="text-stone-400 text-xs italic px-2">Drag cards here...</div>}
                {roster.map((c, idx) => (
                  <div key={`${c.id}-${idx}`} className="flex items-center bg-stone-50 hover:bg-stone-100 border border-stone-200 rounded px-2 py-1.5 cursor-default group transition-colors">
                    <RarityDot rarity={c.rarity} />
                    <div className="ml-2 flex items-center justify-center w-6">
                      {c.type === 'Play' ? <div className="text-[10px] font-black text-teal-600">PLY</div> : <PositionIcon position={c.player.position} className="w-[18px] h-[18px] text-[7px]" />}
                    </div>
                    <div className={`flex-1 text-sm font-bold truncate ml-1 ${c.type === 'Play' ? 'text-teal-700' : 'text-stone-700'}`}>{c.type === 'Play' ? c.name : c.player.name}</div>
                  </div>
                ))}
              </div>
            </div>

            {/* G-League */}
            <div 
              onClick={() => setActiveZone('GLeague')}
              onDragOver={handleDragOver}
              onDrop={(e) => handleDrop(e, 'GLeague')}
              className={`p-2 -m-2 rounded-lg transition-colors border-2 ${activeZone === 'GLeague' ? 'bg-stone-50 border-stone-300' : 'border-transparent hover:border-stone-200'}`}
            >
              <div className="flex items-center justify-between mb-3 px-2">
                <h3 className={`font-bold uppercase tracking-widest text-sm flex items-center gap-2 ${activeZone === 'GLeague' ? 'text-stone-800' : 'text-stone-500'}`}>
                  <LayoutList size={16} /> G-League
                </h3>
                <span className="text-stone-400 text-xs font-bold">{gleague.length}</span>
              </div>
              <div className="flex flex-col gap-1.5 min-h-[50px]">
                {gleague.length === 0 && <div className="text-stone-400 text-xs italic px-2">Drag cards here...</div>}
                {gleague.map((c, idx) => (
                  <div key={`${c.id}-${idx}`} className="flex items-center bg-stone-50 hover:bg-stone-100 border border-stone-200 rounded px-2 py-1.5 cursor-default group transition-colors">
                    <RarityDot rarity={c.rarity} />
                    <div className="ml-2 flex items-center justify-center w-6">
                      {c.type === 'Play' ? <div className="text-[10px] font-black text-teal-600">PLY</div> : <PositionIcon position={c.player.position} className="w-[18px] h-[18px] text-[7px]" />}
                    </div>
                    <div className={`flex-1 text-sm font-bold truncate ml-1 ${c.type === 'Play' ? 'text-teal-700' : 'text-stone-700'}`}>{c.type === 'Play' ? c.name : c.player.name}</div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

export function DraftRoom() {
  const [selectedCardId, setSelectedCardId] = useState<string | null>(null);
  const [isClient, setIsClient] = useState(false);
  const [allPlayers, setAllPlayers] = useState<Player[]>([]);
  const [isSidebarOpenToggled, setIsSidebarOpenToggled] = useState(false);
  const [activeZone, setActiveZone] = useState<'Roster' | 'GLeague'>('Roster');
  const [humanZones, setHumanZones] = useState<Record<string, 'Roster' | 'GLeague'>>({});

  const { draftState, seats, humanSeat, passingToSeat, receivingFromSeat, currentPackNumber, currentPickNumber, processPickAndPass } = useDraftEngine(allPlayers, playsDB);

  useEffect(() => {
    setIsClient(true);
    fetch('/api/cards')
      .then(r => r.json())
      .then((data: any[]) => {
        // Tag with type for DeckBuilder
        const cards = data.map(c => ({ ...c, type: 'Player' }));
        setAllPlayers(cards);
      })
      .catch(e => console.error("Failed to load cards API:", e));
  }, []);

  const handleConfirmPick = () => {
    if (selectedCardId) {
      setHumanZones(prev => ({ ...prev, [selectedCardId]: activeZone }));
      processPickAndPass(selectedCardId, activeZone);
      setSelectedCardId(null);
    }
  };

  const handleDrop = (cardId: string, zone: 'Roster' | 'GLeague') => {
    setHumanZones(prev => ({ ...prev, [cardId]: zone }));
    processPickAndPass(cardId, zone);
    setSelectedCardId(null);
  };

  if (!isClient) return null;

  if (draftState === 'loading' || !humanSeat) {
    return (
      <div className="flex h-screen items-center justify-center font-sans">
        <div className="text-2xl font-semibold text-stone-400 animate-pulse">Generating Draft Pod...</div>
      </div>
    );
  }

  if (draftState === 'deckbuilding') {
    return <DeckBuilder draftedCards={humanSeat.drafted} initialZones={humanZones} />;
  }

  const isSidebarOpen = isSidebarOpenToggled || selectedCardId !== null;

  return (
    <div className="flex flex-col md:flex-row h-screen text-stone-800 font-sans relative overflow-hidden pt-[56px]" style={{ background: '#F5F0EA' }}>
      
      {/* Main Draft Area */}
      <div className="flex-1 flex flex-col relative overflow-hidden">
        {/* Arena Style Header */}
        <header className="px-8 py-4 flex justify-between items-center border-b border-stone-200 bg-white/50 backdrop-blur-sm shrink-0">
          <div className="w-64 hidden md:block">
            {/* Spacer for centering */}
          </div>

          <div className="flex-1 flex justify-center items-center gap-4 sm:gap-8">
             {/* Left Player (Seat 7) */}
             <div className="flex flex-col items-center gap-1 opacity-80">
                <div className={`w-8 h-8 rounded-full bg-white border flex items-center justify-center text-sm ${currentPackNumber !== 2 ? 'border-stone-400 shadow-sm' : 'border-stone-200'}`}>🤖</div>
                <span className={`text-[9px] uppercase tracking-widest font-bold ${currentPackNumber !== 2 ? 'text-stone-600' : 'text-stone-400'}`}>{seats[7]?.botProfile?.name || 'Player'}</span>
             </div>
             
             {/* Central Pass UI */}
             <div className="flex items-center gap-3 sm:gap-6">
                {currentPackNumber === 2 ? <ChevronRight className="text-stone-400 hidden sm:block" size={24} /> : <ChevronLeft className="text-stone-400 hidden sm:block" size={24} />}
                <div className="flex flex-col items-center">
                   <div className="text-stone-400 font-medium uppercase tracking-widest text-[10px]">Pack {currentPackNumber}</div>
                   <div className="text-2xl font-bold text-stone-800 leading-none mt-1 whitespace-nowrap">
                     Pick {currentPickNumber} <span className="text-stone-400 text-lg">/ 12</span>
                   </div>
                </div>
                {currentPackNumber === 2 ? <ChevronRight className="text-stone-400 hidden sm:block" size={24} /> : <ChevronLeft className="text-stone-400 hidden sm:block" size={24} />}
             </div>

             {/* Right Player (Seat 1) */}
             <div className="flex flex-col items-center gap-1 opacity-80">
                <div className={`w-8 h-8 rounded-full bg-white border flex items-center justify-center text-sm ${currentPackNumber === 2 ? 'border-stone-400 shadow-sm' : 'border-stone-200'}`}>🤖</div>
                <span className={`text-[9px] uppercase tracking-widest font-bold ${currentPackNumber === 2 ? 'text-stone-600' : 'text-stone-400'}`}>{seats[1]?.botProfile?.name || 'Player'}</span>
             </div>
          </div>

          <div className="w-64 hidden md:flex justify-end">
            <div className="text-stone-500 font-medium text-[10px] uppercase tracking-widest bg-white px-3 py-1.5 rounded-full border border-stone-200 flex items-center gap-1.5 shadow-sm">
              Passing {currentPackNumber === 2 ? 'Right' : 'Left'} {currentPackNumber === 2 ? <ChevronRight size={14}/> : <ChevronLeft size={14}/>}
            </div>
          </div>
        </header>

        {/* Cards Grid */}
        <main className="flex-1 overflow-y-auto flex flex-col items-center pt-8 px-8 pb-32 custom-scrollbar">
          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-3 md:gap-4 lg:gap-5 w-full max-w-[1300px] mx-auto">
            <AnimatePresence>
              {humanSeat.currentPack.map((card, index) => (
                <motion.div 
                  key={card.id}
                  initial={{ opacity: 0, y: 50, scale: 0.9 }}
                  animate={{ opacity: 1, y: 0, scale: 1 }}
                  exit={{ opacity: 0, scale: 0.8, y: -50 }}
                  transition={{ delay: index * 0.05, type: "spring", stiffness: 300, damping: 25 }}
                  className="flex justify-center [perspective:1000px]"
                  draggable
                  onDragStart={(e: any) => {
                    e.dataTransfer?.setData('text/plain', card.id);
                    setSelectedCardId(card.id);
                  }}
                  onDragEnd={() => setSelectedCardId(null)}
                >
                  {card.type === 'Play' ? (
                    <PlayCard
                      play={card as Play}
                      isSelected={selectedCardId === card.id}
                      onClick={() => setSelectedCardId(card.id)}
                    />
                  ) : (
                    <PlayerCard 
                      player={card as Player} 
                      isSelected={selectedCardId === card.id}
                      onClick={() => setSelectedCardId(card.id)}
                    />
                  )}
                </motion.div>
              ))}
            </AnimatePresence>
          </div>
        </main>

        {/* Confirm Button */}
        <div className="absolute bottom-0 left-0 right-0 p-6 bg-gradient-to-t from-stone-950 via-stone-950/90 to-transparent flex justify-center pb-10 pointer-events-none z-30">
          <motion.button
            initial={{ y: 150, opacity: 0 }}
            animate={{ y: selectedCardId ? 0 : 150, opacity: selectedCardId ? 1 : 0 }}
            onClick={handleConfirmPick}
            className="pointer-events-auto px-16 py-4 bg-gradient-to-r from-orange-500 to-red-600 hover:from-orange-400 hover:to-red-500 text-white font-black text-xl rounded-full shadow-[0_0_40px_rgba(249,115,22,0.4)] transition-all transform hover:scale-105 active:scale-95 border-2 border-white/20 uppercase tracking-widest flex flex-col items-center leading-none"
          >
            <span>Confirm Pick</span>
          </motion.button>
        </div>
      </div>

      {/* Draft Sidebar */}
      <DraftSidebar 
        drafted={humanSeat.drafted} 
        humanZones={humanZones}
        isOpen={isSidebarOpen} 
        toggle={() => setIsSidebarOpenToggled(!isSidebarOpenToggled)}
        activeZone={activeZone}
        setActiveZone={setActiveZone}
        onDrop={handleDrop}
      />
    </div>
  );
}
