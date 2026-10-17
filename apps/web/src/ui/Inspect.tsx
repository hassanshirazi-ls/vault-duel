// Card inspect (D-238): a bottom sheet on phones and tablets, a card in the ledger panel on wide screens (D-240).
// Content: art thumbnail, name, element and kind, Power/Guard, every keyword or Flaw with its
// rule, and the element's beats/weak-to line. All rule text comes through renderText (the view layer's `ctx.render`).
import type { Iid } from '@vault-duel/engine';
import type { ReactNode } from 'react';
import { cardView, elementMatchups } from '../view/cards';
import type { CardView } from '../view/cards';
import { Glyph } from '../visual/glyphs';
import { Art } from './Art';
import { useGame } from './context';
import { Gem } from './Gem';
import { FlawMark } from './MiniCard';
import { Sheet } from './Sheet';
import { elementStyle } from '../visual/elements';

/** The card details, without a container: the sheet and the wide-screen ledger panel both draw this. */
export function InspectCard({ iid, onClose, onSplit }: { readonly iid: Iid; readonly onClose?: (() => void) | undefined; readonly onSplit?: ((iid: Iid) => void) | undefined }) {
  const ctx = useGame((s) => s.ctx);
  const rt = useGame((s) => s.rt);
  const state = useGame((s) => s.state);
  const groups = useGame((s) => s.groups);
  if (ctx === null || rt === null || state === null) return null;
  const host = state.sides.flatMap((side) => side.board).find((m) => m !== null && m.iid === iid);
  const attached = host !== undefined && host !== null && host.sym >= 0 ? cardView(ctx, rt.engine, state, host.sym) : null;
  const canSplit = onSplit !== undefined && groups?.splits.has(iid) === true;
  const extra =
    attached === null && !canSplit ? undefined : (
      <>
        {attached !== null && <Attached c={attached} />}
        {canSplit && (
          <button type="button" className="btn" onClick={() => onSplit?.(iid)}>
            <Glyph id="split" size={18} /> Split
          </button>
        )}
      </>
    );
  return <CardDetail c={cardView(ctx, rt.engine, state, iid)} onClose={onClose} extra={extra} />;
}

/** The card attached under a host (D-308): shown in full, since attaching it is a public act. */
function Attached({ c }: { readonly c: CardView }) {
  const ctx = useGame((s) => s.ctx);
  if (ctx === null) return null;
  return (
    <section className="attached" aria-label={`Attached: ${c.name}`}>
      <h3>
        <Glyph id="link" size={16} /> Attached under it
      </h3>
      <p className="attached-name">
        <Gem element={c.element} /> <b>{c.name}</b>
        {c.kind !== null && <span className="dot"> · {c.kind}</span>}
      </p>
      <p className="muted">{ctx.render('The host gains +{SYMBIOSIS_GUARD_BONUS} Guard and, if it has room, this card\'s keyword. If the host leaves the board, this card comes out in its slot.')}</p>
      <ul className="inspect-kw">
        {c.keywords.map((k) => (
          <li key={k.id} data-flaw={k.flaw ? '' : undefined}>
            <span className="kw-glyph" data-flaw={k.flaw ? '' : undefined}>
              <Glyph id={k.icon} size={16} cracked={k.flaw} />
            </span>
            <span>
              <b>{k.name}</b>
              <br />
              {k.text}
            </span>
          </li>
        ))}
      </ul>
    </section>
  );
}

/** The detail layout for any card view; the Binder draws it from a definition (no duel instance). `extra` goes under the rule text. */
export function CardDetail({ c, onClose, extra }: { readonly c: CardView; readonly onClose?: (() => void) | undefined; readonly extra?: ReactNode }) {
  const ctx = useGame((s) => s.ctx);
  if (ctx === null) return null;
  const flaw = c.keywords.find((k) => k.flaw);
  const matchups = c.element === null ? null : elementMatchups(ctx, c.element.id);
  return (
      <div className="inspect">
        <div className="inspect-body">
        <div className="inspect-head">
          <div className="inspect-art mini" style={elementStyle(c.element?.id)}>
            <span className="mini-clip">
              <Art cardId={c.id} silhouette={c.silhouette} elementId={c.element?.id ?? null} />
            </span>
            {flaw !== undefined && <FlawMark flaw={flaw} />}
          </div>
          <div className="inspect-title">
            <h2>{c.name}</h2>
            <p className="inspect-sub">
              {c.element !== null && (
                <>
                  <Gem element={c.element} /> {c.element.name}
                </>
              )}
              {c.element !== null && c.kind !== null && <span className="dot"> · </span>}
              {c.kind !== null && <span>{c.kind}</span>}
              {c.isChimera && <span className="dot"> · Chimera</span>}
              {c.ascended && (
                <span className="inspect-asc">
                  <Glyph id="star" size={13} filled /> Ascended
                </span>
              )}
              {c.element === null && <span>{c.type}</span>}
            </p>
            {c.power !== null && (
              <p className="inspect-stats">
                <span className="stat p" aria-label={`Power ${c.power}`}>
                  <Glyph id="sword" size={18} /> <b>{c.power}</b>
                </span>
                <span className="stat g" aria-label={`Guard ${c.guard}`}>
                  <Glyph id="shield" size={18} /> <b>{c.guard}</b>
                </span>
              </p>
            )}
          </div>
        </div>
        {c.text !== null && <p className="inspect-text">{c.text}</p>}
        {extra}
        <ul className="inspect-kw">
          {c.keywords.map((k) => (
            <li key={k.id} data-flaw={k.flaw ? '' : undefined}>
              <span className="kw-glyph" data-flaw={k.flaw ? '' : undefined}>
                <Glyph id={k.icon} size={16} cracked={k.flaw} />
              </span>
              <span>
                <b>{k.name}</b>
                {k.flaw && <em> Flaw</em>}
                <br />
                {k.text}
              </span>
            </li>
          ))}
        </ul>
        {matchups !== null && (matchups.beats.length > 0 || matchups.weakTo.length > 0) && (
          <p className="inspect-match">
            {matchups.beats.length > 0 && (
              <span>
                Beats{' '}
                {matchups.beats.map((e) => (
                  <span key={e.id} className="chip">
                    <Gem element={e} /> {e.name}
                  </span>
                ))}
              </span>
            )}
            {matchups.weakTo.length > 0 && (
              <span>
                Weak to{' '}
                {matchups.weakTo.map((e) => (
                  <span key={e.id} className="chip">
                    <Gem element={e} /> {e.name}
                  </span>
                ))}
              </span>
            )}
          </p>
        )}
        </div>
        {onClose !== undefined && (
          <button type="button" className="btn ghost inspect-close" onClick={onClose}>
            <Glyph id="cross" /> Close
          </button>
        )}
      </div>
  );
}

export function Inspect({ iid, onClose, onSplit }: { readonly iid: Iid; readonly onClose: () => void; readonly onSplit?: ((iid: Iid) => void) | undefined }) {
  const ctx = useGame((s) => s.ctx);
  const rt = useGame((s) => s.rt);
  const state = useGame((s) => s.state);
  if (ctx === null || rt === null || state === null) return null;
  const c = cardView(ctx, rt.engine, state, iid);
  return (
    <Sheet modal onClose={onClose} label={`Card: ${c.name}`}>
      <InspectCard iid={iid} onClose={onClose} onSplit={onSplit} />
    </Sheet>
  );
}
