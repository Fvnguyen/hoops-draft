/**
 * `rosterChanged` and the `buildNbaTeams` memo (plan_render_and_engine_perf D3, T6).
 *
 * Split out of `challenge.test.ts` because this file is about the GHOST GUARD, not the
 * challenge engine itself: the front-office editor (`FrontOffice.tsx`) writes a brand-new
 * `SavedRoster` object on every save even when nothing changed, so the page used to
 * compare `rosterPost !== rosterPre` by REFERENCE and ghost-simulate 41 wasted games on
 * every break. `rosterChanged` (`engine/challenge.ts`) replaces that with a structural
 * comparison of only the fields that can actually change a simulated game.
 */

import { describe, it, expect } from 'vitest';
import { rosterChanged, buildNbaTeams, buildChallengeSchedule, simulateHalf } from '@/engine/challenge';
import { buildTeamInfo } from '@/engine/game';
import { PLAY_CATALOG } from '@/engine/plays';
import { seatFromRoster } from '@/components/challenge/rosterSeat';
import { loadPlayers, runHeadlessDraft } from './helpers';
import type { SavedRoster } from '@/storage/types';

// ── A small, hand-built fixture ─────────────────────────────────────────────
//
// `rosterChanged` is a pure structural comparison — it never validates against the
// `PLAYBOOK` catalog or checks that a play's roles are actually eligible, so a synthetic
// (not draft-legal) roster exercises it exactly as well as a real one, deterministically
// and without depending on what a headless draft happens to produce for a given seed.

function baseRoster(): SavedRoster {
  return {
    id: 'roster-1',
    name: 'Test Roster',
    timestamp: '2026-01-01T00:00:00.000Z',
    draftedCards: [],
    depthChartOrder: {
      PG: ['p-pg-1', 'p-pg-2'],
      SG: ['p-sg-1'],
      SF: ['p-sf-1'],
      PF: ['p-pf-1'],
      C: ['p-c-1'],
    },
    activePlays: ['play-a', 'play-b', 'play-c'],
    playAssignments: [
      { cardId: 'play-a', playId: 'play-std-1', roles: { handler: 'p-pg-1', roller: 'p-c-1' } },
      { cardId: 'play-b', playId: 'basic-defense', roles: { featured: 'p-sg-1' } },
      { cardId: 'play-c', playId: 'play-std-3', roles: { elbow: 'p-pf-1', cutter: 'p-sf-1' } },
    ],
    archetypes: { offense: 'iso-kings', defense: 'lockdown-d' },
    version: 2,
    sessionId: null,
  };
}

describe('rosterChanged — unchanged (D3/T6)', () => {
  const roster = baseRoster();

  it('is false against a structuredClone', () => {
    expect(rosterChanged(roster, structuredClone(roster))).toBe(false);
  });

  it('is false against a JSON round-trip', () => {
    expect(rosterChanged(roster, JSON.parse(JSON.stringify(roster)))).toBe(false);
  });

  it('is false against a copy with a different name/timestamp/id', () => {
    const post: SavedRoster = {
      ...structuredClone(roster),
      id: 'roster-2',
      name: 'Renamed Roster',
      timestamp: new Date().toISOString(),
    };
    expect(rosterChanged(roster, post)).toBe(false);
  });

  it('is false when a playAssignment\'s roles are the same pairs in a different key order', () => {
    const post = structuredClone(roster);
    const target = post.playAssignments!.find((a) => Object.keys(a.roles).length >= 2)!;
    expect(target, 'fixture needs a multi-role assignment').toBeTruthy();
    target.roles = Object.fromEntries(Object.entries(target.roles).reverse());
    expect(rosterChanged(roster, post)).toBe(false);
  });
});

