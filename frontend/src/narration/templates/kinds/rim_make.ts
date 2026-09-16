import type { KindTemplates } from '../../types';

export const RIM_MAKE: KindTemplates = {
  kind: 'rim_make',
  pools: {
    rim: [
      '{actor} drives and finishes at the rim.',
      '{actor} slices into the lane for the layup.',
      '{actor} throws it down with two hands.',
      '{actor} goes glass with the reverse and it drops.',
      '{actor} spins baseline and lays it in.',
      '{actor} rolls to the basket and scores inside.',
      '{actor} floats one over the help and it is good.',
      '{actor} bullies into the paint and scores through contact.',
      '{actor} beats the closeout and finishes with the left hand.',
    ],
  },
  assistSuffixes: [
    ' {assist} with the dime.',
    ' {assist} finds the cutter.',
    ' Assist to {assist}.',
    ' {assist} threads it inside.',
    ' Great feed from {assist}.',
    ' {assist} sets it up on the drop-off.',
  ],
};
