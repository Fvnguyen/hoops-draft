'use client';

import { useState, useEffect, useMemo, useRef, useSyncExternalStore } from 'react';
import { useRouter } from 'next/navigation';
import { PlayerCard, PlayCard, Player, Play } from './PlayerCard';
import { motion, AnimatePresence } from 'framer-motion';
import { ChevronRight, ChevronLeft, Volume2, VolumeX } from 'lucide-react';
import { useDraftEngine } from '../hooks/useDraftEngine';
import { usePvpDraft } from '../hooks/usePvpDraft';
import { WaitingFor } from './playoffs/WaitingFor';
import { DeckBuilder } from './DeckBuilder';
import { PackOpener } from './PackOpener';
import { isCoarsePointer } from './useHoverPreview';
import { DraftSidebar } from './DraftSidebar';
import { PackPassStage, passStaggerDelayMs } from './PackPassStage';
import { ConfirmPickDock } from './ConfirmPickDock';
import { IconButton } from './ui/IconButton';
import { Panel, Button } from './ui';
import { PickTimerRing } from './PickTimerRing';
import { RoundSummary } from './RoundSummary';
import { getGameStore } from '@/storage';
import { StorageQuotaError, findUnfinishedDraft } from '@/storage/types';
import { useStorageReady } from './StorageProvider';
import { HUMAN_SEAT_ID } from '@/engine/season';
import { buildDraftSession, buildInProgressDraftSession } from '../lib/sessionBuilder';
import { buildBotRoster } from '../engine/deckbuilder';
import type { DraftSession } from '../engine/deckbuilder';
import { calcRosterIdentity, resolveDepthChart } from '../engine/rosterStats';
import type { RosterIdentity } from '../engine/rosterStats';
import type { PlayerCardData } from '../engine/types';
import type { DraftSeat } from '../engine/draft';
import type { DraftPickRecord } from '../engine/deckbuilder';
import { isSfxEnabled, setSfxEnabled } from '../audio/sfx';
import { clockScaleFromQuery } from '../lib/draftTimer';
import { CUBE_PACKS, CUBE_PLAYER_CARDS_PER_PACK, CUBE_SEATS } from '../engine/balance';
import { useAndroidBackGuard } from '../hooks/useAndroidBackGuard';
import { BackGuardSheet } from './BackGuardSheet';
import { headshotThumb } from '@/lib/headshotThumb';

// Picks per pack = players + the play card; total = packs × picks (see engine/balance.ts).
const PICKS_PER_PACK = CUBE_PLAYER_CARDS_PER_PACK + 1;
const TOTAL_PICKS = CUBE_PACKS * PICKS_PER_PACK;

/** draft_resume D4: pack/pick label for a saved in-progress session, from the human's own
 *  pick count alone (no need to replay — one human seat picks once per overall pick). */
function resumeLabel(session: DraftSession): string {
  const count = session.humanPicks?.[HUMAN_SEAT_ID]?.length ?? 0;
  const pack = Math.min(CUBE_PACKS, Math.floor(count / PICKS_PER_PACK) + 1);
  const pick = (count % PICKS_PER_PACK) + 1;
  return `Resume draft, pack ${pack} pick ${pick}`;
}

/** draft_resume D4: shown on `/draft` when an unfinished session for this owner exists —
 *  resume it exactly (no auto-resume) or abandon it (delete + start fresh). Deliberately
 *  NOT built on the shared `Overlay` primitive: `Overlay` marks itself `data-overlay`,
 *  which is the exact marker `tests/helpers/splash.ts` uses to find (and blindly
 *  backdrop-click) the "what's new" splash — this sheet can be on screen at the same
 *  mount moment as that splash, and must not be mistaken for it (or dismissed by a
 *  backdrop click at all; only the two explicit actions below resolve it). */
function DraftResumeSheet({
  session,
  onResume,
  onAbandon,
}: {
  session: DraftSession | null;
  onResume: (session: DraftSession) => void;
  onAbandon: (session: DraftSession) => void;
}) {
  if (!session) return null;
  return (
    <div
      className="fixed inset-0 z-[100] flex items-center justify-center bg-surface-scrim p-4 backdrop-blur-sm"
      data-draft-resume-sheet
    >
      <Panel role="dialog" aria-modal="true" aria-labelledby="draft-resume-heading" padding="none" variant="inverse" className="relative w-full max-w-sm shadow-2xl">
        <div className="p-6">
          <h2 id="draft-resume-heading" className="text-xl font-bold uppercase text-ink-inverse mb-2">
            {resumeLabel(session)}
          </h2>
          <p className="text-ink-inverse-muted text-sm mb-6">
            You left this draft mid-pick. Pick up right where you left off, or abandon it and start a new one.
          </p>
          <div className="flex justify-end gap-3">
            <Button
              variant="ghost"
              size="md"
              onClick={() => onAbandon(session)}
              className="text-ink-inverse-muted hover:text-ink-inverse hover:bg-white/10"
            >
              Abandon
            </Button>
            <Button variant="primary" size="md" onClick={() => onResume(session)}>
              Resume
            </Button>
          </div>
        </div>
      </Panel>
    </div>
  );
}

