// Result as a bill of sale (D-238): an ivory receipt with a wax stamp, the date, rounds against par, life left, the
// bonus objectives with check/cross, and the emoji round row exactly as it will be shared. Practice (D-247) gets a
// plain receipt instead: no stamp, no Share, and nothing in it was recorded.
import { useEffect, useState } from 'react';
import { definitionView } from '../view/cards';
import { objectiveMet, objectivesMet } from '../view/objectives';
import { roundRow } from '../view/roundRow';
import { browserShareEnv, sendShare, shareText } from '../view/share';
import type { ShareOutcome } from '../view/share';
import { Glyph } from '../visual/glyphs';
import { useGame } from './context';
import { Gem } from './Gem';
import { MiniCard } from './MiniCard';

const REASON: Readonly<Record<string, string>> = {
  collectorDefeated: 'The Collector is defeated.',
  playerDefeated: 'You fell.',
  vaultSealed: 'The vault sealed before you finished.',
};

const SHARE_LABEL: Readonly<Record<ShareOutcome | 'idle', string>> = {
  idle: 'Share',
  shared: 'Shared',
  copied: 'Copied to clipboard',
  cancelled: 'Share',
  failed: 'Could not share',
};

export function Result() {
  const state = useGame((s) => s.state);
  const setup = useGame((s) => s.setup);
  const ctx = useGame((s) => s.ctx);
  const mode = useGame((s) => s.mode);
  const binder = useGame((s) => s.binder);
  const startPractice = useGame((s) => s.startPractice);
  const leavePractice = useGame((s) => s.leavePractice);
  const openScreen = useGame((s) => s.openScreen);
  const [outcome, setOutcome] = useState<ShareOutcome | 'idle'>('idle');
  useEffect(() => {
    if (outcome === 'idle') return undefined;
    const t = window.setTimeout(() => setOutcome('idle'), 2400);
    return () => window.clearTimeout(t);
  }, [outcome]);
  if (state === null || state.result === null || setup === null || ctx === null) return null;
  const { result } = state;
  const won = result.winner === 0;
  const practice = mode === 'practice';
  const row = roundRow(state.track, result.round).join('');
  const sig = definitionView(ctx, setup.signature);
  const stars = objectivesMet(ctx, setup.objectives, state);
  const newFamilies = Object.keys(binder.families).filter((id) => binder.families[id] === setup.date);
  const share = async (): Promise<void> => {
    const text = shareText({
      date: setup.date,
      won,
      rounds: result.round,
      par: setup.difficulty.par,
      life: state.sides[0].life,
      stars,
      starsMax: setup.objectives.length,
      row,
      url: `${window.location.origin}${import.meta.env.BASE_URL}`,
    });
    setOutcome(await sendShare(text, browserShareEnv()));
  };
  return (
    <main className="result" data-practice={practice ? '' : undefined}>
      <article className={`receipt ${won ? 'won' : 'lost'} ${practice ? 'plain' : ''}`} aria-label={practice ? 'Practice receipt' : 'Bill of sale'}>
        <header>
          <p className="eyebrow">{practice ? 'Practice receipt · Unrecorded' : 'Bill of sale'}</p>
          <h1>{practice ? (won ? 'Practice won' : 'Practice lost') : won ? 'Lot acquired' : 'Lot sealed away'}</h1>
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
        {!practice && (
          <div className="stamp" role="img" aria-label={won ? 'Acquired' : 'Sealed in the vault'}>
            <Glyph id={won ? 'gavel' : 'vault'} size={26} />
            <span>{won ? 'ACQUIRED' : 'SEALED IN THE VAULT'}</span>
          </div>
        )}
      </article>

      {!practice && won && sig !== null && (
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
      {!practice && newFamilies.length > 0 && (
        <p className="binder-new">
          <Glyph id="swap" size={16} /> New Chimera family in your Binder: {newFamilies.map((id) => ctx.cards.get(id)?.name ?? id).join(', ')}
        </p>
      )}

      {practice ? (
        <div className="result-actions two">
          <button type="button" className="btn primary" onClick={startPractice}>
            <Glyph id="sword" size={18} /> Practice again
          </button>
          <button type="button" className="btn" onClick={leavePractice}>
            <Glyph id="back" size={18} /> Today's lot
          </button>
        </div>
      ) : (
        <div className="result-actions">
          <button type="button" className="btn primary share" onClick={() => void share()}>
            <Glyph id="scroll" size={18} /> {SHARE_LABEL[outcome]}
          </button>
          <p className="sr-only" role="status">
            {outcome === 'copied' ? 'Copied to clipboard' : outcome === 'shared' ? 'Shared' : ''}
          </p>
          <button type="button" className="btn" onClick={startPractice}>
            <Glyph id="sword" size={18} /> Practice
          </button>
          <button type="button" className="btn" onClick={() => openScreen('binder')}>
            <Glyph id="deck" size={18} /> Binder
          </button>
          <button type="button" className="btn" onClick={() => openScreen('stats')}>
            <Glyph id="scales" size={18} /> Stats
          </button>
        </div>
      )}
    </main>
  );
}
