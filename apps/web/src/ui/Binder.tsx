// The Bestiary (D-238, D-350; the code still says Binder): two tabs. Champions is a month calendar with a thumbnail of the day's champion on won days
// (lost and unplayed days stay dark). Chimeras is the kind-pair triangle built from the content's kinds, with discovered
// families painted and undiscovered ones as labelled silhouettes; tapping a cell shows the card and its recipe.
import { useState } from 'react';
import type { CSSProperties } from 'react';
import { buildMonth, monthOf, shiftMonth } from '../meta/calendar';
import { familyCells } from '../meta/chimera';
import type { FamilyCell } from '../meta/chimera';
import { definitionView } from '../view/cards';
import type { CardView } from '../view/cards';
import { elementStyle } from '../visual/elements';
import { Glyph, Silhouette } from '../visual/glyphs';
import { Art } from './Art';
import { useGame } from './context';
import { CardDetail } from './Inspect';
import { Page } from './Page';
import { Sheet } from './Sheet';

type Tab = 'signatures' | 'chimeras';

function Signatures({ onOpen }: { readonly onOpen: (id: string, date: string) => void }) {
  const ctx = useGame((s) => s.ctx);
  const setup = useGame((s) => s.setup);
  const binder = useGame((s) => s.binder);
  const stats = useGame((s) => s.stats);
  const [shown, setShown] = useState(() => monthOf(setup?.date ?? '1970-01-01'));
  if (ctx === null || setup === null) return null;
  const cur = monthOf(setup.date);
  const month = buildMonth(shown.year, shown.month);
  const title = new Date(shown.year, shown.month - 1, 1).toLocaleDateString(undefined, { month: 'long', year: 'numeric' });
  const weekdays = Array.from({ length: 7 }, (_, i) => new Date(Date.UTC(2024, 0, 1 + i)).toLocaleDateString(undefined, { weekday: 'narrow', timeZone: 'UTC' }));
  const isCurrent = shown.year === cur.year && shown.month === cur.month;
  const won = month.days.filter((d) => binder.signatures[d.date] !== undefined).length;
  return (
    <section aria-label="Champions">
      <div className="month-nav">
        <button type="button" className="btn ghost icon" aria-label="Previous month" onClick={() => setShown(shiftMonth(shown, -1))}>
          <Glyph id="back" size={22} />
        </button>
        <h2>{title}</h2>
        <button type="button" className="btn ghost icon" aria-label="Next month" disabled={isCurrent} onClick={() => setShown(shiftMonth(shown, 1))}>
          <Glyph id="next" size={22} />
        </button>
      </div>
      <ol className="cal" aria-label={`${title}, ${won} champions`}>
        {weekdays.map((w, i) => (
          <li key={`w${i}`} className="cal-wd" aria-hidden="true">
            {w}
          </li>
        ))}
        {Array.from({ length: month.lead }, (_, i) => (
          <li key={`b${i}`} aria-hidden="true" />
        ))}
        {month.days.map((d) => {
          const sig = binder.signatures[d.date];
          const view = sig === undefined ? null : definitionView(ctx, sig);
          const rec = stats.days[d.date];
          const isToday = d.date === setup.date;
          if (view === null) {
            const state = rec === undefined ? (d.date > setup.date ? 'upcoming' : 'not played') : rec.won ? 'won' : 'lost';
            return (
              <li key={d.date} className="cal-day dark" data-today={isToday ? '' : undefined} aria-label={`${d.day}, ${state}`}>
                <span className="cal-n">{d.day}</span>
              </li>
            );
          }
          return (
            <li key={d.date} className="cal-day won" data-today={isToday ? '' : undefined}>
              <button type="button" className="cal-btn" aria-label={`${d.day}, won: ${view.name}`} style={elementStyle(view.element?.id)} onClick={() => onOpen(view.id, d.date)}>
                <span className="cal-art">
                  <Art cardId={view.id} silhouette={view.silhouette} elementId={view.element?.id ?? null} />
                </span>
                <span className="cal-n">{d.day}</span>
              </button>
            </li>
          );
        })}
      </ol>
    </section>
  );
}

