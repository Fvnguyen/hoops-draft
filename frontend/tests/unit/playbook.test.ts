/**
 * Assigned-player playbook: evaluation (evaluatePlayAssignment/evaluatePlaybook) and
 * in-game call resolution (simulateGame's per-possession call/coverage rolls, lineup
 * override, scorer boost, and on-call modifiers — see game.ts §7).
 */
import { describe, it, expect } from 'vitest';
import type { PlayerCardData } from '@/components/PlayerCard';
import {
  PLAYBOOK, evaluatePlayAssignment, evaluatePlaybook, scaledPlayAllocations,
  type PlayAssignment,
} from '@/engine/playbook';
import { simulateGame, type TeamInfo } from '@/engine/game';
import { createRng } from '@/engine/rng';
import { PLAY_BUDGET_OFFENSE } from '@/engine/balance';
import { loadPlayers } from './helpers';

// ── Fixture helpers ──────────────────────────────────────────────────────────

/** First player (not already in `exclude`) carrying `badge` at >= `minLevel`. */
function pickWithBadge(players: PlayerCardData[], badge: string, minLevel: number, exclude: Set<string>): PlayerCardData {
  const found = players.find(p => !exclude.has(p.id) && (p.traits || []).some(t => t.name === badge && t.level >= minLevel));
  if (!found) throw new Error(`fixture setup: no player found with ${badge} ${minLevel}+`);
  exclude.add(found.id);
  return found;
}

/** Any player not already in `exclude` (no badge requirement). */
function pickAny(players: PlayerCardData[], exclude: Set<string>): PlayerCardData {
  const found = players.find(p => !exclude.has(p.id));
  if (!found) throw new Error('fixture setup: ran out of players');
  exclude.add(found.id);
  return found;
}

const HIGH_PNR = PLAYBOOK['play-std-1']; // Handler: Floor General 1+, Roller: Finisher 1+

/**
 * Build a minimal, fully manual 7-player TeamInfo: 5 starters (one per position) plus a
 * backup in PG and SF (so the assigned High Pick & Roll handler/roller are genuine BENCH
 * players, not starters) — or, for the defense fixture, 5 starters plus 2 defensive
 * specialists on the bench. `playAssignments` and `archetypes` are set directly so the
 * test never has to go through the draft/deckbuilder pipeline.
 */
function buildManualTeam(opts: {
  seatId: string;
  starters: PlayerCardData[]; // exactly 5, one per PG/SG/SF/PF/C
  bench?: { pos: 'PG' | 'SG' | 'SF' | 'PF' | 'C'; player: PlayerCardData }[];
  playAssignments?: PlayAssignment[];
}): TeamInfo {
  const positions = ['PG', 'SG', 'SF', 'PF', 'C'] as const;
  const depthChart: Record<string, string[]> = {};
  positions.forEach((pos, i) => { depthChart[pos] = [opts.starters[i].id]; });
  for (const b of opts.bench ?? []) depthChart[b.pos].push(b.player.id);

  const players = [...opts.starters, ...(opts.bench ?? []).map(b => b.player)];

  return {
    seatId: opts.seatId,
    name: opts.seatId,
    players,
    starters: opts.starters.map(p => p.id),
    plays: [],
    depthChart,
    playAssignments: opts.playAssignments ?? [],
    archetypes: {},
  };
}

// ── (a) evaluatePlayAssignment / evaluatePlaybook ────────────────────────────

