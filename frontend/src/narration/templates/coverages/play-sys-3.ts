import type { CoverageTemplates } from '../../types';

/** Grit and Grind: a perimeter stopper, a paint anchor, a rebounder — every touch is contested. */
export const GRIT_AND_GRIND: CoverageTemplates = {
  playId: 'play-sys-3',
  pools: {
    miss: [
      '{coverage} makes it ugly and {actor} misses the shot.',
      '{actor} fights through {coverage} and the shot rims out.',
      'Nothing easy against {coverage}, {actor} comes up short.',
    ],
    block: [
      '{coverage}: {defender} anchors the paint and blocks {actor}.',
      '{defender} contests everything in {coverage} and swats the shot.',
      '{actor} attacks {coverage} and {defender} sends it back.',
    ],
    turnover: [
      '{coverage} grinds the possession down and {actor} throws it away.',
      '{actor} loses the ball in the mud of {coverage}.',
      '{coverage} takes the air out of the possession and {actor} turns it over.',
    ],
    steal: [
      '{coverage}: {defender} digs in and strips {actor}.',
      '{defender} gets into {actor} in {coverage} and comes away with it.',
      '{actor} is worn down by {coverage} and {defender} takes it away.',
    ],
  },
};
