/**
 * These tests target the INTENDED post-fix behaviour of the synergy/play
 * system (see docs/ROADMAP.md section 2, bugs P0-1 and P0-3). Another agent
 * is fixing synergies.ts / gameEngine.ts in parallel — until that lands,
 * (ii) and (iv) below are expected to fail. Do NOT weaken these assertions
 * and do NOT edit the engine from here.
 */
import { describe, it, expect } from 'vitest';
import type { PlayerCardData } from '@/components/PlayerCard';
import { calcTeamBonuses, evaluatePlay, getPlayRequirements } from '@/engine/synergies';
import { simulateGame } from '@/engine/game';
import { loadPlayers, PLAYS, buildTestTeam } from './helpers';

/** Pick real players until the summed badge level for `badgeName` reaches `minTotal`. */
function pickForBadgeTotal(players: PlayerCardData[], badgeName: string, minTotal: number): PlayerCardData[] {
  const candidates = players
    .filter((p) => (p.traits || []).some((t) => t.name === badgeName))
    .sort((a, b) => {
      const la = a.traits.find((t) => t.name === badgeName)!.level;
      const lb = b.traits.find((t) => t.name === badgeName)!.level;
      return lb - la;
    });

  const picked: PlayerCardData[] = [];
  let total = 0;
  for (const c of candidates) {
    picked.push(c);
    total += c.traits.find((t) => t.name === badgeName)!.level;
    if (total >= minTotal) break;
  }
  return picked;
}

function dedupe(players: PlayerCardData[]): PlayerCardData[] {
  const seen = new Set<string>();
  const out: PlayerCardData[] = [];
  for (const p of players) {
    if (!seen.has(p.id)) {
      seen.add(p.id);
      out.push(p);
    }
  }
  return out;
}

describe('synergies & plays (post-fix intent)', () => {
  const players = loadPlayers();

  it('(i) High Pick & Roll activates fully for a roster meeting its badge requirements', () => {
    const floorGenerals = pickForBadgeTotal(players, 'Floor General', 1);
    const finishers = pickForBadgeTotal(players, 'Finisher', 1);
    expect(floorGenerals.length).toBeGreaterThan(0);
    expect(finishers.length).toBeGreaterThan(0);

    const roster = dedupe([...floorGenerals, ...finishers]);
    const highPnR = PLAYS.find((p) => p.id === 'play-std-1')!;

    const bonuses = calcTeamBonuses(roster, [highPnR], new Map());
    expect(bonuses.activePlays.length).toBe(1);
    expect(bonuses.activePlays[0].activated).toBe('full');
  });

  it('(ii) Zone Defense (play-std-3): defenseMods.perEffBonus is negative, and it statistically lowers the opponent\'s measured 3pt make rate', () => {
    const defenders = pickForBadgeTotal(players, 'Lockdown Defender', 1);
    expect(defenders.length).toBeGreaterThan(0);
    const defenseRosterPlayers = dedupe(defenders).slice(0, 12);

    const zoneDefense = PLAYS.find((p) => p.id === 'play-std-2')!;

    // Sanity: the play's own stored effect is a negative efficiency delta.
    const bonusesWithPlay = calcTeamBonuses(defenseRosterPlayers, [zoneDefense], new Map());
    expect(bonusesWithPlay.activePlays[0].activated).toBe('full');
    expect(bonusesWithPlay.defenseMods.perEffBonus).toBeLessThan(0);

    // Statistical check: with the play active, the opponent should make
    // fewer 3s per possession than the identical matchup without it.
    const offenseRosterPlayers = players.slice(200, 212);
    const offenseTeam = buildTestTeam(offenseRosterPlayers, [], 'offense-team');
    const defenseTeamWithPlay = buildTestTeam(defenseRosterPlayers, [zoneDefense], 'defense-with-play');
    const defenseTeamNoPlay = buildTestTeam(defenseRosterPlayers, [], 'defense-no-play');

    const N = 300;
    let makesWith = 0, possWith = 0;
    let makesWithout = 0, possWithout = 0;

    for (let i = 0; i < N; i++) {
      const gWith = simulateGame(offenseTeam, defenseTeamWithPlay);
      const homeWith = gWith.possessions.filter((p) => p.team === 'home');
      possWith += homeWith.length;
      makesWith += homeWith.filter((p) => p.outcome === '3pt').length;

      const gWithout = simulateGame(offenseTeam, defenseTeamNoPlay);
      const homeWithout = gWithout.possessions.filter((p) => p.team === 'home');
      possWithout += homeWithout.length;
      makesWithout += homeWithout.filter((p) => p.outcome === '3pt').length;
    }

    const rateWith = makesWith / possWith;
    const rateWithout = makesWithout / possWithout;

    expect(rateWith).toBeLessThan(rateWithout);
  });

  it('(iii) Lockdown Squad and Rim Protection produce negative rim efficiency deltas in defenseMods', () => {
    const lockdownDefenders = pickForBadgeTotal(players, 'Lockdown Defender', 4);
    const paintProtectors = pickForBadgeTotal(players, 'Paint Protector', 2);
    const glassCleaners = pickForBadgeTotal(players, 'Glass Cleaner', 2);

    expect(lockdownDefenders.length).toBeGreaterThan(0);
    expect(paintProtectors.length).toBeGreaterThan(0);
    expect(glassCleaners.length).toBeGreaterThan(0);

    const roster = dedupe([...lockdownDefenders, ...paintProtectors, ...glassCleaners]);
    const bonuses = calcTeamBonuses(roster, [], new Map());

    const synergyNames = bonuses.activeSynergies.map((s) => s.name);
    expect(synergyNames).toContain('Lockdown Squad');
    expect(synergyNames).toContain('Rim Protection');
    expect(bonuses.defenseMods.rimEffBonus).toBeLessThan(0);
  });

  it('(iv) 7 Seconds or Less at full activation increases the team\'s top-level possessionSwing by exactly 1', () => {
    const sharpshooters = pickForBadgeTotal(players, 'Sharpshooter', 3);
    const floorGenerals = pickForBadgeTotal(players, 'Floor General', 1);
    expect(sharpshooters.length).toBeGreaterThan(0);
    expect(floorGenerals.length).toBeGreaterThan(0);

    const roster = dedupe([...sharpshooters, ...floorGenerals]);
    const sevenSecondsOrLess = PLAYS.find((p) => p.id === 'play-sys-2')!;

    const withoutPlay = calcTeamBonuses(roster, [], new Map());
    const withPlay = calcTeamBonuses(roster, [sevenSecondsOrLess], new Map());

    expect(withPlay.activePlays[0].activated).toBe('full');
    expect(withPlay.possessionSwing - withoutPlay.possessionSwing).toBe(1);
  });
});

describe('evaluatePlay (wave 0 helper)', () => {
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

  it('defensive plays are flagged and land in defenseMods', () => {
    for (const id of ['play-sys-3', 'play-std-2', 'play-std-4']) {
      const play = PLAYS.find((p) => p.id === id)!;
      expect(evaluatePlay(play, {}).defensive, id).toBe(true);
    }
    const press = PLAYS.find((p) => p.id === 'play-std-4')!;
    const defenders = pickForBadgeTotal(loadPlayers(), 'Lockdown Defender', 1);
    const bonuses = calcTeamBonuses(dedupe(defenders).slice(0, 12), [press], new Map());
    expect(bonuses.activePlays[0].activated).toBe('full');
    expect(bonuses.defenseMods.rimEffBonus).toBeLessThan(0);
    expect(bonuses.possessionSwing).toBe(2);
  });
});
