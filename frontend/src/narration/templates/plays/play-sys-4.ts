import type { PlayTemplates } from '../../types';

/** Motion Offense: continuous screens and cuts, the ball keeps moving until a look opens. */
export const MOTION_OFFENSE: PlayTemplates = {
  playId: 'play-sys-4',
  pools: {
    miss: [
      '{play} swings it side to side but {actor} misses the shot.',
      '{actor} curls off a screen in {play} and the shot is off.',
      '{play} finds {actor} off the cut, but the finish will not fall.',
      'Plenty of movement in {play}, and {actor} still misses the look.',
    ],
    rim_make: [
      '{play}: {actor} back-cuts and finishes at the rim.',
      '{actor} slips the screen in {play} and lays it in.',
      '{play} moves the defence and {actor} scores on the cut.',
    ],
    mid_make: [
      '{play}: {actor} curls off the down screen and hits the jumper.',
      '{actor} flares open in {play} and buries the mid-range shot.',
      '{play} frees {actor} at the elbow and the jumper is good.',
    ],
    three_make: [
      '{play}: {actor} comes off the pin-down and drains the three.',
      '{actor} keeps moving in {play} and hits the open three.',
      '{play} swings it to {actor}, who knocks down the triple.',
    ],
    and1: [
      '{play}: {actor} cuts backdoor, scores and draws the foul!',
      '{actor} slips free in {play}, bucket and the foul!',
      '{play} gets {actor} a layup through the contact, and one!',
    ],
    rim_ft: [
      '{play}: {actor} cuts to the rim, is fouled and {ftLine}.',
      '{actor} slips the screen in {play}, draws the foul and {ftLine}.',
      '{play} earns two free throws for {actor}, who {ftLine}.',
    ],
  },
};
