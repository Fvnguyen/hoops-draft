import type { KindTemplates } from '../../types';

/** An unforced turnover before any shot. `{actor}` is the ball-handler charged. */
export const TURNOVER: KindTemplates = {
  kind: 'turnover',
  pools: {
    any: [
      '{actor} loses the handle and the ball goes the other way.',
      '{actor} throws the entry pass away.',
      '{actor} steps on the sideline and turns it over.',
      '{actor} is called for the offensive foul.',
      '{actor} dribbles into traffic and coughs it up.',
      '{actor} forces a pass into the post and it is deflected out of bounds.',
      '{actor} is whistled for travelling.',
      '{actor} fumbles the catch and the ball goes out off the offence.',
      '{actor} tries the skip pass and sails it into the second row.',
    ],
  },
};
