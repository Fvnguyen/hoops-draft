import { describe, it, expect } from 'vitest';
import { generateCubePool } from '@/lib/draftEngine';
import { loadPlayers, PLAYS, runHeadlessDraft } from './helpers';

describe('draftEngine.generateCubePool', () => {
  const players = loadPlayers();

  it('yields 24 packs of 12 cards each', () => {
    const packs = generateCubePool(players, PLAYS);
    expect(packs.length).toBe(24);
    for (const pack of packs) {
      expect(pack.length).toBe(12);
    }
  });

  it('has exactly 264 player cards total, all unique by id, one play per pack', () => {
    const packs = generateCubePool(players, PLAYS);
    const playerIds = new Set<string>();
    let totalPlayerCards = 0;

    for (const pack of packs) {
      const playCards = pack.filter((c) => c.type === 'Play');
      const playerCards = pack.filter((c) => c.type === 'Player');
      expect(playCards.length).toBe(1);
      expect(playerCards.length).toBe(11);
      totalPlayerCards += playerCards.length;
      for (const pc of playerCards) playerIds.add(pc.id);
    }

    expect(totalPlayerCards).toBe(264);
    expect(playerIds.size).toBe(264);
  });

  it('each pack\'s play card resolves to one of the 9 known play-effect ids', () => {
    const packs = generateCubePool(players, PLAYS);
    const knownIds = new Set(PLAYS.map((p) => p.id));

    for (const pack of packs) {
      const play = pack.find((c) => c.type === 'Play')!;
      const resolvedId = (play as any).playId ?? play.id.replace(/_pack\d+$/, '');
      expect(knownIds.has(resolvedId)).toBe(true);
    }
  });
});

describe('headless draft (mirrors useDraftEngine.ts)', () => {
  const players = loadPlayers();

  it('every seat ends with 36 drafted cards', () => {
    const seats = runHeadlessDraft(players, PLAYS);
    expect(seats.length).toBe(8);
    for (const seat of seats) {
      expect(seat.drafted.length).toBe(36);
    }
  });

  it('buildBotRoster gives 12 active players across all 5 positions and up to 3 active plays', () => {
    const seats = runHeadlessDraft(players, PLAYS);
    const positions = ['PG', 'SG', 'SF', 'PF', 'C'];

    for (const seat of seats) {
      const roster = seat.builtRoster;
      let total = 0;
      for (const pos of positions) {
        expect(roster.depthChart[pos]).toBeDefined();
        expect(roster.depthChart[pos].length).toBeGreaterThanOrEqual(1);
        total += roster.depthChart[pos].length;
      }
      expect(total).toBe(12);
      expect(roster.activePlays.length).toBeLessThanOrEqual(3);
    }
  });
});
