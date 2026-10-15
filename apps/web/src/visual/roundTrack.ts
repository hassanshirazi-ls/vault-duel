// The 1-12 round track (D-238). Which rounds carry a gavel and which is the sealed vault come from the globals
// (APPRAISAL_ROUNDS, MAX_ROUNDS, FLAGS.APPRAISAL), never from numbers in the UI.
import type { Globals } from '@vault-duel/engine';

export interface TrackMark {
  readonly round: number;
  readonly appraisal: boolean;
  readonly vault: boolean;
  readonly current: boolean;
  readonly past: boolean;
}

export function roundTrack(g: Globals, currentRound: number): TrackMark[] {
  const appraisals = g.FLAGS.APPRAISAL ? g.APPRAISAL_ROUNDS : [];
  return Array.from({ length: g.MAX_ROUNDS }, (_, i) => {
    const round = i + 1;
    return {
      round,
      appraisal: appraisals.includes(round),
      vault: round === g.MAX_ROUNDS,
      current: round === currentRound,
      past: round < currentRound,
    };
  });
}
