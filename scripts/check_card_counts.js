#!/usr/bin/env node
/**
 * Card Count Validator
 *
 * Validates cube composition, player card uniqueness, and position coverage.
 *
 * Usage:
 *   node scripts/check_card_counts.js
 */

const fs = require('fs');
const path = require('path');

const cardsPath = path.resolve(__dirname, '..', 'data', 'computed_cards.json');
const cards = JSON.parse(fs.readFileSync(cardsPath, 'utf-8'));
const players = cards.filter(c => c.type === 'Player');
const plays = cards.filter(c => c.type === 'Play');
console.log(`Total cards: ${cards.length} (${players.length} players, ${plays.length} plays)`);
console.log(`Unique player IDs: ${new Set(players.map(p => p.id)).size}`);
console.log(`Unique play IDs: ${new Set(plays.map(p => p.id)).size}`);
console.log(`Need 264 player cards for cube (8 seats × 3 packs × 11 players)`);
console.log(`Have enough unique players: ${players.length >= 264}`);

// Check play ID uniqueness
const playIds = plays.map(p => p.id);
const dupePlayIds = playIds.filter((id, i) => playIds.indexOf(id) !== i);
if (dupePlayIds.length > 0) {
  console.log(`\nDUPLICATE play IDs in source data:`, [...new Set(dupePlayIds)]);
}

// Position coverage
const posCounts = {};
players.forEach(p => {
  const pos = p.player?.position || 'UNKNOWN';
  posCounts[pos] = (posCounts[pos] || 0) + 1;
});
console.log(`\nPosition distribution:`, posCounts);
