import { useState, useCallback, useMemo, useEffect, useRef } from 'react';
import { Player, Play } from '../components/PlayerCard';
import { getBotPick, type BotProfile } from '../engine/draft';
import { DraftSession } from '../engine/deckbuilder';
import { replayDraft, type HumanPicks } from '../engine/draftReplay';
import { randomSeed } from '../engine/rng';
import { CUBE_PLAYER_CARDS_PER_PACK, CUBE_PACKS, CUBE_SEATS, BOT_SYNERGY_AWARENESS_RANGE } from '../engine/balance';
import { HUMAN_SEAT_ID } from '../engine/season';
import { deadlineFor } from '../lib/draftTimer';

/** D5: the profile handed to `getBotPick` when the clock expires on the human
 *  seat. No `targetArchetypeId` — `planPull` treats a missing/unmatched target as zero
 *  pull, so it scores every card on its base value with no plan bias — "neutral", not
 *  "optimal". `synergyAwareness` is the midpoint of the real range; it multiplies a
 *  zero pull either way. */
const CLOCK_EXPIRY_PROFILE: BotProfile = {
  id: 'clock-expiry',
  name: 'The Clock',
  noiseSeed: 424242,
  targetArchetypeId: '',
  synergyAwareness: (BOT_SYNERGY_AWARENESS_RANGE[0] + BOT_SYNERGY_AWARENESS_RANGE[1]) / 2,
};

const PICKS_PER_PACK = CUBE_PLAYER_CARDS_PER_PACK + 1;

/** Draft mode (plan ui_draft_deckbuild_pack, D1). Quick skips the timer and the
 *  round-summary pause; Premier gets both. */
export type DraftMode = 'quick' | 'premier' | 'pvp';

/** Which game this draft is for (plan_challenge_mode D1). Doesn't change draft
 *  mechanics (D5's steeper difficulty only applies to challenge games, not the
 *  draft) — carried through so the caller can stamp it onto the saved
 *  `DraftSession` without keeping a second piece of state in sync. */
export type GameMode = 'tournament' | 'challenge' | 'playoffs';

/**
 * pvp_draft D1: when passed to `useDraftEngine`, the room is driven by a Playoffs match row
 * instead of local state. The engine then derives everything from
 * `replayDraft(seed, humanPicks, ..., { autoPicked: humanAutoPicks })`, never starts,
 * resumes or saves a draft itself, treats `localSeatId` as "the human" (seat 0 or 4, with
 * passing/receiving neighbours relative to it), and hands the local pick to `onLocalPick`
 * instead of appending it (the owner sends `match_pick` and folds it into `humanPicks`
 * optimistically). Quick visuals: no intro opener pause, no round summaries (D7). The
 * clock is `pickDeadline` from the server; the owner does the expiry auto-pick.
 */
export interface PvpDraftBinding {
  seed: number;
  localSeatId: 'human-0' | 'human-4';
  humanPicks: HumanPicks;
  humanAutoPicks: Record<string, number[]>;
  /** Epoch ms of the server `pick_deadline`, or null while no clock runs. */
  pickDeadline: number | null;
  onLocalPick: (cardId: string) => void;
}

function freshId(): string {
  return `session_${Date.now()}`;
}

/**
 * draft_resume D2: `(draftSeed, humanPicks, humanAutoPicks)` is the source of truth;
 * `seats`/`pickLog`/the pack/pick counters are all derived through `replayDraft` (memoised
 * on those three plus `allPlayers`/`playsDB`). No `cubePacksRef` — the cube pool is
 * regenerated inside `replayDraft` itself, deterministically, from the stored seed.
 *
 * View state — `draftState` (loading/pack-intro/drafting/round-summary/deckbuilding), the
 * intro/pick clock, `passSeq` — stays local to this hook exactly as before; only the pick
 * data moved.
 *
 * The caller is responsible for calling `startNewDraft()` (fresh) or `resumeDraft(session)`
 * (an unfinished `DraftSession`, draft_resume D4) exactly once, after checking for an
 * unfinished session — this hook no longer auto-starts on mount, so the caller can gate
 * that decision (e.g. behind a resume/abandon prompt) without a wasted fresh draft
 * flashing underneath it.
 */
