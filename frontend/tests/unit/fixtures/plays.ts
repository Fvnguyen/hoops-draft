/**
 * Test fixture: the 10 play definitions used by the game.
 *
 * Copied verbatim (ids/names/rarity/playCategory/badges) from the `playsDB`
 * array in `src/components/DraftRoom.tsx` so engine-level tests can exercise
 * the real play data without importing a React component (DraftRoom.tsx
 * pulls in framer-motion/lucide-react/React hooks — engine tests must not
 * depend on that).
 *
 * Keep this in sync with DraftRoom.tsx's `playsDB` if that ever changes.
 */

import type { Play } from '@/components/PlayerCard';

export const PLAYS: Play[] = [
  { type: 'Play', id: 'play-sys-1', name: 'Triangle Offense', rarity: 'Mythic', playCategory: 'system', badges: ['Post Scorer', 'Mid-Range'], mechanicText: 'Requires elite post and mid-range scoring. Grants massive +25% efficiency to half-court offense.' },
  { type: 'Play', id: 'play-sys-2', name: '7 Seconds or Less', rarity: 'Mythic', playCategory: 'system', badges: ['Floor General', 'Sharpshooter'], mechanicText: 'Requires a Floor General and 3 Sharpshooters. Grants legendary transition scoring boost.' },
  { type: 'Play', id: 'play-sys-3', name: 'Grit and Grind', rarity: 'Rare', playCategory: 'system', badges: ['Lockdown Defender', 'Glass Cleaner'], mechanicText: 'Requires 2 Lockdown Defenders and 1 Glass Cleaner. Opponent efficiency drops by 20%.' },
  { type: 'Play', id: 'play-sys-4', name: 'Motion Offense', rarity: 'Rare', playCategory: 'system', badges: ['Floor General'], mechanicText: 'Requires high team Playmaking. +15% assist rate and team shooting boost.' },
  { type: 'Play', id: 'play-std-1', name: 'High Pick & Roll', rarity: 'Uncommon', playCategory: 'special', badges: ['Floor General', 'Finisher'], mechanicText: 'Boosts effectiveness of Floor Generals running the PnR.' },
  { type: 'Play', id: 'play-std-2', name: 'Box-and-One', rarity: 'Uncommon', playCategory: 'special', badges: ['Lockdown Defender'], mechanicText: 'Reduces opponent star player impact by 30%. Requires Lockdown Defender.' },
  { type: 'Play', id: 'play-std-3', name: 'Horns', rarity: 'Common', playCategory: 'special', badges: [], mechanicText: 'Provides small scoring boost to PFs and Cs.' },
  { type: 'Play', id: 'play-std-4', name: 'Full Court Press', rarity: 'Common', playCategory: 'special', badges: ['Lockdown Defender'], mechanicText: 'Increases forced turnovers. Costs high stamina.' },
  { type: 'Play', id: 'play-std-5', name: 'Four Out One In', rarity: 'Common', playCategory: 'special', badges: ['Sharpshooter', 'Glass Cleaner'], mechanicText: 'Boosts Sharpshooter effectiveness when paired with a Glass Cleaner.' },
  { type: 'Play', id: 'play-std-6', name: 'Point Forward', rarity: 'Rare', playCategory: 'special', badges: ['Floor General', 'Glass Cleaner', 'Sharpshooter'], mechanicText: 'Requires a playmaking big (Floor General and Glass Cleaner together) and 2 Sharpshooters. Boosts 3-point shooting off the big’s playmaking.' },
];
