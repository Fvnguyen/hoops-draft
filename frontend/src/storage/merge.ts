/**
 * Cross-device conflict resolution (accounts_cloud_saves D4).
 *
 * Pure functions only — no Supabase/Dexie/fetch imports, checked by
 * `tests/storage/merge-purity.test.ts` the same way `tests/unit/engine-purity.test.ts`
 * guards `src/engine/`. `storage/supabase.ts` calls these only when the `cas_upsert` RPC
 * reports a row changed under it; kept transport-agnostic so the same merge logic still
 * works if direct-to-Supabase writes are ever replaced by a real backend API.
 */

import type { DraftSession, DraftPickRecord } from '@/engine/deckbuilder';
import type { Season, SeasonScheduleEntry } from '@/engine/season';
import { recomputeStandingsFromSchedule } from '@/engine/season';
import type { ChallengePhase, ChallengeRun, SavedRoster } from './types';

export interface MergeResult<T> {
  merged: T;
  conflict: boolean;
}

function picksMatch(a: DraftPickRecord, b: DraftPickRecord): boolean {
  return a.overallPick === b.overallPick && a.pickedCardId === b.pickedCardId && a.seatId === b.seatId;
}

/**
 * `pickLog` is sequential/append-only within a single draft, so whichever side has more
 * picks recorded is a superset of the other in the normal "resumed on a second device"
 * case — take it outright, no field-level union. `conflict: true` only if the shorter
 * log isn't a prefix of the longer one, which means the two devices somehow recorded
 * different picks at the same position (corruption, not a normal race).
 */
export function mergeDraftSession(local: DraftSession, remote: DraftSession): MergeResult<DraftSession> {
  const localLog = local.pickLog ?? [];
  const remoteLog = remote.pickLog ?? [];
  const longerIsLocal = localLog.length >= remoteLog.length;
  const longer = longerIsLocal ? localLog : remoteLog;
  const shorter = longerIsLocal ? remoteLog : localLog;
  const longerSide = longerIsLocal ? local : remote;

  const isPrefix = shorter.every((rec, i) => picksMatch(rec, longer[i]));
  return { merged: longerSide, conflict: !isPrefix };
}

/**
 * Schedule entries are monotonic: `played` flips false -> true once, gaining a `result`,
 * and never reverts. Per entry, take whichever side has it played (both played is not a
 * genuine collision — each game is only ever played once — but falls back to `local`
 * deterministically if it somehow happens). `standings` is always recomputed from the
 * merged schedule rather than merged field-by-field, so it can never drift from the
 * schedule that produced it. `conflict` is always `false` — nothing here needs a human.
 */
export function mergeSeason(local: Season, remote: Season, session: DraftSession): MergeResult<Season> {
  const length = Math.max(local.schedule.length, remote.schedule.length);
  const schedule: SeasonScheduleEntry[] = [];
  for (let i = 0; i < length; i++) {
    const l = local.schedule[i];
    const r = remote.schedule[i];
    if (l?.played && !r?.played) schedule.push(l);
    else if (r?.played && !l?.played) schedule.push(r);
    else schedule.push(l ?? r);
  }

  const currentGame = Math.max(local.currentGame, remote.currentGame);
  const base = local.currentGame >= remote.currentGame ? local : remote;
  const standings = recomputeStandingsFromSchedule(schedule, session, base.humanTeam?.name);

  return { merged: { ...base, schedule, currentGame, standings }, conflict: false };
}

/**
 * Depth-chart/play-assignment edits are arbitrary reorderings, not append-only data —
 * there's no sensible way to auto-merge two divergent rosters. Always a conflict; the
 * caller surfaces `SyncConflictPrompt` and the human picks a side. `merged` is a
 * placeholder (local) that callers must not use directly when `conflict` is true.
 */
export function mergeRoster(local: SavedRoster, _remote: SavedRoster): MergeResult<SavedRoster> {
  return { merged: local, conflict: true };
}

const CHALLENGE_PHASE_ORDER: Record<ChallengePhase, number> = { first: 0, break: 1, second: 2, done: 3 };

/**
 * challenge_mode D11's one merge rule: whichever side is further along the
 * first -> break -> second -> done ladder wins outright, no field-level union (a `phase`
 * further along always carries the halves/trade data that got it there). Ties (including
 * two sides genuinely at the same phase) keep `local`. Never a conflict — unlike
 * `mergeRoster`, there's no arbitrary reordering here for a human to adjudicate.
 */
export function mergeChallengeRun(local: ChallengeRun, remote: ChallengeRun): MergeResult<ChallengeRun> {
  const localRank = CHALLENGE_PHASE_ORDER[local.phase];
  const remoteRank = CHALLENGE_PHASE_ORDER[remote.phase];
  return { merged: remoteRank > localRank ? remote : local, conflict: false };
}
