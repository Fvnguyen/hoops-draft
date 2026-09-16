import type { PlayTemplates } from '../../types';

/** Horns: two bigs at the elbows, the ball-handler picks a side, cutter dives. */
export const HORNS: PlayTemplates = {
  playId: 'play-std-3',
  pools: {
    miss: [
      '{play} sets up at the elbows but {actor} misses the look.',
      '{actor} comes off the elbow screen in {play} and the shot is off.',
      '{play} gets {actor} a shot from the elbow action, no good.',
      'The {play} set stalls and {actor} misses a tough one.',
    ],
    rim_make: [
      '{play}: {actor} dives off the elbow and finishes at the rim.',
      '{actor} cuts through the {play} set and lays it in.',
      '{play} opens the lane and {actor} rolls in for the score.',
    ],
    mid_make: [
      '{play}: {actor} pops to the elbow and hits the jumper.',
      '{actor} works off the elbow screen in {play} and buries it.',
      '{play} gets {actor} the elbow look and it is good.',
    ],
    three_make: [
      '{play}: {actor} slips out of the elbow action and hits the three.',
      '{actor} finds the open corner off {play} and drains it.',
      '{play} bends the defence and {actor} knocks down the three.',
    ],
    and1: [
      '{play}: {actor} dives to the rim, scores and draws the foul!',
      '{actor} cuts through the elbows in {play}, bucket and the foul!',
      '{play} gets {actor} inside through the contact, and one!',
    ],
    rim_ft: [
      '{play}: {actor} dives off the elbow, is fouled and {ftLine}.',
      '{actor} cuts hard in {play}, draws the foul and {ftLine}.',
      '{play} gets {actor} to the rim, draws the foul, and {ftLine}.',
    ],
  },
};
