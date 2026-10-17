// The Bond options sheet and the Split preview (D-313). Everything listed comes from `engine.bondOptions(state)` (facts
// about each legal Graft, Split and Symbiosis); tapping a row performs its `steps` through the store, each step checked
// against the legal list first. A Graft row stops at the position step, so the Graft workbench opens to finish it.
import { useMemo, useState } from 'react';
import type { Iid } from '@vault-duel/engine';
import { BOND_ICON, bondView } from '../view/bond';
import type { BondFamily, BondRowView, PartView } from '../view/bond';
import { bondRanking } from '../view/rank';
import { Glyph } from '../visual/glyphs';
import { useGame } from './context';
import { Gem } from './Gem';
import { Sheet } from './Sheet';

export type BondMode = { readonly t: 'options' } | { readonly t: 'split'; readonly m: Iid };

function PartLine({ p, showPlace = true, showSym = true }: { readonly p: PartView; readonly showPlace?: boolean; readonly showSym?: boolean }) {
  return (
    <span className="bond-part">
      <Gem element={p.element} />
      <b className="bond-name">{p.name}</b>
      <span className="stat p" aria-label={`Power ${p.power}`}>
        <Glyph id="sword" size={14} /> <b>{p.power}</b>
      </span>
      <span className="stat g" aria-label={`Guard ${p.guard}`}>
        <Glyph id="shield" size={14} /> <b>{p.guard}</b>
      </span>
      {p.keywords.map((k) => (
        <span key={k.id} className="chip kw sm" data-flaw={k.flaw ? '' : undefined}>
          <Glyph id={k.icon} size={12} cracked={k.flaw} /> {k.name}
        </span>
      ))}
      {showPlace && (
        <span className="chip sm place" data-hand={p.inHand ? '' : undefined}>
          <Glyph id={p.inHand ? 'deck' : 'pos'} size={12} /> {p.place}
        </span>
      )}
      {showSym && p.symbiote !== null && (
        <span className="chip sm">
          <Glyph id="link" size={12} /> {p.symbiote}
        </span>
      )}
    </span>
  );
}

function Foot({ row, best, exposure = true }: { readonly row: BondRowView; readonly best: boolean; readonly exposure?: boolean }) {
  return (
    <>
      <span className="bond-foot">
        {exposure && (
          <span className="chip sm exposure" data-safe={row.exposure.safe ? '' : undefined} data-exposed={row.exposure.safe ? undefined : ''}>
            <Glyph id={row.exposure.icon} size={12} /> {row.exposure.text}
          </span>
        )}
        {row.deltas.map((d) => (
          <span key={d.icon + d.text} className="chip sm delta">
            <Glyph id={d.icon} size={12} /> {d.text}
          </span>
        ))}
        {row.cost !== '' && (
          <span className="chip sm">
            <Glyph id="scroll" size={12} /> {row.cost}
          </span>
        )}
      </span>
      {row.rank !== null && (
        <span className="bond-why" data-best={best ? '' : undefined}>
          <Glyph id={best ? 'star' : 'info'} size={12} filled={best} /> {row.rank.reason}
        </span>
      )}
    </>
  );
}

function Materials({ row }: { readonly row: BondRowView }) {
  if (row.kind !== 'graft') return null;
  return (
    <span className="bond-mats">
      {row.materials.map((m, i) => (
        <span key={m.iid} className="bond-mat">
          {i > 0 && <span className="plus">+</span>}
          <Gem element={m.element} /> {m.name}
          <span className="from" title={m.from === 'hand' ? 'From your hand' : 'Sacrificed from your board'}>
            <Glyph id={m.from === 'hand' ? 'deck' : 'tomb'} size={11} /> {m.from === 'hand' ? 'hand' : 'board'}
          </span>
        </span>
      ))}
    </span>
  );
}

function BestBadge() {
  return (
    <span className="best-badge">
      <Glyph id="star" size={12} filled /> Best
    </span>
  );
}