export function useDraftEngine(
  allPlayers: Player[],
  playsDB: Play[],
  mode: DraftMode = 'premier',
  gameMode: GameMode = 'tournament',
  /** pvp_draft: drive the room from a match row (see `PvpDraftBinding`). Wired in T3. */
  pvp?: PvpDraftBinding,
) {
  const [draftStateLocal, setDraftState] = useState<'loading' | 'pack-intro' | 'drafting' | 'round-summary' | 'deckbuilding'>('loading');
  const [draftSeedLocal, setDraftSeed] = useState<number | undefined>(undefined);
  const [humanPicksLocal, setHumanPicksLocal] = useState<HumanPicks>({ [HUMAN_SEAT_ID]: [] });
  const [humanAutoPicksLocal, setHumanAutoPicksLocal] = useState<Record<string, number[]>>({});
  const [sessionId, setSessionId] = useState<string | null>(null);
  // D4: epoch ms the current pick expires at; null outside a timed Premier pick.
  const [pickDeadlineLocal, setPickDeadline] = useState<number | null>(null);
  // Bumped once per pass so `PackPassStage` (T3) can key its animation off a
  // value that changes even when pack contents coincidentally look the same.
  const [passSeq, setPassSeq] = useState(0);

  // pvp_draft: everything the room is driven from comes off the `pvp` binding instead of
  // this hook's own state — no local starts/resumes/saves happen on that path (see
  // `PvpDraftBinding`'s doc comment).
  const draftSeed = pvp ? pvp.seed : draftSeedLocal;
  const humanPicks = pvp ? pvp.humanPicks : humanPicksLocal;
  const humanAutoPicks = pvp ? pvp.humanAutoPicks : humanAutoPicksLocal;
  const pickDeadline = pvp ? pvp.pickDeadline : pickDeadlineLocal;
  // D7: PvP is always in the "drafting" view — no loading/pack-intro/round-summary/
  // deckbuilding pauses (Quick visuals); the room page (T3) handles its own
  // loading/complete/void screens off `usePvpDraft`'s phase instead.
  const draftState = pvp ? 'drafting' : draftStateLocal;
  const humanSeatId = pvp ? pvp.localSeatId : HUMAN_SEAT_ID;

  // Derived: the whole room, rebuilt from the seed + picks so far. `undefined` seed (not
  // started yet) or an empty pool (cards not loaded yet) both mean "nothing to show".
  const replay = useMemo(() => {
    if (draftSeed === undefined || allPlayers.length === 0) return null;
    return replayDraft(draftSeed, humanPicks, allPlayers, playsDB, { autoPicked: humanAutoPicks });
  }, [draftSeed, humanPicks, humanAutoPicks, allPlayers, playsDB]);

  const seats = replay?.seats ?? [];
  const currentPackNumber = replay?.packNumber ?? 1;
  const currentPickNumber = replay?.pickNumber ?? 1;
  const overallPick = replay?.overallPick ?? 1;
  const pickLog = replay?.pickLog ?? [];

  const startNewDraft = useCallback(() => {
    setDraftSeed(randomSeed());
    setHumanPicksLocal({ [HUMAN_SEAT_ID]: [] });
    setHumanAutoPicksLocal({});
    setSessionId(freshId());
    setPickDeadline(null);
    setDraftState('pack-intro');
  }, []);

  /** draft_resume D4/D5: rebuild the room from a saved in-progress `DraftSession` — same
   *  id, seed and picks so the very next autosave still upserts one row. Goes straight to
   *  'drafting' (skips the pack-open animation: the pack is already mid-pick, not fresh)
   *  with the pick clock re-armed at full length by the caller's next `armIntroClock`
   *  call (D5 — picks that would have expired while the app was closed are never
   *  auto-taken). */
  const resumeDraft = useCallback((session: DraftSession) => {
    setDraftSeed(session.seed);
    setHumanPicksLocal(session.humanPicks ?? { [HUMAN_SEAT_ID]: [] });
    setHumanAutoPicksLocal(session.humanAutoPicks ?? {});
    setSessionId(session.id);
    setPickDeadline(null);
    setDraftState('drafting');
  }, []);

  // Shared core of processPickAndPass/pickFromIntro/expirePick (D5's timeout
  // auto-pick and D7's pick-from-the-opener-spread both need the exact same
  // pick/pass mechanics — only how `cardId` was chosen differs). Solo drafts only
  // (`pvp` takes the branch below in processPickAndPass instead).
  const applyPick = useCallback((cardId: string, autoPicked: boolean) => {
    if (!replay) return;
    const humanSeat = replay.seats.find(s => s.id === HUMAN_SEAT_ID);
    if (!humanSeat) return;
    if (!humanSeat.currentPack.some(c => c.id === cardId)) return; // stale/invalid id — no-op

    const prevPickNumber = replay.pickNumber;
    const prevPackNumber = replay.packNumber;
    const idxInHumanPicks = humanPicks[HUMAN_SEAT_ID]?.length ?? 0;

    setHumanPicksLocal(prev => ({ ...prev, [HUMAN_SEAT_ID]: [...(prev[HUMAN_SEAT_ID] ?? []), cardId] }));
    if (autoPicked) {
      setHumanAutoPicksLocal(prev => ({ ...prev, [HUMAN_SEAT_ID]: [...(prev[HUMAN_SEAT_ID] ?? []), idxInHumanPicks] }));
    }
    setPickDeadline(null);

    const crossesPackBoundary = prevPickNumber === PICKS_PER_PACK;
    const completesDraft = crossesPackBoundary && prevPackNumber + 1 > CUBE_PACKS;

    if (completesDraft) {
      // Draft complete — pack 3 always goes straight to the builder (D3), in both modes.
      setDraftState('deckbuilding');
      return;
    }

    setPassSeq(prev => prev + 1);

    if (crossesPackBoundary && mode === 'premier') {
      // D3: pause after the last pick of packs 1 and 2 instead of dealing the next pack
      // immediately. The next pack is already dealt in the derived `replay` (replayDraft
      // always advances eagerly); `startNextRound` only flips the view back to the intro.
      setDraftState('round-summary');
    }
    // Quick mode (D2) at a boundary, or any non-boundary pick: stay on whatever view state
    // the caller was already in ('drafting' or 'pack-intro') — no repeat intro.
  }, [replay, humanPicks, mode]);

  const processPickAndPass = useCallback((humanPickId: string) => {
    if (pvp) {
      // pvp_draft D1: hand off to the room instead of appending locally — `usePvpDraft`
      // applies it optimistically and sends `match_pick`. Same "must be in my current
      // pack" guard `applyPick` does for the solo path. No `passSeq` bump here — unlike
      // solo, our own pick alone often doesn't change `currentPack` yet (the opponent may
      // not have picked this round), so the pass animation is driven by `overallPick`
      // actually advancing instead (see the effect below), not by the local click.
      if (!replay) return;
      const seat = replay.seats.find(s => s.id === pvp.localSeatId);
      if (!seat || !seat.currentPack.some(c => c.id === humanPickId)) return;
      pvp.onLocalPick(humanPickId);
      return;
    }
    if (draftState !== 'drafting') return;
    applyPick(humanPickId, false);
  }, [pvp, replay, draftState, applyPick]);

  /** Pick straight from the intro/premier opener spread (D7) instead of via the
   *  post-reveal grid. Same pick/pass mechanics as `processPickAndPass`, just
   *  valid while the draft is still showing the opener. Never used in PvP (D7: no
   *  opener pause). */
  const pickFromIntro = useCallback((cardId: string) => {
    if (pvp || draftState !== 'pack-intro') return;
    applyPick(cardId, false);
  }, [pvp, draftState, applyPick]);

  /** Leaves `round-summary` for the next pack's opener (D3). The next pack's cards are
   *  already in `seats` (derived eagerly by `replayDraft`) — this only flips the view. */
  const startNextRound = useCallback(() => {
    if (draftState !== 'round-summary') return;
    setPickDeadline(null);
    setDraftState('pack-intro');
  }, [draftState]);

  /** Clock ran out on `overallPick`: auto-picks for the human via a neutral bot
   *  profile (D5). Guarded by `overallPickAtExpiry` so a stale timer firing
   *  after the human already picked (or the pack already advanced) is a no-op. */
  const expirePick = useCallback((overallPickAtExpiry: number) => {
    if (mode !== 'premier') return;
    if (draftState !== 'drafting') return;
    if (!replay || overallPickAtExpiry !== replay.overallPick) return;

    const humanSeat = replay.seats.find(s => s.id === HUMAN_SEAT_ID);
    if (!humanSeat || humanSeat.currentPack.length === 0) return;

    const neutralSeat = { ...humanSeat, isBot: true, botProfile: CLOCK_EXPIRY_PROFILE };
    const cardId = getBotPick(neutralSeat, overallPickAtExpiry);
    if (!cardId) return;

    applyPick(cardId, true);
  }, [mode, draftState, replay, applyPick]);

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

  // pvp_draft D1: neighbours relative to the LOCAL seat (0 or 4), not always seat 0.
  const localIndex = pvp?.localSeatId === 'human-4' ? 4 : 0;
  const rightIndex = (localIndex + 1) % CUBE_SEATS;
  const leftIndex = (localIndex + CUBE_SEATS - 1) % CUBE_SEATS;
  const packDirection = currentPackNumber === 2 ? 1 : -1;
  const passingToSeat = seats.length > 0 ? seats[packDirection === 1 ? rightIndex : leftIndex] : undefined;
  const receivingFromSeat = seats.length > 0 ? seats[packDirection === 1 ? leftIndex : rightIndex] : undefined;
  const humanSeat = seats.find(s => s.id === humanSeatId) ?? seats[0];

  // pvp_draft: the pass animation follows the round ACTUALLY resolving (both humans
  // picked, packs rotated), not the local click — `overallPick` only advances at that
  // point, unlike solo where the same click always both picks and resolves.
  const prevOverallPickRef = useRef(overallPick);
  useEffect(() => {
    if (!pvp) return;
    if (prevOverallPickRef.current !== overallPick) {
      prevOverallPickRef.current = overallPick;
      setPassSeq(prev => prev + 1);
    }
  }, [pvp, overallPick]);

  return {
    draftState,
    seats,
    humanSeat,
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
    gameMode,
    pickDeadline,
    passSeq,
    pickFromIntro,
    startNextRound,
    expirePick,
    armIntroClock,
    startNewDraft,
    resumeDraft,
    humanPicks,
    humanAutoPicks,
    sessionId,
  };
}
