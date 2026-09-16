import type { KindTemplates } from '../../types';

/** A missed field goal that the defence rebounds. `{defender}` is the defensive rebounder when credited. */
export const MISS: KindTemplates = {
  kind: 'miss',
  pools: {
    rim: [
      '{actor} drives and the layup rolls off the rim.',
      '{actor} goes hard to the cup but the finish is short.',
      '{actor} attacks the paint and misses over the help.',
      '{actor} gets to the rim and the shot rattles out.',
      '{actor} tries a floater in the lane and it is long.',
      '{actor} spins baseline and the reverse layup will not fall.',
      '{actor} muscles inside but the shot rims out.',
      '{actor} cannot finish through the contact and {defender} cleans it up.',
    ],
    mid: [
      '{actor} pulls up from the elbow and it is off the back iron.',
      '{actor} rises for the mid-range jumper and misses.',
      '{actor} fades from fifteen feet and it is short.',
      '{actor} gets a clean look from the free-throw line and misses.',
      '{actor} pulls up in the lane and the jumper is long.',
      '{actor} works into the mid-range and the shot comes up empty.',
      '{actor} takes a contested pull-up and it clanks off the rim.',
      '{actor} misses the elbow jumper and {defender} secures the board.',
    ],
    three: [
      '{actor} lets it fly from deep and it is off the mark.',
      '{actor} fires from the wing and the three is short.',
      '{actor} steps into a corner three and misses.',
      '{actor} launches from the top of the key and it rims out.',
      '{actor} takes a contested three and it is no good.',
      '{actor} comes off the screen and misses from beyond the arc.',
      '{actor} pulls up from deep and the three hits the front rim.',
      '{actor} misses from distance and {defender} grabs the rebound.',
    ],
  },
};
