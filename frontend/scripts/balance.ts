#!/usr/bin/env tsx
/**
 * Headless balance report.
 *
 * Usage: tsx scripts/balance.ts [games=500]
 *
 * Runs the same headless draft -> roster -> game pipeline as the vitest
 * suite (tests/unit/helpers.ts) and prints a compact tuning report: PPP,
 * score distribution, home-court/OT rates, possession counts, margins, and
 * synergy/play activation rates. Intended to replace the
 * play -> /debug -> export -> analyze loop for balance tuning.
 */

import { loadPlayers, PLAYS, simulateMany, activationRates } from '../tests/unit/helpers';

function mean(arr: number[]): number {
  return arr.length ? arr.reduce((a, b) => a + b, 0) / arr.length : 0;
}

function median(arr: number[]): number {
  if (!arr.length) return 0;
  const s = [...arr].sort((a, b) => a - b);
  const m = Math.floor(s.length / 2);
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
}

function sd(arr: number[]): number {
  if (!arr.length) return 0;
  const m = mean(arr);
  return Math.sqrt(mean(arr.map((x) => (x - m) ** 2)));
}

function pct(n: number, d: number): string {
  return d > 0 ? `${((100 * n) / d).toFixed(1)}%` : 'n/a';
}

function main(): void {
  const n = parseInt(process.argv[2] || '500', 10);
  const t0 = Date.now();

  const players = loadPlayers();

  console.log(`\n=== League Rating Means (${players.length} cards) ===`);
  const ratingKeys = [
    'finishing', 'midRange', 'perimeter', 'playmaking',
    'rebounding', 'perimeterDefense', 'postDefense',
  ] as const;
  for (const key of ratingKeys) {
    const m = mean(players.map((p) => (p.ratings as any)[key] ?? 0));
    console.log(`  ${key.padEnd(18)} ${m.toFixed(2)}`);
  }

  console.log(`\nRunning ${n} headless games...`);
  const games = simulateMany(n, players, PLAYS);
  const dt = Date.now() - t0;

  const allTeamScores: number[] = [];
  const margins: number[] = [];
  let homeWins = 0;
  let otGames = 0;
  let totalPoss = 0;
  let totalPoints = 0;
  let homePoss = 0, awayPoss = 0, homePts = 0, awayPts = 0;
  let inRange9030 = 0;

  for (const g of games) {
    allTeamScores.push(g.finalScore[0], g.finalScore[1]);
    margins.push(Math.abs(g.finalScore[0] - g.finalScore[1]));
    if (g.finalScore[0] > g.finalScore[1]) homeWins++;
    if (g.isOvertime) otGames++;

    totalPoss += g.possessions.length;
    totalPoints += g.finalScore[0] + g.finalScore[1];

    homePts += g.finalScore[0];
    awayPts += g.finalScore[1];
    homePoss += g.possessions.filter((p) => p.team === 'home').length;
    awayPoss += g.possessions.filter((p) => p.team === 'away').length;

    for (const s of g.finalScore) {
      if (s >= 90 && s <= 130) inRange9030++;
    }
  }

  const overallPPP = totalPoints / totalPoss;

  console.log(`\n=== Balance Report (${games.length} games, ${dt}ms) ===`);
  console.log(`Overall PPP:        ${overallPPP.toFixed(3)}`);
  console.log(`Home-side PPP:      ${(homePts / homePoss).toFixed(3)}`);
  console.log(`Away-side PPP:      ${(awayPts / awayPoss).toFixed(3)}`);
  console.log(`Team score mean:    ${mean(allTeamScores).toFixed(1)}`);
  console.log(`Team score median:  ${median(allTeamScores).toFixed(1)}`);
  console.log(`Team score sd:      ${sd(allTeamScores).toFixed(1)}`);
  console.log(`% scores in [90,130]: ${pct(inRange9030, allTeamScores.length)}`);
  console.log(`Home win %:         ${pct(homeWins, games.length)}`);
  console.log(`OT %:               ${pct(otGames, games.length)}`);
  console.log(`Mean total poss/game: ${(totalPoss / games.length).toFixed(1)}`);
  console.log(`Margin mean:        ${mean(margins).toFixed(1)}`);
  console.log(`Margin median:      ${median(margins).toFixed(1)}`);

  const { synergyCounts, playCounts, teamSamples } = activationRates(games);

  console.log('\n=== Synergy Activation Rates (sorted desc) ===');
  const sortedSyn = Object.entries(synergyCounts).sort((a, b) => b[1] - a[1]);
  for (const [name, count] of sortedSyn) {
    console.log(`  ${name.padEnd(24)} ${pct(count, teamSamples)}`);
  }

  console.log('\n=== Play Activation Rates ===');
  for (const [name, counts] of Object.entries(playCounts)) {
    const total = counts.full + counts.partial + counts.none;
    console.log(
      `  ${name.padEnd(24)} full ${pct(counts.full, total)}  ` +
      `partial ${pct(counts.partial, total)}  none ${pct(counts.none, total)}`
    );
  }

  console.log('\nMost common synergies:');
  for (const [name, count] of sortedSyn.slice(0, 3)) {
    console.log(`  ${name}: ${pct(count, teamSamples)}`);
  }
  console.log('Least common synergies:');
  for (const [name, count] of sortedSyn.slice(-3).reverse()) {
    console.log(`  ${name}: ${pct(count, teamSamples)}`);
  }

  console.log('');
}

main();
