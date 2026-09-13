'use client';

import { useState, useEffect, useRef, useSyncExternalStore } from 'react';
import { PlayerCard, PlayCard, Player, Play } from './PlayerCard';
import { motion, AnimatePresence } from 'framer-motion';
import { ChevronRight, ChevronLeft, Volume2, VolumeX } from 'lucide-react';
import { useDraftEngine } from '../hooks/useDraftEngine';
import { DeckBuilder } from './DeckBuilder';
import { PackOpener } from './PackOpener';
import { DraftSidebar } from './DraftSidebar';
import { PackPassStage, passStaggerDelayMs } from './PackPassStage';
import { PickTimerRing } from './PickTimerRing';
import { RoundSummary } from './RoundSummary';
import { getGameStore } from '@/storage';
import { StorageQuotaError } from '@/storage/types';
import { buildDraftSession } from '../lib/sessionBuilder';
import { buildBotRoster } from '../engine/deckbuilder';
import { calcRosterIdentity, resolveDepthChart } from '../engine/rosterStats';
import type { RosterIdentity } from '../engine/rosterStats';
import type { PlayerCardData } from '../engine/types';
import type { DraftSeat } from '../engine/draft';
import type { DraftPickRecord } from '../engine/deckbuilder';
import { isSfxEnabled, setSfxEnabled } from '../audio/sfx';
import { clockScaleFromQuery } from '../lib/draftTimer';
import { CUBE_PACKS, CUBE_PLAYER_CARDS_PER_PACK } from '../engine/balance';

// Picks per pack = players + the play card; total = packs × picks (see engine/balance.ts).
const PICKS_PER_PACK = CUBE_PLAYER_CARDS_PER_PACK + 1;
const TOTAL_PICKS = CUBE_PACKS * PICKS_PER_PACK;

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

// ── Bot pick ticker ──────────────────────────────────────────────────────
//
// Surfaces the most recent bot picks (pickLog) so the draft doesn't feel
// solitary. Resolves names from the seats' own `drafted` arrays rather than
// a separate id->card map, since every picked card already lives there.
// Neighbour seats' picks are prioritized to the front of the ticker. A
// human pick shows up too, but only when the clock made it (D5).
function resolvePickLabel(record: DraftPickRecord, seats: DraftSeat[]): string | null {
  const seat = seats.find(s => s.id === record.seatId);
  if (!seat) return null;
  const card = seat.drafted.find(c => c.id === record.pickedCardId);
  if (!card) return null;
  const cardName = card.type === 'Play' ? card.name : card.player.name;
  if (record.autoPicked) {
    return `Clock took ${cardName} for you`;
  }
  const botName = seat.botProfile?.name || 'Bot';
  return `${botName} took ${cardName}`;
}

function BotPickTicker({ pickLog, seats }: { pickLog: DraftPickRecord[]; seats: DraftSeat[] }) {
  const neighbourIds = new Set([seats[7]?.id, seats[1]?.id].filter(Boolean));

  const items = pickLog
    .filter(r => r.seatId !== 'human-0' || r.autoPicked)
    .slice(-16)
    .sort((a, b) => {
      const aFirst = neighbourIds.has(a.seatId) ? 0 : 1;
      const bFirst = neighbourIds.has(b.seatId) ? 0 : 1;
      if (aFirst !== bFirst) return aFirst - bFirst;
      return b.overallPick - a.overallPick;
    })
    .map(r => resolvePickLabel(r, seats))
    .filter((s): s is string => !!s)
    .slice(0, 6);

  if (items.length === 0) return null;

  return (
    <div className="w-full overflow-x-auto whitespace-nowrap px-8 py-1.5 bg-stone-100/70 border-b border-stone-200 text-[11px] text-stone-500 font-medium custom-scrollbar shrink-0">
      {items.map((text, i) => (
        <motion.span
          key={i}
          initial={{ opacity: 0, y: -4 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: passStaggerDelayMs(i) / 1000, duration: 0.2 }}
        >
          {i > 0 && <span className="mx-2 text-stone-300">·</span>}
          {text}
        </motion.span>
      ))}
    </div>
  );
}

function SaveErrorBanner({ message }: { message: string | null }) {
  if (!message) return null;
  return (
    <div className="fixed top-[56px] left-0 right-0 z-50 bg-red-50 border-b border-red-200 px-4 py-3">
      <p className="text-sm text-red-700 font-semibold text-center">{message}</p>
    </div>
  );
}

