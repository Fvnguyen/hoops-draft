'use client';

import { useMemo } from 'react';
import type { DraftCard, Play, PlayerCardData } from '@/engine/types';
import {
  PLAYBOOK,
  evaluatePlaybook,
  getPlaybookId,
  isEligibleForRole,
  type PlayAssignment,
  type PlayRole,
  type PlayStatus,
  type PlaybookStatus,
  type PlaySide,
} from '@/engine/playbook';
import { evaluateArchetypes, shortlistArchetypes, type ArchetypeSelection, type ArchetypeStatus } from '@/engine/archetypes';
import { evaluateRosterChecklist, type ChecklistResult } from '@/lib/rosterChecklist';
import { DEPTH_COLUMNS } from '@/engine/positions';
import type { DenseDepthChart } from '@/engine/depthChart';

/** PlayerCardData chart → the dense id chart a few read-only calcs want (the roster
 *  checklist here, and `DeckBuilder.tsx`'s own `rosterFull`). Placement itself lives in
 *  `applyBuilderAction` (`engine/deckbuilder.ts`). Exported so `DeckBuilder.tsx` — which
 *  needs the same conversion for `rosterFull` — doesn't keep a second copy. */
export const toIdChart = (chart: Record<string, PlayerCardData[]>): DenseDepthChart =>
  Object.fromEntries(DEPTH_COLUMNS.map(col => [col, (chart[col] ?? []).map(p => p.id)]));

export interface UseBuilderPlaybookParams {
  depthChart: Record<string, PlayerCardData[]>;
  activePlays: (Play | null)[];
  playAssignments: Record<string, PlayAssignment>;
  rosterPlayers: PlayerCardData[];
  rosterPlays: Play[];
  draftedCards: DraftCard[];
  archetypes: ArchetypeSelection;
  /** The role currently being assigned (a role row was clicked), if any. */
  assigning: { cardId: string; roleId: string } | null;
  /** `Object.values(depthChart).flat()` — the caller already has this every render for
   *  its own handlers, so it's taken as a param rather than recomputed here too. */
  allPlayers: PlayerCardData[];
}

export interface UseBuilderPlaybookResult {
  starterIds: Set<string>;
  playbookAssignments: PlayAssignment[];
  archetypeStatuses: ArchetypeStatus[];
  validArchetypes: ArchetypeSelection;
  playbookStatus: PlaybookStatus;
  playStatusByCardId: Map<string, PlayStatus>;
  rolesByPlayer: Map<string, { playName: string; roleName: string; side: PlaySide }[]>;
  checklist: ChecklistResult;
  assigningRole: PlayRole | undefined;
  isAssignEligible: (player: PlayerCardData) => boolean;
  isRoleEligible: (cardId: string, roleId: string, playerId: string) => boolean;
  pickerCandidates: PlayerCardData[] | undefined;
  /** Plays-sidebar strip dot state (deckbuilder_ux artboard g): empty slot, needs
   *  more roles filled, or every role filled. */
  playSlotDot: (slotIndex: number) => 'ready' | 'warn' | 'empty';
}

/**
 * Every derived "how does this roster's playbook/identity currently score" value (plan
 * render_and_engine_perf, D8 layout half / T10) — moved out of `DeckBuilder.tsx` as one
 * cohesive unit since they all chain off `playAssignments`/`depthChart`/`archetypes`.
 * Mutating actions (`dispatch`, `assigning`'s setter) stay in `DeckBuilder.tsx`; this hook
 * only ever reads.
 */
