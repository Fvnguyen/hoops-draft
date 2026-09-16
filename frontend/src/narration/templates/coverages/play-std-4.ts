import type { CoverageTemplates } from '../../types';

/** Full Court Press: pressure from the inbound, traps in the backcourt, a back-line helper. */
export const FULL_COURT_PRESS: CoverageTemplates = {
  playId: 'play-std-4',
  pools: {
    miss: [
      '{coverage} eats the clock and {actor} misses a rushed shot.',
      '{actor} finally breaks {coverage} but the shot is off.',
      'Harried by {coverage}, {actor} forces one up and misses.',
    ],
    block: [
      '{coverage} speeds up {actor} and {defender} blocks the shot.',
      '{defender} trails the play out of {coverage} and swats it.',
      '{coverage}: {actor} hurries the shot and {defender} sends it back.',
    ],
    turnover: [
      '{coverage} traps {actor} in the backcourt and the ball is lost.',
      '{actor} cannot beat {coverage} and throws it away.',
      '{coverage} forces the eight-second violation on {actor}.',
      '{actor} is trapped on the sideline by {coverage} and turns it over.',
    ],
    steal: [
      '{coverage}: {defender} jumps the inbound and steals it from {actor}.',
      '{defender} doubles {actor} out of {coverage} and rips it away.',
      '{actor} is trapped by {coverage} and {defender} comes up with it.',
    ],
  },
};