function ModePill({ mode }: { mode: 'quick' | 'premier' }) {
  return (
    <span className="text-stone-500 font-black text-[9px] uppercase tracking-widest bg-white px-2.5 py-1 rounded-full border border-stone-200 shadow-sm">
      {mode === 'premier' ? 'Premier' : 'Quick'}
    </span>
  );
}

function SfxToggle() {
  // Lazy-init from localStorage: this component only ever mounts client-side
  // (DraftRoom renders null until isClient flips true), so it's safe to read
  // here instead of syncing it in via an effect.
  const [enabled, setEnabled] = useState(() => isSfxEnabled());

  const toggle = () => {
    const next = !enabled;
    setSfxEnabled(next);
    setEnabled(next);
  };

  return (
    <button
      type="button"
      onClick={toggle}
      title={enabled ? 'Mute sound' : 'Enable sound'}
      aria-pressed={enabled}
      className="w-7 h-7 rounded-full border border-stone-200 bg-white flex items-center justify-center text-stone-400 hover:text-stone-700 hover:border-stone-300 transition-colors shadow-sm shrink-0"
    >
      {enabled ? <Volume2 size={13} /> : <VolumeX size={13} />}
    </button>
  );
}

function averageRosterIdentities(identities: RosterIdentity[]): RosterIdentity | undefined {
  if (identities.length === 0) return undefined;

  const average = (key: keyof RosterIdentity) =>
    identities.reduce((sum, identity) => sum + identity[key], 0) / identities.length;

  return {
    finishing: average('finishing'),
    midRange: average('midRange'),
    perimeter: average('perimeter'),
    playmaking: average('playmaking'),
    rebounding: average('rebounding'),
    perDef: average('perDef'),
    postDef: average('postDef'),
  };
}

// Always true once mounted on the client, false during SSR — the mismatch between
// getSnapshot and getServerSnapshot makes React re-render right after hydration
// without a component-level setState call inside an effect.
function subscribeNever() {
  return () => {};
}

export interface DraftRoomProps {
  /** Draft mode (plan ui_draft_deckbuild_pack, D1). Read server-side from
   *  `?mode=` by `app/draft/page.tsx` (T3); missing/unknown defaults to Premier. */
  mode?: 'quick' | 'premier';
  /** `?clock=fast` (D4, dev-only): scales the Premier pick clock down so it
   *  can be exercised quickly in tests/manual QA. Converted to a multiplier
   *  via `clockScaleFromQuery` and passed straight into `armIntroClock`. */
  clockFast?: boolean;
}

