import type { PlayTemplates } from '../../types';

/** Triangle Offense: post entry on the strong side, cuts and reads off the block. */
export const TRIANGLE_OFFENSE: PlayTemplates = {
  playId: 'play-sys-1',
  pools: {
    miss: [
      '{play} enters it to the post but {actor} misses the shot.',
      '{actor} works the block in {play} and the shot rims out.',
      '{play} cycles the ball, and {actor} misses the look.',
      'The post entry in {play} goes nowhere and {actor} misses.',
    ],
    rim_make: [
      '{play}: {actor} cuts off the post and lays it in.',
      '{actor} seals on the block in {play} and scores inside.',
      '{play} feeds the post and {actor} finishes at the rim.',
    ],
    mid_make: [
      '{play}: {actor} pops to the pinch post and hits the jumper.',
      '{actor} reads the cut in {play} and buries the mid-range shot.',
      '{play} gets {actor} the elbow look and it is good.',
      '{actor} fades off the block in {play} and knocks it down.',
    ],
    three_make: [
      '{play}: {actor} fills the weak-side corner and drains the three.',
      '{actor} spots up out of {play} and hits from deep.',
      '{play} draws the double team and {actor} makes the open three.',
    ],
    and1: [
      '{play}: {actor} scores off the post feed and draws the foul!',
      '{actor} spins off the block in {play}, bucket and the foul!',
      '{play} gets {actor} inside through the contact, and one!',
    ],
    rim_ft: [
      '{play}: {actor} cuts off the post, is fouled and {ftLine}.',
      '{actor} seals inside in {play}, draws the foul and {ftLine}.',
      '{play} earns two free throws for {actor}, who {ftLine}.',
    ],
  },
};
