/**
 * pvp_match contracts: the shared record of a two-player "Playoffs" match.
 *
 * `Match` mirrors a `public.matches` row column for column (snake_case, as supabase-js
 * returns it) so there is no mapping layer to drift. Clients never write the table
 * directly: every change goes through one of the security-definer RPCs listed below,
 * and game results are written only by `POST /api/match/[id]/simulate` (service role).
 *
 * Host is seat 0 (`human-0`), guest is seat 4 (`human-4`). Game numbers are 1-based.
 */

import type { PlayerBoxScore } from '@/engine/gameTypes';
import type { MatchSide } from '@/engine/playoffs';
import type { SavedRoster, ChallengeTrade } from './types';

export type { MatchSide };

export const MATCH_SEAT_ID: Record<MatchSide, string> = { host: 'human-0', guest: 'human-4' };

/** Picks each human makes over the cube draft (3 packs x 8 cards). */
export const MATCH_PICKS_PER_SEAT = 24;
/** D6: heartbeat period while a match page is open; offline after `MATCH_OFFLINE_MS`. */
export const MATCH_HEARTBEAT_MS = 15_000;
export const MATCH_OFFLINE_MS = 45_000;
/** D5: fall back to polling if the Realtime channel is not SUBSCRIBED within this. */
export const MATCH_SUBSCRIBE_TIMEOUT_MS = 5_000;
export const MATCH_POLL_MS = 3_000;
/** pvp_draft D4: the server accepts `match_autopick` for an absent seat this long after
 *  `pick_deadline` (SQL mirrors it). */
export const PVP_AUTOPICK_GRACE_MS = 10_000;
/** pvp_draft D5: an opponent offline (no heartbeat) this long lets the present player
 *  press "Finish the draft"; from then on their client auto-picks for the absent seat at
 *  each deadline + grace. Before that the room waits. */
export const PVP_OFFLINE_FINISH_MS = 5 * 60_000;

export type MatchStatus =
  | 'invited'   // host invited guest, waiting on match_respond
  | 'declined'  // terminal
  | 'expired'   // terminal: invite older than 7 days (D8)
  | 'drafting'  // both humans drafting (pvp_draft)
  | 'building'  // both drafted all 24 picks, building rosters
  | 'series'    // both rosters locked, games being simulated (pvp_series)
  | 'sideboard' // mid-series front office (pvp_series D4)
  | 'done'      // terminal: series over, winner_id set
  | 'void'      // terminal: a pick failed validation (pvp_draft D3)
  | 'forfeit';  // terminal: a player idle > 7 days (D8), winner_id = the other

export const TERMINAL_MATCH_STATUSES: readonly MatchStatus[] = ['declined', 'expired', 'done', 'void', 'forfeit'];

/** One simulated series game, slim (the play-by-play is re-simulated from `seed`). */
export interface MatchGame {
  /** 1-based game number. */
  game: number;
  home: MatchSide;
  seed: number;
  /** engine/balance.ts BALANCE_VERSION at simulation time. */
  balanceVersion: number;
  score: { host: number; guest: number };
  overtimePeriods: number;
  box: { host: PlayerBoxScore[]; guest: PlayerBoxScore[] };
  simulatedAt: string;
}

export interface MatchSideboardEntry {
  roster: SavedRoster;
  trade?: ChallengeTrade;
  lockedAt: string;
}

export interface MatchSeen {
  game: number;
  at: string;
}

export interface Match {
  id: string;
  seed: number;
  host_id: string;
  guest_id: string;
  status: MatchStatus;
  /** Card ids in pick order. */
  host_picks: string[];
  guest_picks: string[];
  /** 0-based pick indexes the clock took for that seat (replayDraft `autoPicked`). */
  host_autopicks: number[];
  guest_autopicks: number[];
  pick_deadline: string | null;
  host_roster: SavedRoster | null;
  guest_roster: SavedRoster | null;
  host_locked_at: string | null;
  guest_locked_at: string | null;
  sideboard: { host?: MatchSideboardEntry; guest?: MatchSideboardEntry };
  games: MatchGame[];
  host_seen: MatchSeen | null;
  guest_seen: MatchSeen | null;
  /** Heartbeats (D6). Written by match_heartbeat, which does NOT bump `version`. */
  host_seen_at: string | null;
  guest_seen_at: string | null;
  winner_id: string | null;
  /** pvp_draft D3: why the match was voided (a replay found an illegal pick). */
  void_reason: string | null;
  version: number;
  created_at: string;
  updated_at: string;
}

/** A row of `public.user_directory` (D3): approved users only. */
export interface DirectoryUser {
  id: string;
  display_name: string;
  username: string | null;
}

