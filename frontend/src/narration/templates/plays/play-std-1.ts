import type { PlayTemplates } from '../../types';

/** High Pick & Roll: a ball screen at the top, the handler attacks and the roller dives. */
export const HIGH_PICK_AND_ROLL: PlayTemplates = {
  playId: 'play-std-1',
  pools: {
    miss: [
      '{play}: {actor} comes off the ball screen and misses.',
      '{actor} rejects the screen in {play} and the shot is off.',
      '{play} gets {actor} a look off the pick, but it will not fall.',
      'The defence switches {play} and {actor} misses the shot.',
    ],
    rim_make: [
      '{play}: {actor} rolls to the rim and finishes.',
      '{actor} splits the hedge off {play} and lays it in.',
      '{play} gets {actor} downhill and the finish is easy.',
      '{actor} turns the corner on {play} and scores at the rim.',
    ],
    mid_make: [
      '{play}: {actor} snakes the screen and hits the pull-up.',
      '{actor} comes off the pick in {play} and buries the jumper.',
      '{play} gives {actor} a step and the mid-range shot is good.',
    ],
    three_make: [
      '{play}: {actor} pulls up behind the ball screen for three, good.',
      'The defence goes under on {play} and {actor} makes them pay from three.',
      '{play} draws the help and {actor} drains the open three.',
    ],
    and1: [
      '{play}: {actor} rolls hard, scores and takes the foul, and one!',
      '{actor} attacks off the ball screen in {play}, bucket and the foul!',
      '{play} gets {actor} to the rim through the contact, and one!',
    ],
    rim_ft: [
      '{play}: {actor} turns the corner, is fouled and {ftLine}.',
      '{actor} rolls off the screen in {play}, draws the foul and {ftLine}.',
      '{play} sends {actor} to the line, who {ftLine}.',
    ],
  },
};