export function useBuilderPlaybook({
  depthChart,
  activePlays,
  playAssignments,
  rosterPlayers,
  rosterPlays,
  draftedCards,
  archetypes,
  assigning,
  allPlayers,
}: UseBuilderPlaybookParams): UseBuilderPlaybookResult {
  // Play-role assignment: evaluate every equipped play's roles against the active
  // 12-man roster (playAssignments/evaluatePlaybook — docs/plan_plays_and_synergies
  // §4). Only depth-chart players are eligible; roles referencing anyone else read
  // as unfilled with a reason.
  const playbookAssignments = useMemo(() => Object.values(playAssignments), [playAssignments]);
  const starterIds = useMemo(() => new Set(Object.values(depthChart).map(col => col[0]?.id).filter((id): id is string => !!id)), [depthChart]);
  const archetypeStatuses = useMemo(() => evaluateArchetypes(Object.values(depthChart).flat(), starterIds, archetypes), [depthChart, starterIds, archetypes]);
  // Only unlocked plans may stay selected; anything that dropped below Online is pruned.
  const validArchetypes = useMemo<ArchetypeSelection>(() => {
    const unlocked = new Set(shortlistArchetypes(archetypeStatuses).map(st => st.def.id));
    const keep = (id?: string) => (id && unlocked.has(id) ? id : undefined);
    return archetypes.gold ? { gold: keep(archetypes.gold) } : { offense: keep(archetypes.offense), defense: keep(archetypes.defense) };
  }, [archetypes, archetypeStatuses]);
  const playbookStatus = useMemo(
    () => evaluatePlaybook(playbookAssignments, Object.values(depthChart).flat()),
    [playbookAssignments, depthChart]
  );
  const playStatusByCardId = useMemo(() => {
    const map = new Map<string, PlayStatus>();
    playbookStatus.plays.forEach(s => map.set(s.assignment.cardId, s));
    return map;
  }, [playbookStatus]);

  // playerId -> every role they currently hold, across every equipped play — feeds
  // the RoleTag overlay on depth-chart cards.
  const roleEntries = useMemo(() => {
    const entries: { playerId: string; playName: string; roleName: string; side: PlaySide }[] = [];
    for (const a of playbookAssignments) {
      const def = PLAYBOOK[a.playId];
      if (!def) continue;
      for (const [roleId, playerId] of Object.entries(a.roles)) {
        const role = def.roles.find(r => r.id === roleId);
        if (!role) continue;
        entries.push({ playerId, playName: def.name, roleName: role.name, side: def.side });
      }
    }
    return entries;
  }, [playbookAssignments]);

  // Not wrapped in useMemo: grouping a Map of arrays defeats the React Compiler's
  // ability to preserve manual memoization (verified — every mutation style tried
  // still failed `react-hooks/preserve-manual-memoization`). roleEntries above is
  // already memoized, and this grouping pass over at most a few dozen entries is
  // cheap enough to redo every render.
  const rolesByPlayer = new Map<string, { playName: string; roleName: string; side: PlaySide }[]>();
  for (const entry of roleEntries) {
    rolesByPlayer.set(entry.playerId, [...(rolesByPlayer.get(entry.playerId) ?? []), entry]);
  }

  // "Roster ready" checklist (D15) — the single source of save-blocker truth, shown
  // in the header instead of hiding in a disabled button's tooltip. Cheap enough to
  // recompute every render (the react-compiler lint rejects memoizing it here).
  const checklist = evaluateRosterChecklist(
    {
      version: 2,
      depthChart: toIdChart(depthChart),
      activePlays: activePlays.filter((p): p is Play => p !== null).map(p => p.id),
      playAssignments: playbookAssignments,
      archetypes: validArchetypes,
      rosterPlayers: rosterPlayers.map(p => p.id),
      rosterPlays: rosterPlays.map(p => p.id),
    },
    draftedCards,
  );

  // Assigning a role? Precompute which role/def is targeted so every depth-chart
  // card can be scored for eligibility in the same render pass.
  const assigningRole = useMemo(() => {
    if (!assigning) return undefined;
    const play = activePlays.find(p => p?.id === assigning.cardId);
    const def = play ? PLAYBOOK[getPlaybookId(play)] : undefined;
    return def?.roles.find(r => r.id === assigning.roleId);
  }, [assigning, activePlays]);

  const isAssignEligible = (player: PlayerCardData): boolean => {
    if (!assigning || !assigningRole) return false;
    if (!isEligibleForRole(player, assigningRole)) return false;
    const currentRoles = playAssignments[assigning.cardId]?.roles ?? {};
    return !Object.entries(currentRoles).some(([rid, pid]) => rid !== assigning.roleId && pid === player.id);
  };

  /** Eligibility check for a given (play, role, player) triple — used by PlayPanel to
   *  highlight a role row green/red while a depth-chart player is being dragged over it. */
  const isRoleEligible = (cardId: string, roleId: string, playerId: string): boolean => {
    const play = activePlays.find(p => p?.id === cardId);
    const def = play ? PLAYBOOK[getPlaybookId(play)] : undefined;
    const role = def?.roles.find(r => r.id === roleId);
    const player = allPlayers.find(p => p.id === playerId);
    if (!def || !role || !player) return false;
    if (!isEligibleForRole(player, role)) return false;
    const currentRoles = playAssignments[cardId]?.roles ?? {};
    return !Object.entries(currentRoles).some(([rid, pid]) => rid !== roleId && pid === playerId);
  };

  // Eligible active-roster candidates for the role currently being assigned, sorted by
  // badge level desc — feeds the PlayPanel "Assign" popover (a second path to the same
  // assignRole() call the depth-chart click-to-place flow already uses).
  const pickerCandidates = !assigning || !assigningRole ? undefined : allPlayers
    .filter(isAssignEligible)
    .sort((a, b) => {
      const levelOf = (p: PlayerCardData) => {
        if (!assigningRole.badge) return 0;
        const main = p.traits?.find(t => t.name === assigningRole.badge)?.level ?? 0;
        const alt = assigningRole.altBadge ? (p.traits?.find(t => t.name === assigningRole.altBadge)?.level ?? 0) : 0;
        return Math.max(main, alt);
      };
      return levelOf(b) - levelOf(a);
    });

  const playSlotDot = (slotIndex: number): 'ready' | 'warn' | 'empty' => {
    const play = activePlays[slotIndex];
    if (!play) return 'empty';
    const status = playStatusByCardId.get(play.id);
    if (!status) return 'empty';
    return status.roles.every(r => r.filled) ? 'ready' : 'warn';
  };

  return {
    starterIds,
    playbookAssignments,
    archetypeStatuses,
    validArchetypes,
    playbookStatus,
    playStatusByCardId,
    rolesByPlayer,
    checklist,
    assigningRole,
    isAssignEligible,
    isRoleEligible,
    pickerCandidates,
    playSlotDot,
  };
}