// The play catalog lives in the pure engine (`engine/plays.ts`) so the draft room, the
// challenge mode's NBA opponents, the balance script and the unit tests all read one copy.
export { PLAY_CATALOG as playsDB } from '../engine/plays';
import { PLAY_CATALOG as playsDB } from '../engine/plays';
// ── Bot pick ticker ──────────────────────────────────────────────────────
//
// Surfaces the most recent bot picks (pickLog) so the draft doesn't feel
// solitary. Resolves names from the seats' own `drafted` arrays rather than
// a separate id->card map, since every picked card already lives there.
// Neighbour seats' picks are prioritized to the front of the ticker. A
// human pick shows up too, but only when the clock made it (D5).
function resolvePickLabel(record: DraftPickRecord, seats: DraftSeat[], localSeatId: string): string | null {
  const seat = seats.find(s => s.id === record.seatId);
  if (!seat) return null;
  const card = seat.drafted.find(c => c.id === record.pickedCardId);
  if (!card) return null;
  const cardName = card.type === 'Play' ? card.name : card.player.name;
  if (record.autoPicked) {
    return record.seatId === localSeatId ? `Clock took ${cardName} for you` : `Clock took ${cardName}`;
  }
  const botName = seat.botProfile?.name || 'Bot';
  return `${botName} took ${cardName}`;
}

function BotPickTicker({ pickLog, seats, localSeatId, leftIndex, rightIndex }: {
  pickLog: DraftPickRecord[];
  seats: DraftSeat[];
  /** HUMAN_SEAT_ID for solo; the local `useDraftEngine` humanSeat.id for PvP. */
  localSeatId: string;
  leftIndex: number;
  rightIndex: number;
}) {
  const neighbourIds = new Set([seats[leftIndex]?.id, seats[rightIndex]?.id].filter(Boolean));

  const items = pickLog
    // pvp_draft D6: never surface the OTHER human seat's picks — only our own (only when
    // the clock took it) and bot picks, exactly like the solo ticker.
    .filter(r => (r.seatId === localSeatId ? r.autoPicked : !r.seatId.startsWith('human-')))
    .slice(-16)
    .sort((a, b) => {
      const aFirst = neighbourIds.has(a.seatId) ? 0 : 1;
      const bFirst = neighbourIds.has(b.seatId) ? 0 : 1;
      if (aFirst !== bFirst) return aFirst - bFirst;
      return b.overallPick - a.overallPick;
    })
    .map(r => resolvePickLabel(r, seats, localSeatId))
    .filter((s): s is string => !!s)
    .slice(0, 6);

  if (items.length === 0) return null;

  return (
    <div className="w-full overflow-x-auto whitespace-nowrap px-8 py-1.5 bg-surface-sunken/70 border-b border-line text-xs text-ink-muted font-medium custom-scrollbar shrink-0">
      {items.map((text, i) => (
        <motion.span
          key={i}
          initial={{ opacity: 0, y: -4 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: passStaggerDelayMs(i) / 1000, duration: 0.2 }}
        >
          {i > 0 && <span className="mx-2 text-ink-subtle">·</span>}
          {text}
        </motion.span>
      ))}
    </div>
  );
}

function SaveErrorBanner({ message }: { message: string | null }) {
  if (!message) return null;
  return (
    // mobile_load T9/D9: `fixed` elements sit against the physical viewport edge, not
    // `body`'s padding box, so the phone-landscape display-cutout padding in globals.css
    // (which only insets `body`) never reaches this banner — pad it directly with the
    // same `--safe-left`/`--safe-right` vars, added on top of the existing `px-4`.
    <div className="fixed top-0 left-0 right-0 z-50 bg-danger-soft border-b border-danger-line pl-[calc(1rem+var(--safe-left))] pr-[calc(1rem+var(--safe-right))] py-3">
      <p className="text-sm text-danger font-semibold text-center">{message}</p>
    </div>
  );
}

