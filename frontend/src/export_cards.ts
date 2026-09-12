import { getAllCards } from './lib/engine';
import fs from 'fs';

const cards = getAllCards();

// Save the full array to a temporary JSON file for analysis
fs.writeFileSync('../data/computed_cards.json', JSON.stringify(cards, null, 2));
console.log(`Exported ${cards.length} cards to computed_cards.json`);
