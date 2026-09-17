/**
 * Front-office quote templates (plan_challenge_mode D8). Pure data, no imports: the
 * reason ids and the ranking live in `engine/challengeAdvice.ts`, which tightens
 * `QuoteTemplates` to its own `ChallengeReasonId` union on the way in.
 *
 * One pool per reason id per speaker, 3-4 variants each (enforced by
 * `tests/unit/challengeAdvice.test.ts`). Placeholders are `{name}` and are filled from
 * the reason's `vars`; a template whose placeholders are not all available is skipped,
 * so a pool must never be written so that every variant needs an optional var.
 *
 * House style: spoken, present tense, one or two sentences, under ~150 characters.
 * PRODUCT RULE — a quote may cite season averages, minutes, plus-minus, badges and
 * plan names, but NEVER a player's OVR or any of the seven engine ratings, and NEVER
 * a win-loss record (the record stays sealed until the season ends).
 */

export type ChallengeSpeaker = 'coach' | 'owner' | 'fans';

/** reason id -> variants. Keyed loosely so template files stay import-free. */
export type QuoteTemplates = Record<string, string[]>;
