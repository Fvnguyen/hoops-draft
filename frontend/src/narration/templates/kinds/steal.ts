import type { KindTemplates } from '../../types';

/** A turnover credited to a defender. `{defender}` is the stealer; `{actor}` the ball-handler. */
export const STEAL: KindTemplates = {
  kind: 'steal',
  pools: {
    any: [
      '{defender} picks the pocket of {actor}.',
      '{defender} jumps the passing lane and steals it from {actor}.',
      '{actor} telegraphs the pass and {defender} reads it all the way.',
      '{defender} strips {actor} on the drive.',
      '{actor} dribbles into a trap and {defender} comes away with it.',
      '{defender} pokes it loose from {actor} and the offence is done.',
      '{defender} anticipates the swing pass and takes it from {actor}.',
      '{defender} digs down and rips the ball from {actor}.',
    ],
  },
};