describe('evaluatePlayAssignment / evaluatePlaybook', () => {
  const players = loadPlayers();

  it('is active when every role is filled by a distinct, eligible active-roster player', () => {
    const used = new Set<string>();
    const handler = pickWithBadge(players, 'Floor General', 1, used);
    const roller = pickWithBadge(players, 'Finisher', 1, used);
    const assignment: PlayAssignment = { cardId: 'c1', playId: 'play-std-1', roles: { handler: handler.id, roller: roller.id } };

    const status = evaluatePlayAssignment(assignment, [handler, roller]);
    expect(status?.active).toBe(true);
    expect(status?.allocation).toBe(HIGH_PNR.allocation);
    expect(status?.playerIds.sort()).toEqual([handler.id, roller.id].sort());
  });

  it('is inactive when a role player lacks the required badge', () => {
    const used = new Set<string>();
    const handler = pickWithBadge(players, 'Floor General', 1, used);
    const nonFinisher = pickAny(players.filter(p => !(p.traits || []).some(t => t.name === 'Finisher')), used);
    const assignment: PlayAssignment = { cardId: 'c1', playId: 'play-std-1', roles: { handler: handler.id, roller: nonFinisher.id } };

    const status = evaluatePlayAssignment(assignment, [handler, nonFinisher]);
    expect(status?.active).toBe(false);
    expect(status?.allocation).toBe(0);
    const rollerRole = status?.roles.find(r => r.role.id === 'roller');
    expect(rollerRole?.filled).toBe(false);
  });

  it('is inactive when a role is unassigned', () => {
    const used = new Set<string>();
    const handler = pickWithBadge(players, 'Floor General', 1, used);
    const assignment: PlayAssignment = { cardId: 'c1', playId: 'play-std-1', roles: { handler: handler.id } };
    const status = evaluatePlayAssignment(assignment, [handler]);
    expect(status?.active).toBe(false);
  });

  it('enforces the distinct-role rule: the same player cannot fill two roles in one play', () => {
    const used = new Set<string>();
    // A player who happens to carry BOTH Floor General 1+ and Finisher 1+.
    const dual = players.find(p => {
      const traits = p.traits || [];
      return traits.some(t => t.name === 'Floor General' && t.level >= 1) && traits.some(t => t.name === 'Finisher' && t.level >= 1);
    });
    expect(dual, 'fixture needs a dual-badge player').toBeTruthy();
    used.add(dual!.id);
    const assignment: PlayAssignment = { cardId: 'c1', playId: 'play-std-1', roles: { handler: dual!.id, roller: dual!.id } };
    const status = evaluatePlayAssignment(assignment, [dual!]);
    expect(status?.active).toBe(false);
    const rollerRole = status?.roles.find(r => r.role.id === 'roller');
    expect(rollerRole?.reason).toMatch(/already holds another role/i);
  });

  it('is inactive when the assigned player is not in the active roster', () => {
    const used = new Set<string>();
    const handler = pickWithBadge(players, 'Floor General', 1, used);
    const roller = pickWithBadge(players, 'Finisher', 1, used);
    // roller is a valid card but simply not passed in `activePlayers`.
    const assignment: PlayAssignment = { cardId: 'c1', playId: 'play-std-1', roles: { handler: handler.id, roller: roller.id } };
    const status = evaluatePlayAssignment(assignment, [handler]);
    expect(status?.active).toBe(false);
    const rollerRole = status?.roles.find(r => r.role.id === 'roller');
    expect(rollerRole?.reason).toMatch(/not in active roster/i);
  });

  it('scales a side\'s allocations down proportionally when active plays exceed its budget, never exceeding the budget', () => {
    const used = new Set<string>();
    // Four offensive plays, all made active, whose raw allocations sum well above
    // PLAY_BUDGET_OFFENSE (0.40, T4 2026-09-14): 0.13 + 0.15 + 0.15 + 0.18 = 0.61.
    const handler = pickWithBadge(players, 'Floor General', 1, used);
    const roller = pickWithBadge(players, 'Finisher', 1, used);
    const organizer = pickWithBadge(players, 'Floor General', 2, used);
    const connector = pickWithBadge(players, 'Floor General', 1, used);
    const spacer = pickWithBadge(players, 'Sharpshooter', 1, used);
    const shooter1 = pickWithBadge(players, 'Sharpshooter', 1, used);
    const shooter2 = pickWithBadge(players, 'Sharpshooter', 1, used);
    const anchor = pickWithBadge(players, 'Glass Cleaner', 1, used);
    const initiator = pickWithBadge(players, 'Floor General', 1, used);
    const elbow = pickWithBadge(players, 'Mid-Range Maestro', 2, used);
    const interior = pickWithBadge(players, 'Finisher', 1, used);

    const roster = [handler, roller, organizer, connector, spacer, shooter1, shooter2, anchor, initiator, elbow, interior];

    const assignments: PlayAssignment[] = [
      { cardId: 'p1', playId: 'play-std-1', roles: { handler: handler.id, roller: roller.id } }, // 0.09
      { cardId: 'p2', playId: 'play-sys-4', roles: { organizer: organizer.id, connector: connector.id, spacer: spacer.id } }, // 0.10
      { cardId: 'p3', playId: 'play-std-5', roles: { shooter1: shooter1.id, shooter2: shooter2.id, anchor: anchor.id } }, // 0.10
      { cardId: 'p4', playId: 'play-sys-1', roles: { initiator: initiator.id, elbow: elbow.id, interior: interior.id } }, // 0.12
    ];

    const status = evaluatePlaybook(assignments, roster);
    expect(status.plays.every(p => p.active)).toBe(true);
    expect(status.offenseAllocation).toBeCloseTo(0.61, 5);
    expect(status.overBudget).toBe(true);

    const scaled = scaledPlayAllocations(status, 'offense');
    expect(scaled.length).toBe(4);
    const scaledTotal = scaled.reduce((s, p) => s + p.allocation, 0);
    expect(scaledTotal).toBeCloseTo(PLAY_BUDGET_OFFENSE, 5);
    expect(scaledTotal).toBeLessThanOrEqual(PLAY_BUDGET_OFFENSE + 1e-9);
    // Every play's share of the scaled total still matches its share of the raw total
    // (proportional scaling, not an arbitrary cutoff).
    for (const sp of scaled) {
      expect(sp.allocation / scaledTotal).toBeCloseTo(sp.status.allocation / status.offenseAllocation, 5);
    }
  });

  it('does not scale when a side is within its budget', () => {
    const used = new Set<string>();
    const handler = pickWithBadge(players, 'Floor General', 1, used);
    const roller = pickWithBadge(players, 'Finisher', 1, used);
    const assignments: PlayAssignment[] = [
      { cardId: 'p1', playId: 'play-std-1', roles: { handler: handler.id, roller: roller.id } },
    ];
    const status = evaluatePlaybook(assignments, [handler, roller]);
    expect(status.overBudget).toBe(false);
    const scaled = scaledPlayAllocations(status, 'offense');
    expect(scaled[0].allocation).toBeCloseTo(HIGH_PNR.allocation, 10);
  });
});

