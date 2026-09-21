/**
 * The play-card catalog (Systems = Rare/Mythic, Plays = Uncommon/Common).
 *
 * Pure data, no React — lives in the engine so every consumer reads ONE copy:
 * the draft room (`playsDB` re-export), `engine/challenge.ts` (NBA opponents get the
 * full catalog), `scripts/balance.ts` / `feasibility` and the unit tests. It used to be
 * a literal inside `components/DraftRoom.tsx` hand-copied into `tests/unit/fixtures/
 * plays.ts`, and that copy went stale twice (card_balance T3's badges, T4's four new
 * plays) with no error — just silently missing rows in the balance report.
 */
import type { Play } from './types';

// Plays database (Systems = Rare/Mythic, Plays = Uncommon/Common).
// `badges` field is read by engine/draft.ts's bot draft logic to score plays against
// a bot's drafted player traits — this exact array must reflect the badge requirements
// the plays actually enforce at runtime (playbook.ts). mechanicText describes the
// requirements in prose form for the UI (card details, roster builder progress).
export const PLAY_CATALOG: Play[] = [
  { type: 'Play', id: 'play-sys-1', name: 'Triangle Offense', rarity: 'Mythic', playCategory: 'system', badges: ['Finisher', 'Mid-Range Maestro'], mechanicText: 'Requires 2 Finishers and 2 Mid-Range Maestros. Boosts rim and mid-range shot volume and efficiency across the half-court offense.' },
  { type: 'Play', id: 'play-sys-2', name: '7 Seconds or Less', rarity: 'Mythic', playCategory: 'system', badges: ['Floor General', 'Sharpshooter'], mechanicText: 'Requires a Floor General and 3 Sharpshooters. Grants legendary transition scoring boost.' },
  { type: 'Play', id: 'play-sys-3', name: 'Grit and Grind', rarity: 'Rare', playCategory: 'system', badges: ['Lockdown Defender', 'Glass Cleaner'], mechanicText: 'Requires 2 Lockdown Defenders and 1 Glass Cleaner. Chokes off opponent rim and mid-range efficiency.' },
  { type: 'Play', id: 'play-sys-4', name: 'Motion Offense', rarity: 'Rare', playCategory: 'system', badges: ['Floor General'], mechanicText: 'Requires 2 Floor Generals. Boosts efficiency across every shot channel and speeds up the pace.' },
  { type: 'Play', id: 'play-std-1', name: 'High Pick & Roll', rarity: 'Uncommon', playCategory: 'special', badges: ['Floor General', 'Finisher'], mechanicText: 'Requires a Floor General and a Finisher. Boosts rim scoring off the pick-and-roll.' },
  { type: 'Play', id: 'play-std-2', name: 'Box-and-One', rarity: 'Uncommon', playCategory: 'special', badges: ['Lockdown Defender'], mechanicText: 'Requires a Lockdown Defender. Chokes off opponent perimeter and mid-range efficiency.' },
  { type: 'Play', id: 'play-std-3', name: 'Horns', rarity: 'Common', playCategory: 'special', badges: ['Finisher', 'Glass Cleaner'], mechanicText: 'Requires a Finisher and a Glass Cleaner. Small scoring boost to a two-big elbow set.' },
  { type: 'Play', id: 'play-std-4', name: 'Full Court Press', rarity: 'Common', playCategory: 'special', badges: ['Lockdown Defender'], mechanicText: 'Requires a Lockdown Defender. Forces extra possessions at a small cost to opponent rim efficiency.' },
  { type: 'Play', id: 'play-std-5', name: 'Four Out One In', rarity: 'Common', playCategory: 'special', badges: ['Sharpshooter', 'Glass Cleaner'], mechanicText: 'Requires 2 Sharpshooters and a Glass Cleaner. Boosts 3-point volume and efficiency at the cost of some rim shots.' },
  { type: 'Play', id: 'play-std-6', name: 'Point Forward', rarity: 'Rare', playCategory: 'special', badges: ['Floor General', 'Glass Cleaner', 'Sharpshooter'], mechanicText: 'Requires a playmaking big (Floor General and Glass Cleaner together) and 2 Sharpshooters. Boosts 3-point shooting off the big’s playmaking.' },
  // card_balance T4 (2026-09-17)
  { type: 'Play', id: 'play-std-7', name: 'Switch Everything', rarity: 'Uncommon', playCategory: 'special', badges: ['Lockdown Defender'], mechanicText: 'Requires 2 Lockdown Defenders. Denies switches across the perimeter and rim.' },
  { type: 'Play', id: 'play-std-8', name: 'Drop Coverage', rarity: 'Rare', playCategory: 'special', badges: ['Paint Protector'], mechanicText: 'Requires 2 Paint Protectors. The best single-purpose rim shutdown in the catalog.' },
  { type: 'Play', id: 'play-std-9', name: 'Post-Up Series', rarity: 'Uncommon', playCategory: 'special', badges: ['Finisher'], mechanicText: 'Requires 2 Finishers. Runs the offense through back-to-basket post scoring.' },
  { type: 'Play', id: 'play-std-10', name: 'Drive-and-Kick Series', rarity: 'Common', playCategory: 'special', badges: ['Floor General', 'Sharpshooter'], mechanicText: 'Requires a Floor General and 2 Sharpshooters. Drives collapse the defense and kick out to the corners.' },
];

