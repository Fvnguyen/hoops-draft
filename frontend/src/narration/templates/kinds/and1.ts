import type { KindTemplates } from '../../types';

/** The only kind allowed exclamation marks (D3). The free throw on an and-one is always good (1/1). */
export const AND1: KindTemplates = {
  kind: 'and1',
  pools: {
    rim: [
      '{actor} scores through the foul at the rim, and one!',
      '{actor} takes the hit and finishes anyway, and one!',
      '{actor} powers up through the contact, bucket and the foul!',
      '{actor} hangs in the air, absorbs the hit and scores, and one!',
      '{actor} slams it home through the foul, and one!',
      '{actor} finishes the tough layup with the whistle, and one!',
      '{actor} muscles it in over {defender} and draws the foul, and one!',
    ],
    mid: [
      '{actor} pulls up, gets bumped and still buries it, and one!',
      '{actor} hits the mid-range jumper and draws the foul, and one!',
      '{actor} is fouled on the elbow jumper and it drops, and one!',
      '{actor} fades, takes the contact and scores, and one!',
      '{actor} rises from fifteen feet through the foul and it is good, and one!',
      '{actor} cans the contested pull-up with the whistle, and one!',
    ],
    three: [
      '{actor} is fouled on the three and it goes in, four-point play!',
      '{actor} buries the three through the contact, and one!',
      '{actor} gets hit on the release and still drains it, and one!',
      '{actor} splashes the three with the foul, and one!',
      '{actor} hits from deep as the whistle blows, four-point play!',
      '{actor} takes the bump beyond the arc and nails it, and one!',
    ],
  },
  assistSuffixes: [
    ' {assist} with the assist.',
    ' {assist} finds the finisher.',
    ' Set up by {assist}.',
    ' {assist} delivers the pass.',
    ' The feed from {assist} starts it.',
    ' Assist to {assist}.',
  ],
};
