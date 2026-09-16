import type { CoverageTemplates } from '../../types';

/** Box-and-One: a chaser shadows the star, four others zone the paint and take away the three. */
export const BOX_AND_ONE: CoverageTemplates = {
  playId: 'play-std-2',
  pools: {
    miss: [
      '{coverage} takes away the first option and {actor} misses.',
      '{actor} is shadowed all over the floor by {coverage} and misses.',
      'Against {coverage}, {actor} gets a contested look and it is off.',
    ],
    block: [
      '{coverage}: {defender} chases {actor} down and blocks the shot.',
      '{defender} sits in the box in {coverage} and swats the attempt.',
      '{actor} runs into {coverage} and {defender} blocks it.',
    ],
    turnover: [
      '{coverage} denies the star and {actor} throws it away.',
      '{actor} forces it into the box in {coverage} and loses the ball.',
      '{coverage} clogs the lane and {actor} turns it over.',
    ],
    steal: [
      '{coverage}: {defender} shadows {actor} and picks the pocket.',
      '{defender} jumps the pass out of {coverage} and steals it.',
      '{actor} is chased into a trap by {coverage} and {defender} takes it.',
    ],
  },
};
