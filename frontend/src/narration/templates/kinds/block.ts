import type { KindTemplates } from '../../types';

/** A miss credited as a block. `{defender}` is the blocker; the renderer falls back to "a defender" when uncredited. */
export const BLOCK: KindTemplates = {
  kind: 'block',
  pools: {
    rim: [
      '{defender} meets {actor} at the rim and swats it away.',
      '{actor} rises for the layup and {defender} sends it back.',
      '{defender} rejects {actor} at the summit.',
      '{actor} attacks the paint and {defender} blocks the shot.',
      '{defender} walls off the rim and denies {actor}.',
      '{actor} goes up strong and {defender} erases it.',
      '{defender} rotates over and pins the layup by {actor} on the glass.',
    ],
    mid: [
      '{defender} gets a hand on the pull-up from {actor}.',
      '{actor} rises from the elbow and {defender} blocks it.',
      '{defender} closes hard and swats the jumper by {actor}.',
      '{actor} fades from mid-range and {defender} gets a piece of it.',
      '{defender} times the jump and blocks the mid-range look.',
      '{actor} pulls up and {defender} volleyballs it away.',
      '{defender} recovers late but still blocks the jumper by {actor}.',
    ],
    three: [
      '{defender} flies out and blocks the three from {actor}.',
      '{actor} fires from deep and {defender} gets a fingertip on it.',
      '{defender} contests and swats the three by {actor}.',
      '{actor} rises from the wing and {defender} blocks it clean.',
      '{defender} runs {actor} off the line and blocks the shot.',
      '{actor} launches and {defender} deflects the three away.',
      '{defender} closes out hard and the three from {actor} never gets off.',
    ],
  },
};
