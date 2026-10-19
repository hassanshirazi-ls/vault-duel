// Home as the Monarch's decree (D-238, D-273 menu A, D-350, D-351): the title, the tagline (D-353) and the decree's date,
// the big Daily duel plate (date, difficulty stars, Enter the vault / Resume / Today's result), then ink plates with a
// one-line italic subtitle: Practice (after today's duel), How to play, Bestiary, Stats (D-265). Everything about the day
// sits below them in a folding "Today's decree": the champion on its plinth, the weekly twist, the levy rounds, the bonus
// objectives and the deck list. The footer has the feedback link and the countdown to the next duel (local midnight).
import { deckLine, definitionView } from '../view/cards';
import { Glyph } from '../visual/glyphs';
import { useGame } from './context';
import { FeedbackLink } from './Feedback';
import { Gem } from './Gem';
import { MiniCard } from './MiniCard';
import { useEffect, useState } from 'react';
import { formatCountdown, minutesToNextDuel } from '../daily/date';

/** Under the title (D-353); the web manifest and the page meta description carry the same words. */
const TAGLINE = 'Defy the Monarch, a few minutes a day.';

function lotDate(iso: string): string {
  const [y, m, d] = iso.split('-').map(Number);
  if (y === undefined || m === undefined || d === undefined) return iso;
  return new Date(y, m - 1, d).toLocaleDateString(undefined, { day: 'numeric', month: 'long', year: 'numeric' });
}

function shortDate(iso: string): string {
  const [y, m, d] = iso.split('-').map(Number);
  if (y === undefined || m === undefined || d === undefined) return iso;
  return new Date(y, m - 1, d).toLocaleDateString(undefined, { weekday: 'short', day: 'numeric', month: 'short' });
}

/** "Next duel in 14h 12m": local midnight, checked every 30 seconds. */
function NextDuel() {
  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    const id = window.setInterval(() => setNow(new Date()), 30000);
    return () => window.clearInterval(id);
  }, []);
  return <span className="next-duel">Next duel in {formatCountdown(minutesToNextDuel(now))}</span>;
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
  const stars = g.DIFFICULTY_STAR_CUTS.length + 1;
  const twist = setup.twist >= 0 ? ctx.twistText[setup.twist] : undefined;
  const sig = definitionView(ctx, setup.signature);
  const plate = (icon: string, title: string, sub: string, onClick: () => void, opts: { disabled?: boolean } = {}) => (
    <button type="button" className="plate" disabled={opts.disabled} onClick={onClick}>
      <Glyph id={icon} size={22} />
      <span className="plate-text">
        <span className="plate-title">{title}</span>
        <span className="plate-sub">{sub}</span>
      </span>
    </button>
  );
  return (
    <main className="home">
      <header className="lot-head">
        <button type="button" className="btn ghost help" onClick={openHowTo} aria-label="How to play" title="How to play">
          <span aria-hidden="true">?</span>
        </button>
        <p className="eyebrow">Decree of {lotDate(setup.date)}</p>
        <h1>Vault Duel</h1>
        <p className="tagline">{TAGLINE}</p>
      </header>

      <button type="button" className="daily-plate" onClick={enterDaily}>
        <span className="daily-row">
          <span className="daily-title">Daily duel</span>
          <span className="daily-date">{shortDate(setup.date)}</span>
        </span>
        <span className="daily-row stars-row">
          <span className="stars" role="img" aria-label={`Difficulty ${difficulty.stars} of ${stars} stars`}>
            {Array.from({ length: stars }, (_, i) => (
              <span key={i} data-on={i < difficulty.stars ? '' : undefined}>
                <Glyph id="star" size={20} filled={i < difficulty.stars} />
              </span>
            ))}
          </span>
          <span className="par">Par round {difficulty.par}</span>
        </span>
        <span className="daily-go">
          <Glyph id="vault" size={22} /> {dailyLabel}
        </span>
      </button>

      <nav className="plates" aria-label="Main menu">
        {plate(
          dailyDone ? 'sword' : 'lock',
          'Practice',
          !dailyDone ? "Opens after today's duel" : practiceSaved ? 'Resume your unrecorded duel' : "Replay today's vault, unrecorded",
          practiceSaved ? continuePractice : startPractice,
          { disabled: !dailyDone },
        )}
        {plate('scroll', 'How to play', 'Rules, elements and a demo duel', openHowTo)}
        {plate('deck', 'Bestiary', "Every champion and Chimera you've met", () => openScreen('binder'))}
        {plate('scales', 'Stats', 'Streak, wins, best rounds', () => openScreen('stats'))}
      </nav>

      <details className="lot">
        <summary>
          <Glyph id="crown" size={20} />
          <span className="plate-text">
            <span className="plate-title">Today's decree</span>
            <span className="plate-sub">Champion, bonuses and your deck</span>
          </span>
        </summary>
        {sig !== null && (
          <section className="plinth" aria-label="Champion of the day">
            <p className="eyebrow">Today's champion</p>
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
              <Glyph id="crown" size={18} />
              <span>
                <b>Levy rounds</b> {g.APPRAISAL_ROUNDS.join(' · ')}
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
      </details>

      <footer className="home-foot">
        <FeedbackLink plain />
        <NextDuel />
      </footer>
      {g.FLAGS.DEBUG_OVERLAY && source !== null && <p className="muted">Setup source: {source}</p>}
    </main>
  );
}
