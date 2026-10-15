// The middle round marker (D-238): rounds 1..MAX_ROUNDS, a gavel on each Appraisal round, a sealed-vault mark on the
// last, the current round lit. All of it comes from the globals through roundTrack().
import type { Globals } from '@vault-duel/engine';
import { roundTrack } from '../visual/roundTrack';
import { Glyph } from '../visual/glyphs';

export function RoundTrack({ globals, round }: { readonly globals: Globals; readonly round: number }) {
  const marks = roundTrack(globals, round);
  return (
    <ol className="track" aria-label={`Round ${round} of ${globals.MAX_ROUNDS}`}>
      {marks.map((m) => (
        <li key={m.round} data-current={m.current ? '' : undefined} data-past={m.past ? '' : undefined} data-mark={m.appraisal ? 'gavel' : m.vault ? 'vault' : undefined}>
          <span className="track-mark" aria-hidden="true">
            {m.appraisal && <Glyph id="gavel" size={14} />}
            {m.vault && !m.appraisal && <Glyph id="vault" size={14} />}
          </span>
          <span className="track-n">{m.round}</span>
          {m.appraisal && <span className="sr-only"> Appraisal</span>}
          {m.vault && <span className="sr-only"> Vault seals</span>}
        </li>
      ))}
    </ol>
  );
}
