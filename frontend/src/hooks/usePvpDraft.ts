'use client';

/**
 * pvp_draft (D1-D5, D9): the Playoffs draft room's state, from the `matches` row.
 *
 * Wraps `useMatch(matchId)`: replays `(seed, host_picks, guest_picks)` with
 * `validateReplay` (a rejected pick calls `match_void`, D3), sends local picks with
 * `match_pick` and folds them in optimistically (on an RPC error it refetches and the row
 * wins, D1), auto-picks for the local seat with `pvpAutopick` when `pick_deadline` passes
 * (`match_pick` with `auto: true`, D4), and, only after the owner pressed "Finish the draft"
 * (offered once the opponent has been offline `PVP_OFFLINE_FINISH_MS`), auto-picks for the
 * absent seat with `match_autopick` at each `pick_deadline + PVP_AUTOPICK_GRACE_MS` (D5).
 * Before that, an absent opponent makes the room wait. A reload rebuilds everything
 * from the row; no resume sheet (D9).
 */

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useAuthStatus } from '@/components/AuthProvider';
import { useMatch } from './useMatch';
import { validateReplay, pvpAutopick, type HumanPicks } from '@/engine/draftReplay';
import { PLAY_CATALOG as playsDB } from '@/engine/plays';
import type { Player } from '@/components/PlayerCard';
import {
  MATCH_SEAT_ID,
  MATCH_OFFLINE_MS,
  PVP_AUTOPICK_GRACE_MS,
  PVP_OFFLINE_FINISH_MS,
  type DirectoryUser,
  type Match,
  type MatchAction,
  type MatchSide,
  type MatchTransport,
} from '@/storage/matchTypes';
import type { PvpDraftBinding } from './useDraftEngine';

export type PvpDraftPhase =
  | 'loading'
  | 'not-participant'
  | 'not-drafting' // the row is past (or before) the draft: invited, building, series, ...
  | 'picking'      // the local seat owes the current pick
  | 'waiting'      // the local seat has picked, the opponent has not (D2: WaitingFor)
  | 'complete'     // both made 24 picks: go to /playoffs/[id]/build
  | 'void';

export interface UsePvpDraftResult {
  phase: PvpDraftPhase;
  match: Match | null;
  me: MatchSide | null;
  /** Null until the row and the card set are loaded. Pass straight to `useDraftEngine`. */
  binding: PvpDraftBinding | null;
  opponentName: string | null;
  opponentOnline: boolean;
  /** Epoch ms since the opponent's last heartbeat went stale, null while online. */
  opponentOfflineSince: number | null;
  /** D5: true once the opponent has been offline `PVP_OFFLINE_FINISH_MS`. */
  canFinishForOpponent: boolean;
  finishingForOpponent: boolean;
  finishForOpponent: () => void;
  transport: MatchTransport;
  voidReason: string | null;
  error: string | null;
  /** T4 (build page): send `lockRoster` directly — the only action the build page needs
   *  beyond what this hook already drives itself. Same versioned-retry `useMatch.send`. */
  send: (action: MatchAction) => Promise<Match>;
}

const OTHER_SIDE: Record<MatchSide, MatchSide> = { host: 'guest', guest: 'host' };

