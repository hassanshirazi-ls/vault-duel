// The round strip (D-238, D-339): rounds 1..MAX_ROUNDS, a gavel on each Appraisal round, a sealed-vault mark on the last,
// the current round lit. A small chip at the end folds in the Appraisal countdown ("in 2"). All of it comes from the globals.
import type { CSSProperties } from 'react';
import type { Globals } from '@vault-duel/engine';
import { roundTrack } from '../visual/roundTrack';
import { Glyph } from '../visual/glyphs';

export interface TrackAppraisal {
  /** rounds until the next Appraisal; 0 means after your turn */
  readonly roundsAway: number;
  readonly round: number;
  /** beat of a gavel cue playing now, to flash the chip */
  readonly flashBeat?: number | undefined;
}

export function RoundTrack({ globals, round, appraisal = null }: { readonly globals: Globals; readonly round: number; readonly appraisal?: TrackAppraisal | null }) {
  const marks = roundTrack(globals, round);
  return (
    <div className="track-strip">
      <ol className="track" aria-label={`Round ${round} of ${globals.MAX_ROUNDS}`}>
        {marks.map((m) => (
          <li key={m.round} data-current={m.current ? '' : undefined} data-past={m.past ? '' : undefined} data-mark={m.appraisal ? 'gavel' : m.vault ? 'vault' : undefined}>
            <span className="track-mark" aria-hidden="true">
              {m.appraisal && <Glyph id="gavel" size={12} />}
              {m.vault && !m.appraisal && <Glyph id="vault" size={12} />}
            </span>
            <span className="track-n">{m.round}</span>
            {m.appraisal && <span className="sr-only"> Appraisal</span>}
            {m.vault && <span className="sr-only"> Vault seals</span>}
          </li>
        ))}
      </ol>
      {appraisal !== null && (
        <span
          className={`track-appraisal ${appraisal.flashBeat !== undefined ? 'cue cue-flash' : ''}`}
          style={{ '--b': appraisal.flashBeat ?? 0 } as CSSProperties}
          data-soon={appraisal.roundsAway <= 1 ? '' : undefined}
          role="status"
          aria-label={appraisal.roundsAway === 0 ? 'Appraisal after your turn' : `Appraisal in round ${appraisal.round}, ${appraisal.roundsAway} ${appraisal.roundsAway === 1 ? 'round' : 'rounds'} away`}
        >
          <Glyph id="gavel" size={13} /> {appraisal.roundsAway === 0 ? 'now' : `in ${appraisal.roundsAway}`}
        </span>
      )}
    </div>
  );
}