/**
 * The RPC contract (migration `supabase/migrations/202609220001_matches.sql`).
 * All are `security definer set search_path = public`, granted to `authenticated` only,
 * require the caller to be an APPROVED profile, and return the updated `matches` row
 * (except where noted). Arguments are prefixed `p_` in SQL.
 *
 *   match_invite(p_guest_id uuid) -> matches
 *     caller = host. guest must be approved and != caller. One `invited` row per pair
 *     (either direction) at a time. seed = DB-drawn non-negative int. status 'invited'.
 *   match_respond(p_id text, p_version int, p_accept boolean) -> matches
 *     caller = guest, status 'invited'. accept -> 'drafting' with pick_deadline NULL (no
 *     clock until someone picks; 202609220002); else 'declined'.
 *   match_pick(p_id text, p_version int, p_index int, p_card_id text, p_auto boolean default false) -> matches
 *     caller = either side, status 'drafting'. p_index must equal len(my picks) and
 *     len(my picks) <= len(their picks) (nobody runs more than one pick ahead). Appends;
 *     p_auto appends p_index to my autopicks. When both sides have picked p_index,
 *     pick_deadline = now()+45s; when I am the first to pick p_index and there is no
 *     deadline yet (pick 1), pick_deadline = now()+45s for the other side (202609220002). When both have 24 picks -> 'building', pick_deadline null.
 *   match_autopick(p_id text, p_version int, p_seat text, p_index int, p_card_id text) -> matches
 *     caller = the OTHER side of p_seat, status 'drafting', now() > pick_deadline + 10s,
 *     p_index = len(that seat's picks). Appends the card and the index to that seat's
 *     autopicks (so one call per index by construction).
 *   match_lock_roster(p_id text, p_version int, p_roster jsonb) -> matches
 *     status 'building', my roster not yet locked. Both locked -> 'series'.
 *   match_sideboard(p_id text, p_version int, p_roster jsonb, p_trade jsonb) -> matches
 *     status 'sideboard', my entry not yet set. Both set -> 'series'.
 *   match_seen(p_id text, p_version int, p_game int) -> matches
 *     participant, any non-terminal status. Sets my *_seen = {game, at: now()}.
 *   match_heartbeat(p_id text) -> void
 *     participant. Sets my *_seen_at = now(). No version check, no version bump.
 *   match_void(p_id text, p_version int, p_reason text) -> matches   [202609220002_match_void.sql]
 *     participant, status 'drafting' or 'building' -> 'void', void_reason = p_reason
 *     (truncated to 500 chars). pvp_draft D3: called when a replay rejects a pick.
 *   match_expire(p_id text default null) -> int
 *     D8 over one match (or every match of the caller when null): 'invited' older than 7
 *     days -> 'expired'; a non-terminal status whose awaited player has been idle for 7
 *     days -> 'forfeit', winner_id = the other. Returns rows changed. No version arg.
 *
 * Every RPC with p_version raises when it does not equal the row's version, and bumps
 * version by 1 on success. Errors are `raise exception '<code>: <detail>'` with one of
 * the codes in `MatchErrorCode`, so the client matches on the message prefix.
 */
export type MatchErrorCode =
  | 'version_mismatch'
  | 'not_participant'
  | 'not_approved'
  | 'bad_status'
  | 'bad_sequence'
  | 'too_early'
  | 'duplicate_invite'
  | 'bad_argument';

export function matchErrorCode(message: string | undefined | null): MatchErrorCode | null {
  const m = /^(version_mismatch|not_participant|not_approved|bad_status|bad_sequence|too_early|duplicate_invite|bad_argument)\b/.exec(message ?? '');
  return m ? (m[1] as MatchErrorCode) : null;
}

/** What `useMatch().send` accepts: one variant per versioned RPC. */
export type MatchAction =
  | { type: 'respond'; accept: boolean }
  | { type: 'pick'; index: number; cardId: string; auto?: boolean }
  | { type: 'autopick'; seat: MatchSide; index: number; cardId: string }
  | { type: 'lockRoster'; roster: SavedRoster }
  | { type: 'sideboard'; roster: SavedRoster; trade?: ChallengeTrade }
  | { type: 'seen'; game: number }
  | { type: 'void'; reason: string };

/** D5: how the match row is kept fresh. */
export type MatchTransport = 'connecting' | 'realtime' | 'polling';

export interface UseMatchResult {
  match: Match | null;
  /** null until loaded, or when the caller is not a participant. */
  me: MatchSide | null;
  transport: MatchTransport;
  /** D6: true when the opponent's heartbeat is older than MATCH_OFFLINE_MS. */
  opponentOnline: boolean;
  error: string | null;
  /** Calls the RPC with the current version; on `version_mismatch` refetches and retries
   *  once. Resolves to the updated row, rejects with the RPC error otherwise. */
  send: (action: MatchAction) => Promise<Match>;
  refetch: () => Promise<void>;
}

/** What `useMatchList` selects: everything except the roster snapshots, which can be
 *  100+ KB each and are only needed on a match's own page. The bell runs this query on
 *  every route. */
export type MatchSummary = Omit<Match, 'host_roster' | 'guest_roster' | 'sideboard'>;

export const MATCH_SUMMARY_COLUMNS =
  'id,seed,host_id,guest_id,status,host_picks,guest_picks,host_autopicks,guest_autopicks,' +
  'pick_deadline,host_locked_at,guest_locked_at,games,host_seen,guest_seen,host_seen_at,' +
  'guest_seen_at,winner_id,void_reason,version,created_at,updated_at';

export interface UseMatchListResult {
  matches: MatchSummary[];
  loading: boolean;
  refetch: () => Promise<void>;
}

/** Which side the user is on, or null when not a participant. */
export function sideOf(match: Pick<Match, 'host_id' | 'guest_id'>, userId: string | null | undefined): MatchSide | null {
  if (!userId) return null;
  if (match.host_id === userId) return 'host';
  if (match.guest_id === userId) return 'guest';
  return null;
}
