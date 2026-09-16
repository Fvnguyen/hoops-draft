import type { PlayTemplates } from '../../types';

/** Four Out One In: four shooters spaced around one big inside, threes and lobs. */
export const FOUR_OUT_ONE_IN: PlayTemplates = {
  playId: 'play-std-5',
  pools: {
    miss: [
      '{play} spaces the floor but {actor} misses the shot.',
      '{actor} gets a clean look out of {play} and it will not fall.',
      '{play} spreads them out, and {actor} still misses.',
      'The spacing in {play} is there, but {actor} comes up empty.',
    ],
    rim_make: [
      '{play}: {actor} works the lone big inside and scores at the rim.',
      '{actor} drives the open lane in {play} and finishes.',
      '{play} clears the paint and {actor} lays it in.',
    ],
    mid_make: [
      '{play}: {actor} pump-fakes the closeout and hits the pull-up.',
      '{actor} attacks the closeout in {play} and buries the jumper.',
      '{play} spaces the floor and {actor} knocks down the mid-range look.',
    ],
    three_make: [
      '{play}: {actor} catches on the wing and drains the three.',
      '{actor} spots up in {play} and splashes the corner three.',
      '{play} gets the kick-out to {actor}, who hits from deep.',
      '{actor} is left alone in {play} and makes them pay from three.',
    ],
    and1: [
      '{play}: {actor} attacks the open lane, scores and draws the foul!',
      '{actor} gets to the rim through {play}, bucket and the foul!',
      '{play} puts {actor} at the rim through the contact, and one!',
    ],
    rim_ft: [
      '{play}: {actor} drives the open lane, is fouled and {ftLine}.',
      '{actor} attacks the closeout in {play}, draws the foul and {ftLine}.',
      '{play} earns two free throws for {actor}, who {ftLine}.',
    ],
  },
};
