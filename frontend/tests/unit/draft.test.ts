import { describe, it, expect } from 'vitest';
import { generateCubePool, getBotPick, createBotProfiles, type DraftSeat } from '@/engine/draft';
import { buildBotRoster, type DraftSessionSeat } from '@/engine/deckbuilder';
import { createRng } from '@/engine/rng';
import { simulateGame, buildTeamInfo } from '@/engine/game';
import { OFF_POSITION_PENALTY } from '@/engine/balance';
import type { Play, PlayerCardData, Trait } from '@/engine/types';
import { loadPlayers, PLAYS, runHeadlessDraft, buildTeams } from './helpers';

function makePlayer(id: string, pos: string, overall: number, traits: Trait[] = []): PlayerCardData {
  return {
    type: 'Player', id,
    player: { id, name: id, position: pos, height: '6-6', weight: 210, age: 26, team: 'TST' },
    stats: {
      gp: 70, mpg: 0, pts: 15, trb: 5, ast: 3, stl: 1, blk: 0.5, fga: 12, fg3a: 3, fta: 3,
      pct_fga_0_3: 0.3, pct_fga_3_10: 0.2, pct_fga_10_16: 0.15, pct_fga_16_3p: 0.1, pct_fga_3p: 0.25,
      fg_pct_0_3: 0.6, fg_pct_3_10: 0.4, fg_pct_10_16: 0.4, fg_pct_16_3p: 0.4, fg_pct_3p: 0.36,
      fg_pct: 0.46, fg3_pct: 0.36, fg2_pct: 0.5, ft_pct: 0.78, per: 15, ts: 0.55, vorp: 1, dbpm: 0, tov: 2,
    },
    awards: [],
    ratings: { overall, finishing: overall, midRange: overall, perimeter: overall, playmaking: overall, rebounding: overall, perimeterDefense: overall, postDefense: overall },
    traits,
    rarity: 'Common',
  };
}

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

describe('buildBotRoster never leaves a depth-chart column empty', () => {
  const players = loadPlayers();
  const positions = ['PG', 'SG', 'SF', 'PF', 'C'];

  it('covers all 5 columns across 100 seeded headless drafts (800 seats)', () => {
    for (let seed = 0; seed < 100; seed++) {
      const seats = runHeadlessDraft(players, PLAYS, seed);
      for (const seat of seats) {
        for (const pos of positions) {
          expect((seat.builtRoster.depthChart[pos] ?? []).length, `seed ${seed} seat ${seat.id} ${pos}`).toBeGreaterThanOrEqual(1);
        }
      }
    }
  });

  it('falls back to an adjacent-eligible player when a bot drafted zero naturally-eligible players for a column', () => {
    // Every drafted card is a guard (PG or SG) — no natural SF/PF/C at all.
    const drafted = Array.from({ length: 14 }, (_, i) => makePlayer(`g${i}`, i % 2 === 0 ? 'PG' : 'SG', 70 - i));
    const roster = buildBotRoster(drafted);
    for (const pos of positions) {
      expect((roster.depthChart[pos] ?? []).length, pos).toBeGreaterThanOrEqual(1);
    }
    // The forward/center columns can only be adjacent-filled guards, not empty or duplicated.
    expect(roster.depthChart.SF.length).toBeGreaterThanOrEqual(1);
    expect(roster.depthChart.C.length).toBeGreaterThanOrEqual(1);
  });
});

describe('getBotPick forces a positional pick in pack 3 when a column is still uncovered', () => {
  it('takes the pack\'s only Centre over a higher-value Guard once the roster has zero natural Centres', () => {
    const rng = createRng(1);
    const [profile] = createBotProfiles(rng, 1);
    const guardOnlyRoster = Array.from({ length: 16 }, (_, i) => makePlayer(`g${i}`, 'PG', 70));
    const center = makePlayer('center-1', 'C', 60); // lower overall than the guards in the pack
    const guard = makePlayer('guard-hot', 'PG', 95); // clearly the best card in the pack by value
    const seat: DraftSeat = {
      id: 'bot-1', isBot: true, botProfile: profile,
      drafted: guardOnlyRoster,
      currentPack: [center, guard],
    };
    // Pack 3 starts after 2 full packs of 8 picks (CUBE_PLAYER_CARDS_PER_PACK + 1).
    const pick = getBotPick(seat, 17);
    expect(pick).toBe(center.id);
  });

  it('picks normally by score before pack 3, even with an uncovered column', () => {
    const rng = createRng(1);
    const [profile] = createBotProfiles(rng, 1);
    const guardOnlyRoster = Array.from({ length: 5 }, (_, i) => makePlayer(`g${i}`, 'PG', 70));
    const center = makePlayer('center-1', 'C', 60);
    const guard = makePlayer('guard-hot', 'PG', 95);
    const seat: DraftSeat = {
      id: 'bot-1', isBot: true, botProfile: profile,
      drafted: guardOnlyRoster,
      currentPack: [center, guard],
    };
    const pick = getBotPick(seat, 8); // pack 1, no forced-pick override yet
    expect(pick).toBe(guard.id);
  });
});

describe('buildTeamInfo off-position penalty (D4/D5 fallback support)', () => {
  const seatWithPlayerAt = (player: PlayerCardData, col: string): DraftSessionSeat => ({
    id: 'bot-1', isBot: true, drafted: [player],
    builtRoster: {
      depthChart: { PG: [], SG: [], SF: [], PF: [], C: [], [col]: [player.id] },
      activePlays: [], rosterPlayers: [], rosterPlays: [],
    },
  });

  it('derates every rating dimension for a player slotted off their natural position', () => {
    const center = makePlayer('c1', 'C', 80);
    const team = buildTeamInfo(seatWithPlayerAt(center, 'PG'), false);
    const placed = team.players.find(p => p.id === 'c1')!;
    expect(placed.ratings.overall).toBe(Math.round(80 * OFF_POSITION_PENALTY));
  });

  it('does not derate a natural-position placement', () => {
    const point = makePlayer('p1', 'PG', 80);
    const team = buildTeamInfo(seatWithPlayerAt(point, 'PG'), false);
    const placed = team.players.find(p => p.id === 'p1')!;
    expect(placed.ratings.overall).toBe(80);
  });

  it('exempts a Positionless badge holder from the off-position penalty', () => {
    const flex = makePlayer('f1', 'C', 80, [{ name: 'Positionless', level: 1 }]);
    const team = buildTeamInfo(seatWithPlayerAt(flex, 'PG'), false);
    const placed = team.players.find(p => p.id === 'f1')!;
    expect(placed.ratings.overall).toBe(80);
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
