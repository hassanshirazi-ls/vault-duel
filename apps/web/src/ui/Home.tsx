// Home as an auction catalogue (D-238): "Lot of <date>", difficulty stars, the day's signature card on a velvet plinth,
// brass lines for the weekly twist, the Appraisal rounds and the bonus objectives, a deck list that folds open, and
// one large "Enter the vault" button, with Practice (after today's duel), Binder and Stats beneath it.
import { deckLine, definitionView } from '../view/cards';
import { Glyph } from '../visual/glyphs';
import { useGame } from './context';
import { Gem } from './Gem';
import { MiniCard } from './MiniCard';
import { useState } from 'react';

function lotDate(iso: string): string {
  const [y, m, d] = iso.split('-').map(Number);
  if (y === undefined || m === undefined || d === undefined) return iso;
  return new Date(y, m - 1, d).toLocaleDateString(undefined, { day: 'numeric', month: 'long', year: 'numeric' });
}

export function Home() {
  const ctx = useGame((s) => s.ctx);
  const setup = useGame((s) => s.setup);
  const source = useGame((s) => s.source);
  const start = useGame((s) => s.start);
  const dailyDone = useGame((s) => s.dailyDone);
  const startPractice = useGame((s) => s.startPractice);
  const openScreen = useGame((s) => s.openScreen);
  const [inspect, setInspect] = useState(false);
  if (ctx === null || setup === null) return null;
  const { difficulty } = setup;
  const g = ctx.globals;
  const twist = setup.twist >= 0 ? ctx.twistText[setup.twist] : undefined;
  const sig = definitionView(ctx, setup.signature);
  return (
    <main className="home">
      <header className="lot-head">
        <p className="eyebrow">Vault Duel · Auction catalogue</p>
        <h1>Lot of {lotDate(setup.date)}</h1>
        <p className="stars" role="img" aria-label={`Difficulty ${difficulty.stars} of ${g.DIFFICULTY_STAR_CUTS.length + 1} stars`}>
          {Array.from({ length: g.DIFFICULTY_STAR_CUTS.length + 1 }, (_, i) => (
            <span key={i} data-on={i < difficulty.stars ? '' : undefined}>
              <Glyph id="star" size={24} filled={i < difficulty.stars} />
            </span>
          ))}
          <span className="par">Par round {difficulty.par}</span>
        </p>
      </header>

      {sig !== null && (
        <section className="plinth" aria-label="Signature card of the day">
          <p className="eyebrow">Today's signature</p>
          <div className="plinth-card">
            <MiniCard view={sig} side="me" large onTap={() => setInspect((v) => !v)} onLong={() => setInspect((v) => !v)} />
          </div>
          <div className="plinth-base" />
          <p className="plinth-name">
            <Gem element={sig.element} /> {sig.name}
          </p>
          {inspect && sig.text !== null && <p className="muted">{sig.text}</p>}
        </section>
      )}

      <ul className="brass-lines">
        {twist !== undefined && (
          <li>
            <Glyph id="scroll" size={18} />
            <span>
              <b>Weekly twist</b> {ctx.render(twist)}
            </span>
          </li>
        )}
        {g.FLAGS.APPRAISAL && (
          <li>
            <Glyph id="gavel" size={18} />
            <span>
              <b>Appraisal rounds</b> {g.APPRAISAL_ROUNDS.join(' · ')}
            </span>
          </li>
        )}
        {setup.objectives.map((id) => (
          <li key={id}>
            <Glyph id="star" size={18} />
            <span>
              <b>Bonus</b> {ctx.render(ctx.objectives.get(id)?.text ?? id)}
            </span>
          </li>
        ))}
      </ul>

      <details className="deck">
        <summary>
          <Glyph id="scroll" size={18} /> Your deck ({setup.deckList.length})
        </summary>
        <ol>
          {setup.deckList.map((id, i) => {
            const c = deckLine(ctx, id);
            return (
              <li key={i}>
                {c.element !== null ? <Gem element={c.element} /> : <Glyph id={c.type === 'trap' ? 'trap' : 'spell'} size={16} />}
                <span className="deck-name">{c.name}</span>
                <span className="deck-type">{c.type}</span>
                {c.text !== null && <span className="deck-text">{c.text}</span>}
              </li>
            );
          })}
        </ol>
      </details>

      <button type="button" className="btn primary large" onClick={start}>
        <Glyph id="vault" size={24} /> Enter the vault
      </button>
      <nav className="home-links" aria-label="More">
        <button type="button" className="btn ghost" disabled={!dailyDone} onClick={startPractice}>
          <Glyph id={dailyDone ? 'sword' : 'lock'} size={18} />
          Practice
          {!dailyDone && <span className="soon">After today</span>}
        </button>
        <button type="button" className="btn ghost" onClick={() => openScreen('binder')}>
          <Glyph id="deck" size={18} />
          Binder
        </button>
        <button type="button" className="btn ghost" onClick={() => openScreen('stats')}>
          <Glyph id="scales" size={18} />
          Stats
        </button>
      </nav>
      {g.FLAGS.DEBUG_OVERLAY && source !== null && <p className="muted">Setup source: {source}</p>}
    </main>
  );
}
