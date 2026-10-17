// Graft workbench sheet (D-238). It is driven entirely by the pending-choice actions in the legal list and by
// `previewGraft()`; Cancel is `graftCancel`, the order swap is `graftSwap` (cancel, begin, pick, pick, all legal).
// The board stays live above it: Duel makes the legal material cards glow and routes their taps to `graftPick`.
import { Fragment, useState } from 'react';
import type { Action, Iid } from '@vault-duel/engine';
import { ASCEND_HINT, UNSTABLE_WARNING } from '../view/copy';
import { cardView } from '../view/cards';
import { POSITION_LABEL } from '../view/legal';
import { graftPreviewView } from '../view/status';
import { Glyph } from '../visual/glyphs';
import { useGame } from './context';
import { Gem } from './Gem';
import { useLongPress } from './hooks';
import { MiniCard } from './MiniCard';
import type { CardView } from '../view/cards';
import { Sheet } from './Sheet';

const STAGE_HINT: Readonly<Record<string, string>> = {
  mat1: 'Tap a glowing card for the first material.',
  mat2: 'Tap a glowing card for the second material.',
  ascend: '',
  keywords: 'Choose which keywords the Chimera inherits.',
  position: 'Choose how it enters the board.',
};

/** A filled material slot: a tap takes the material out again, holding it inspects it. */
function MaterialSlot({ n, view, active, onTake, onLong }: { readonly n: number; readonly view: CardView | null; readonly active: boolean; readonly onTake: () => void; readonly onLong: () => void }) {
  const press = useLongPress(onTake, onLong);
  return (
    <button
      type="button"
      className="slot"
      data-filled={view !== null ? '' : undefined}
      data-active={active ? '' : undefined}
      disabled={view === null}
      aria-label={view === null ? undefined : `${view.name}, material ${n}. Tap to take it out.`}
      {...(view === null ? {} : press)}
    >
      <span className="slot-n">{n}</span>
      {view === null ? (
        <span className="slot-empty">{n === 3 ? 'Ascend' : 'Tap a card'}</span>
      ) : (
        <span className="slot-card">
          <Gem element={view.element} />
          <span className="slot-name">{view.name}</span>
          <span className="slot-stats">
            <Glyph id="sword" size={11} /> {view.power} <Glyph id="shield" size={11} /> {view.guard}
          </span>
          <span className="slot-take">
            <Glyph id="cross" size={12} />
          </span>
        </span>
      )}
    </button>
  );
}

