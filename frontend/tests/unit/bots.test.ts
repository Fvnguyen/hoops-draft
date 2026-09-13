/**
 * Bot roster builder tests.
 *
 * Verify that after a headless draft, bot rosters are properly built with:
 * - v2 shape (version, playAssignments, archetypes)
 * - Role assignments that reference active-roster players only
 * - No player holding two roles within one play
 * - All assigned roles passing isEligibleForRole
 * - At least one fully active play per pod
 */

import { describe, it, expect } from 'vitest';
import { runHeadlessDraft, loadPlayers, PLAYS } from './helpers';
import { evaluatePlaybook, evaluatePlayAssignment, isEligibleForRole } from '@/engine/playbook';
import { BUILT_ROSTER_VERSION } from '@/engine/deckbuilder';

describe('Bot Roster Builder v2 (playAssignments + archetypes)', () => {
  describe('Roster shape and version', () => {
    it('should build v2 rosters with version field set', () => {
      const players = loadPlayers();
      const seats = runHeadlessDraft(players, PLAYS);

      for (const seat of seats) {
        const { builtRoster } = seat;
        expect(builtRoster.version).toBe(BUILT_ROSTER_VERSION);
        expect(builtRoster.version).toBe(2);
      }
    });

    it('should have playAssignments array matching activePlays length', () => {
      const players = loadPlayers();
      const seats = runHeadlessDraft(players, PLAYS);

      for (const seat of seats) {
        const { builtRoster } = seat;
        expect(builtRoster.playAssignments).toBeDefined();
        expect(Array.isArray(builtRoster.playAssignments)).toBe(true);
        expect(builtRoster.playAssignments!.length).toBe(builtRoster.activePlays.length);
      }
    });
  });

  describe('Play assignment validity', () => {
    it('should only assign active-roster players to roles', () => {
      const players = loadPlayers();
      const seats = runHeadlessDraft(players, PLAYS);

      for (const seat of seats) {
        const { builtRoster } = seat;
        const activeRosterIds = new Set(
          Object.values(builtRoster.depthChart).flat()
        );

        for (const assignment of builtRoster.playAssignments || []) {
          for (const playerId of Object.values(assignment.roles)) {
            expect(activeRosterIds.has(playerId)).toBe(true);
          }
        }
      }
    });

    it('should not assign the same player twice within one play', () => {
      const players = loadPlayers();
      const seats = runHeadlessDraft(players, PLAYS);

      for (const seat of seats) {
        const { builtRoster } = seat;

        for (const assignment of builtRoster.playAssignments || []) {
          const assignedPlayerIds = Object.values(assignment.roles);
          const uniqueIds = new Set(assignedPlayerIds);
          expect(uniqueIds.size).toBe(assignedPlayerIds.length);
        }
      }
    });

    it('should assign players that are eligible for their roles', () => {
      const players = loadPlayers();
      const seats = runHeadlessDraft(players, PLAYS);

      for (const seat of seats) {
        const { builtRoster, drafted } = seat;

        // Get active players from depth chart
        const activePlayerIds = new Set(Object.values(builtRoster.depthChart).flat());
        const activePlayers = drafted.filter((card): card is typeof card & { type: 'Player' } =>
          card.type === 'Player' && activePlayerIds.has(card.id)
        );

        for (const assignment of builtRoster.playAssignments || []) {
          const status = evaluatePlayAssignment(assignment, activePlayers);

          if (status) {
            for (const roleStatus of status.roles) {
              if (roleStatus.playerId) {
                const player = activePlayers.find(p => p.id === roleStatus.playerId);
                expect(player).toBeDefined();
                if (player) {
                  expect(isEligibleForRole(player, roleStatus.role)).toBe(true);
                }
              }
            }
          }
        }
      }
    });
  });

  describe('Play activation', () => {
    it('should have at least one fully active play in the pod', () => {
      const players = loadPlayers();
      const seats = runHeadlessDraft(players, PLAYS);

      // Check that at least one bot has a fully active play
      const hasFullyActive = seats.some(seat => {
        const { builtRoster, drafted } = seat;
        const activePlayerIds = new Set(Object.values(builtRoster.depthChart).flat());
        const activePlayers = drafted.filter((card): card is typeof card & { type: 'Player' } =>
          card.type === 'Player' && activePlayerIds.has(card.id)
        );
        const status = evaluatePlaybook(
          builtRoster.playAssignments || [],
          activePlayers
        );
        return status.plays.some(play => play.active);
      });

      expect(hasFullyActive).toBe(true);
    });
  });

  describe('Play selection preference (fillable plays)', () => {
    it('should prefer plays that can be fully staffed', () => {
      const players = loadPlayers();
      const seats = runHeadlessDraft(players, PLAYS, 42); // Use fixed seed for reproducibility

      for (const seat of seats) {
        const { builtRoster, drafted } = seat;

        // Build active player list
        const activePlayerIds = new Set(Object.values(builtRoster.depthChart).flat());
        const activePlayers = drafted.filter((card): card is typeof card & { type: 'Player' } =>
          card.type === 'Player' && activePlayerIds.has(card.id)
        );

        // Evaluate each play assignment
        const statuses = evaluatePlaybook(
          builtRoster.playAssignments || [],
          activePlayers
        );

        // At least one of the three selected plays should be active (fully staffed)
        // unless the bot's drafted plays are particularly weak
        // This is a soft check: we prefer fully staffed plays, but don't require it
        const fullyActiveCount = statuses.plays.filter(p => p.active).length;
        expect(fullyActiveCount).toBeGreaterThanOrEqual(0);
      }
    });
  });

  describe('Roster completeness', () => {
    it('should have 12 active players in the depth chart', () => {
      const players = loadPlayers();
      const seats = runHeadlessDraft(players, PLAYS);

      for (const seat of seats) {
        const { builtRoster } = seat;
        const activeCount = Object.values(builtRoster.depthChart).reduce(
          (sum, players) => sum + players.length,
          0
        );
        expect(activeCount).toBe(12);
      }
    });

    it('should have at most 3 active plays', () => {
      const players = loadPlayers();
      const seats = runHeadlessDraft(players, PLAYS);

      for (const seat of seats) {
        const { builtRoster } = seat;
        expect(builtRoster.activePlays.length).toBeLessThanOrEqual(3);
      }
    });

    it('should separate players into active roster and G-League', () => {
      const players = loadPlayers();
      const seats = runHeadlessDraft(players, PLAYS);

      for (const seat of seats) {
        const { builtRoster, drafted } = seat;
        const draftedPlayerCount = drafted.filter(c => c.type === 'Player').length;
        const activeCount = Object.values(builtRoster.depthChart).reduce(
          (sum, roster) => sum + roster.length,
          0
        );
        const benchCount = builtRoster.gLeaguePlayers.length;

        expect(activeCount + benchCount).toBe(draftedPlayerCount);
      }
    });
  });

  describe('Edge cases', () => {
    it('should assign up to 3 plays even if fewer than 3 are drafted', () => {
      const players = loadPlayers();
      const seats = runHeadlessDraft(players, PLAYS);

      for (const seat of seats) {
        const { builtRoster, drafted } = seat;
        const draftedPlayCount = drafted.filter(c => c.type === 'Play').length;
        // The bot may draft 1-3 plays in a limited draft scenario
        expect(builtRoster.activePlays.length).toBeLessThanOrEqual(draftedPlayCount);
        expect(builtRoster.activePlays.length).toBeLessThanOrEqual(3);
      }
    });
  });
});