/** One tappable option: a Split or Symbiosis row, or one way of making a Graft. */
function Row({ row, best, onPick, nested = false, sameExposure = false }: { readonly row: BondRowView; readonly best: boolean; readonly onPick: (r: BondRowView) => void; readonly nested?: boolean; readonly sameExposure?: boolean }) {
  return (
    <button type="button" className="bond-row" data-kind={row.kind} data-best={best ? '' : undefined} data-nested={nested ? '' : undefined} onClick={() => onPick(row)}>
      {best && <BestBadge />}
      {nested ? (
        <Materials row={row} />
      ) : (
        <>
          {row.kind === 'symbiosis' ? (
            <>
              <span className="bond-line">
                <Glyph id="link" size={14} />
                <b className="bond-name">{row.materials[0]?.name}</b>
                <span className="muted">under</span>
              </span>
              {row.parts[0] !== undefined && <PartLine p={row.parts[0]} showSym={false} />}
              <span className="bond-gains">
                {row.gains.map((g) => (
                  <span key={g} className="chip sm gain">
                    <Glyph id="spark" size={12} /> {g}
                  </span>
                ))}
              </span>
            </>
          ) : row.kind === 'split' ? (
            <>
              <span className="bond-line">
                <Glyph id="split" size={14} />
                <b className="bond-name">{row.title}</b>
              </span>
              {row.parts.map((p) => (
                <PartLine key={p.iid} p={p} />
              ))}
            </>
          ) : (
            <>
              {row.parts[0] !== undefined && <PartLine p={row.parts[0]} showPlace={false} />}
              <Materials row={row} />
            </>
          )}
        </>
      )}
      <Foot row={row} best={best} exposure={!sameExposure} />
    </button>
  );
}

/** A Graft family: one result, several ways to make it. One way performs at once; several open a list of the ways. */
function Family({ fam, bestId, onPick }: { readonly fam: BondFamily; readonly bestId: string | null; readonly onPick: (r: BondRowView) => void }) {
  const [open, setOpen] = useState(false);
  if (fam.rows.length === 1) return <Row row={fam.head} best={fam.head.id === bestId} onPick={onPick} />;
  const hasBest = fam.rows.some((r) => r.id === bestId);
  const head = fam.head;
  return (
    <div className="bond-fam" data-open={open ? '' : undefined} data-best={hasBest ? '' : undefined}>
      <button type="button" className="bond-row fam-head" aria-expanded={open} onClick={() => setOpen(!open)}>
        {hasBest && <BestBadge />}
        {head.parts[0] !== undefined && <PartLine p={head.parts[0]} showPlace={false} />}
        <span className="bond-foot">
          <span className="chip sm ways">
            <Glyph id={open ? 'cross' : 'next'} size={12} /> {fam.rows.length} ways to make it
          </span>
          <span className="chip sm exposure" data-safe={head.exposure.safe ? '' : undefined} data-exposed={head.exposure.safe ? undefined : ''}>
            <Glyph id={head.exposure.icon} size={12} /> {head.exposure.text}
          </span>
        </span>
      </button>
      {open && (
        <div className="fam-rows">
          {fam.rows.map((r) => (
            <Row key={r.id} row={r} best={r.id === bestId} onPick={onPick} nested sameExposure={r.exposure.text === head.exposure.text} />
          ))}
        </div>
      )}
    </div>
  );
}