function ModePill({ mode }: { mode: 'quick' | 'premier' }) {
  return (
    <span className="text-ink-muted font-black text-xs uppercase tracking-widest bg-surface-raised px-2.5 py-1 rounded-full border border-line shadow-sm">
      {mode === 'premier' ? 'Premier' : 'Quick'}
    </span>
  );
}

/** plan_challenge_mode D2: the one badge that marks a challenge session in the
 *  (otherwise un-re-themed) draft room and deck builder. */
function ChallengeBadge() {
  return (
    <span className="font-display text-xs uppercase tracking-widest bg-surface-inverse-deep text-accent px-2.5 py-1 rounded-full border border-accent shadow-sm">
      82:0
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
    <IconButton
      variant="raised"
      onClick={toggle}
      aria-pressed={enabled}
      label={enabled ? 'Mute sound' : 'Enable sound'}
      className="shrink-0"
    >
      {enabled ? <Volume2 size={16} /> : <VolumeX size={16} />}
    </IconButton>
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
  /** Which game this draft is for (plan_challenge_mode D1). Read server-side
   *  from `?game=` by `app/draft/page.tsx`; missing/unknown defaults to the
   *  tournament. Stamped onto the saved `DraftSession` and threaded to the
   *  deck builder so its save CTA can route correctly. */
  gameMode?: 'tournament' | 'challenge';
  /** `?clock=fast` (D4, dev-only): scales the Premier pick clock down so it
   *  can be exercised quickly in tests/manual QA. Converted to a multiplier
   *  via `clockScaleFromQuery` and passed straight into `armIntroClock`. */
  clockFast?: boolean;
  /** pvp_draft T3: renders this room from a Playoffs match row instead of local solo
   *  state (`usePvpDraft`). `mode`/`gameMode` are ignored — PvP is always Quick visuals
   *  (D7) under `gameMode: 'playoffs'`. */
  pvpMatchId?: string;
}

export function DraftRoom({ mode: urlMode = 'premier', gameMode: urlGameMode = 'tournament', clockFast = false, pvpMatchId }: DraftRoomProps = {}) {
  const isPvp = !!pvpMatchId;
  const router = useRouter();
  // pvp_draft: hooks are never conditional — this is a no-op (`useMatch` skips its effects
  // on a falsy id) when `pvpMatchId` is absent, i.e. every solo draft.
  const pvpRoom = usePvpDraft(pvpMatchId ?? '');

  // draft_resume: a resumed draft keeps the mode and game it was started with, whatever
  // `/draft?mode=&game=` says now (the URL only picks the mode of a NEW draft).
  const [resumedModes, setResumedModes] = useState<{ mode: 'quick' | 'premier'; gameMode: 'tournament' | 'challenge' } | null>(null);
  const mode = isPvp ? 'pvp' : (resumedModes?.mode ?? urlMode);
  const gameMode = isPvp ? 'playoffs' : (resumedModes?.gameMode ?? urlGameMode);
  const [selectedCardId, setSelectedCardId] = useState<string | null>(null);
  const isClient = useSyncExternalStore(subscribeNever, () => true, () => false);
  const [allPlayers, setAllPlayers] = useState<Player[]>([]);
  // Sidebar defaults open on lg+ screens (>=1024px), collapsed strip below that.
  // Read only at mount: this component renders null until isClient flips true,
  // so by the time this state is actually shown, `window` is always defined.
  const [isSidebarOpenToggled, setIsSidebarOpenToggled] = useState(
    () => typeof window !== 'undefined' && window.innerWidth >= 1024
  );
  // Set once the FINAL 'complete' session write lands (not the same moment the hook mints
  // the draft's id) — DeckBuilder reads this session back from the store, so it must not
  // see the id before that row actually exists.
  const [completedSessionId, setCompletedSessionId] = useState<string | null>(null);
  const [saveError, setSaveError] = useState<string | null>(null);
  const savingSessionRef = useRef(false);
  const [showBackGuard, setShowBackGuard] = useState(false);
  // draft_resume D4: 'checking' until the one-time unfinished-session lookup resolves;
  // then either the session to prompt about, or null (nothing to resume). Gates whether
  // `startNewDraft` fires, so no draft is ever generated behind the player's back only to
  // be thrown away when a resume was actually available.
  const [resumeCandidate, setResumeCandidate] = useState<DraftSession | null | 'checking'>('checking');
  const resumeDecidedRef = useRef(false);
  const draftStartedRef = useRef(false);

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
    receivingFromSeat,
    startNewDraft,
    resumeDraft,
    humanPicks,
    humanAutoPicks,
    sessionId,
  } = useDraftEngine(allPlayers, playsDB, mode, gameMode, isPvp ? (pvpRoom.binding ?? undefined) : undefined);

  // draft_resume D4: look up an unfinished session for this owner exactly once, before
  // ever starting a fresh draft (no auto-resume — the sheet always gets first say). Gated
  // on `useStorageReady()`: right after a reload the store's owner isn't applied yet
  // (`GameStore.setOwnerId` is async, see `StorageProvider`), and every read filters by
  // owner — checking too early always finds nothing, silently skipping the resume prompt.
  const storageReady = useStorageReady();
  useEffect(() => {
    if (isPvp) return; // pvp_draft D9: no resume sheet — the room always rebuilds from the row.
    if (!storageReady) return;
    let cancelled = false;
    findUnfinishedDraft(getGameStore())
      .then((session) => {
        if (!cancelled) setResumeCandidate(session);
      })
      .catch((err) => {
        console.error('Failed to check for an unfinished draft session:', err);
        if (!cancelled) setResumeCandidate(null);
      });
    return () => { cancelled = true; };
  }, [isPvp, storageReady]);

  // draft_resume D4/D5: once the resume check has resolved (found nothing, or the player
  // decided), start a fresh draft. Resuming an unfinished session takes the other path
  // (`handleResume`) and never falls through to this.
  useEffect(() => {
    if (isPvp) return; // pvp_draft: never starts/resumes a draft itself (the row drives it).
    if (allPlayers.length === 0) return;
    if (resumeCandidate === 'checking' || resumeCandidate) return; // still checking, or the sheet is up
    if (draftStartedRef.current) return;
    draftStartedRef.current = true;
    startNewDraft();
  }, [isPvp, allPlayers, resumeCandidate, startNewDraft]);

  const handleResume = (session: DraftSession) => {
    if (resumeDecidedRef.current) return;
    resumeDecidedRef.current = true;
    draftStartedRef.current = true;
    setResumedModes({ mode: session.mode ?? 'premier', gameMode: session.gameMode ?? 'tournament' });
    resumeDraft(session);
    setResumeCandidate(null);
  };

  const handleAbandon = (session: DraftSession) => {
    if (resumeDecidedRef.current) return;
    resumeDecidedRef.current = true;
    getGameStore()
      .deleteDraftSession(session.id)
      .catch((err) => console.error('Failed to delete abandoned draft session:', err))
      .finally(() => setResumeCandidate(null));
  };

  // draft_resume D3: after every human pick, upsert the in-progress row (status
  // 'drafting', no seats/pickLog — `replayDraft` rebuilds those from seed + picks). Skips
  // the very first render of a fresh draft (zero picks yet — nothing worth persisting)
  // and stops once the draft is complete (the final save below takes over that id).
  useEffect(() => {
    if (isPvp) return; // pvp_draft D9: no local autosave — the match row is the record.
    if (draftState === 'deckbuilding' || draftState === 'loading') return;
    if (!sessionId || draftSeed === undefined) return;
    const pickCount = Object.values(humanPicks).reduce((n, ids) => n + ids.length, 0);
    if (pickCount === 0) return;
    getGameStore()
      .saveDraftSession(buildInProgressDraftSession(sessionId, draftSeed, humanPicks, humanAutoPicks, mode as 'quick' | 'premier', gameMode as 'tournament' | 'challenge'))
      .catch((err) => console.error('Failed to autosave draft session:', err));
  }, [isPvp, draftState, sessionId, draftSeed, humanPicks, humanAutoPicks, mode, gameMode]);

  // plan_mobile_native_feel D3: only while still picking — no partial draft is ever
  // persisted (the pod is only saved once, on the transition to 'deckbuilding' above),
  // so back here can only warn, not save. Once deckbuilding starts, `DeckBuilder` below
  // mounts its own guard and takes over; disabling this one avoids a double prompt.
  // pvp_draft: no back guard — the room is always resumable from the row (D9).
  const backGuardEnabled = isClient && !isPvp && draftState !== 'loading' && draftState !== 'deckbuilding';
  const { goBack } = useAndroidBackGuard({
    enabled: backGuardEnabled,
    onBackAttempt: () => setShowBackGuard(true),
  });

  // Preload the headshots the player is about to see: this pack (still sealed during
  // the intro) and the neighbour's pack that will be passed to us next. Card fronts are
  // pre-generated 480px WebP files (plan mobile_load D3/D4) served `unoptimized`, so a
  // plain Image preload of the exact URL the card will request is all that's needed —
  // no next/image `getImageProps`/srcset negotiation.
  const humanPack = humanSeat?.currentPack;
  const incomingPack = receivingFromSeat?.currentPack;
  useEffect(() => {
    if (typeof window === 'undefined') return;
    const cards = [...(humanPack ?? []), ...(incomingPack ?? [])];
    for (const card of cards) {
      if (card.type !== 'Player') continue;
      new window.Image().src = headshotThumb(card.player.id, 480);
    }
  }, [humanPack, incomingPack]);

  // Only DeckBuilder (mounted once deckbuilding starts) reads this; `buildBotRoster` for
  // all 7 bot seats is too heavy to redo on every card tap / timer tick during the draft.
  const podAverageIdentity = useMemo(() => {
    if (draftState !== 'deckbuilding') return undefined;
    return averageRosterIdentities(
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
  }, [seats, draftState]);

  // Persist the full draft pod + pick history when transitioning to deckbuilding. Same
  // `sessionId` the in-progress autosaves used (draft_resume D3), so this upsert replaces
  // that 'drafting' row with the 'complete' one instead of leaving it behind.
  useEffect(() => {
    if (isPvp) return; // pvp_draft: never reaches 'deckbuilding' — build page reads the row directly.
    if (draftState === 'deckbuilding' && seats.length > 0 && !completedSessionId && !savingSessionRef.current) {
      savingSessionRef.current = true;
      const session = buildDraftSession(seats, pickLog, draftSeed, mode as 'quick' | 'premier', gameMode as 'tournament' | 'challenge', sessionId ?? undefined);
      getGameStore()
        .saveDraftSession(session)
        .then(() => {
          setCompletedSessionId(session.id);
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
  }, [isPvp, draftState, seats, completedSessionId, sessionId, pickLog, draftSeed, mode, gameMode]);

  // pvp_draft T3/T4: route away once the room itself has nothing left to show. 'complete'
  // (both made 24 picks — status flipped to 'building') and a 'building' row opened here
  // both go to the build page; anything else non-drafting (invited/series/done/...) or a
  // caller who isn't a participant goes back to the match list.
  useEffect(() => {
    if (!isPvp || !pvpMatchId) return;
    if (pvpRoom.phase === 'complete') router.replace(`/playoffs/${pvpMatchId}/build`);
    else if (pvpRoom.phase === 'not-drafting') router.replace(`/playoffs/${pvpMatchId}`);
    else if (pvpRoom.phase === 'not-participant') router.replace('/playoffs/new');
  }, [isPvp, pvpMatchId, pvpRoom.phase, router]);

  useEffect(() => {
    import('@/engine/cards')
      .then(({ getAllCards }) => {
        const data = getAllCards() as Array<Omit<Player, 'type'>>;
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
      processPickAndPass(selectedCardId);
      setSelectedCardId(null);
    }
  };

  // Double-click (or a second click on the already-selected card) confirms
  // immediately; otherwise a 2s auto-confirm timer covers the single-click
  // baseline (MTG-style pick flow, D3). The timer resets whenever the
  // selection changes and is cleared once a pick is confirmed.
  // game_canvas (owner): on a touch device a second tap DESELECTS (there is no hover
  // to preview with, so the player taps to look); the dock's Confirm button is the only
  // way to pick, and the 2s auto-pick below is off. Pointer keeps double-click-to-pick.
  const handleCardClick = (cardId: string) => {
    if (selectedCardId === cardId) {
      if (isCoarsePointer()) { setSelectedCardId(null); return; }
      processPickAndPass(cardId);
      setSelectedCardId(null);
    } else {
      setSelectedCardId(cardId);
    }
  };

  useEffect(() => {
    if (!selectedCardId) return;
    if (isCoarsePointer()) return;
    const timer = window.setTimeout(() => {
      processPickAndPass(selectedCardId);
      setSelectedCardId(null);
    }, 2000);
    return () => window.clearTimeout(timer);
  }, [selectedCardId, processPickAndPass]);

  // Dropping a just-selected pack card onto the sidebar's roster list also
  // advances the draft (the card hasn't been picked yet).
  const handleDrop = (cardId: string) => {
    processPickAndPass(cardId);
    setSelectedCardId(null);
  };

  if (!isClient) return null;

  if (isPvp) {
    if (pvpRoom.phase === 'void') {
      return (
        <div className="flex h-dvh-z flex-col items-center justify-center gap-3 px-6 text-center font-sans">
          <h1 className="font-display text-3xl uppercase tracking-tight text-ink">This match was voided</h1>
          {pvpRoom.voidReason && <p className="max-w-md text-sm text-ink-muted">{pvpRoom.voidReason}</p>}
        </div>
      );
    }
    if (pvpRoom.phase === 'not-participant') {
      return (
        <div className="flex h-dvh-z items-center justify-center font-sans">
          <div className="text-2xl font-semibold text-ink-subtle">You are not in this match.</div>
        </div>
      );
    }
    // 'loading', 'not-drafting' (about to redirect) and "binding/cards not ready yet" all
    // show the same generic loading state — the redirect effect above handles routing.
    if (pvpRoom.phase === 'loading' || pvpRoom.phase === 'not-drafting' || pvpRoom.phase === 'complete' || !humanSeat) {
      return (
        <div className="flex h-dvh-z items-center justify-center font-sans">
          <div className="text-2xl font-semibold text-ink-subtle animate-pulse">Loading the room...</div>
        </div>
      );
    }
  }

  if (!isPvp && (draftState === 'loading' || !humanSeat)) {
    return (
      <div className="flex h-dvh-z items-center justify-center font-sans">
        <DraftResumeSheet
          session={resumeCandidate === 'checking' ? null : resumeCandidate}
          onResume={handleResume}
          onAbandon={handleAbandon}
        />
        <div className="text-2xl font-semibold text-ink-subtle animate-pulse">Generating Draft Pod...</div>
      </div>
    );
  }

  if (draftState === 'deckbuilding') {
    return (
      <>
        <SaveErrorBanner message={saveError} />
        <DeckBuilder draftedCards={humanSeat.drafted} sessionId={completedSessionId ?? undefined} podAverageIdentity={podAverageIdentity} gameMode={gameMode as 'tournament' | 'challenge'} />
      </>
    );
  }

  const selectedCard = selectedCardId
    ? humanSeat.currentPack.find(card => card.id === selectedCardId) ?? null
    : null;
  const selectedCardName = selectedCard
    ? selectedCard.type === 'Play'
      ? selectedCard.name
      : selectedCard.player.name
    : null;

  const packDirection = currentPackNumber === 2 ? 1 : -1;
  // pvp_draft: the header's neighbour seats are relative to the LOCAL seat (0 or 4), not
  // always table seats 7/1 — matches `useDraftEngine`'s own passingToSeat/receivingFromSeat.
  const localSeatIndex = humanSeat.id === 'human-4' ? 4 : 0;
  const rightIndex = (localSeatIndex + 1) % CUBE_SEATS;
  const leftIndex = (localSeatIndex + CUBE_SEATS - 1) % CUBE_SEATS;
  const leftSeat = seats[leftIndex];
  const rightSeat = seats[rightIndex];
  const isPackIntro = draftState === 'pack-intro';
  const isRoundSummary = draftState === 'round-summary';
  // Owner call: selecting/picking a card must not pop the sidebar open; only its toggle does.
  const isSidebarOpen = isSidebarOpenToggled && !isPackIntro;
  // D7/D8: the opener now renders inside the real room's <main>, with the
  // header/ticker/sidebar blurred behind it instead of a hand-built backdrop.
  const backdropClass = isPackIntro ? 'blur-sm pointer-events-none select-none' : '';

  return (
    <div className="flex flex-col md:flex-row h-dvh-z bg-surface text-ink font-sans relative overflow-hidden">
      <SaveErrorBanner message={saveError} />
      <BackGuardSheet
        open={showBackGuard}
        message="Your picks so far will be lost — the draft can't be resumed once you leave."
        onCancel={() => setShowBackGuard(false)}
        onLeave={goBack}
      />

      {isRoundSummary && (
        <RoundSummary
          drafted={humanSeat.drafted}
          // `currentPackNumber` already points at the upcoming pack while
          // paused in round-summary (applyPick advances it before pausing).
          completedPackNumber={currentPackNumber - 1}
          nextPassDirection={currentPackNumber === 2 ? 'right' : 'left'}
          onStartNextRound={startNextRound}
        />
      )}

      {/* pvp_draft D2: the local seat has picked, the opponent hasn't. A floating pill over
          the settled pack, never a blocking overlay: waiting is the normal state for
          whoever picks first, and the pack behind it stays readable (owner, 2026-09-22). */}
      {isPvp && pvpRoom.phase === 'waiting' && (
        <div className="pointer-events-none absolute inset-x-0 top-[4.5rem] z-30 [&>*]:pointer-events-auto">
        <WaitingFor
          name={pvpRoom.opponentName}
          pickDeadline={pickDeadline}
          opponentOnline={pvpRoom.opponentOnline}
          canFinishForOpponent={pvpRoom.canFinishForOpponent}
          finishingForOpponent={pvpRoom.finishingForOpponent}
          onFinishForOpponent={pvpRoom.finishForOpponent}
        />
        </div>
      )}

      {/* Main Draft Area */}
      <div className="flex-1 flex flex-col relative overflow-hidden">
        {/* Arena Style Header */}
        {/* game_canvas D2: during the pack intro the header and ticker are blurred and inert,
            so on a phone they give their height to the two-row spread instead. */}
        <header className={`px-8 py-4 flex justify-between items-center border-b border-line bg-surface-raised/50 backdrop-blur-sm shrink-0 transition-[filter] duration-200 ${backdropClass} ${isPackIntro ? 'pointer-coarse:max-lg:hidden' : ''}`}>
          <div className="w-64 hidden lg:flex items-center gap-2">
            {isPvp ? (
              <span className="font-display text-xs uppercase tracking-widest bg-surface-inverse-deep text-accent px-2.5 py-1 rounded-full border border-accent shadow-sm">
                Playoffs
              </span>
            ) : (
              <ModePill mode={mode as 'quick' | 'premier'} />
            )}
            {gameMode === 'challenge' && <ChallengeBadge />}
            {(mode === 'premier' || isPvp) && <PickTimerRing pickDeadline={isPackIntro ? null : pickDeadline} pickNumber={currentPickNumber} size={34} />}
            <SfxToggle />
          </div>

          {/* game_canvas T0: the seats are shrink-0 and the bar/chevrons scale with the
              breakpoint, so this row fits 830px without pushing a seat past x=0. */}
          <div className="min-w-0 flex-1 flex justify-center items-center gap-4 lg:gap-8">
             {/* Left neighbour seat (seat 7 relative to the local seat) */}
             <motion.div
               key={`left-${passSeq}`}
               initial={{ scale: 1 }}
               animate={{ scale: [1, 1.15, 1] }}
               transition={{ duration: 0.3, delay: passStaggerDelayMs(currentPackNumber === 2 ? 1 : 0) / 1000 }}
               className="flex shrink-0 flex-col items-center gap-1 opacity-80"
             >
                <div className={`w-8 h-8 rounded-full bg-surface-raised border flex items-center justify-center text-sm ${currentPackNumber !== 2 ? 'border-ink-subtle shadow-sm' : 'border-line'}`}>🤖</div>
                <span className={`max-w-24 truncate text-xs uppercase tracking-widest font-bold ${currentPackNumber !== 2 ? 'text-ink' : 'text-ink-subtle'}`}>{leftSeat?.botProfile?.name || 'Player'}</span>
             </motion.div>

             {/* Central Pass UI */}
             <div className="flex min-w-0 items-center gap-3 lg:gap-6">
                {currentPackNumber === 2 ? <ChevronRight className="text-ink-subtle hidden lg:block" size={24} /> : <ChevronLeft className="text-ink-subtle hidden lg:block" size={24} />}
                <div className="flex flex-col items-center gap-1.5">
                   <div className="text-ink font-bold text-sm leading-none whitespace-nowrap">
                     Pack {currentPackNumber} <span className="text-ink-subtle font-medium">·</span> Pick {currentPickNumber} of {PICKS_PER_PACK}
                   </div>
                   <div className="w-40 sm:w-56 lg:w-72 h-1.5 rounded-full bg-surface-muted overflow-hidden flex gap-[1.5px]">
                     {Array.from({ length: TOTAL_PICKS }).map((_, i) => (
                       <div
                         key={i}
                         className={`flex-1 rounded-[1px] ${i < overallPick - 1 ? 'bg-accent' : 'bg-surface-muted'}`}
                       />
                     ))}
                   </div>
                   <div className="text-ink-subtle font-medium uppercase tracking-widest text-xs">
                     Overall Pick {overallPick} / {TOTAL_PICKS}
                   </div>
                </div>
                {currentPackNumber === 2 ? <ChevronRight className="text-ink-subtle hidden lg:block" size={24} /> : <ChevronLeft className="text-ink-subtle hidden lg:block" size={24} />}
             </div>

             {/* Right Player (Seat 1) */}
             <motion.div
               key={`right-${passSeq}`}
               initial={{ scale: 1 }}
               animate={{ scale: [1, 1.15, 1] }}
               transition={{ duration: 0.3, delay: passStaggerDelayMs(currentPackNumber === 2 ? 0 : 1) / 1000 }}
               className="flex shrink-0 flex-col items-center gap-1 opacity-80"
             >
                <div className={`w-8 h-8 rounded-full bg-surface-raised border flex items-center justify-center text-sm ${currentPackNumber === 2 ? 'border-ink-subtle shadow-sm' : 'border-line'}`}>🤖</div>
                <span className={`max-w-24 truncate text-xs uppercase tracking-widest font-bold ${currentPackNumber === 2 ? 'text-ink' : 'text-ink-subtle'}`}>{rightSeat?.botProfile?.name || 'Player'}</span>
             </motion.div>
          </div>

          <div className="w-64 hidden lg:flex justify-end">
            <div className="text-ink-muted font-medium text-xs uppercase tracking-widest bg-surface-raised px-3 py-1.5 rounded-full border border-line flex items-center gap-1.5 shadow-sm">
              Passing {currentPackNumber === 2 ? 'Right' : 'Left'} {currentPackNumber === 2 ? <ChevronRight size={14}/> : <ChevronLeft size={14}/>}
            </div>
          </div>
        </header>

        <div className={`transition-[filter] duration-200 ${backdropClass} ${isPackIntro ? 'pointer-coarse:max-lg:hidden' : ''}`}>
          <BotPickTicker pickLog={pickLog} seats={seats} localSeatId={humanSeat.id} leftIndex={leftIndex} rightIndex={rightIndex} />
        </div>

        {isPackIntro ? (
          // D7/D8: embedded in the room's own <main> rather than a fixed
          // full-screen overlay — header/ticker/sidebar are blurred behind it
          // (backdropClass above) instead of the old hand-built
          // DraftRoomIntroBackdrop.
          <main className="flex-1 overflow-y-auto">
            <PackOpener
              pack={humanSeat.currentPack}
              packNumber={currentPackNumber}
              totalPacks={CUBE_PACKS}
              mode={mode as 'quick' | 'premier'}
              pickDeadline={pickDeadline}
              embedded
              className="max-w-[1500px] mx-auto"
              onPick={(pick) => pickFromIntro(pick.cardId)}
              onComplete={() => {
                setIsSidebarOpenToggled(false);
                setDraftState('drafting');
              }}
            />
          </main>
        ) : (
          <>
            {/* Cards Grid */}
            <main className="flex-1 overflow-y-auto flex flex-col items-center pt-6 px-6 pb-6 custom-scrollbar">
              <PackPassStage passSeq={passSeq} direction={packDirection === 1 ? 'right' : 'left'}>
                {/* game_canvas D2 (owner): on a phone the pack is two rows of four; the grid's
                    max-width is derived from the viewport height minus the header + ticker
                    (~200px) so both rows fit without scrolling. phone_card D3 (2026-09-19):
                    the *10/7 factor is 2x the card aspect ratio (width/height) — updated to
                    *2.3 (= 2x1.15) alongside the card's own aspect-[1.15/1] phone variant. */}
                <div className="grid grid-cols-3 sm:grid-cols-4 lg:grid-cols-5 gap-5 lg:gap-6 pointer-coarse:max-lg:gap-2! pointer-coarse:max-lg:max-w-[calc((100dvh/var(--zoom)-200px)*2.3+24px)]! w-full max-w-[1500px] mx-auto">
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
                        <div
                          className="relative w-full"
                          role="button"
                          tabIndex={0}
                          aria-label={`Select ${card.type === 'Play' ? card.name : card.player.name}`}
                          onKeyDown={(e) => {
                            if (e.key === 'Enter' || e.key === ' ') {
                              e.preventDefault();
                              handleCardClick(card.id);
                            }
                          }}
                        >
                          {card.type === 'Play' ? (
                            <PlayCard
                              play={card as Play}
                              isSelected={selectedCardId === card.id}
                              onClick={() => handleCardClick(card.id)}
                              wide
                            />
                          ) : (
                            <PlayerCard
                              player={card as Player}
                              isSelected={selectedCardId === card.id}
                              onClick={() => handleCardClick(card.id)}
                              size="sm"
                              wide
                            />
                          )}
                          {selectedCardId === card.id && (
                            <span className="absolute -bottom-5 inset-x-0 text-center text-xs font-bold uppercase tracking-widest text-accent whitespace-nowrap pointer-coarse:hidden">
                              Double-click to pick
                            </span>
                          )}
                        </div>
                      </motion.div>
                    ))}
                  </AnimatePresence>
                </div>
              </PackPassStage>
            </main>

            <ConfirmPickDock
              cardName={selectedCardName}
              onConfirm={handleConfirmPick}
            />
          </>
        )}
      </div>

      {/* Draft Sidebar */}
      <div className={`transition-[filter] duration-200 ${backdropClass}`}>
        <DraftSidebar
          drafted={humanSeat.drafted}
          isOpen={isSidebarOpen}
          toggle={() => setIsSidebarOpenToggled(!isSidebarOpenToggled)}
          onDropPick={handleDrop}
        />
      </div>
    </div>
  );
}
