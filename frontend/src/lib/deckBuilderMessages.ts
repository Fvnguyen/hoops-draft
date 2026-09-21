import type { AssignPlayFailureReason, BuilderActionError } from '@/engine/deckbuilder';
import type { Play } from '@/engine/types';

/**
 * User-facing error-toast text for a refused `BuilderAction` (plan render_and_engine_perf,
 * D8 layout half / T10) — pure string mapping, split out of `DeckBuilder.tsx` since none of
 * it touches component state.
 */

export function placePlayerFailureMessage(error: BuilderActionError): string {
  switch (error) {
    case 'ineligible': return 'Not eligible for this position';
    case 'occupied': return 'That slot is already filled';
    default: return 'Cannot place there';
  }
}

export function moveFailureMessage(error: BuilderActionError): string {
  switch (error) {
    case 'ineligible': return 'Not eligible for this position';
    case 'full': return 'Column full';
    case 'not-found': return 'Player is not on the roster';
    default: return 'Cannot place there';
  }
}

export function assignPlayFailureMessage(play: Play, reason: AssignPlayFailureReason): string {
  switch (reason) {
    case 'full': return 'All play slots are full';
    case 'wrong-side': return `${play.name} has no open slot for its side`;
    case 'duplicate': return `${play.name} is already active`;
    default: return 'Cannot activate that play';
  }
}
