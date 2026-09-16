import type { KindTemplates } from '../../types';

export const MID_MAKE: KindTemplates = {
  kind: 'mid_make',
  pools: {
    mid: [
      '{actor} pulls up from the elbow and knocks it down.',
      '{actor} rises from fifteen feet and buries it.',
      '{actor} fades from the baseline and it is pure.',
      '{actor} hits the mid-range jumper off the dribble.',
      '{actor} steps into the free-throw line jumper and it is good.',
      '{actor} cans the pull-up from the wing.',
      '{actor} gets to the spot and drains the mid-range look.',
      '{actor} stops on a dime and hits from the nail.',
    ],
  },
  assistSuffixes: [
    ' {assist} with the assist.',
    ' {assist} finds the open man.',
    ' Kick-out from {assist}.',
    ' {assist} draws two and delivers.',
    ' The pass from {assist} sets the table.',
    ' Nice touch pass by {assist}.',
  ],
};
