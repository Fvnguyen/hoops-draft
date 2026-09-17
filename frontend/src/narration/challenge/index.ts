/**
 * Front-office quote pools (plan_challenge_mode D8). This module only aggregates the
 * three speaker files; the reason catalogue, the ranking and the placeholder filling
 * live in `engine/challengeAdvice.ts`.
 */
import type { ChallengeSpeaker, QuoteTemplates } from './types';
import { COACH_QUOTES } from './coach';
import { OWNER_QUOTES } from './owner';
import { FANS_QUOTES } from './fans';

export type { ChallengeSpeaker, QuoteTemplates };

export const CHALLENGE_QUOTES: Record<ChallengeSpeaker, QuoteTemplates> = {
  coach: COACH_QUOTES,
  owner: OWNER_QUOTES,
  fans: FANS_QUOTES,
};

/** Speaker order on the board (board 4: Coach, Owner, Fans, left to right). */
export const CHALLENGE_SPEAKERS: ChallengeSpeaker[] = ['coach', 'owner', 'fans'];
