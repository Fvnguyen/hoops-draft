/**
 * Team Builder Helper (plan render_and_engine_perf D6 — split out of game.ts).
 */

import type { PlayerCardData, Play } from './types';
import { DraftSessionSeat, normalizeBuiltRoster } from './deckbuilder';
import type { TeamInfo } from './gameTypes';
import { OFF_POSITION_PENALTY } from './balance';
import { naturalPositions, effectivePosition, type DepthColumn } from './positions';

// ── Team Builder Helper ────────────────────────────────────────────────────

export function buildTeamInfo(
  seat: DraftSessionSeat,
  isHuman: boolean,
  /** Human team label (account display name); defaults to 'You' for callers/tests
   *  that don't have an identity to pass — the engine stays pure either way. */
  humanName: string = 'You'
): TeamInfo {
  const roster = seat.builtRoster;
  const allCards = seat.drafted;
  const playerMap = new Map<string, PlayerCardData>();
  const playMap = new Map<string, Play>();

  for (const card of allCards) {
    if (card.type === 'Player') playerMap.set(card.id, card as PlayerCardData);
    else if (card.type === 'Play') playMap.set(card.id, card as Play);
  }

  // Positionless (`effectivePosition` -> 'ALL') fits every column with no penalty; every
  // other player only fits their real natural columns (`positions.ts`, single source of
  // truth — same check the deck builder's drag/drop uses for `allowAdjacent: false`).
  const isNaturalPosition = (player: PlayerCardData, col: string): boolean =>
    naturalPositions(effectivePosition(player.player.position, player.traits)).includes(col as DepthColumn);

  // Off-position penalty (adjacent placement, human choice or `buildBotRoster`'s last-
  // resort coverage fallback) — flat derate on every rating dimension.
  const applyOOPPenalty = (player: PlayerCardData): PlayerCardData => ({
    ...player,
    ratings: {
      overall: Math.round(player.ratings.overall * OFF_POSITION_PENALTY),
      finishing: Math.round(player.ratings.finishing * OFF_POSITION_PENALTY),
      midRange: Math.round(player.ratings.midRange * OFF_POSITION_PENALTY),
      perimeter: Math.round(player.ratings.perimeter * OFF_POSITION_PENALTY),
      playmaking: Math.round(player.ratings.playmaking * OFF_POSITION_PENALTY),
      rebounding: Math.round(player.ratings.rebounding * OFF_POSITION_PENALTY),
      perimeterDefense: Math.round(player.ratings.perimeterDefense * OFF_POSITION_PENALTY),
      postDefense: Math.round(player.ratings.postDefense * OFF_POSITION_PENALTY),
    },
  });

  // Collect active roster players, applying OOP penalty where needed
  const activePlayers: PlayerCardData[] = [];
  const starters: string[] = [];

  for (const [pos, ids] of Object.entries(roster.depthChart)) {
    for (const id of ids) {
      const player = playerMap.get(id);
      if (player && !activePlayers.find(p => p.id === id)) {
        if (!isNaturalPosition(player, pos)) {
          activePlayers.push(applyOOPPenalty(player));
        } else {
          activePlayers.push(player);
        }
      }
    }
    if (ids.length > 0) starters.push(ids[0]);
  }

  // Collect active plays
  const activePlays: Play[] = [];
  for (const id of roster.activePlays) {
    const play = playMap.get(id);
    if (play) activePlays.push(play);
  }

  // v2 roster shape: assigned-player play roles + chosen archetypes. Normalise here so
  // pre-v2 saved rosters (no playAssignments/archetypes yet) still produce a valid,
  // all-inactive playbook instead of throwing.
  const normalized = normalizeBuiltRoster(roster, allCards);

  return {
    seatId: seat.id,
    name: isHuman ? humanName : (seat.botProfile?.name || seat.id),
    players: activePlayers,
    starters,
    plays: activePlays,
    depthChart: roster.depthChart,
    playAssignments: normalized.playAssignments,
    archetypes: normalized.archetypes,
  };
}
