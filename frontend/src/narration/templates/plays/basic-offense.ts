import type { PlayTemplates } from '../../types';

/** Basic Offense: the featured player is on the floor and gets the ball. */
export const BASIC_OFFENSE: PlayTemplates = {
  playId: 'basic-offense',
  pools: {
    miss: [
      '{play} runs through {actor}, who forces the shot and misses.',
      '{actor} gets the featured touch from {play} but the shot is off.',
      'Nothing doing on {play}, {actor} misses the look.',
    ],
    rim_make: [
      '{play} gets {actor} the ball and the finish at the rim is easy.',
      '{actor} takes the featured touch inside and scores.',
      '{play} isolates {actor}, who drives and lays it in.',
    ],
    mid_make: [
      '{play} clears out for {actor}, who hits the pull-up.',
      '{actor} works the featured possession and buries the jumper.',
      '{play} gets {actor} to the elbow and the shot is good.',
    ],
    three_make: [
      '{play} frees {actor} on the wing and the three is good.',
      '{actor} takes the featured look from deep and drains it.',
      '{play} spaces the floor and {actor} knocks down the three.',
    ],
    and1: [
      '{play} puts {actor} in the paint, bucket and the foul!',
      '{actor} takes the featured touch through the contact, and one!',
      '{play} gets {actor} going downhill and it is an and-one!',
    ],
    rim_ft: [
      '{play} gets {actor} to the rim for the whistle, and {ftLine}.',
      '{actor} attacks on the featured touch, is fouled and {ftLine}.',
      '{play} draws the whistle for {actor}, who {ftLine}.',
    ],
  },
};
