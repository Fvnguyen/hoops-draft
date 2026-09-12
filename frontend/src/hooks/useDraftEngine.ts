import { useState, useEffect, useCallback, useRef } from 'react';
import { DraftCard, Player, Play } from '../components/PlayerCard';
import { DraftSeat, generateCubePool, getBotPick } from '../engine/draft';
import { DraftPickRecord } from '../engine/deckbuilder';
import { createRng, randomSeed } from '../engine/rng';

const BOT_NAMES = ['Astro', 'HoopsBot', 'DataDunk', 'SwishAI', 'DraftGPT', 'NetMaster', 'RimRunner'];
const TRAITS_POOL = ['Sharpshooter', 'Lockdown Defender', 'Playmaker', 'Finisher', 'Rebounder'];

export function useDraftEngine(allPlayers: Player[], playsDB: Play[]) {
  const [draftState, setDraftState] = useState<'loading' | 'drafting' | 'deckbuilding'>('loading');
  const [seats, setSeats] = useState<DraftSeat[]>([]);
  const [currentPackNumber, setCurrentPackNumber] = useState(1); // 1, 2, 3
  const [currentPickNumber, setCurrentPickNumber] = useState(1); // 1 to 12
  const [overallPick, setOverallPick] = useState(1); // 1 to 36
  const [pickLog, setPickLog] = useState<DraftPickRecord[]>([]);
  const [draftSeed, setDraftSeed] = useState<number | undefined>(undefined);

  // Store pre-generated cube packs: 24 packs (8 seats × 3 rounds)
  const cubePacksRef = useRef<DraftCard[][]>([]);
  const startedRef = useRef(false);

  const startNewDraft = useCallback(() => {
    // Generate ALL 24 packs upfront (cube-style: each player at most once), from a
    // fresh seed so the draft is reproducible/replayable from `draftSeed` alone.
    const seed = randomSeed();
    const allPacks = generateCubePool(allPlayers, playsDB, createRng(seed));
    cubePacksRef.current = allPacks;
    setDraftSeed(seed);

    const initialSeats: DraftSeat[] = [];

    // Round 1: packs 0-7
    // Seat 0: Human
    initialSeats.push({
      id: 'human-0',
      isBot: false,
      drafted: [],
      currentPack: allPacks[0] || [],
    });

    // Seats 1-7: Bots
    for (let i = 1; i < 8; i++) {
      initialSeats.push({
        id: `bot-${i}`,
        isBot: true,
        botProfile: {
          id: `bot-${i}`,
          name: BOT_NAMES[i - 1],
          noiseSeed: Math.floor(Math.random() * 1000000),
          favoredTrait: TRAITS_POOL[Math.floor(Math.random() * TRAITS_POOL.length)],
        },
        drafted: [],
        currentPack: allPacks[i] || [],
      });
    }

    setSeats(initialSeats);
    setCurrentPackNumber(1);
    setCurrentPickNumber(1);
    setOverallPick(1);
    setDraftState('drafting');
  }, [allPlayers, playsDB]);

  // Initialize Draft Pod — start exactly once, when allPlayers first becomes non-empty.
  // startNewDraft is recreated when allPlayers changes, so this effect re-runs then;
  // the ref guards against StrictMode double-invocation and later prop churn.
  useEffect(() => {
    if (allPlayers.length > 0 && !startedRef.current) {
      startedRef.current = true;
      startNewDraft();
    }
  }, [allPlayers, startNewDraft]);

  const processPickAndPass = useCallback((humanPickId: string, zone: 'Roster' | 'GLeague') => {
    if (draftState !== 'drafting') return;

    const newSeats = [...seats.map(s => ({ ...s, drafted: [...s.drafted], currentPack: [...s.currentPack] }))];
    const pickRecords: DraftPickRecord[] = [];
    
    // 1. Record Human Pick
    const humanSeat = newSeats[0];
    const humanPackSnapshot = humanSeat.currentPack.map(c => c.id); // Snapshot BEFORE picking
    const pickedCardIndex = humanSeat.currentPack.findIndex(c => c.id === humanPickId);
    if (pickedCardIndex !== -1) {
      const pickedCard = humanSeat.currentPack.splice(pickedCardIndex, 1)[0];
      humanSeat.drafted.push(pickedCard);
      pickRecords.push({
        packNumber: currentPackNumber,
        pickNumber: currentPickNumber,
        overallPick,
        seatId: humanSeat.id,
        packContents: humanPackSnapshot,
        pickedCardId: humanPickId,
        zone,
      });
    }

    // 2. Record Bot Picks
    for (let i = 1; i < 8; i++) {
      const botSeat = newSeats[i];
      if (botSeat.currentPack.length > 0) {
        const botPackSnapshot = botSeat.currentPack.map(c => c.id); // Snapshot BEFORE picking
        const botPickId = getBotPick(botSeat, overallPick);
        const botPickIndex = botSeat.currentPack.findIndex(c => c.id === botPickId);
        if (botPickIndex !== -1) {
          const pickedCard = botSeat.currentPack.splice(botPickIndex, 1)[0];
          botSeat.drafted.push(pickedCard);
          pickRecords.push({
            packNumber: currentPackNumber,
            pickNumber: currentPickNumber,
            overallPick,
            seatId: botSeat.id,
            packContents: botPackSnapshot,
            pickedCardId: botPickId,
          });
        }
      }
    }

    // Append to pick log
    setPickLog(prev => [...prev, ...pickRecords]);

    // 3. Pass Packs
    const packDirection = currentPackNumber === 2 ? 1 : -1; // Pack 1 & 3: Pass Left (-1). Pack 2: Pass Right (+1).
    const rotatedPacks: DraftCard[][] = new Array(8);

    for (let i = 0; i < 8; i++) {
      let targetSeatIndex = (i + packDirection) % 8;
      if (targetSeatIndex < 0) targetSeatIndex += 8;
      rotatedPacks[targetSeatIndex] = newSeats[i].currentPack;
    }

    // Assign rotated packs
    for (let i = 0; i < 8; i++) {
      newSeats[i].currentPack = rotatedPacks[i];
    }

    // 4. Update State
    let nextPickNum = currentPickNumber + 1;
    let nextPackNum = currentPackNumber;
    const nextOverall = overallPick + 1;

    if (nextPickNum > 12) {
      nextPickNum = 1;
      nextPackNum += 1;
      
      if (nextPackNum > 3) {
        // Draft Complete
        setSeats(newSeats);
        setDraftState('deckbuilding');
        return;
      } else {
        // Deal pre-generated packs for the next round from cube pool
        // Round 2: packs 8-15, Round 3: packs 16-23
        const packOffset = (nextPackNum - 1) * 8;
        for (let i = 0; i < 8; i++) {
          newSeats[i].currentPack = cubePacksRef.current[packOffset + i] || [];
        }
      }
    }

    setSeats(newSeats);
    setCurrentPickNumber(nextPickNum);
    setCurrentPackNumber(nextPackNum);
    setOverallPick(nextOverall);
    
  }, [draftState, seats, currentPackNumber, currentPickNumber, overallPick]);

  const packDirection = currentPackNumber === 2 ? 1 : -1;
  const passingToSeat = seats.length > 0 ? seats[packDirection === 1 ? 1 : 7] : undefined;
  const receivingFromSeat = seats.length > 0 ? seats[packDirection === 1 ? 7 : 1] : undefined;

  return {
    draftState,
    seats,
    humanSeat: seats[0],
    passingToSeat,
    receivingFromSeat,
    currentPackNumber,
    currentPickNumber,
    overallPick,
    pickLog,
    processPickAndPass,
    setDraftState,
    draftSeed,
  };
}
