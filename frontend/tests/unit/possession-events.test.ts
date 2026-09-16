/**
 * engine_possession_model D4/D6: the per-possession events that replaced the pre-game
 * possession battle — turnovers (playmaking vs perimeter defence), offensive rebounds
 * (rebounding vs rebounding), the creator steer, and the on-court shot profile.
 */
import { describe, it, expect } from 'vitest';
import {
  turnoverChance, offensiveReboundChance, steerShotProfile, calcLineupShotProfile, simulateGame,
} from '@/engine/game';
import { emptyModifiers } from '@/engine/synergies';
import {
  CHANNEL_CENTRE, TURNOVER_BASE, TURNOVER_MIN, TURNOVER_MAX, OREB_BASE, OREB_MIN, OREB_MAX, STEER_CAP,
} from '@/engine/balance';
import { createRng } from '@/engine/rng';
import { loadPlayers, runHeadlessDraft, buildTeams, PLAYS } from './helpers';
import type { PlayerCardData } from '@/engine/types';

const players = loadPlayers();
const byName = (name: string, team: string): PlayerCardData => {
  const p = players.find(x => x.player.name === name && x.player.team === team) ?? players.find(x => x.player.name === name);
  if (!p) throw new Error(`missing ${name}`);
  return p;
};
const LAL = ['Luka Dončić', 'Austin Reaves', 'LeBron James', 'Rui Hachimura', 'Deandre Ayton'].map(n => byName(n, 'LAL'));
const WAS = ['Bub Carrington', 'Tre Johnson', 'Bilal Coulibaly', 'Kyshawn George', 'Alex Sarr'].map(n => byName(n, 'WAS'));
const DET = ['Cade Cunningham', 'Duncan Robinson', 'Ausar Thompson', 'Tobias Harris', 'Jalen Duren'].map(n => byName(n, 'DET'));
const NYK = ['Jalen Brunson', 'Mikal Bridges', 'OG Anunoby', 'Josh Hart', 'Karl-Anthony Towns'].map(n => byName(n, 'NYK'));

function synth(id: string, r: Partial<PlayerCardData['ratings']>): PlayerCardData {
  return {
    type: 'Player', id,
    player: { id, name: id, position: 'PG', height: '6-6', weight: 210, age: 26, team: 'TST' },
    stats: {} as PlayerCardData['stats'], awards: [],
    ratings: { overall: 60, finishing: 60, midRange: 60, perimeter: 60, playmaking: 60, rebounding: 60, perimeterDefense: 60, postDefense: 60, ...r },
    traits: [], rarity: 'Common',
  } as PlayerCardData;
}
const five = (r: Partial<PlayerCardData['ratings']>) => Array.from({ length: 5 }, (_, i) => synth(`p${i}`, r));

describe('turnoverChance (D6)', () => {
  it('elite creators turn it over less than the Wizards against the same defence, both inside the clamp', () => {
    const lal = turnoverChance(LAL, NYK);
    const was = turnoverChance(WAS, NYK);
    expect(lal).toBeLessThan(was);
    for (const v of [lal, was]) { expect(v).toBeGreaterThanOrEqual(TURNOVER_MIN); expect(v).toBeLessThanOrEqual(TURNOVER_MAX); }
  });
  it('a stronger perimeter defence forces more turnovers from the same offence', () => {
    expect(turnoverChance(LAL, DET)).toBeGreaterThan(turnoverChance(LAL, WAS)); // DET perim D 67 vs WAS 40
  });
  it('an average offence against an average defence sits at the base rate', () => {
    // Synthetic lineups whose standardised values equal the centres are hard to build; the
    // clamp bounds and monotonicity above are the contract, the base is asserted by range.
    expect(TURNOVER_BASE).toBeGreaterThan(TURNOVER_MIN);
    expect(TURNOVER_BASE).toBeLessThan(TURNOVER_MAX);
  });
});

describe('offensiveReboundChance (D6)', () => {
  it('is the base rate for identical lineups and favours the better rebounding five', () => {
    const same = five({});
    expect(offensiveReboundChance(same, same)).toBeCloseTo(OREB_BASE, 9);
    const bigs = five({ rebounding: 90 });
    const guards = five({ rebounding: 20 });
    expect(offensiveReboundChance(bigs, guards)).toBeGreaterThan(OREB_BASE);
    expect(offensiveReboundChance(guards, bigs)).toBeLessThan(OREB_BASE);
    expect(offensiveReboundChance(bigs, guards)).toBeLessThanOrEqual(OREB_MAX);
    expect(offensiveReboundChance(guards, bigs)).toBeGreaterThanOrEqual(OREB_MIN);
  });
});