function Chimeras({ onOpen }: { readonly onOpen: (cell: FamilyCell) => void }) {
  const ctx = useGame((s) => s.ctx);
  const binder = useGame((s) => s.binder);
  if (ctx === null) return null;
  const cells = familyCells(ctx);
  const found = cells.filter((c) => c.recipe !== null && binder.families[c.recipe.id] !== undefined).length;
  const n = ctx.kindOrder.length;
  const kindHead = (id: string, axis: 'col' | 'row', idx: number) => {
    const k = ctx.kinds.get(id);
    return (
      <div key={`${axis}${id}`} className={`tri-head ${axis}`} style={axis === 'col' ? { gridColumn: idx + 2, gridRow: 1 } : { gridColumn: 1, gridRow: idx + 2 }}>
        <Silhouette id={k?.silhouette ?? 'chimera'} className="tri-sil" />
        <span>{k?.name ?? id}</span>
      </div>
    );
  };
  return (
    <section aria-label="Chimeras">
      <p className="tri-count">
        <Glyph id="deck" size={16} /> {found} of {cells.length} families discovered
      </p>
      <div className="tri" style={{ '--n': n } as CSSProperties}>
        {ctx.kindOrder.map((id, i) => kindHead(id, 'col', i))}
        {ctx.kindOrder.map((id, i) => kindHead(id, 'row', i))}
        {cells.map((c) => {
          const known = c.recipe !== null && binder.families[c.recipe.id] !== undefined;
          const names = c.kinds.map((k) => ctx.kinds.get(k)?.name ?? k);
          const label = known && c.recipe !== null ? c.recipe.name : `Undiscovered: ${names.join(' and ')}`;
          const sil = ctx.kinds.get(c.kinds[0])?.silhouette ?? 'chimera';
          return (
            <button
              key={`${c.row}-${c.col}`}
              type="button"
              className="tri-cell"
              data-known={known ? '' : undefined}
              style={{ gridColumn: c.col + 2, gridRow: c.row + 2 }}
              aria-label={label}
              onClick={() => onOpen(c)}
            >
              <Silhouette id={known ? 'chimera' : sil} className="tri-fig" />
              <span className="tri-name">{known && c.recipe !== null ? c.recipe.name : names.join(' + ')}</span>
              {!known && <Glyph id="lock" size={12} className="tri-lock" />}
            </button>
          );
        })}
      </div>
    </section>
  );
}

function FamilySheet({ cell, onClose }: { readonly cell: FamilyCell; readonly onClose: () => void }) {
  const ctx = useGame((s) => s.ctx);
  const binder = useGame((s) => s.binder);
  if (ctx === null) return null;
  const names = cell.kinds.map((k) => ctx.kinds.get(k)?.name ?? k);
  const recipe = cell.recipe;
  const first = recipe === null ? undefined : binder.families[recipe.id];
  const view: CardView | null = recipe !== null && first !== undefined ? definitionView(ctx, recipe.id) : null;
  const recipeLine = (
    <p className="recipe-line">
      <Glyph id="swap" size={16} /> <b>Recipe</b> {names.join(' + ')}
      {first !== undefined && <span className="muted"> · found {first}</span>}
    </p>
  );
  return (
    <Sheet modal onClose={onClose} label={view === null ? `Undiscovered family: ${names.join(' and ')}` : `Family: ${view.name}`}>
      {view !== null ? (
        <CardDetail c={view} onClose={onClose} extra={recipeLine} />
      ) : (
        <div className="inspect">
          <div className="inspect-body">
            <div className="inspect-head">
              <div className="inspect-art mini" style={elementStyle(null)}>
                <span className="mini-clip">
                  <Art cardId={`unknown-${cell.row}-${cell.col}`} silhouette={ctx.kinds.get(cell.kinds[0])?.silhouette ?? 'chimera'} elementId={null} />
                </span>
              </div>
              <div className="inspect-title">
                <h2>Undiscovered</h2>
                <p className="inspect-sub">Chimera family</p>
              </div>
            </div>
            {recipeLine}
            <p className="inspect-text">Graft this pair in a counted duel to add it to your Bestiary.</p>
          </div>
          <button type="button" className="btn ghost inspect-close" onClick={onClose}>
            <Glyph id="cross" /> Close
          </button>
        </div>
      )}
    </Sheet>
  );
}

export function Binder() {
  const ctx = useGame((s) => s.ctx);
  const close = useGame((s) => s.closeScreen);
  const [tab, setTab] = useState<Tab>('signatures');
  const [sig, setSig] = useState<{ id: string; date: string } | null>(null);
  const [cell, setCell] = useState<FamilyCell | null>(null);
  if (ctx === null) return null;
  const sigView = sig === null ? null : definitionView(ctx, sig.id);
  return (
    <Page title="Bestiary" onBack={close} className="binder-page">
      <div className="tabs" role="tablist" aria-label="Bestiary">
        {(['signatures', 'chimeras'] as const).map((t) => (
          <button key={t} type="button" role="tab" aria-selected={tab === t} className="tab" onClick={() => setTab(t)}>
            <Glyph id={t === 'signatures' ? 'scroll' : 'swap'} size={18} /> {t === 'signatures' ? 'Champions' : 'Chimeras'}
          </button>
        ))}
      </div>
      {tab === 'signatures' ? <Signatures onOpen={(id, date) => setSig({ id, date })} /> : <Chimeras onOpen={setCell} />}
      {sigView !== null && sig !== null && (
        <Sheet modal onClose={() => setSig(null)} label={`Champion: ${sigView.name}`}>
          <CardDetail
            c={sigView}
            onClose={() => setSig(null)}
            extra={
              <p className="recipe-line">
                <Glyph id="crown" size={16} /> <b>Defied</b> {sig.date}
              </p>
            }
          />
        </Sheet>
      )}
      {cell !== null && <FamilySheet cell={cell} onClose={() => setCell(null)} />}
    </Page>
  );
}
