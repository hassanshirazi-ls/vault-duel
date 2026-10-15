// The Collector's Ledger (D-247): an aged ledger page with the played / won / win % / streak figures in engraved serif,
// the current streak in red ink, average rounds against par, objective stars, and a rounds-used chart of inked tally
// bars with a "lost" row and today's row marked. Every number is derived from the per-day records (meta/stats.ts).
import { summarize } from '../meta/stats';
import { Glyph } from '../visual/glyphs';
import { useGame } from './context';
import { Page } from './Page';

/** Tally marks: groups of five (four strokes and a gate), then the remainder. */
function Tally({ n }: { readonly n: number }) {
  const groups = Math.floor(n / 5);
  const rest = n % 5;
  return (
    <span className="tally" aria-hidden="true">
      {Array.from({ length: groups }, (_, i) => (
        <span key={i} className="tally-gate">
          <i />
          <i />
          <i />
          <i />
          <b />
        </span>
      ))}
      {rest > 0 && (
        <span className="tally-gate">
          {Array.from({ length: rest }, (_, i) => (
            <i key={i} />
          ))}
        </span>
      )}
    </span>
  );
}

export function Stats() {
  const ctx = useGame((s) => s.ctx);
  const setup = useGame((s) => s.setup);
  const stats = useGame((s) => s.stats);
  const close = useGame((s) => s.closeScreen);
  if (ctx === null || setup === null) return null;
  const g = ctx.globals;
  const today = setup.date;
  const sum = summarize(stats.days, today, g.MAX_ROUNDS);
  const todayRec = stats.days[today];
  const rounds = Array.from({ length: g.MAX_ROUNDS }, (_, i) => i + 1);
  const figure = (label: string, value: string, extra?: { red?: boolean; glyph?: string }) => (
    <div className="fig" data-red={extra?.red === true ? '' : undefined}>
      <dt>{label}</dt>
      <dd>
        {extra?.glyph !== undefined && <Glyph id={extra.glyph} size={18} />}
        {value}
      </dd>
    </div>
  );
  const vsPar = sum.avgVsPar === null ? '-' : `${sum.avgVsPar > 0 ? '+' : ''}${sum.avgVsPar}`;
  return (
    <Page title="Ledger" onBack={close} className="stats-page">
      <article className="ledger" aria-label="The Collector's Ledger">
        <header>
          <p className="eyebrow">Bound in oxblood</p>
          <h2>The Collector's Ledger</h2>
        </header>
        <dl className="figs">
          {figure('Played', String(sum.played))}
          {figure('Won', String(sum.won))}
          {figure('Win rate', `${sum.winPct}%`)}
          {figure('Streak', String(sum.current), { red: true, glyph: 'flame' })}
          {figure('Best streak', String(sum.best))}
          {figure('Rounds vs par', vsPar)}
          {figure('Bonus stars', `${sum.stars}`, { glyph: 'star' })}
        </dl>
        <section className="chart" aria-label="Rounds used">
          <h3>Rounds used</h3>
          {sum.played === 0 && <p className="muted">No lots in the ledger yet. Win or lose today's duel to start it.</p>}
          <ol>
            {rounds.map((r) => {
              const n = sum.byRounds[r] ?? 0;
              const isToday = todayRec?.won === true && Math.min(todayRec.rounds, g.MAX_ROUNDS) === r;
              return (
                <li key={r} data-today={isToday ? '' : undefined}>
                  <span className="row-label">{r}</span>
                  <Tally n={n} />
                  <span className="row-count">{n}</span>
                  {isToday && (
                    <span className="today-mark">
                      <Glyph id="gavel" size={14} /> Today
                    </span>
                  )}
                </li>
              );
            })}
            <li className="lost-row" data-today={todayRec?.won === false ? '' : undefined}>
              <span className="row-label">
                <Glyph id="vault" size={14} /> Lost
              </span>
              <Tally n={sum.lost} />
              <span className="row-count">{sum.lost}</span>
              {todayRec?.won === false && (
                <span className="today-mark">
                  <Glyph id="gavel" size={14} /> Today
                </span>
              )}
            </li>
          </ol>
        </section>
      </article>
    </Page>
  );
}
