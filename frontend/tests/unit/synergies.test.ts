/**
 * synergies.ts v3 (docs/plan_plays_and_synergies_2026-09-13.md): `calcTeamBonuses` no
 * longer derives bonuses from badge-total synergy checks or from `activePlays` — Plays
 * are resolved per-possession in game.ts against the assigned-player playbook
 * (playbook.ts), and roster-wide bonuses now come only from the caller-selected
 * archetype(s) (archetypes.ts) passed via `options.archetypes`. Chemistry synergies
 * (Brotherhood, Veteran Core, Young Guns) are removed entirely.
 *
 * `evaluatePlay`/`getPlayRequirements`/`getPlayEffectId` are unchanged — they still
 * describe a play card's badge requirements for the play-card UI (PlayerCard.tsx,
 * DraftRoom.tsx) independently of calcTeamBonuses.
 */
import { describe, it, expect } from 'vitest';
import type { PlayerCardData } from '@/components/PlayerCard';
import { calcTeamBonuses, evaluatePlay, getPlayRequirements, SYNERGIES } from '@/engine/synergies';
import { MONO_THRESHOLDS } from '@/engine/archetypes';
import { loadPlayers, PLAYS } from './helpers';

/** The top `n` real carriers of `badgeName`, highest level first (best chance of also
 *  clearing the points threshold at a fixed carrier count — see archetypes.test.ts). */
function topCarriers(players: PlayerCardData[], badgeName: string, n: number): PlayerCardData[] {
  return players
    .filter((p) => (p.traits || []).some((t) => t.name === badgeName))
    .sort((a, b) => {
      const la = a.traits.find((t) => t.name === badgeName)!.level;
      const lb = b.traits.find((t) => t.name === badgeName)!.level;
      return lb - la;
    })
    .slice(0, n);
}

describe('calcTeamBonuses (transition state — no archetype selected)', () => {
  const players = loadPlayers();

  it('returns empty modifiers and no active synergies when options is omitted (existing callers)', () => {
    const roster = players.slice(0, 12);
    const bonuses = calcTeamBonuses(roster, [], new Map());
    expect(bonuses.offenseMods.rimShareBonus).toBe(0);
    expect(bonuses.offenseMods.midShareBonus).toBe(0);
    expect(bonuses.offenseMods.perShareBonus).toBe(0);
    expect(bonuses.defenseMods.rimEffBonus).toBe(0);
    expect(bonuses.possessionSwing).toBe(0);
    expect(bonuses.activeSynergies).toEqual([]);
    expect(bonuses.activePlays).toEqual([]);
  });

  it('ignores activePlays entirely — a play that used to drive bonuses no longer does', () => {
    const roster = players.slice(0, 12);
    const sevenSecondsOrLess = PLAYS.find((p) => p.id === 'play-sys-2')!;
    const withPlay = calcTeamBonuses(roster, [sevenSecondsOrLess], new Map());
    const withoutPlay = calcTeamBonuses(roster, [], new Map());
    expect(withPlay).toEqual(withoutPlay);
    // And activePlays is always empty from this function now — game.ts fills its own copy.
    expect(withPlay.activePlays).toEqual([]);
  });

  it('still returns empty modifiers when an empty archetype selection is passed explicitly', () => {
    const roster = players.slice(0, 12);
    const bonuses = calcTeamBonuses(roster, [], new Map(), { starterIds: new Set(), archetypes: {} });
    expect(bonuses.activeSynergies).toEqual([]);
    expect(bonuses.offenseMods.perShareBonus).toBe(0);
  });
});