describe('rosterChanged — changed (D3/T6)', () => {
  const roster = baseRoster();

  it('is true when a depth-chart column reorders (starter swapped with a backup)', () => {
    const post = structuredClone(roster);
    post.depthChartOrder.PG = ['p-pg-2', 'p-pg-1'];
    expect(rosterChanged(roster, post)).toBe(true);
  });

  it('is true when a player moves depth-chart column', () => {
    const post = structuredClone(roster);
    post.depthChartOrder.PG = [...post.depthChartOrder.PG, 'p-sg-1'];
    post.depthChartOrder.SG = [];
    expect(rosterChanged(roster, post)).toBe(true);
  });

  it('is true when an active play changes', () => {
    const post = structuredClone(roster);
    post.activePlays = ['play-x', 'play-b', 'play-c'];
    expect(rosterChanged(roster, post)).toBe(true);
  });

  it('is true when the active plays change slot order', () => {
    const post = structuredClone(roster);
    post.activePlays = ['play-b', 'play-a', 'play-c'];
    expect(rosterChanged(roster, post)).toBe(true);
  });

  it('is true when a role is reassigned to a different player', () => {
    const post = structuredClone(roster);
    post.playAssignments![0].roles.handler = 'p-sg-1';
    expect(rosterChanged(roster, post)).toBe(true);
  });

  it('is true when the archetype selection changes', () => {
    const post = structuredClone(roster);
    post.archetypes = { ...post.archetypes, offense: 'run-and-gun' };
    expect(rosterChanged(roster, post)).toBe(true);
  });

  it('is true when a trade swaps an active-roster card', () => {
    const post = structuredClone(roster);
    post.depthChartOrder.C = ['traded-in-card'];
    expect(rosterChanged(roster, post)).toBe(true);
  });
});

describe('rosterChanged — the core property (D3/T6)', () => {
  // Real cards, a real bot-built roster (via tests/unit/helpers.ts), real opponents: the
  // property that makes skipping the ghost safe is that an UNCHANGED roster, by
  // `rosterChanged`'s own verdict, plays out identically — not just "looks similar".
  const players = loadPlayers();
  const seat = runHeadlessDraft(players, PLAY_CATALOG, 20260921)[0];
  const pre: SavedRoster = {
    id: 'real-roster',
    name: 'Real Roster',
    timestamp: '2026-09-21T00:00:00.000Z',
    draftedCards: seat.drafted,
    depthChartOrder: seat.builtRoster.depthChart,
    activePlays: seat.builtRoster.activePlays,
    playAssignments: seat.builtRoster.playAssignments,
    archetypes: seat.builtRoster.archetypes,
    version: seat.builtRoster.version,
    sessionId: null,
  };
  // Same roster, but a fresh object graph and different metadata — exactly what
  // `FrontOffice.tsx`'s editor save produces for an unedited roster, and what a second
  // IndexedDB clone of the same record looks like after a reload.
  const post: SavedRoster = {
    ...structuredClone(pre),
    id: 'real-roster-clone',
    name: 'Real Roster (reloaded)',
    timestamp: new Date().toISOString(),
  };

  it('rosterChanged agrees these are unchanged', () => {
    expect(rosterChanged(pre, post)).toBe(false);
  });

  it('simulateHalf produces identical results (W/L string and scores) for both', () => {
    const opponents = buildNbaTeams(players, PLAY_CATALOG);
    const schedule = buildChallengeSchedule(4242);
    const teamPre = buildTeamInfo(seatFromRoster(pre), true, 'Pre');
    const teamPost = buildTeamInfo(seatFromRoster(post), true, 'Post');

    const halfPre = simulateHalf(teamPre, opponents, schedule, 2, 4242);
    const halfPost = simulateHalf(teamPost, opponents, schedule, 2, 4242);

    expect(halfPost.results).toBe(halfPre.results);
    expect(halfPost.games.map((g) => g.score)).toEqual(halfPre.games.map((g) => g.score));
    expect(halfPost.wins).toBe(halfPre.wins);
  });
});

describe('buildNbaTeams memo (D3/T6)', () => {
  const players = loadPlayers();

  it('returns the SAME Map instance for the same cards array reference', () => {
    const a = buildNbaTeams(players, PLAY_CATALOG);
    const b = buildNbaTeams(players, PLAY_CATALOG);
    expect(b).toBe(a);
  });

  it('returns a DIFFERENT Map instance for a different (even structurally-equal) array', () => {
    const a = buildNbaTeams(players, PLAY_CATALOG);
    const otherArray = [...players];
    const c = buildNbaTeams(otherArray, PLAY_CATALOG);
    expect(c).not.toBe(a);
    // ... but the contents are still correct — a cache miss is a correctness fallback,
    // not a broken build.
    expect(c.size).toBe(a.size);
  });
});
