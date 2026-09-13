/**
 * "Roster ready" checklist (plan ui_draft_deckbuild_pack, D15).
 *
 * Pure: takes a `BuiltRoster` plus the drafted cards it refers to and reports
 * which requirements are met, so the deck builder can SHOW the save blockers
 * instead of hiding them in a disabled button's tooltip.
 *
 * Requirements (in display order):
 *   players   — exactly 12 on the depth chart
 *   starters  — all five columns have a starter (names the missing column)
 *   plays     — 3 active plays
 *   roles     — no assigned role points at a player who can't fill it
 *   identity  — an identity is chosen (OPTIONAL: never blocks the save)
 */
import type { BuiltRoster } from '@/engine/deckbuilder';
import type { DraftCard, PlayerCardData } from '@/engine/types';
import { evaluatePlaybook } from '@/engine/playbook';
import { DEPTH_COLUMNS } from '@/engine/positions';
import { MAX_ROSTER } from '@/engine/depthChart';

export const REQUIRED_PLAYS = 3;

export type ChecklistId = 'players' | 'starters' | 'plays' | 'roles' | 'identity';

export interface ChecklistItem {
  id: ChecklistId;
  /** Short requirement label, e.g. "12 players". */
  label: string;
  met: boolean;
  /** Optional requirements are reported but never block the save. */
  optional: boolean;
  /** What is still missing, when not met — e.g. "Need 2 more" / "No SG starter". */
  detail?: string;
}

export interface ChecklistResult {
  items: ChecklistItem[];
  /** Required items that are not met, in display order. */
  unmet: ChecklistItem[];
  /** True when every REQUIRED item is met. */
  ready: boolean;
}

export function evaluateRosterChecklist(roster: BuiltRoster, cards: DraftCard[]): ChecklistResult {
  const chart = roster.depthChart ?? {};
  const placedIds = DEPTH_COLUMNS.flatMap(col => chart[col] ?? []);
  const count = placedIds.length;

  // 1. Roster size
  const playersItem: ChecklistItem = {
    id: 'players',
    label: `${MAX_ROSTER} players`,
    met: count === MAX_ROSTER,
    optional: false,
    detail:
      count === MAX_ROSTER
        ? undefined
        : count < MAX_ROSTER
          ? `Need ${MAX_ROSTER - count} more`
          : `Drop ${count - MAX_ROSTER}`,
  };

  // 2. One starter per column
  const emptyColumns = DEPTH_COLUMNS.filter(col => (chart[col] ?? []).length === 0);
  const startersItem: ChecklistItem = {
    id: 'starters',
    label: '5 starters',
    met: emptyColumns.length === 0,
    optional: false,
    detail: emptyColumns.length === 0 ? undefined : `No ${emptyColumns.join(', ')} starter`,
  };

  // 3. Three active plays
  const playCount = (roster.activePlays ?? []).length;
  const playsItem: ChecklistItem = {
    id: 'plays',
    label: `${REQUIRED_PLAYS} active plays`,
    met: playCount === REQUIRED_PLAYS,
    optional: false,
    detail:
      playCount === REQUIRED_PLAYS
        ? undefined
        : playCount < REQUIRED_PLAYS
          ? `Need ${REQUIRED_PLAYS - playCount} more`
          : `Drop ${playCount - REQUIRED_PLAYS}`,
  };

  // 4. No dangling/ineligible role assignment. An UNASSIGNED role is fine (the play
  //    is simply inactive); a role holding a player who can't fill it is not.
  const placedSet = new Set(placedIds);
  const activePlayers = cards.filter(
    (c): c is PlayerCardData => c.type === 'Player' && placedSet.has(c.id),
  );
  const status = evaluatePlaybook(roster.playAssignments ?? [], activePlayers);
  let badRole: string | undefined;
  for (const play of status.plays) {
    for (const role of play.roles) {
      if (role.playerId && !role.filled) {
        badRole = `${play.def.name} — ${role.role.name}: ${role.reason ?? 'invalid'}`;
        break;
      }
    }
    if (badRole) break;
  }
  const rolesItem: ChecklistItem = {
    id: 'roles',
    label: 'Play roles valid',
    met: !badRole,
    optional: false,
    detail: badRole,
  };

  // 5. Identity (optional)
  const a = roster.archetypes ?? {};
  const identityItem: ChecklistItem = {
    id: 'identity',
    label: 'Identity chosen',
    met: Boolean(a.gold || a.offense || a.defense),
    optional: true,
    detail: a.gold || a.offense || a.defense ? undefined : 'Optional',
  };

  const items = [playersItem, startersItem, playsItem, rolesItem, identityItem];
  const unmet = items.filter(i => !i.optional && !i.met);
  return { items, unmet, ready: unmet.length === 0 };
}