export function BondSheet({ mode, onClose }: { readonly mode: BondMode; readonly onClose: () => void }) {
  const ctx = useGame((s) => s.ctx);
  const rt = useGame((s) => s.rt);
  const state = useGame((s) => s.state);
  const perform = useGame((s) => s.performBond);
  const graftBegin = useGame((s) => s.groups?.graftBegin ?? null);
  const act = useGame((s) => s.act);
  const preview = useMemo(() => (rt === null || state === null ? null : rt.engine.bondOptions(state)), [rt, state]);
  const view = useMemo(() => {
    if (ctx === null || rt === null || state === null || preview === null) return null;
    return bondView(ctx, rt.engine, state, preview, bondRanking(ctx, rt.engine, state, preview));
  }, [ctx, rt, state, preview]);
  if (ctx === null || view === null) return null;

  const pick = (row: BondRowView): void => {
    onClose();
    perform(row.option.steps);
  };
  const bestId = view.best === null ? null : view.best.id;
  const bondOn = ctx.globals.FLAGS.BOND_ACTION;
  const slots = ctx.globals.FLAGS.TURN_SLOTS;
  // the Graft workbench, for picking the materials by hand (one Bond button for every bond, D-335)
  const manualGraft =
    graftBegin === null ? null : (
      <button
        type="button"
        className="btn bond-manual"
        onClick={() => {
          onClose();
          act(graftBegin);
        }}
      >
        <Glyph id="swap" size={16} /> Graft: pick materials yourself
      </button>
    );

  if (mode.t === 'split') {
    const row = view.groups.flatMap((g) => g.families).flatMap((f) => f.rows).find((r) => r.id === `split:${mode.m}`);
    return (
      <Sheet modal onClose={onClose} label="Split preview" className="bonds">
        <div className="bonds-body">
          <div className="bench-head">
            <h2>
              <Glyph id="split" size={20} /> {row === undefined ? 'Split' : row.title}
            </h2>
          </div>
          {row === undefined ? (
            <p className="muted">This cannot be split right now.</p>
          ) : (
            <>
              <p className="muted">It comes apart into the cards it was grafted from. They stand face-up where shown, and cannot attack or move this turn.</p>
              <ul className="bond-parts" aria-label="Parts">
                {row.parts.map((p) => (
                  <li key={p.iid}>
                    <PartLine p={p} />
                  </li>
                ))}
              </ul>
              <Foot row={row} best={false} />
            </>
          )}
          <div className="bench-actions">
            <button type="button" className="btn ghost" onClick={onClose}>
              <Glyph id="cross" size={18} /> Cancel
            </button>
            <button type="button" className="btn primary" disabled={row === undefined} onClick={() => row !== undefined && pick(row)}>
              <Glyph id="split" size={18} /> Split
            </button>
          </div>
        </div>
      </Sheet>
    );
  }

  return (
    <Sheet modal onClose={onClose} label="Bond options" className="bonds">
      <div className="bonds-body">
        <div className="bench-head">
          <h2>Bond options</h2>
          <button type="button" className="btn ghost" onClick={onClose}>
            <Glyph id="cross" size={16} /> Close
          </button>
        </div>
        <div className="bonds-scroll">
          <p className="muted bonds-note">
            {slots
              ? 'One bond each turn, at any point in it. It does not use your monster or spell slot.'
              : bondOn
                ? 'Each turn you may make one bond action, before your first attack.'
                : 'A bond action is your card play for the turn.'}{' '}
            Tap an option to do it. The result shown is what you would have afterwards.
          </p>
          {view.best !== null && view.best.rank !== null && (
            <button type="button" className="bonds-best" onClick={() => pick(view.best as BondRowView)}>
              <Glyph id="star" size={16} filled />
              <span>
                Best: <b>{view.best.title}</b> ({view.best.rank.reason}). Tap to do it.
              </span>
            </button>
          )}
          {view.empty && graftBegin === null && <p className="muted">No bond action is possible right now.</p>}
          {view.groups.map((g) => (
            <section key={g.kind} className="bond-group" aria-label={g.label}>
              <h3>
                <Glyph id={BOND_ICON[g.kind]} size={16} /> {g.label} <span className="count">{g.count}</span>
              </h3>
              {g.kind === 'graft' && manualGraft}
              {g.families.map((f) => (
                <Family key={f.key} fam={f} bestId={bestId} onPick={pick} />
              ))}
            </section>
          ))}
          {!view.groups.some((g) => g.kind === 'graft') && manualGraft}
        </div>
      </div>
    </Sheet>
  );
}