// ── (b)/(c)/(d) High Pick & Roll in-game behaviour ──────────────────────────

describe('High Pick & Roll in-game call resolution', () => {
  const players = loadPlayers();
  const used = new Set<string>();

  const starterPG = pickAny(players, used);
  const starterSG = pickAny(players, used);
  const starterSF = pickAny(players, used);
  const starterPF = pickAny(players, used);
  const starterC = pickAny(players, used);
  const handler = pickWithBadge(players, 'Floor General', 1, used); // bench PG
  const roller = pickWithBadge(players, 'Finisher', 1, used); // bench SF

  const opponentUsed = new Set<string>();
  const awayStarters = [0, 1, 2, 3, 4].map(() => pickAny(players, opponentUsed));

  const hpnrAssignment: PlayAssignment = {
    cardId: 'hpnr-1', playId: 'play-std-1', roles: { handler: handler.id, roller: roller.id },
  };

  const homeWithPlay = buildManualTeam({
    seatId: 'home-with-play',
    starters: [starterPG, starterSG, starterSF, starterPF, starterC],
    bench: [{ pos: 'PG', player: handler }, { pos: 'SF', player: roller }],
    playAssignments: [hpnrAssignment],
  });
  const homeWithoutPlay = buildManualTeam({
    seatId: 'home-without-play',
    starters: [starterPG, starterSG, starterSF, starterPF, starterC],
    bench: [{ pos: 'PG', player: handler }, { pos: 'SF', player: roller }],
    playAssignments: [],
  });
  // Same assignment, but only one role filled -> inactive. Used for the "no-op" test.
  const homeInactivePlay = buildManualTeam({
    seatId: 'home-inactive-play',
    starters: [starterPG, starterSG, starterSF, starterPF, starterC],
    bench: [{ pos: 'PG', player: handler }, { pos: 'SF', player: roller }],
    playAssignments: [{ cardId: 'hpnr-1', playId: 'play-std-1', roles: { handler: handler.id } }],
  });
  const awayTeam = buildManualTeam({
    seatId: 'away-fixed',
    starters: awayStarters as [PlayerCardData, PlayerCardData, PlayerCardData, PlayerCardData, PlayerCardData],
  });

  const N = 300;

  it('(b) the assigned bench players appear on court substantially more with the play active than without it', () => {
    let onCourtWith = 0, onCourtWithout = 0, totalOffPossWith = 0;

    for (let i = 0; i < N; i++) {
      const seed = 1_000_000 + i;
      const gWith = simulateGame(homeWithPlay, awayTeam, { rng: createRng(seed) });
      const gWithout = simulateGame(homeWithoutPlay, awayTeam, { rng: createRng(seed) });

      const homePossWith = gWith.possessions.filter(p => p.team === 'home');
      const homePossWithout = gWithout.possessions.filter(p => p.team === 'home');
      totalOffPossWith += homePossWith.length;

      for (const p of homePossWith) {
        if (p.lineupOnCourt.includes(handler.id)) onCourtWith++;
        if (p.lineupOnCourt.includes(roller.id)) onCourtWith++;
      }
      for (const p of homePossWithout) {
        if (p.lineupOnCourt.includes(handler.id)) onCourtWithout++;
        if (p.lineupOnCourt.includes(roller.id)) onCourtWithout++;
      }
    }

    const diff = onCourtWith - onCourtWithout;
    // Expected floor: each called possession forces BOTH assigned players on, so the
    // combined appearance count should rise by roughly 2x the play's allocation share
    // of home's offensive possessions. Use a lenient (0.5x) lower bound to stay robust
    // to baseline-rotation overlap while still being a meaningful statistical check.
    const expectedFloor = 2 * HIGH_PNR.allocation * totalOffPossWith * 0.5;
    expect(diff).toBeGreaterThan(expectedFloor);
  });

  it('(c) every possession tagged with the play has both assigned players on court', () => {
    let taggedCount = 0;
    for (let i = 0; i < N; i++) {
      const g = simulateGame(homeWithPlay, awayTeam, { rng: createRng(2_000_000 + i) });
      for (const p of g.possessions) {
        const tag = p.calledPlays?.find(cp => cp.playId === 'play-std-1' && cp.side === 'offense');
        if (!tag) continue;
        taggedCount++;
        expect(p.lineupOnCourt).toContain(handler.id);
        expect(p.lineupOnCourt).toContain(roller.id);
        expect(tag.teamSide).toBe('home');
      }
    }
    expect(taggedCount).toBeGreaterThan(0);
  });

  it('(d) an inactive play (missing role) changes nothing versus not having the assignment at all', () => {
    const seed = 3_141_592;
    const gInactive = simulateGame(homeInactivePlay, awayTeam, { rng: createRng(seed) });
    const gAbsent = simulateGame(homeWithoutPlay, awayTeam, { rng: createRng(seed) });

    expect(gInactive.finalScore).toEqual(gAbsent.finalScore);
    expect(gInactive.possessions.length).toBe(gAbsent.possessions.length);
    expect(gInactive.boxScore).toEqual(gAbsent.boxScore);
    // No possession should ever be tagged, since the play never activates.
    expect(gInactive.possessions.every(p => !p.calledPlays || p.calledPlays.length === 0)).toBe(true);
  });
});