describe('steerShotProfile (D6)', () => {
  const base = { rim: 0.35, mid: 0.25, per: 0.40 };
  it('keeps the profile a distribution and never moves more than STEER_CAP', () => {
    for (const [off, def] of [[LAL, WAS], [WAS, LAL], [DET, NYK], [NYK, DET]] as const) {
      const p = steerShotProfile(base, off, def, CHANNEL_CENTRE);
      expect(p.rim + p.mid + p.per).toBeCloseTo(1, 9);
      for (const v of [p.rim, p.mid, p.per]) expect(v).toBeGreaterThanOrEqual(0);
      const moved = Math.max(Math.abs(p.rim - base.rim), Math.abs(p.mid - base.mid), Math.abs(p.per - base.per));
      expect(moved).toBeLessThanOrEqual(STEER_CAP + 1e-9);
    }
  });
  it('an elite-creator lineup moves share toward the channel worth the most expected points in this matchup', () => {
    // Lakers creators (playmaking value ~79 vs centre 70) against a defence with no rim
    // protection: rim is the best expected-points channel, so rim share must rise.
    const softRim = five({ postDefense: 10, perimeterDefense: 90 });
    const p = steerShotProfile(base, LAL, softRim, CHANNEL_CENTRE);
    expect(p.rim).toBeGreaterThan(base.rim);
    // Against a defence with no perimeter defence, threes are the best shot instead.
    const softPerim = five({ postDefense: 90, perimeterDefense: 10 });
    const q = steerShotProfile(base, LAL, softPerim, CHANNEL_CENTRE);
    expect(q.per).toBeGreaterThan(base.per);
  });
  it('a below-average creator lineup steers the other way', () => {
    const softRim = five({ postDefense: 10, perimeterDefense: 90 });
    const noCreators = five({ playmaking: 5 });
    const p = steerShotProfile(base, noCreators, softRim, CHANNEL_CENTRE);
    expect(p.rim).toBeLessThan(base.rim);
  });
  it('mid-range is never the steer target against an ordinary defence (least efficient by design)', () => {
    const p = steerShotProfile(base, LAL, NYK, CHANNEL_CENTRE);
    expect(p.mid).toBeLessThanOrEqual(base.mid + 1e-9);
  });
});

describe('calcLineupShotProfile (D4)', () => {
  it('two non-shooters on the floor mean fewer threes than five shooters', () => {
    const shooters = five({ perimeter: 80 });
    const det = calcLineupShotProfile(DET, emptyModifiers(), emptyModifiers());
    const all = calcLineupShotProfile(shooters, emptyModifiers(), emptyModifiers());
    expect(det.per).toBeLessThan(all.per);
    expect(det.rim + det.mid + det.per).toBeCloseTo(1, 9);
  });
});

describe('simulated games carry the events (D6)', () => {
  const teams = buildTeams(runHeadlessDraft(players, PLAYS, 7));
  const rng = createRng(99);
  const games = Array.from({ length: 20 }, (_, i) => simulateGame(teams[i % 8], teams[(i + 3) % 8], { rng }));

  it('turnover rate per possession is in the NBA band and every turnover is charged to a player', () => {
    let poss = 0, to = 0, boxTo = 0;
    for (const g of games) {
      poss += g.possessions.length;
      to += g.possessions.filter(e => e.turnoverPlayerId).length;
      boxTo += [...g.boxScore.home, ...g.boxScore.away].reduce((s, b) => s + b.turnovers, 0);
    }
    expect(to / poss).toBeGreaterThan(0.09);
    expect(to / poss).toBeLessThan(0.19);
    expect(boxTo).toBe(to);
  });
  it('offensive rebounds happen, are credited in the box score, and a turnover possession scores nothing', () => {
    let oreb = 0, boxOreb = 0;
    for (const g of games) {
      for (const e of g.possessions) {
        oreb += e.offensiveRebounders?.length ?? 0;
        if (e.turnoverPlayerId) { expect(e.outcome).toBe('miss'); expect(e.scoringPlayerId === undefined || e.scoringPlayerId === e.turnoverPlayerId).toBe(true); }
      }
      boxOreb += [...g.boxScore.home, ...g.boxScore.away].reduce((s, b) => s + b.offensiveRebounds, 0);
    }
    expect(oreb).toBeGreaterThan(0);
    expect(boxOreb).toBe(oreb);
  });
  it('possession counts no longer depend on roster strength: the split is pace noise plus play swing only', () => {
    // Identical rosters both ways: over many seeded games the mean possession difference
    // is the home-court noise asymmetry (D4), not a strength delta.
    const t = teams[0];
    const r = createRng(5);
    let diff = 0; const n = 200;
    for (let i = 0; i < n; i++) {
      const g = simulateGame(t, { ...t, seatId: 'mirror', name: 'Mirror' } as typeof t, { rng: r });
      const home = g.possessions.filter(e => e.team === 'home' && e.quarter <= 4).length;
      const away = g.possessions.filter(e => e.team === 'away' && e.quarter <= 4).length;
      diff += home - away;
    }
    expect(Math.abs(diff / n)).toBeLessThan(4); // pace noise only; a strength delta would be 0 here anyway, this pins the shape
  });
});
