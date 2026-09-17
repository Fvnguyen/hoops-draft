/**
 * The 14 play definitions used by the game.
 *
 * No longer a hand-copied literal: it re-exports the single catalog in
 * `src/engine/plays.ts` (pure data, no React), which `components/DraftRoom.tsx`
 * re-exports as `playsDB`. The old copy drifted stale twice — card_balance T3's
 * badges fix and T4's four new plays never reached it — which silently made
 * `npm run balance`/`feasibility` blind to real plays with no error at all.
 * Kept as a file so the many `from './fixtures/plays'` imports still resolve.
 */

import { PLAY_CATALOG } from '@/engine/plays';
import type { Play } from '@/engine/types';

export const PLAYS: Play[] = PLAY_CATALOG;
