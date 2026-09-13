import { describe, it, expect } from 'vitest';
import { generateCubePool } from '@/engine/draft';
import { createRng } from '@/engine/rng';
import { simulateGame } from '@/engine/game';
import type { Play } from '@/engine/types';
import { loadPlayers, PLAYS, runHeadlessDraft, buildTeams } from './helpers';

describe('draftEngine.generateCubePool', () => {
  const players = loadPlayers();

  it('yields 24 packs of 8 cards each', () => {
    const packs = generateCubePool(players, PLAYS, createRng(1));
    expect(packs.length).toBe(24);
    for (const pack of packs) {
      expect(pack.length).toBe(8);
    }
  });

  it('has exactly 168 player cards total, all unique by id, one play per pack', () => {
    const packs = generateCubePool(players, PLAYS, createRng(1));
    const playerIds = new Set<string>();
    let totalPlayerCards = 0;

    for (const pack of packs) {
      const playCards = pack.filter((c) => c.type === 'Play');
      const playerCards = pack.filter((c) => c.type === 'Player');
      expect(playCards.length).toBe(1);
      expect(playerCards.length).toBe(7);
      totalPlayerCards += playerCards.length;
      for (const pc of playerCards) playerIds.add(pc.id);
    }

    expect(totalPlayerCards).toBe(168);
    expect(playerIds.size).toBe(168);
  });

  it('each pack\'s play card resolves to one of the 9 known play-effect ids', () => {
    const packs = generateCubePool(players, PLAYS, createRng(1));
    const knownIds = new Set(PLAYS.map((p) => p.id));

    for (const pack of packs) {
      const play = pack.find((c): c is Play => c.type === 'Play')!;
      const resolvedId = play.playId ?? play.id.replace(/_pack\d+$/, '');
      expect(knownIds.has(resolvedId)).toBe(true);
    }
  });
});

describe('headless draft (mirrors useDraftEngine.ts)', () => {
  const players = loadPlayers();

  it('every seat ends with 24 drafted cards', () => {
    const seats = runHeadlessDraft(players, PLAYS);
    expect(seats.length).toBe(8);
    for (const seat of seats) {
      expect(seat.drafted.length).toBe(24);
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

describe('seeded determinism (draft + game)', () => {
  const players = loadPlayers();

  it('same seed produces an identical draft (drafted card ids per seat) and an identical game', () => {
    const seed = 424242;

    const seatsA = runHeadlessDraft(players, PLAYS, seed);
    const seatsB = runHeadlessDraft(players, PLAYS, seed);
    expect(seatsA.map((s) => s.drafted.map((c) => c.id))).toEqual(seatsB.map((s) => s.drafted.map((c) => c.id)));

    const teamsA = buildTeams(seatsA);
    const teamsB = buildTeams(seatsB);
    const gameA = simulateGame(teamsA[0], teamsA[1], { rng: createRng(seed) });
    const gameB = simulateGame(teamsB[0], teamsB[1], { rng: createRng(seed) });

    expect(gameA.finalScore).toEqual(gameB.finalScore);
    expect(gameA.possessions.length).toBe(gameB.possessions.length);
  });
});