// ── (e) Box-and-One defensive coverage ──────────────────────────────────────

describe('Box-and-One in-game coverage', () => {
  const players = loadPlayers();
  const used = new Set<string>();

  const starterPG = pickAny(players, used);
  const starterSG = pickAny(players, used);
  const starterSF = pickAny(players, used);
  const starterPF = pickAny(players, used);
  const starterC = pickAny(players, used);
  const chaser = pickWithBadge(players, 'Lockdown Defender', 2, used);
  const helper = pickWithBadge(players, 'Lockdown Defender', 1, used);

  const offenseUsed = new Set<string>();
  const offenseStarters = [0, 1, 2, 3, 4].map(() => pickAny(players, offenseUsed));

  const defenseTeam = buildManualTeam({
    seatId: 'defense-with-play',
    starters: [starterPG, starterSG, starterSF, starterPF, starterC],
    bench: [{ pos: 'SG', player: chaser }, { pos: 'PF', player: helper }],
    playAssignments: [{ cardId: 'boo-1', playId: 'play-std-2', roles: { chaser: chaser.id, helper: helper.id } }],
  });
  const offenseTeam = buildManualTeam({
    seatId: 'offense-fixed',
    starters: offenseStarters as [PlayerCardData, PlayerCardData, PlayerCardData, PlayerCardData, PlayerCardData],
  });

  it('lowers the opponent\'s measured 3pt make rate on covered possessions vs uncovered possessions', () => {
    const N = 300;
    let coveredMakes = 0, coveredTotal = 0, uncoveredMakes = 0, uncoveredTotal = 0;

    for (let i = 0; i < N; i++) {
      const g = simulateGame(offenseTeam, defenseTeam, { rng: createRng(4_000_000 + i) });
      const offensePoss = g.possessions.filter(p => p.team === 'home'); // offenseTeam is home
      for (const p of offensePoss) {
        const covered = p.calledPlays?.some(cp => cp.playId === 'play-std-2' && cp.side === 'defense');
        if (covered) {
          coveredTotal++;
          if (p.outcome === '3pt') coveredMakes++;
        } else {
          uncoveredTotal++;
          if (p.outcome === '3pt') uncoveredMakes++;
        }
      }
    }

    expect(coveredTotal).toBeGreaterThan(0);
    const coveredRate = coveredMakes / coveredTotal;
    const uncoveredRate = uncoveredMakes / uncoveredTotal;
    expect(coveredRate).toBeLessThan(uncoveredRate);
  });
});
