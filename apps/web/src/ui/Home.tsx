// Home as an auction catalogue (D-238): "Lot of <date>", difficulty stars, the day's signature card on a velvet plinth,
// brass lines for the weekly twist, the Appraisal rounds and the bonus objectives, a deck list that folds open, and
// the main menu beneath it (D-265): Daily duel (Play, Resume or Today's result), Practice (after today's duel), How to
// play, Binder and Stats.
import { deckLine, definitionView } from '../view/cards';
import { Glyph } from '../visual/glyphs';
import { useGame } from './context';
import { FeedbackLink } from './Feedback';
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
  const enterDaily = useGame((s) => s.enterDaily);
  const dailyDone = useGame((s) => s.dailyDone);
  const startPractice = useGame((s) => s.startPractice);
  const continuePractice = useGame((s) => s.continuePractice);
  const practiceSaved = useGame((s) => s.practiceSaved);
  const mode = useGame((s) => s.mode);
  const state = useGame((s) => s.state);
  const actions = useGame((s) => s.actions);
  const daily = useGame((s) => s.daily);
  const openScreen = useGame((s) => s.openScreen);
  const openHowTo = useGame((s) => s.openHowTo);
  const [inspect, setInspect] = useState(false);
  if (ctx === null || setup === null) return null;
  const { difficulty } = setup;
  // while Practice is the running duel the daily one waits in `daily`
  const dailyState = mode === 'daily' ? state : (daily?.state ?? null);
  const dailyMoves = mode === 'daily' ? actions.length : (daily?.actions.length ?? 0);
  const dailyLabel = dailyState?.result != null ? "Today's result" : dailyState !== null && dailyMoves > 0 ? 'Resume' : 'Enter the vault';
  const g = ctx.globals;
  const twist = setup.twist >= 0 ? ctx.twistText[setup.twist] : undefined;
  const sig = definitionView(ctx, setup.signature);
  return (
    <main className="home">
      <header className="lot-head">
        <button type="button" className="btn ghost help" onClick={openHowTo} aria-label="How to play" title="How to play">
          <span aria-hidden="true">?</span>
        </button>
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

      <nav className="home-links menu" aria-label="Main menu">
        <button type="button" className="btn primary large" onClick={enterDaily}>
          <Glyph id="vault" size={24} />
          <span className="entry">
            Daily duel
            <span className="soon">{dailyLabel}</span>
          </span>
        </button>
        <button type="button" className="btn" disabled={!dailyDone} onClick={practiceSaved ? continuePractice : startPractice}>
          <Glyph id={dailyDone ? 'sword' : 'lock'} size={18} />
          <span className="entry">
            Practice
            <span className="soon">{!dailyDone ? 'After today' : practiceSaved ? 'Resume' : 'Unrecorded'}</span>
          </span>
        </button>
        <button type="button" className="btn" onClick={openHowTo}>
          <Glyph id="scroll" size={18} />
          <span className="entry">How to play</span>
        </button>
        <button type="button" className="btn" onClick={() => openScreen('binder')}>
          <Glyph id="deck" size={18} />
          <span className="entry">Binder</span>
        </button>
        <button type="button" className="btn" onClick={() => openScreen('stats')}>
          <Glyph id="scales" size={18} />
          <span className="entry">Stats</span>
        </button>
      </nav>
      <FeedbackLink />
      {g.FLAGS.DEBUG_OVERLAY && source !== null && <p className="muted">Setup source: {source}</p>}
    </main>
  );
}
