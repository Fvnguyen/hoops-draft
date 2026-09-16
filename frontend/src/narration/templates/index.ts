/**
 * Template data for the narration renderer (plan game_theater T3, D3). One file per kind,
 * per offensive play and per defensive coverage; this module only aggregates them.
 * `templates/identity.ts` (D5) is owned separately and is not re-exported here.
 */
import type { NarrativeKind, ShotChannel, KindTemplates, PlayTemplates, CoverageTemplates } from '../types';
import { MISS } from './kinds/miss';
import { BLOCK } from './kinds/block';
import { TURNOVER } from './kinds/turnover';
import { STEAL } from './kinds/steal';
import { RIM_MAKE } from './kinds/rim_make';
import { RIM_FT } from './kinds/rim_ft';
import { MID_MAKE } from './kinds/mid_make';
import { THREE_MAKE } from './kinds/three_make';
import { AND1 } from './kinds/and1';
import { BASIC_OFFENSE } from './plays/basic-offense';
import { HORNS } from './plays/play-std-3';
import { HIGH_PICK_AND_ROLL } from './plays/play-std-1';
import { MOTION_OFFENSE } from './plays/play-sys-4';
import { FOUR_OUT_ONE_IN } from './plays/play-std-5';
import { TRIANGLE_OFFENSE } from './plays/play-sys-1';
import { SEVEN_SECONDS_OR_LESS } from './plays/play-sys-2';
import { BASIC_DEFENSE } from './coverages/basic-defense';
import { FULL_COURT_PRESS } from './coverages/play-std-4';
import { BOX_AND_ONE } from './coverages/play-std-2';
import { GRIT_AND_GRIND } from './coverages/play-sys-3';

export const KIND_TEMPLATES: Record<NarrativeKind, KindTemplates> = {
  miss: MISS,
  block: BLOCK,
  turnover: TURNOVER,
  steal: STEAL,
  rim_make: RIM_MAKE,
  rim_ft: RIM_FT,
  mid_make: MID_MAKE,
  three_make: THREE_MAKE,
  and1: AND1,
};

export const PLAY_TEMPLATES: Record<string, PlayTemplates> = {
  [BASIC_OFFENSE.playId]: BASIC_OFFENSE,
  [HORNS.playId]: HORNS,
  [HIGH_PICK_AND_ROLL.playId]: HIGH_PICK_AND_ROLL,
  [MOTION_OFFENSE.playId]: MOTION_OFFENSE,
  [FOUR_OUT_ONE_IN.playId]: FOUR_OUT_ONE_IN,
  [TRIANGLE_OFFENSE.playId]: TRIANGLE_OFFENSE,
  [SEVEN_SECONDS_OR_LESS.playId]: SEVEN_SECONDS_OR_LESS,
};

export const COVERAGE_TEMPLATES: Record<string, CoverageTemplates> = {
  [BASIC_DEFENSE.playId]: BASIC_DEFENSE,
  [FULL_COURT_PRESS.playId]: FULL_COURT_PRESS,
  [BOX_AND_ONE.playId]: BOX_AND_ONE,
  [GRIT_AND_GRIND.playId]: GRIT_AND_GRIND,
};

/** Which channels every kind must cover with >= 6 variants (tests enforce). */
export const REQUIRED_KIND_CHANNELS: Record<NarrativeKind, Array<ShotChannel | 'any'>> = {
  miss: ['rim', 'mid', 'three'],
  block: ['rim', 'mid', 'three'],
  turnover: ['any'],
  steal: ['any'],
  rim_make: ['rim'],
  rim_ft: ['any'],
  mid_make: ['mid'],
  three_make: ['three'],
  and1: ['rim', 'mid', 'three'],
};

/** Kinds every offensive play file must cover with >= 3 variants. */
export const REQUIRED_PLAY_KINDS: NarrativeKind[] = ['miss', 'rim_make', 'mid_make', 'three_make', 'and1', 'rim_ft'];
/** Kinds every coverage file must cover with >= 3 variants. */
export const REQUIRED_COVERAGE_KINDS: NarrativeKind[] = ['miss', 'block', 'turnover', 'steal'];

/** Prefixed when narrative.isSecondChance; {rebounder} = last offensive rebounder. */
export const SECOND_CHANCE_PREFIXES: string[] = [
  '{rebounder} keeps it alive.',
  '{rebounder} tips out the miss.',
  '{rebounder} wins the offensive board.',
  '{rebounder} pulls down the offensive rebound.',
  '{rebounder} comes up with the loose ball.',
  '{rebounder} crashes the glass for a second chance.',
];

/** Prefixed when narrative.isPossessionWin; {team} may be "You", so no verb hangs off it. */
export const POSSESSION_WIN_PREFIXES: string[] = [
  'Extra possession for {team}.',
  'Bonus trip for {team}.',
  'One more possession for {team}.',
  'A hustle play earns {team} another possession.',
  'The tempo pays off with an extra possession for {team}.',
  'The loose ball goes to {team} for an extra trip.',
];

/**
 * Appended (after the terminal period is stripped) when narrative.steeredTo is set on a
 * make or miss: the creator steer moved the shot profile toward that channel.
 */
export const STEER_TAGS: Record<ShotChannel, string[]> = {
  rim: [
    'the offence keeps attacking the rim',
    'the offence hunts the paint',
    'everything is going downhill tonight',
  ],
  mid: [
    'the offence is living in the mid-range',
    'the offence hunts the pull-up',
    'the elbows are the target tonight',
  ],
  three: [
    'the offence hunts the three',
    'the offence is living beyond the arc',
    'the game plan is threes tonight',
  ],
};
