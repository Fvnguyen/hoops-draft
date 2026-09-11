import { useState, useEffect, useCallback } from 'react';
import { DraftCard, Player, Play } from '../components/PlayerCard';
import { DraftSeat, generatePack, getBotPick, BotProfile } from '../lib/draftEngine';

const BOT_NAMES = ['Astro', 'HoopsBot', 'DataDunk', 'SwishAI', 'DraftGPT', 'NetMaster', 'RimRunner'];
const TRAITS_POOL = ['Sharpshooter', 'Lockdown Defender', 'Playmaker', 'Finisher', 'Rebounder'];

export function useDraftEngine(allPlayers: Player[], playsDB: Play[]) {
  const [draftState, setDraftState] = useState<'loading' | 'drafting' | 'deckbuilding'>('loading');
  const [seats, setSeats] = useState<DraftSeat[]>([]);
  const [currentPackNumber, setCurrentPackNumber] = useState(1); // 1, 2, 3
  const [currentPickNumber, setCurrentPickNumber] = useState(1); // 1 to 12
  const [overallPick, setOverallPick] = useState(1); // 1 to 36

  // Initialize Draft Pod
  useEffect(() => {
    if (allPlayers.length > 0 && seats.length === 0) {
      startNewDraft();
    }
  }, [allPlayers]);

  const startNewDraft = useCallback(() => {
    const initialSeats: DraftSeat[] = [];
    
    // Seat 0: Human
    initialSeats.push({
      id: 'human-0',
      isBot: false,
      drafted: [],
      currentPack: generatePack(allPlayers, playsDB),
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
        currentPack: generatePack(allPlayers, playsDB),
      });
    }

    setSeats(initialSeats);
    setCurrentPackNumber(1);
    setCurrentPickNumber(1);
    setOverallPick(1);
    setDraftState('drafting');
  }, [allPlayers, playsDB]);

  const processPickAndPass = useCallback((humanPickId: string, zone: 'Roster' | 'GLeague') => {
    if (draftState !== 'drafting') return;

    const newSeats = [...seats.map(s => ({ ...s, drafted: [...s.drafted], currentPack: [...s.currentPack] }))];
    
    // 1. Record Human Pick
    const humanSeat = newSeats[0];
    const pickedCardIndex = humanSeat.currentPack.findIndex(c => c.id === humanPickId);
    if (pickedCardIndex !== -1) {
      const pickedCard = humanSeat.currentPack.splice(pickedCardIndex, 1)[0];
      // Keep track of human's zone choice by modifying the card object temporarily or we can just push to drafted. 
      // To keep it simple, we'll store zone in a UI-level wrapper later, but for now we just push to drafted.
      humanSeat.drafted.push(pickedCard);
    }

    // 2. Record Bot Picks
    for (let i = 1; i < 8; i++) {
      const botSeat = newSeats[i];
      if (botSeat.currentPack.length > 0) {
        const botPickId = getBotPick(botSeat, overallPick);
        const botPickIndex = botSeat.currentPack.findIndex(c => c.id === botPickId);
        if (botPickIndex !== -1) {
          const pickedCard = botSeat.currentPack.splice(botPickIndex, 1)[0];
          botSeat.drafted.push(pickedCard);
        }
      }
    }

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
    let nextOverall = overallPick + 1;

    if (nextPickNum > 12) {
      nextPickNum = 1;
      nextPackNum += 1;
      
      if (nextPackNum > 3) {
        // Draft Complete
        setSeats(newSeats);
        setDraftState('deckbuilding');
        return;
      } else {
        // Generate new packs for next round
        for (let i = 0; i < 8; i++) {
          newSeats[i].currentPack = generatePack(allPlayers, playsDB);
        }
      }
    }

    setSeats(newSeats);
    setCurrentPickNumber(nextPickNum);
    setCurrentPackNumber(nextPackNum);
    setOverallPick(nextOverall);
    
  }, [draftState, seats, currentPackNumber, currentPickNumber, overallPick, allPlayers, playsDB]);

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
    processPickAndPass,
    setDraftState,
  };
}
