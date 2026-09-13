import { useState, useEffect, useCallback, useRef } from 'react';
import { DraftCard, Player, Play } from '../components/PlayerCard';
import { DraftSeat, generateCubePool, getBotPick, type BotProfile } from '../engine/draft';
import { DraftPickRecord } from '../engine/deckbuilder';
import { createRng, pick, randomSeed, type Rng } from '../engine/rng';
import { CUBE_PLAYER_CARDS_PER_PACK } from '../engine/balance';

const BOT_NAMES = ['Astro', 'HoopsBot', 'DataDunk', 'SwishAI', 'DraftGPT', 'NetMaster', 'RimRunner'];
const TRAITS_POOL = ['Sharpshooter', 'Lockdown Defender', 'Playmaker', 'Finisher', 'Rebounder'];

/**
 * Draws the 7 bot profiles from `rng` (in seat order), so the same draft
 * seed reproduces the same bot noise/trait leanings across replays.
 */
export function createBotProfiles(rng: Rng): BotProfile[] {
  return BOT_NAMES.map((name, idx) => ({
    id: `bot-${idx + 1}`,
    name,
    noiseSeed: Math.floor(rng.next() * 1000000),
    favoredTrait: pick(rng, TRAITS_POOL),
  }));
}

/** Draft mode (plan ui_draft_deckbuild_pack, D1). Quick skips the timer and the
 *  round-summary pause; Premier gets both. */
export type DraftMode = 'quick' | 'premier';

export function useDraftEngine(allPlayers: Player[], playsDB: Play[], mode: DraftMode = 'premier') {
  // 'round-summary' (D3, Premier only) pauses the draft after packs 1 and 2.
  const [draftState, setDraftState] = useState<'loading' | 'pack-intro' | 'drafting' | 'round-summary' | 'deckbuilding'>('loading');
  const [seats, setSeats] = useState<DraftSeat[]>([]);
  const [currentPackNumber, setCurrentPackNumber] = useState(1); // 1, 2, 3
  const [currentPickNumber, setCurrentPickNumber] = useState(1); // 1 to 12
  const [overallPick, setOverallPick] = useState(1); // 1 to 36
  const [pickLog, setPickLog] = useState<DraftPickRecord[]>([]);
  const [draftSeed, setDraftSeed] = useState<number | undefined>(undefined);
  // D4: epoch ms the current pick expires at; null outside a timed Premier pick.
  // Armed by `armIntroClock` (T1) once a pack is actually in place — the timer
  // never runs during the intro opener, round summaries, or in Quick mode.
  const [pickDeadline, setPickDeadline] = useState<number | null>(null);
  // Bumped once per pass so `PackPassStage` (T3) can key its animation off a
  // value that changes even when pack contents coincidentally look the same.
  const [passSeq, setPassSeq] = useState(0);

  // Store pre-generated cube packs: 24 packs (8 seats × 3 rounds)
  const cubePacksRef = useRef<DraftCard[][]>([]);
  const startedRef = useRef(false);

  const startNewDraft = useCallback(() => {
    // Generate ALL 24 packs upfront (cube-style: each player at most once), from a
    // fresh seed so the draft is reproducible/replayable from `draftSeed` alone.
    const seed = randomSeed();
    const rng = createRng(seed);
    const allPacks = generateCubePool(allPlayers, playsDB, rng);
    cubePacksRef.current = allPacks;
    setDraftSeed(seed);

    const botProfiles = createBotProfiles(rng);
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
        botProfile: botProfiles[i - 1],
        drafted: [],
        currentPack: allPacks[i] || [],
      });
    }

    setSeats(initialSeats);
    setCurrentPackNumber(1);
    setCurrentPickNumber(1);
    setOverallPick(1);
    setDraftState('pack-intro');
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

    if (nextPickNum > CUBE_PLAYER_CARDS_PER_PACK + 1) {
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
    setPassSeq(prev => prev + 1);

  }, [draftState, seats, currentPackNumber, currentPickNumber, overallPick]);

  // ── T1 stubs (D3-D5): kept here only so callers compile against the final
  // hook API during T0; real behaviour (round-summary pause, the pick clock,
  // timeout auto-pick) lands in T1. ──────────────────────────────────────────

  /** Pick straight from the intro/premier opener spread (D7) instead of via the
   *  post-reveal grid. No-op until T1. */
  const pickFromIntro = useCallback((cardId: string, zone: 'Roster' | 'GLeague') => {
    void cardId; void zone;
  }, []);

  /** Leaves `round-summary` and deals the next pack's opener (D3). No-op until T1. */
  const startNextRound = useCallback(() => {}, []);

  /** Clock ran out on `overallPick`: auto-picks for the human via a neutral bot
   *  profile (D5). No-op until T1. */
  const expirePick = useCallback((overallPickAtExpiry: number) => {
    void overallPickAtExpiry;
  }, []);

  /** Arms `pickDeadline` for the pack now in place (D4). No-op until T1 — Quick
   *  mode never calls this; the setter is only referenced here so it isn't
   *  flagged as dead state before T1 starts using it. */
  const armIntroClock = useCallback(() => {
    setPickDeadline(prev => prev);
  }, []);

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
    mode,
    pickDeadline,
    passSeq,
    pickFromIntro,
    startNextRound,
    expirePick,
    armIntroClock,
  };
}