export function GraftSheet({ onInspect }: { readonly onInspect: (iid: Iid) => void }) {
  const ctx = useGame((s) => s.ctx);
  const rt = useGame((s) => s.rt);
  const state = useGame((s) => s.state);
  const groups = useGame((s) => s.groups);
  const act = useGame((s) => s.act);
  const swap = useGame((s) => s.graftSwap);
  const unpick = useGame((s) => s.graftUnpick);
  const [chips, setChips] = useState<readonly string[]>([]);
  const [wantPos, setWantPos] = useState<0 | 1>(0);
  if (ctx === null || rt === null || state === null || groups === null || state.pending === null) return null;
  const { pending } = state;
  const g = ctx.globals;
  const preview = graftPreviewView(ctx, rt.engine, state);
  const cancel = (): void => {
    if (groups.graftCancel !== null) act(groups.graftCancel);
  };
  const slotCount = g.FLAGS.ASCEND && (pending.stage === 'ascend' || pending.mats.length > 2) ? g.MAX_GRAFT_MATERIALS : 2;
  const handPicks = state.sides[0].hand.filter((iid) => groups.graftPicks.has(iid) || pending.mats.includes(iid));
  const canSwap = pending.mats.length === 2 && pending.stage !== 'mat1' && pending.stage !== 'mat2';

  // keyword choice: chips toggle; a selection of the allowed size must match one of the legal graftKeywords actions
  const maxKw = g.MAX_INHERITED_KEYWORDS;
  const maskOf = (ids: readonly string[]): number => ids.reduce((m, id) => m | (1 << (ctx.content.kwBit[id] ?? 0)), 0);
  const available = new Set(preview?.available.map((k) => k.id));
  const picked = chips.filter((id) => available.has(id));
  const chosen: Extract<Action, { t: 'graftKeywords' }> | undefined =
    picked.length === maxKw ? groups.graftKeywords.find((a) => a.kw === maskOf(picked)) : undefined;
  // the last step with lanes on (D-284): graftPosition carries a lane, so pick the position, then the lane
  const laned = groups.graftPositions.filter((a) => a.lane !== undefined);
  const lanedPos = new Set(laned.map((a) => a.pos));
  const pos: 0 | 1 = lanedPos.has(wantPos) || lanedPos.size === 0 ? wantPos : lanedPos.has(0) ? 0 : 1;
  const toggle = (id: string): void =>
    setChips((cur) => (cur.includes(id) ? cur.filter((x) => x !== id) : [...cur, id].slice(-maxKw)));

  return (
    <Sheet modal={false} onClose={cancel} label="Graft workbench" className="workbench">
      <div className="bench">
        <div className="bench-head">
          <h2>Graft workbench</h2>
          <button type="button" className="btn ghost" onClick={cancel} disabled={groups.graftCancel === null}>
            <Glyph id="cross" size={16} /> Cancel
          </button>
        </div>

        <div className="slots">
          {Array.from({ length: slotCount }, (_, i) => {
            const iid = pending.mats[i];
            const view = iid === undefined ? null : cardView(ctx, rt.engine, state, iid);
            const active = iid === undefined && i === pending.mats.length;
            return (
              <Fragment key={`slot-${i}`}>
                <MaterialSlot n={i + 1} view={view} active={active} onTake={() => iid !== undefined && unpick(iid)} onLong={() => iid !== undefined && onInspect(iid)} />
                {i === 0 && (
                  <button type="button" className="swap" onClick={swap} disabled={!canSwap} aria-label="Swap the order of the materials" title="Swap order">
                    <Glyph id="swap" size={20} />
                  </button>
                )}
              </Fragment>
            );
          })}
        </div>

        <div className="bench-scroll">
        <div className="preview" aria-live="polite">
          {preview === null ? (
            <p className="muted">{STAGE_HINT[pending.stage] ?? ''}</p>
          ) : (
            <>
              <div className="preview-row">
                <h3>{preview.name}</h3>
                {preview.ascended && (
                  <span className="chip">
                    <Glyph id="star" size={13} filled /> Ascended
                  </span>
                )}
              </div>
              <div className="preview-row">
                <span className="chip" title="Element comes from slot 1">
                  <Gem element={preview.element} /> {preview.element?.name ?? ''}
                </span>
                <span className="stat p">
                  <Glyph id="sword" size={16} /> <b>{preview.power}</b>
                </span>
                <span className="stat g">
                  <Glyph id="shield" size={16} /> <b>{preview.guard}</b>
                </span>
              </div>
              {preview.keywords.length > 0 && (
                <div className="preview-row">
                  {preview.keywords.map((k) => (
                    <span key={k.id} className="chip kw">
                      <Glyph id={k.icon} size={14} /> {k.name}
                    </span>
                  ))}
                </div>
              )}
              {preview.unstable && (
                <p className="unstable">
                  <Glyph id="spark" size={18} /> {ctx.render(UNSTABLE_WARNING)}
                </p>
              )}
              {pending.stage === 'ascend' && <p className="muted">{ctx.render(ASCEND_HINT)}</p>}
              {STAGE_HINT[pending.stage] !== undefined && pending.stage !== 'ascend' && <p className="muted">{STAGE_HINT[pending.stage]}</p>}
            </>
          )}
        </div>

        {pending.stage === 'keywords' && preview !== null && (
          <div className="kw-pick">
            {preview.available.map((k) => (
              <button
                key={k.id}
                type="button"
                className="chip kw pick"
                data-on={picked.includes(k.id) ? '' : undefined}
                aria-pressed={picked.includes(k.id)}
                onClick={() => toggle(k.id)}
              >
                <Glyph id={k.icon} size={16} /> {k.name}
                {picked.includes(k.id) && <Glyph id="check" size={14} />}
              </button>
            ))}
          </div>
        )}

        {handPicks.length > 0 && (
          <div className="bench-hand" aria-label="Materials in your hand">
            {handPicks.map((iid) => (
              <MiniCard
                key={`h-${iid}`}
                view={cardView(ctx, rt.engine, state, iid)}
                side="me"
                glow={pending.mats.includes(iid) ? null : 'target'}
                selected={pending.mats.includes(iid)}
                onTap={() => (pending.mats.includes(iid) ? unpick(iid) : act(groups.graftPicks.get(iid) as Action))}
                onLong={() => onInspect(iid)}
              />
            ))}
          </div>
        )}

        </div>

        <div className="bench-actions" data-lanes={laned.length > 0 ? '' : undefined}>
          {pending.stage === 'ascend' && groups.graftSkipAscend !== null && (
            <button type="button" className="btn primary" onClick={() => act(groups.graftSkipAscend as Action)}>
              <Glyph id="check" size={18} /> Graft
            </button>
          )}
          {pending.stage === 'keywords' && (
            <button type="button" className="btn primary" disabled={chosen === undefined} onClick={() => chosen !== undefined && act(chosen)}>
              <Glyph id="check" size={18} /> Keep these
            </button>
          )}
          {pending.stage === 'position' && laned.length > 0 && (
            <>
              <div className="lane-pos" role="group" aria-label="Position">
                {([0, 1] as const).map((p) => (
                  <button
                    key={p}
                    type="button"
                    className="toggle sq"
                    aria-pressed={pos === p}
                    aria-label={POSITION_LABEL[p]}
                    title={POSITION_LABEL[p]}
                    disabled={!lanedPos.has(p)}
                    onClick={() => setWantPos(p)}
                  >
                    <Glyph id={p === 0 ? 'sword' : 'shield'} size={22} />
                  </button>
                ))}
              </div>
              <div className="lane-pick" role="group" aria-label="Lane">
                {laned
                  .filter((a) => a.pos === pos)
                  .map((a) => (
                    <button key={`${a.pos}-${a.lane}`} type="button" className="btn primary" aria-label={`Graft into lane ${(a.lane ?? 0) + 1}`} onClick={() => act(a)}>
                      <Glyph id="pos" size={16} /> {(a.lane ?? 0) + 1}
                    </button>
                  ))}
              </div>
            </>
          )}
          {pending.stage === 'position' &&
            groups.graftPositions.filter((a) => a.lane === undefined).map((a) => (
              <button key={a.pos} type="button" className="btn primary" onClick={() => act(a)}>
                <Glyph id={a.pos === 0 ? 'sword' : 'shield'} size={18} /> Graft · {POSITION_LABEL[a.pos].replace(' position', '')}
              </button>
            ))}
          {(pending.stage === 'mat1' || pending.stage === 'mat2') && (
            <button type="button" className="btn primary" disabled>
              <Glyph id="check" size={18} /> Graft
            </button>
          )}
        </div>
      </div>
    </Sheet>
  );
}
