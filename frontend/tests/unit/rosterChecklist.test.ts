/**
 * "Roster ready" checklist (plan ui_draft_deckbuild_pack, D15).
 *
 * Pure helper behind the deck builder's visible save-blocker list: 12 players,
 * a starter in every column, 3 active plays, no dangling role assignment, and
 * an OPTIONAL identity.
 */
import { describe, it, expect } from 'vitest';
import { evaluateRosterChecklist } from '@/lib/rosterChecklist';
import type { BuiltRoster } from '@/engine/deckbuilder';
import { PLAYBOOK } from '@/engine/playbook';

const ids = (prefix: string, n: number) => Array.from({ length: n }, (_, i) => `${prefix}${i}`);

/** A complete, valid roster: 12 players spread over all five columns, 3 plays. */
function validRoster(overrides: Partial<BuiltRoster> = {}): BuiltRoster {
  return {
    version: 2,
    depthChart: {
      PG: ids('pg', 3), SG: ids('sg', 3), SF: ids('sf', 2), PF: ids('pf', 2), C: ids('c', 2),
    },
    activePlays: ['play-a', 'play-b', 'play-c'],
    playAssignments: [],
    archetypes: {},
    gLeaguePlayers: [],
    gLeaguePlays: [],
    ...overrides,
  };
}

const item = (roster: BuiltRoster, id: string) =>
  evaluateRosterChecklist(roster, []).items.find(i => i.id === id)!;

describe('evaluateRosterChecklist', () => {
  it('reports a complete roster as ready (identity is optional)', () => {
    const result = evaluateRosterChecklist(validRoster(), []);
    expect(result.ready).toBe(true);
    expect(result.unmet).toEqual([]);
    expect(result.items.find(i => i.id === 'identity')!.met).toBe(false);
    expect(result.items.find(i => i.id === 'identity')!.optional).toBe(true);
  });

  it('counts how many players are missing', () => {
    const roster = validRoster({ depthChart: { PG: ids('pg', 2), SG: ids('sg', 2), SF: ids('sf', 2), PF: ids('pf', 2), C: ids('c', 2) } });
    const players = item(roster, 'players');
    expect(players.met).toBe(false);
    expect(players.detail).toBe('Need 2 more');
    expect(evaluateRosterChecklist(roster, []).ready).toBe(false);
  });

  it('counts how many players are over the limit', () => {
    const roster = validRoster({ depthChart: { PG: ids('pg', 4), SG: ids('sg', 4), SF: ids('sf', 2), PF: ids('pf', 2), C: ids('c', 2) } });
    expect(item(roster, 'players').detail).toBe('Drop 2');
  });

  it('names the columns with no starter', () => {
    const roster = validRoster({ depthChart: { PG: ids('pg', 5), SG: ids('sg', 5), SF: ids('sf', 2), PF: [], C: [] } });
    const starters = item(roster, 'starters');
    expect(starters.met).toBe(false);
    expect(starters.detail).toBe('No PF, C starter');
  });

  it('requires exactly three active plays', () => {
    expect(item(validRoster({ activePlays: ['a', 'b'] }), 'plays').detail).toBe('Need 1 more');
    expect(item(validRoster({ activePlays: ['a', 'b', 'c', 'd'] }), 'plays').detail).toBe('Drop 1');
    expect(item(validRoster(), 'plays').met).toBe(true);
  });

  it('accepts unassigned roles (the play is simply inactive)', () => {
    const playId = Object.keys(PLAYBOOK)[0];
    const roster = validRoster({
      playAssignments: [{ cardId: 'play-a', playId, roles: {} }],
    });
    expect(item(roster, 'roles').met).toBe(true);
  });

  it('rejects a role pointing at someone outside the active roster', () => {
    const playId = Object.keys(PLAYBOOK)[0];
    const roleId = PLAYBOOK[playId].roles[0].id;
    const roster = validRoster({
      playAssignments: [{ cardId: 'play-a', playId, roles: { [roleId]: 'not-on-the-roster' } }],
    });
    const roles = item(roster, 'roles');
    expect(roles.met).toBe(false);
    expect(roles.detail).toContain(PLAYBOOK[playId].name);
    expect(evaluateRosterChecklist(roster, []).ready).toBe(false);
  });

  it('marks a chosen identity as met, gold or side selection alike', () => {
    expect(item(validRoster({ archetypes: { gold: 'any' } }), 'identity').met).toBe(true);
    expect(item(validRoster({ archetypes: { offense: 'any' } }), 'identity').met).toBe(true);
  });

  it('lists unmet requirements in display order', () => {
    const roster = validRoster({ depthChart: { PG: [], SG: [], SF: [], PF: [], C: [] }, activePlays: [] });
    expect(evaluateRosterChecklist(roster, []).unmet.map(i => i.id)).toEqual(['players', 'starters', 'plays']);
  });
});
