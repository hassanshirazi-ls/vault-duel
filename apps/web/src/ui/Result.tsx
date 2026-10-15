// Result as a bill of sale (D-238): an ivory receipt with a wax stamp, the date, rounds against par, life left, the
// bonus objectives with check/cross, and the emoji round row exactly as it will be shared.
import { useState } from 'react';
import { definitionView } from '../view/cards';
import { objectiveMet } from '../view/objectives';
import { roundRow } from '../view/roundRow';
import { Glyph } from '../visual/glyphs';
import { useGame } from './context';
import { Gem } from './Gem';
import { MiniCard } from './MiniCard';

const REASON: Readonly<Record<string, string>> = {
  collectorDefeated: 'The Collector is defeated.',
  playerDefeated: 'You fell.',
  vaultSealed: 'The vault sealed before you finished.',
};

export function Result() {
  const state = useGame((s) => s.state);
  const setup = useGame((s) => s.setup);
  const ctx = useGame((s) => s.ctx);
  const [copied, setCopied] = useState<'idle' | 'done' | 'failed'>('idle');
  if (state === null || state.result === null || setup === null || ctx === null) return null;
  const { result } = state;
  const won = result.winner === 0;
  const row = roundRow(state.track, result.round).join('');
  const sig = definitionView(ctx, setup.signature);
  // TODO(W2): meta/share.ts builds this text (and the row above) for sharing; this is the same row, minimal header.
  const shareText = `Vault Duel ${setup.date}\n${won ? 'Acquired' : 'Sealed'} · round ${result.round}/${setup.difficulty.par}\n${row}`;
  const share = async (): Promise<void> => {
    try {
      if (typeof navigator.share === 'function') await navigator.share({ text: shareText });
      else await navigator.clipboard.writeText(shareText);
      setCopied('done');
    } catch {
      setCopied('failed');
    }
  };
  return (
    <main className="result">
      <article className={`receipt ${won ? 'won' : 'lost'}`} aria-label="Bill of sale">
        <header>
          <p className="eyebrow">Bill of sale</p>
          <h1>{won ? 'Lot acquired' : 'Lot sealed away'}</h1>
          <p className="receipt-date">{setup.date}</p>
        </header>
        <p className="receipt-reason">{REASON[result.reason] ?? ''}</p>
        <dl className="receipt-lines">
          <div>
            <dt>Rounds</dt>
            <dd>
              {result.round} <span className="muted">against par {setup.difficulty.par}</span>
            </dd>
          </div>
          <div>
            <dt>Life left</dt>
            <dd>
              <Glyph id="heart" size={16} filled /> {Math.max(0, state.sides[0].life)}
            </dd>
          </div>
          <div>
            <dt>Grafts</dt>
            <dd>{state.track.grafts}</dd>
          </div>
        </dl>
        <ul className="receipt-objectives">
          {setup.objectives.map((id) => {
            const o = ctx.objectives.get(id);
            const met = o !== undefined && objectiveMet(o, state, ctx.globals);
            return (
              <li key={id} data-met={met ? '' : undefined}>
                <Glyph id={met ? 'check' : 'cross'} size={18} />
                <span>{ctx.render(o?.text ?? id)}</span>
                <span className="sr-only">{met ? ' met' : ' not met'}</span>
              </li>
            );
          })}
        </ul>
        <p className="receipt-row" aria-label="Round row">
          {row}
        </p>
        <div className="stamp" role="img" aria-label={won ? 'Acquired' : 'Sealed in the vault'}>
          <Glyph id={won ? 'gavel' : 'vault'} size={26} />
          <span>{won ? 'ACQUIRED' : 'SEALED IN THE VAULT'}</span>
        </div>
      </article>

      {won && sig !== null && (
        <div className="binder-strip">
          <MiniCard view={sig} side="me" onTap={() => undefined} onLong={() => undefined} />
          <p>
            <Glyph id="check" size={16} /> Added to your Binder
            <br />
            <span className="muted">
              <Gem element={sig.element} /> {sig.name}
            </span>
          </p>
        </div>
      )}

      <div className="result-actions">
        <button type="button" className="btn primary" onClick={() => void share()}>
          <Glyph id="scroll" size={18} /> {copied === 'done' ? 'Shared' : copied === 'failed' ? 'Could not share' : 'Share'}
        </button>
        <button type="button" className="btn" disabled>
          Practice <span className="soon">Soon</span>
        </button>
        <button type="button" className="btn" disabled>
          Binder <span className="soon">Soon</span>
        </button>
      </div>
    </main>
  );
}