describe('calcTeamBonuses (archetype selected)', () => {
  const players = loadPlayers();

  it('Shooting Gallery Online (Sharpshooter) lowers own mid share and raises 3pt share via offenseMods', () => {
    const roster = topCarriers(players, 'Sharpshooter', MONO_THRESHOLDS.online.carriers);
    expect(roster.length).toBe(MONO_THRESHOLDS.online.carriers);
    const points = roster.reduce((s, p) => s + p.traits.find((t) => t.name === 'Sharpshooter')!.level, 0);
    expect(points).toBeGreaterThanOrEqual(MONO_THRESHOLDS.online.points);
    const starterIds = new Set(roster.slice(0, MONO_THRESHOLDS.online.starters).map((p) => p.id));

    const bonuses = calcTeamBonuses(roster, [], new Map(), {
      starterIds,
      archetypes: { offense: 'shooting-gallery' },
    });

    expect(bonuses.offenseMods.midShareBonus).toBeLessThan(0);
    expect(bonuses.offenseMods.perShareBonus).toBeGreaterThan(0);
    expect(bonuses.activeSynergies.map((s) => s.name)).toEqual(['Shooting Gallery']);
    // Plays never populate calcTeamBonuses's own list, regardless of selection.
    expect(bonuses.activePlays).toEqual([]);
  });

  it('an archetype that fails to reach Online contributes nothing', () => {
    // A single Sharpshooter carrier can never reach Online (needs 5 carriers/10 pts/2 starters).
    const roster = topCarriers(players, 'Sharpshooter', 1);
    const bonuses = calcTeamBonuses(roster, [], new Map(), {
      starterIds: new Set(),
      archetypes: { offense: 'shooting-gallery' },
    });
    expect(bonuses.activeSynergies).toEqual([]);
    expect(bonuses.offenseMods.perShareBonus).toBe(0);
  });

  it('a defense-side archetype applies to defenseMods, not offenseMods', () => {
    const roster = topCarriers(players, 'Lockdown Defender', MONO_THRESHOLDS.online.carriers);
    const points = roster.reduce((s, p) => s + p.traits.find((t) => t.name === 'Lockdown Defender')!.level, 0);
    expect(points).toBeGreaterThanOrEqual(MONO_THRESHOLDS.online.points);
    const starterIds = new Set(roster.slice(0, MONO_THRESHOLDS.online.starters).map((p) => p.id));

    const bonuses = calcTeamBonuses(roster, [], new Map(), {
      starterIds,
      archetypes: { defense: 'no-fly-zone' },
    });

    expect(bonuses.defenseMods.perEffBonus).toBeLessThan(0); // opponent 3pt efficiency hurt
    expect(bonuses.offenseMods.perShareBonus).toBe(0);
  });
});

describe('SYNERGIES (display view over ARCHETYPES; chemistry removed)', () => {
  it('exposes id/name/category/description for the KPI popover, with no chemistry entries', () => {
    expect(SYNERGIES.length).toBeGreaterThan(0);
    for (const s of SYNERGIES) {
      expect(typeof s.id).toBe('string');
      expect(typeof s.name).toBe('string');
      expect(['mono', 'two', 'gold']).toContain(s.category);
      expect(typeof s.description).toBe('string');
    }
    expect(SYNERGIES.map((s) => s.name)).not.toContain('Brotherhood');
    expect(SYNERGIES.map((s) => s.name)).not.toContain('Veteran Core');
    expect(SYNERGIES.map((s) => s.name)).not.toContain('Young Guns');
  });
});

describe('evaluatePlay (unchanged — badge-requirement UI helper, independent of calcTeamBonuses)', () => {
  it('reports per-requirement have/met counts and the activation tier', () => {
    const highPnR = PLAYS.find((p) => p.id === 'play-std-1')!;
    const none = evaluatePlay(highPnR, {});
    expect(none.activation).toBe('none');
    expect(none.requirements.map((r) => [r.badge, r.levels, r.have, r.met])).toEqual([
      ['Floor General', 1, 0, false],
      ['Finisher', 1, 0, false],
    ]);
    const partial = evaluatePlay(highPnR, { 'Floor General': 2 });
    expect(partial.activation).toBe('partial');
    expect(partial.metCount).toBe(1);
    const full = evaluatePlay(highPnR, { 'Floor General': 2, Finisher: 1 });
    expect(full.activation).toBe('full');
    expect(full.summary.length).toBeGreaterThan(0);
  });

  it('resolves the effect through playId or the _packN suffix', () => {
    const base = PLAYS.find((p) => p.id === 'play-sys-2')!;
    const suffixed = { ...base, id: `${base.id}_pack7`, playId: undefined };
    expect(evaluatePlay(suffixed, {}).effectId).toBe('play-sys-2');
    expect(getPlayRequirements('play-sys-2').length).toBe(2);
  });

  it('every play card in the DB has an effect whose name matches the card', () => {
    for (const play of PLAYS) {
      const ev = evaluatePlay(play, {});
      expect(ev.name, play.id).toBe(play.name);
      expect(ev.total, play.id).toBeGreaterThan(0);
    }
  });

  it('defensive plays are flagged', () => {
    for (const id of ['play-sys-3', 'play-std-2', 'play-std-4']) {
      const play = PLAYS.find((p) => p.id === id)!;
      expect(evaluatePlay(play, {}).defensive, id).toBe(true);
    }
  });
});
