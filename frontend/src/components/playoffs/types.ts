/**
 * pvp_series T1: props of the Playoffs series components. Every component gets the match
 * row and the viewer's side; nothing here may render the opponent's roster, bench, plays
 * or identity (D3) — only their name, record in this series, online state and, on a game
 * page before tip-off, their five starters.
 */

import type { Match, MatchSide } from '@/storage/matchTypes';
import type { ChallengeTrade, SavedRoster } from '@/storage/types';

export interface SeriesStripProps {
  match: Match;
  me: MatchSide;
  opponentName: string | null;
  /** D5: seven slots, home marks, scores; "Watch" links to `/playoffs/[id]/game/[n]`. */
}

export interface CoinFlipProps {
  seed: number;
  me: MatchSide;
  opponentName: string | null;
  /** Plays once per viewer; the caller stores "seen" client-side (getMeta/setMeta). */
  onDone: () => void;
}

export interface PlayoffsFrontOfficeProps {
  match: Match;
  me: MatchSide;
  /** The viewer's roster as it played the games so far (the locked roster). */
  roster: SavedRoster;
  /** Calls `match_sideboard` (hold = the same roster, no trade). Resolves once locked. */
  onLock: (roster: SavedRoster, trade?: ChallengeTrade) => Promise<void>;
}

export interface SeriesResultsProps {
  match: Match;
  me: MatchSide;
  opponentName: string | null;
  /** D6: the loser invites the winner to a fresh match (`match_invite`). */
  onRematch: () => Promise<void>;
}
