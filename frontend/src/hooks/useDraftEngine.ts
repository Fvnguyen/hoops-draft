import { useState, useEffect, useCallback, useRef } from 'react';
import { DraftCard, Player, Play } from '../components/PlayerCard';
import { DraftSeat, generateCubePool, getBotPick, type BotProfile } from '../engine/draft';
import { DraftPickRecord } from '../engine/deckbuilder';
import { createRng, pick, randomSeed, type Rng } from '../engine/rng';
import { CUBE_PLAYER_CARDS_PER_PACK } from '../engine/balance';
import { deadlineFor } from '../lib/draftTimer';

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

/** D5: the profile handed to `getBotPick` when the clock expires on the human
 *  seat. `favoredTrait: ''` never matches a real badge, so it scores every
 *  card on its base value with no trait bias — "neutral", not "optimal". */
const CLOCK_EXPIRY_PROFILE: BotProfile = {
  id: 'clock-expiry',
  name: 'The Clock',
  noiseSeed: 424242,
  favoredTrait: '',
};

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
    setPickDeadline(null);
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

  // Shared core of processPickAndPass/pickFromIntro/expirePick (D5's timeout
  // auto-pick and D7's pick-from-the-opener-spread both need the exact same
  // pick/pass mechanics — only how `cardId` was chosen differs).
  const applyPick = useCallback((cardId: string, autoPicked: boolean) => {
    const humanSeatSnapshot = seats[0];
    if (!humanSeatSnapshot) return;
    const pickedCardIndex = humanSeatSnapshot.currentPack.findIndex(c => c.id === cardId);
    if (pickedCardIndex === -1) return; // stale/invalid id — no-op rather than passing packs without a human pick

    const newSeats = [...seats.map(s => ({ ...s, drafted: [...s.drafted], currentPack: [...s.currentPack] }))];
    const pickRecords: DraftPickRecord[] = [];

    // 1. Record Human Pick
    const humanSeat = newSeats[0];
    const humanPackSnapshot = humanSeat.currentPack.map(c => c.id); // Snapshot BEFORE picking
    const pickedCard = humanSeat.currentPack.splice(pickedCardIndex, 1)[0];
    humanSeat.drafted.push(pickedCard);
    pickRecords.push({
      packNumber: currentPackNumber,
      pickNumber: currentPickNumber,
      overallPick,
      seatId: humanSeat.id,
      packContents: humanPackSnapshot,
      pickedCardId: cardId,
      ...(autoPicked ? { autoPicked: true } : {}),
    });

    // 2. Record Bot Picks
    for (let i = 1; i < 8; i++) {
      const botSeat = newSeats[i];
      if (botSeat.currentPack.length > 0) {
        const botPackSnapshot = botSeat.currentPack.map(c => c.id); // Snapshot BEFORE picking
        const botPickId = getBotPick(botSeat, overallPick);
        const botPickIndex = botSeat.currentPack.findIndex(c => c.id === botPickId);
        if (botPickIndex !== -1) {
          const botPickedCard = botSeat.currentPack.splice(botPickIndex, 1)[0];
          botSeat.drafted.push(botPickedCard);
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
        // Draft complete — pack 3 always goes straight to the builder (D3),
        // in both modes.
        setSeats(newSeats);
        setCurrentPickNumber(nextPickNum);
        setCurrentPackNumber(nextPackNum);
        setOverallPick(nextOverall);
        setPickDeadline(null);
        setDraftState('deckbuilding');
        return;
      }

      if (mode === 'premier') {
        // D3: pause after the last pick of packs 1 and 2 instead of dealing
        // the next pack immediately. `currentPackNumber` moves to the pack
        // that's coming up so the summary/header can already reflect it;
        // the actual cards are dealt lazily by `startNextRound`.
        setSeats(newSeats);
        setCurrentPickNumber(nextPickNum);
        setCurrentPackNumber(nextPackNum);
        setOverallPick(nextOverall);
        setPassSeq(prev => prev + 1);
        setPickDeadline(null);
        setDraftState('round-summary');
        return;
      }

      // Quick mode (D2): never pauses — deal the next pack and keep drafting,
      // with no repeat intro.
      const packOffset = (nextPackNum - 1) * 8;
      for (let i = 0; i < 8; i++) {
        newSeats[i].currentPack = cubePacksRef.current[packOffset + i] || [];
      }
    }

    setSeats(newSeats);
    setCurrentPickNumber(nextPickNum);
    setCurrentPackNumber(nextPackNum);
    setOverallPick(nextOverall);
    setPassSeq(prev => prev + 1);
    // A new pick within the same pack still needs a no-op-safe deadline reset;
    // real arming happens via the caller's explicit `armIntroClock()` call so
    // the countdown only starts once the pass animation has actually settled.
    setPickDeadline(null);
  }, [seats, currentPackNumber, currentPickNumber, overallPick, mode]);

  const processPickAndPass = useCallback((humanPickId: string) => {
    if (draftState !== 'drafting') return;
    applyPick(humanPickId, false);
  }, [draftState, applyPick]);

  /** Pick straight from the intro/premier opener spread (D7) instead of via the
   *  post-reveal grid. Same pick/pass mechanics as `processPickAndPass`, just
   *  valid while the draft is still showing the opener. */
  const pickFromIntro = useCallback((cardId: string) => {
    if (draftState !== 'pack-intro') return;
    applyPick(cardId, false);
  }, [draftState, applyPick]);

  /** Leaves `round-summary` and deals the next pack's opener (D3). */
  const startNextRound = useCallback(() => {
    if (draftState !== 'round-summary') return;
    const packOffset = (currentPackNumber - 1) * 8;
    const newSeats = seats.map((s, i) => ({
      ...s,
      currentPack: [...(cubePacksRef.current[packOffset + i] || [])],
    }));
    setSeats(newSeats);
    setPickDeadline(null);
    setDraftState('pack-intro');
  }, [draftState, currentPackNumber, seats]);

  /** Clock ran out on `overallPick`: auto-picks for the human via a neutral bot
   *  profile (D5). Guarded by `overallPickAtExpiry` so a stale timer firing
   *  after the human already picked (or the pack already advanced) is a no-op. */
  const expirePick = useCallback((overallPickAtExpiry: number) => {
    if (mode !== 'premier') return;
    if (draftState !== 'drafting') return;
    if (overallPickAtExpiry !== overallPick) return;

    const humanSeat = seats[0];
    if (!humanSeat || humanSeat.currentPack.length === 0) return;

    const neutralSeat: DraftSeat = { ...humanSeat, isBot: true, botProfile: CLOCK_EXPIRY_PROFILE };
    const cardId = getBotPick(neutralSeat, overallPickAtExpiry);
    if (!cardId) return;

    applyPick(cardId, true);
  }, [mode, draftState, overallPick, seats, applyPick]);

  /** Arms `pickDeadline` for whichever pick is now current (D4), Premier mode
   *  only, once a pack is actually in place (`draftState === 'drafting'`) —
   *  null during openers/summaries/deckbuilding/Quick mode. `scale` is the
   *  caller's clock-scale multiplier (see `lib/draftTimer.ts`'s
   *  `clockScaleFromQuery`); T3's `DraftRoom` reads `?clock=` from the URL
   *  and passes the resulting number straight through here — the hook takes
   *  no URL/query dependency of its own. Defaults to 1 (real-time) when the
   *  caller doesn't pass one. */
  const armIntroClock = useCallback((scale: number = 1) => {
    if (mode !== 'premier' || draftState !== 'drafting') {
      setPickDeadline(null);
      return;
    }
    setPickDeadline(deadlineFor(currentPickNumber, Date.now(), scale));
  }, [mode, draftState, currentPickNumber]);

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