export function DraftRoom({ mode = 'premier', clockFast = false }: DraftRoomProps = {}) {
  const [selectedCardId, setSelectedCardId] = useState<string | null>(null);
  const isClient = useSyncExternalStore(subscribeNever, () => true, () => false);
  const [allPlayers, setAllPlayers] = useState<Player[]>([]);
  // Sidebar defaults open on lg+ screens (>=1024px), collapsed strip below that.
  // Read only at mount: this component renders null until isClient flips true,
  // so by the time this state is actually shown, `window` is always defined.
  const [isSidebarOpenToggled, setIsSidebarOpenToggled] = useState(
    () => typeof window !== 'undefined' && window.innerWidth >= 1024
  );
  const [activeZone, setActiveZone] = useState<'Roster' | 'GLeague'>('Roster');
  const [humanZones, setHumanZones] = useState<Record<string, 'Roster' | 'GLeague'>>({});
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [saveError, setSaveError] = useState<string | null>(null);
  const savingSessionRef = useRef(false);

  // D4: `?clock=fast` (dev-only — clockScaleFromQuery ignores it in production)
  // scales the pick clock down; passed straight into `armIntroClock(scale)`.
  const clockScale = clockScaleFromQuery(clockFast ? 'fast' : null, process.env.NODE_ENV === 'production');

  const {
    draftState,
    seats,
    humanSeat,
    currentPackNumber,
    currentPickNumber,
    overallPick,
    pickLog,
    processPickAndPass,
    pickFromIntro,
    setDraftState,
    draftSeed,
    pickDeadline,
    passSeq,
    startNextRound,
    expirePick,
    armIntroClock,
  } = useDraftEngine(allPlayers, playsDB, mode);

  const podAverageIdentity = averageRosterIdentities(
    seats
      .filter(seat => seat.isBot)
      .map(seat => {
        const players = seat.drafted.filter(
          (card): card is PlayerCardData => card.type === 'Player'
        );
        const botRoster = buildBotRoster(seat.drafted, seat.botProfile);
        return calcRosterIdentity(resolveDepthChart(players, botRoster.depthChart));
      })
  );

  // Persist the full draft pod + pick history when transitioning to deckbuilding
  useEffect(() => {
    if (draftState === 'deckbuilding' && seats.length > 0 && !sessionId && !savingSessionRef.current) {
      savingSessionRef.current = true;
      const session = buildDraftSession(seats, pickLog, draftSeed, mode);
      getGameStore()
        .saveDraftSession(session)
        .then(() => {
          setSessionId(session.id);
          console.log(`Draft session saved: ${session.id} (${seats.length} seats, ${pickLog.length} pick records, ${seats.reduce((s, seat) => s + seat.drafted.length, 0)} total cards)`);
        })
        .catch((err) => {
          savingSessionRef.current = false;
          if (err instanceof StorageQuotaError) {
            setSaveError(err.message);
          } else {
            setSaveError('Failed to save draft session. Please try again.');
          }
        });
    }
  }, [draftState, seats, sessionId, pickLog, draftSeed, mode]);

  useEffect(() => {
    fetch('/api/cards')
      .then(r => r.json())
      .then((data: Array<Omit<Player, 'type'>>) => {
        // Tag with type for DeckBuilder
        const cards = data.map(c => ({ ...c, type: 'Player' as const }));
        setAllPlayers(cards);
      })
      .catch(e => console.error("Failed to load cards API:", e));
  }, []);

  // Arm the pick clock (D4) once the pack for a live drafting turn is
  // actually in place. No-op in Quick mode / outside 'drafting' (armIntroClock
  // nulls pickDeadline itself in that case).
  useEffect(() => {
    armIntroClock(clockScale);
  }, [draftState, overallPick, armIntroClock, clockScale]);

  // Timeout: the clock ran out on the current pick (D5/D4). Guarded by
  // overallPick inside expirePick itself (per its contract) so this effect
  // re-arming on every render is safe.
  useEffect(() => {
    if (mode !== 'premier' || pickDeadline == null || draftState !== 'drafting') return;
    const msLeft = pickDeadline - Date.now();
    if (msLeft <= 0) {
      expirePick(overallPick);
      return;
    }
    const timer = window.setTimeout(() => expirePick(overallPick), msLeft);
    return () => window.clearTimeout(timer);
  }, [mode, pickDeadline, draftState, overallPick, expirePick]);

  const handleConfirmPick = () => {
    if (selectedCardId) {
      setHumanZones(prev => ({ ...prev, [selectedCardId]: activeZone }));
      processPickAndPass(selectedCardId, activeZone);
      setSelectedCardId(null);
    }
  };

  // Dropping a just-selected pack card onto a zone: assigns the zone AND
  // advances the draft (the card hasn't been picked yet).
  const handleDrop = (cardId: string, zone: 'Roster' | 'GLeague') => {
    setHumanZones(prev => ({ ...prev, [cardId]: zone }));
    processPickAndPass(cardId, zone);
    setSelectedCardId(null);
  };

  // Re-filing an already-drafted card between Roster/G-League (sidebar's
  // trailing zone-toggle button): zone bookkeeping only, never touches the
  // pick counter or pack contents.
  const handleReassignZone = (cardId: string, zone: 'Roster' | 'GLeague') => {
    setHumanZones(prev => ({ ...prev, [cardId]: zone }));
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
    return (
      <>
        <SaveErrorBanner message={saveError} />
        <DeckBuilder draftedCards={humanSeat.drafted} initialZones={humanZones} sessionId={sessionId ?? undefined} podAverageIdentity={podAverageIdentity} />
      </>
    );
  }

  const packDirection = currentPackNumber === 2 ? 1 : -1;
  const isPackIntro = draftState === 'pack-intro';
  const isRoundSummary = draftState === 'round-summary';
  const isSidebarOpen = (isSidebarOpenToggled || selectedCardId !== null) && !isPackIntro;
  // D7/D8: the opener now renders inside the real room's <main>, with the
  // header/ticker/sidebar blurred behind it instead of a hand-built backdrop.
  const backdropClass = isPackIntro ? 'blur-sm pointer-events-none select-none' : '';

  return (
    <div className="flex flex-col md:flex-row h-screen text-stone-800 font-sans relative overflow-hidden pt-[56px]" style={{ background: '#F5F0EA' }}>
      <SaveErrorBanner message={saveError} />

      {isRoundSummary && (
        <RoundSummary
          drafted={humanSeat.drafted}
          humanZones={humanZones}
          // `currentPackNumber` already points at the upcoming pack while
          // paused in round-summary (applyPick advances it before pausing).
          completedPackNumber={currentPackNumber - 1}
          nextPassDirection={currentPackNumber === 2 ? 'right' : 'left'}
          onStartNextRound={startNextRound}
        />
      )}

      {/* Main Draft Area */}
      <div className="flex-1 flex flex-col relative overflow-hidden">
        {/* Arena Style Header */}
        <header className={`px-8 py-4 flex justify-between items-center border-b border-stone-200 bg-white/50 backdrop-blur-sm shrink-0 transition-[filter] duration-200 ${backdropClass}`}>
          <div className="w-64 hidden md:flex items-center gap-2">
            <ModePill mode={mode} />
            {mode === 'premier' && <PickTimerRing pickDeadline={isPackIntro ? null : pickDeadline} pickNumber={currentPickNumber} size={34} />}
            <SfxToggle />
          </div>

          <div className="flex-1 flex justify-center items-center gap-4 sm:gap-8">
             {/* Left Player (Seat 7) */}
             <motion.div
               key={`left-${passSeq}`}
               initial={{ scale: 1 }}
               animate={{ scale: [1, 1.15, 1] }}
               transition={{ duration: 0.3, delay: passStaggerDelayMs(currentPackNumber === 2 ? 1 : 0) / 1000 }}
               className="flex flex-col items-center gap-1 opacity-80"
             >
                <div className={`w-8 h-8 rounded-full bg-white border flex items-center justify-center text-sm ${currentPackNumber !== 2 ? 'border-stone-400 shadow-sm' : 'border-stone-200'}`}>🤖</div>
                <span className={`text-[9px] uppercase tracking-widest font-bold ${currentPackNumber !== 2 ? 'text-stone-600' : 'text-stone-400'}`}>{seats[7]?.botProfile?.name || 'Player'}</span>
             </motion.div>

             {/* Central Pass UI */}
             <div className="flex items-center gap-3 sm:gap-6">
                {currentPackNumber === 2 ? <ChevronRight className="text-stone-400 hidden sm:block" size={24} /> : <ChevronLeft className="text-stone-400 hidden sm:block" size={24} />}
                <div className="flex flex-col items-center gap-1.5">
                   <div className="text-stone-800 font-bold text-sm leading-none whitespace-nowrap">
                     Pack {currentPackNumber} <span className="text-stone-400 font-medium">·</span> Pick {currentPickNumber} of {PICKS_PER_PACK}
                   </div>
                   <div className="w-56 sm:w-72 h-1.5 rounded-full bg-stone-200 overflow-hidden flex gap-[1.5px]">
                     {Array.from({ length: TOTAL_PICKS }).map((_, i) => (
                       <div
                         key={i}
                         className={`flex-1 rounded-[1px] ${i < overallPick - 1 ? 'bg-orange-500' : 'bg-stone-200'}`}
                       />
                     ))}
                   </div>
                   <div className="text-stone-400 font-medium uppercase tracking-widest text-[9px]">
                     Overall Pick {overallPick} / {TOTAL_PICKS}
                   </div>
                </div>
                {currentPackNumber === 2 ? <ChevronRight className="text-stone-400 hidden sm:block" size={24} /> : <ChevronLeft className="text-stone-400 hidden sm:block" size={24} />}
             </div>

             {/* Right Player (Seat 1) */}
             <motion.div
               key={`right-${passSeq}`}
               initial={{ scale: 1 }}
               animate={{ scale: [1, 1.15, 1] }}
               transition={{ duration: 0.3, delay: passStaggerDelayMs(currentPackNumber === 2 ? 0 : 1) / 1000 }}
               className="flex flex-col items-center gap-1 opacity-80"
             >
                <div className={`w-8 h-8 rounded-full bg-white border flex items-center justify-center text-sm ${currentPackNumber === 2 ? 'border-stone-400 shadow-sm' : 'border-stone-200'}`}>🤖</div>
                <span className={`text-[9px] uppercase tracking-widest font-bold ${currentPackNumber === 2 ? 'text-stone-600' : 'text-stone-400'}`}>{seats[1]?.botProfile?.name || 'Player'}</span>
             </motion.div>
          </div>

          <div className="w-64 hidden md:flex justify-end">
            <div className="text-stone-500 font-medium text-[10px] uppercase tracking-widest bg-white px-3 py-1.5 rounded-full border border-stone-200 flex items-center gap-1.5 shadow-sm">
              Passing {currentPackNumber === 2 ? 'Right' : 'Left'} {currentPackNumber === 2 ? <ChevronRight size={14}/> : <ChevronLeft size={14}/>}
            </div>
          </div>
        </header>

        <div className={`transition-[filter] duration-200 ${backdropClass}`}>
          <BotPickTicker pickLog={pickLog} seats={seats} />
        </div>

        {isPackIntro ? (
          // D7/D8: embedded in the room's own <main> rather than a fixed
          // full-screen overlay — header/ticker/sidebar are blurred behind it
          // (backdropClass above) instead of the old hand-built
          // DraftRoomIntroBackdrop.
          <main className="flex-1 overflow-y-auto relative">
            <PackOpener
              pack={humanSeat.currentPack}
              packNumber={currentPackNumber}
              totalPacks={CUBE_PACKS}
              mode={mode}
              pickDeadline={pickDeadline}
              embedded
              className="max-w-[1500px] mx-auto"
              onPick={(pick) => pickFromIntro(pick.cardId, pick.zone)}
              onComplete={() => {
                setIsSidebarOpenToggled(false);
                setDraftState('drafting');
              }}
            />
          </main>
        ) : (
          <>
            {/* Cards Grid */}
            <main className="flex-1 overflow-y-auto flex flex-col items-center pt-6 px-6 pb-32 custom-scrollbar">
              <PackPassStage passSeq={passSeq} direction={packDirection === 1 ? 'right' : 'left'}>
                <div className="grid grid-cols-3 sm:grid-cols-4 lg:grid-cols-5 gap-5 lg:gap-6 w-full max-w-[1500px] mx-auto">
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
                        // motion.div types onDragStart as its own pan/drag-gesture handler
                        // (MouseEvent | TouchEvent | PointerEvent), which doesn't carry
                        // dataTransfer — but the `draggable` attribute still fires a real
                        // native HTML5 dragstart event at runtime, so we cast to the type
                        // that's actually there instead of widening the param to `any`.
                        onDragStart={(e) => {
                          const dragEvent = e as unknown as React.DragEvent<HTMLDivElement>;
                          dragEvent.dataTransfer?.setData('text/plain', card.id);
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
                            size="sm"
                          />
                        )}
                      </motion.div>
                    ))}
                  </AnimatePresence>
                </div>
              </PackPassStage>
            </main>

            {/* Confirm Button — the gradient wrapper only mounts while a card is
                selected, so it no longer permanently darkens the last row of cards. */}
            <AnimatePresence>
              {selectedCardId && (
                <motion.div
                  key="confirm-bar"
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  exit={{ opacity: 0 }}
                  className="absolute bottom-0 left-0 right-0 p-6 bg-gradient-to-t from-stone-950 via-stone-950/90 to-transparent flex justify-center pb-10 pointer-events-none z-30"
                >
                  <motion.button
                    initial={{ y: 150 }}
                    animate={{ y: 0 }}
                    exit={{ y: 150 }}
                    onClick={handleConfirmPick}
                    className="pointer-events-auto px-16 py-4 bg-gradient-to-r from-orange-500 to-red-600 hover:from-orange-400 hover:to-red-500 text-white font-black text-xl rounded-full shadow-[0_0_40px_rgba(249,115,22,0.4)] transition-all transform hover:scale-105 active:scale-95 border-2 border-white/20 uppercase tracking-widest flex flex-col items-center leading-none"
                  >
                    <span>Confirm Pick</span>
                  </motion.button>
                </motion.div>
              )}
            </AnimatePresence>
          </>
        )}
      </div>

      {/* Draft Sidebar */}
      <div className={`transition-[filter] duration-200 ${backdropClass}`}>
        <DraftSidebar
          drafted={humanSeat.drafted}
          humanZones={humanZones}
          isOpen={isSidebarOpen}
          toggle={() => setIsSidebarOpenToggled(!isSidebarOpenToggled)}
          activeZone={activeZone}
          setActiveZone={setActiveZone}
          onDropPick={handleDrop}
          onReassignZone={handleReassignZone}
        />
      </div>
    </div>
  );
}
