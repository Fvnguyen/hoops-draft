import type { PlayTemplates } from '../../types';

/** 7 Seconds or Less: early offence, advance passes and trail threes before the defence is set. */
export const SEVEN_SECONDS_OR_LESS: PlayTemplates = {
  playId: 'play-sys-2',
  pools: {
    miss: [
      '{play} pushes the pace but {actor} misses the early look.',
      '{actor} fires early in {play} and the shot is off.',
      '{play} runs the break, and {actor} rushes the shot and misses.',
      'The early look from {play} is there, but {actor} cannot convert.',
    ],
    rim_make: [
      '{play}: {actor} beats the defence down the floor and finishes.',
      '{actor} takes the advance pass in {play} and lays it in.',
      '{play} gets {actor} a run-out and the finish is easy.',
    ],
    mid_make: [
      '{play}: {actor} pulls up early in the clock and hits the jumper.',
      '{actor} stops on the break in {play} and buries the pull-up.',
      '{play} gets {actor} a quick elbow look and it drops.',
    ],
    three_make: [
      '{play}: {actor} trails the break and drains the three.',
      '{actor} lets it fly early in {play} and it is good.',
      '{play} finds {actor} before the defence is set, three is good.',
      '{actor} pulls up in transition off {play} and splashes the triple.',
    ],
    and1: [
      '{play}: {actor} attacks in transition, scores and draws the foul!',
      '{actor} beats the defence down the floor in {play}, and one!',
      '{play} gets {actor} to the rim early through the contact, and one!',
    ],
    rim_ft: [
      '{play}: {actor} attacks in transition, is fouled and {ftLine}.',
      '{actor} pushes the break in {play}, draws the foul and {ftLine}.',
      '{play} earns two free throws for {actor}, who {ftLine}.',
    ],
  },
};
