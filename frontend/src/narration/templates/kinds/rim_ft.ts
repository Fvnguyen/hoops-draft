import type { KindTemplates } from '../../types';

/**
 * A foul at the rim with a free-throw trip and no field goal. `{ftLine}` is rendered by
 * render.ts from narrative.ftMade / ftAttempted ("hits both", "splits the pair", "misses both").
 */
export const RIM_FT: KindTemplates = {
  kind: 'rim_ft',
  pools: {
    any: [
      '{actor} is fouled at the rim and {ftLine}.',
      '{actor} draws contact on the drive and {ftLine} at the line.',
      '{actor} gets hacked going up and {ftLine}.',
      '{actor} earns two free throws and {ftLine}.',
      '{actor} is sent to the line and {ftLine}.',
      '{actor} attacks, gets the whistle, then {ftLine}.',
      '{actor} takes the foul in the paint and {ftLine}.',
    ],
  },
  assistSuffixes: [
    ' {assist} sets up the drive.',
    ' The look comes from {assist}.',
    ' {assist} finds the seam.',
    ' Good entry from {assist}.',
    ' {assist} starts the action.',
    ' The pass from {assist} draws the foul.',
  ],
};
