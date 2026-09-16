import type { CoverageTemplates } from '../../types';

/** Basic Defense: the featured defender is on the floor for this possession. */
export const BASIC_DEFENSE: CoverageTemplates = {
  playId: 'basic-defense',
  pools: {
    miss: [
      '{coverage} holds up and {actor} misses the shot.',
      '{actor} gets a look against {coverage} and it will not fall.',
      'Solid work in {coverage}, {actor} misses under pressure.',
    ],
    block: [
      '{coverage} sends {defender} to the ball and the shot is blocked.',
      '{defender} anchors {coverage} and swats the attempt by {actor}.',
      '{coverage}: {defender} rises and blocks {actor}.',
    ],
    turnover: [
      '{coverage} forces {actor} into a bad pass and the ball is lost.',
      '{actor} loses the handle against {coverage}.',
      '{coverage} stays home and {actor} turns it over.',
    ],
    steal: [
      '{coverage}: {defender} strips {actor} and takes it away.',
      '{defender} reads the pass out of {coverage} and steals it.',
      '{actor} is picked clean by {defender} in {coverage}.',
    ],
  },
};