export function usePvpDraft(matchId: string): UsePvpDraftResult {
  const authStatus = useAuthStatus();
  const { match, me, transport, opponentOnline, send, refetch, error: matchError } = useMatch(matchId);

  // Card pool, loaded once (same shape `DraftRoom` loads for the solo path).
  const [allPlayers, setAllPlayers] = useState<Player[]>([]);
  useEffect(() => {
    let cancelled = false;
    import('@/engine/cards')
      .then(({ getAllCards }) => {
        if (cancelled) return;
        const data = getAllCards() as Array<Omit<Player, 'type'>>;
        setAllPlayers(data.map((c) => ({ ...c, type: 'Player' as const })));
      })
      .catch((e) => console.error('usePvpDraft: failed to load cards:', e));
    return () => { cancelled = true; };
  }, []);

  // Opponent's display name, off the approved-user directory (T3: no per-match profile
  // lookup RPC exists, this reuses the same endpoint `/playoffs/new`'s invite list uses).
  const [opponentName, setOpponentName] = useState<string | null>(null);
  const opponentId = match && me ? (me === 'host' ? match.guest_id : match.host_id) : null;
  useEffect(() => {
    if (!opponentId) return;
    let cancelled = false;
    fetch('/api/users')
      .then((r) => r.json())
      .then((data: { users?: DirectoryUser[] }) => {
        if (cancelled) return;
        const u = data.users?.find((u) => u.id === opponentId);
        if (u) setOpponentName(u.display_name || u.username || 'Opponent');
      })
      .catch(() => { /* name stays null — non-fatal */ });
    return () => { cancelled = true; };
  }, [opponentId]);

  // ── Optimistic local picks (D1) ──────────────────────────────────────────
  // `optimisticExtra` is the tail of card ids sent for the local seat but not yet reflected
  // in `match` (either row). It shrinks automatically as the row's own pick count for this
  // seat grows (that can only happen from a call THIS client made, in order), and is
  // dropped entirely on an RPC error, after which the row (via refetch) wins.
  const mineRowLen = match && me ? (me === 'host' ? match.host_picks.length : match.guest_picks.length) : 0;
  const optimisticRef = useRef<string[]>([]);
  const [optimisticExtra, setOptimisticExtraState] = useState<string[]>([]);
  const setOptimisticExtra = useCallback((next: string[]) => {
    optimisticRef.current = next;
    setOptimisticExtraState(next);
  }, []);
  const mineRowLenRef = useRef(mineRowLen);
  useEffect(() => {
    const grew = mineRowLen - mineRowLenRef.current;
    if (grew > 0) setOptimisticExtra(optimisticRef.current.slice(grew));
    mineRowLenRef.current = mineRowLen;
  }, [mineRowLen, setOptimisticExtra]);

  const applyLocalPick = useCallback((cardId: string, auto: boolean) => {
    if (!match || !me) return;
    const mineRow = me === 'host' ? match.host_picks : match.guest_picks;
    const index = mineRow.length + optimisticRef.current.length;
    setOptimisticExtra([...optimisticRef.current, cardId]);
    void send({ type: 'pick', index, cardId, auto }).catch(() => {
      // D1: the RPC raised (version or sequencing) — drop the optimistic tail, the row wins.
      setOptimisticExtra([]);
      void refetch();
    });
  }, [match, me, send, refetch, setOptimisticExtra]);

  const onLocalPick = useCallback((cardId: string) => applyLocalPick(cardId, false), [applyLocalPick]);

  // ── Replay (validated off the CONFIRMED row only — optimism never feeds validation) ──
  const rowHumanPicks: HumanPicks = useMemo(() => (
    match ? { 'human-0': match.host_picks, 'human-4': match.guest_picks } : ({} as HumanPicks)
  ), [match]);
  const rowAutoPicks: Record<string, number[]> = useMemo(() => (
    match ? { 'human-0': match.host_autopicks, 'human-4': match.guest_autopicks } : ({} as Record<string, number[]>)
  ), [match]);

  const validation = useMemo(() => {
    if (!match || allPlayers.length === 0) return null;
    return validateReplay(match.seed, rowHumanPicks, allPlayers, playsDB, { autoPicked: rowAutoPicks });
  }, [match, allPlayers, rowHumanPicks, rowAutoPicks]);
  const state = validation?.ok ? validation.state : null;

  // D3: a rejected replay voids the match — once per bad row, and only for a status where
  // voiding is legal (the server also enforces this, but skip the doomed call).
  const voidSentRef = useRef(false);
  useEffect(() => {
    if (!match || !validation) return;
    if (validation.ok) { voidSentRef.current = false; return; }
    if (match.status !== 'drafting' && match.status !== 'building') return;
    if (voidSentRef.current) return;
    voidSentRef.current = true;
    void send({ type: 'void', reason: validation.reason }).catch(() => { voidSentRef.current = false; });
  }, [match, validation, send]);

  // ── Binding for `useDraftEngine` (visible picks include our own optimistic tail so the
  //    local seat's own pack updates instantly) ──
  const humanPicks: HumanPicks = useMemo(() => {
    if (!match) return {} as HumanPicks;
    const hostExtra = me === 'host' ? optimisticExtra : [];
    const guestExtra = me === 'guest' ? optimisticExtra : [];
    return {
      'human-0': [...match.host_picks, ...hostExtra],
      'human-4': [...match.guest_picks, ...guestExtra],
    };
  }, [match, me, optimisticExtra]);

  const binding: PvpDraftBinding | null = useMemo(() => {
    if (!match || !me || allPlayers.length === 0 || match.status !== 'drafting') return null;
    return {
      seed: match.seed,
      localSeatId: MATCH_SEAT_ID[me] as 'human-0' | 'human-4',
      humanPicks,
      humanAutoPicks: rowAutoPicks,
      pickDeadline: match.pick_deadline ? new Date(match.pick_deadline).getTime() : null,
      onLocalPick,
    };
  }, [match, me, allPlayers.length, humanPicks, rowAutoPicks, onLocalPick]);

  // ── Phase (D2) ────────────────────────────────────────────────────────────
  const mineEffectiveLen = mineRowLen + optimisticExtra.length;
  const theirRowLen = match && me ? (me === 'host' ? match.guest_picks.length : match.host_picks.length) : 0;

  const phase: PvpDraftPhase = useMemo(() => {
    if (!match) return 'loading';
    // `useCurrentProfile()` can still be resolving on first render even once the row has
    // loaded — 'not-participant' only once auth itself has actually settled, so a signed-in
    // participant never gets bounced by a one-frame `me === null`.
    if (authStatus === 'loading') return 'loading';
    if (!me) return 'not-participant';
    if (match.status === 'void') return 'void';
    if (match.status === 'building') return 'complete';
    if (match.status !== 'drafting') return 'not-drafting';
    return mineEffectiveLen <= theirRowLen ? 'picking' : 'waiting';
  }, [match, me, authStatus, mineEffectiveLen, theirRowLen]);

  // ── Offline / Finish the draft (D5) ────────────────────────────────────────
  const otherSeenAt = match && me ? (me === 'host' ? match.guest_seen_at : match.host_seen_at) : null;
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const timer = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(timer);
  }, []);

  const opponentOfflineSince = useMemo(() => {
    if (!match || !me || opponentOnline) return null;
    if (otherSeenAt) return new Date(otherSeenAt).getTime() + MATCH_OFFLINE_MS;
    return new Date(match.created_at).getTime();
  }, [match, me, opponentOnline, otherSeenAt]);

  const canFinishForOpponent = useMemo(() => {
    if (!opponentOfflineSince || !match || match.status !== 'drafting') return false;
    return now - opponentOfflineSince >= PVP_OFFLINE_FINISH_MS;
  }, [opponentOfflineSince, match, now]);

  const [finishingForOpponent, setFinishingForOpponent] = useState(false);
  // An opponent who comes back takes their own picks again; otherwise both clients race
  // for the same seat (the row stays consistent, but the returning player loses picks).
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- derived reset on reconnect
    if (opponentOnline && finishingForOpponent) setFinishingForOpponent(false);
  }, [opponentOnline, finishingForOpponent]);
  const finishForOpponent = useCallback(() => {
    if (!canFinishForOpponent) return;
    setFinishingForOpponent(true);
  }, [canFinishForOpponent]);

  // ── D4: own-seat expiry auto-pick ──────────────────────────────────────────
  const ownAutopickSentRef = useRef<string | null>(null);
  useEffect(() => {
    if (!match || !me || !state || phase !== 'picking' || !match.pick_deadline) return;
    const deadlineMs = new Date(match.pick_deadline).getTime();
    if (now < deadlineMs) return;
    const localSeatId = MATCH_SEAT_ID[me];
    const key = `${localSeatId}:${mineEffectiveLen}`;
    if (ownAutopickSentRef.current === key) return;
    const cardId = pvpAutopick(state, localSeatId);
    if (!cardId) return;
    ownAutopickSentRef.current = key;
    applyLocalPick(cardId, true);
  }, [match, me, state, phase, now, mineEffectiveLen, applyLocalPick]);

  // ── D5: absent-opponent auto-pick, once "Finish the draft" was pressed ─────
  const opponentAutopickSentRef = useRef<string | null>(null);
  useEffect(() => {
    if (!finishingForOpponent || opponentOnline || !match || !me || !state) return;
    if (match.status !== 'drafting' || phase !== 'waiting' || !match.pick_deadline) return;
    const deadlineMs = new Date(match.pick_deadline).getTime();
    if (now < deadlineMs + PVP_AUTOPICK_GRACE_MS) return;
    const otherSide = OTHER_SIDE[me];
    const otherSeatId = MATCH_SEAT_ID[otherSide];
    const key = `${otherSeatId}:${theirRowLen}`;
    if (opponentAutopickSentRef.current === key) return;
    const cardId = pvpAutopick(state, otherSeatId);
    if (!cardId) return;
    opponentAutopickSentRef.current = key;
    void send({ type: 'autopick', seat: otherSide, index: theirRowLen, cardId }).catch(() => {
      opponentAutopickSentRef.current = null;
    });
  }, [finishingForOpponent, opponentOnline, match, me, state, phase, now, theirRowLen, send]);

  return {
    phase,
    match,
    me,
    binding,
    opponentName,
    opponentOnline,
    opponentOfflineSince,
    canFinishForOpponent,
    finishingForOpponent,
    finishForOpponent,
    transport,
    voidReason: match?.void_reason ?? null,
    error: matchError,
    send,
  };
}
