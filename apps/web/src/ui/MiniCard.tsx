// The mini card (D-237, D-240, D-351, D-360): the art fills the card, and the name, the element badge, the keyword glyphs,
// the turn marks and Power/Guard are lettered onto it, with the stat in play reversed. Also used for the hand. Tap and long-press are handled by the caller's callbacks; this component draws and nothing else. A mouse
// hovering over it only reports `onHover` (a preview), never an action.
import { useLayoutEffect, useRef, useState } from 'react';
import type { CSSProperties } from 'react';
import type { Monster } from '@vault-duel/engine';
import type { CardView, KeywordView } from '../view/cards';
import { elementStyle } from '../visual/elements';
import { Glyph } from '../visual/glyphs';
import { frameFor } from '../visual/keywordFrame';
import { Art } from './Art';
import { Gem } from './Gem';
import { useLongPress } from './hooks';

/**
 * How a Flaw shows on a card (D-271, Flaw B): fracture lines through the ink frame and a chip missing from the top-left
 * corner; the art is untouched. On large cards a jagged black plate with the Flaw's name hangs on the
 * bottom edge (CSS shows it only there). The card must be `position: relative` (`.mini` is).
 */
export function FlawMark({ flaw }: { readonly flaw: KeywordView }) {
  return (
    <>
      <svg className="fx flaw-crack" viewBox="0 0 100 125" preserveAspectRatio="none" aria-hidden="true" focusable="false">
        <polygon className="chip" points="-1,-1 17,-1 12,6 15,10 8,12 9,18 -1,22" />
        <path d="M17 0 12 6 15 10 8 12 9 18 0 22M63 -1 60 4 64 7 62 12M101 46 96 50 98 55 94 60M26 126 30 120 26 116M-1 84 4 87 2 92" />
      </svg>
      <span className="flaw-plate">
        <Glyph id={flaw.icon} size={11} /> {flaw.name}
      </span>
    </>
  );
}

/** the smallest the name's font gets before the rest of the fit is a sideways squeeze (D-360) */
const NAME_MIN_SCALE = 0.82;

/**
 * The card name on one line, never shortened (D-360, owner: "one line only like Yu-Gi-Oh"). A name wider than its bar
 * first shrinks to NAME_MIN_SCALE of its size, then is squeezed sideways until it fits. Re-measured when the card
 * resizes and when the fonts arrive.
 */
function CardName({ name }: { readonly name: string }) {
  const box = useRef<HTMLSpanElement>(null);
  const text = useRef<HTMLSpanElement>(null);
  const [fit, setFit] = useState(1);
  const scaleOf = (f: number): number => Math.max(f, NAME_MIN_SCALE);
  useLayoutEffect(() => {
    const b = box.current;
    const t = text.current;
    if (b === null || t === null) return undefined;
    let current = 1;
    const measure = (): void => {
      const cs = getComputedStyle(b);
      const avail = b.clientWidth - parseFloat(cs.paddingLeft) - parseFloat(cs.paddingRight);
      // offsetWidth ignores the squeeze but follows the font size, so divide that back out
      const natural = t.offsetWidth / scaleOf(current);
      if (avail <= 0 || natural <= 0) return;
      const next = Math.min(1, (avail - 0.5) / natural);
      if (Math.abs(next - current) > 0.004) {
        current = next;
        setFit(next);
      }
    };
    measure();
    const ro = typeof ResizeObserver === 'undefined' ? null : new ResizeObserver(measure);
    ro?.observe(b);
    let alive = true;
    void document.fonts?.ready.then(() => {
      if (alive) measure();
    });
    return () => {
      alive = false;
      ro?.disconnect();
    };
  }, [name]);
  const scale = scaleOf(fit);
  return (
    <span className="mini-name" ref={box}>
      <span className="mini-name-text" ref={text} style={fit < 1 ? { fontSize: `${scale}em`, transform: `scaleX(${fit / scale})` } : undefined}>
        {name}
      </span>
    </span>
  );
}

export type Glow = 'target' | null;

export interface MiniCardProps {
  readonly view: CardView;
  readonly monster?: Monster | undefined;
  readonly side: 'me' | 'them';
  readonly onTap: () => void;
  readonly onLong: () => void;
  readonly glow?: Glow;
  readonly selected?: boolean;
  readonly dim?: boolean;
  readonly cue?: { readonly kind: string; readonly beat: number; readonly amount?: number | undefined } | undefined;
  readonly large?: boolean;
  readonly preview?: string | undefined;
  /** a glyph beside the preview text (Riposte shows a shield, a hidden Guard an eye), so the warning is never text alone */
  readonly previewIcon?: string | undefined;
  /** a labelled marker with an icon, for the Monarch's telegraph (D-266) */
  readonly mark?: { readonly icon: string; readonly label: string } | undefined;
  readonly style?: CSSProperties;
  readonly label?: string;
  /** can hit monsters but not life this turn (D-280) */
  readonly monstersOnly?: boolean;
  /** already used this turn's reposition: a position switch or a lane move (D-282) */
  readonly moved?: boolean;
  /** already attacked this turn (FLAGS.TURN_SLOTS, D-335: it can no longer move or switch either) */
  readonly attacked?: boolean;
  /** a monster the Monarch took by levy, crowned while it serves him (D-349): a small crown badge */
  readonly crowned?: boolean;
  /** the card attached under this monster (FLAGS.SYMBIOSIS, D-308): drawn as a small tab under the card */
  readonly symbiote?: CardView | null | undefined;
  /** a mouse entered or left the card; touch and pen never call this */
  readonly onHover?: ((on: boolean) => void) | undefined;
}

export function MiniCard({ view, monster, side, onTap, onLong, glow = null, selected = false, dim = false, cue, large = false, preview, previewIcon, mark, style, label, onHover, monstersOnly = false, moved = false, attacked = false, crowned = false, symbiote = null }: MiniCardProps) {
  const press = useLongPress(onTap, onLong);
  const frame = frameFor(view.keywords);
  const flaw = view.keywords.find((k) => k.flaw);
  const faceDown = monster?.faceDown === true;
  const unstable = monster !== undefined && monster.unstableUntil >= 0;
  const cueStyle = cue === undefined ? undefined : ({ '--b': cue.beat } as CSSProperties);
  const classes = ['mini', large ? 'large' : '', cue === undefined ? '' : `cue cue-${cue.kind}`].filter(Boolean).join(' ');
  const stat = (base: number | null): string => (base === null ? '' : String(base));
  const status = [monster === undefined ? '' : monster.pos === 0 ? 'Attack position' : 'Guard position', view.ascended ? 'Ascended' : '', unstable ? 'Unstable' : '', monstersOnly ? 'Can attack monsters, not life, this turn' : '', moved ? 'Already moved this turn' : '', attacked ? 'Already attacked this turn' : '', crowned ? 'Crowned' : '', symbiote === null ? '' : `${symbiote.name} attached`].filter(Boolean);
  return (
    <button
      type="button"
      className={classes}
      data-side={side}
      data-frame={frame.visual ?? undefined}
      data-flaw={frame.flawVisual ?? undefined}
      data-glow={glow ?? undefined}
      data-selected={selected ? '' : undefined}
      data-dim={dim ? '' : undefined}
      data-down={faceDown ? '' : undefined}
      data-unstable={unstable ? '' : undefined}
      data-pos={monster?.pos}
      data-sym={symbiote === null ? undefined : ''}
      data-attacked={attacked ? '' : undefined}
      style={{ ...elementStyle(view.element?.id), ...cueStyle, ...style }}
      aria-label={label ?? `${view.name}${view.power !== null ? `, Power ${stat(view.power)}, Guard ${stat(view.guard)}` : ''}${status.length > 0 ? `, ${status.join(', ')}` : ''}`}
      {...press}
      onPointerEnter={(e) => {
        if (e.pointerType === 'mouse') onHover?.(true);
      }}
      onPointerLeave={(e) => {
        press.onPointerLeave();
        if (e.pointerType === 'mouse') onHover?.(false);
      }}
    >
      <span className="fx fx-a" />
      <span className="fx fx-b" />
      {flaw !== undefined && <FlawMark flaw={flaw} />}
      <span className="mini-clip">
        <Art cardId={view.id} silhouette={view.silhouette} elementId={view.element?.id ?? null} />
        {faceDown && (
          <span className="down-mark">
            <Glyph id="facedown" size={26} />
          </span>
        )}
      </span>
      {/* D-360: the art fills the card. Name, icons and stats are lettered straight onto it (ink with a paper outline).
          The name is one line, never shortened (CardName squeezes a long one), with the icons and turn marks under it. */}
      <span className="mini-head">
        <CardName name={view.name} />
        <span className="mini-icons">
          <Gem element={view.element} />
          {view.element === null && (
            <span className="gem" style={elementStyle(null)}>
              <Glyph id={view.type === 'trap' ? 'trap' : 'spell'} size={14} />
            </span>
          )}
          {frame.glyphs.map((k) => (
            <span key={k.id} className="kw-glyph" data-flaw={k.flaw ? '' : undefined} title={k.name}>
              <Glyph id={k.icon} size={14} cracked={k.flaw} />
            </span>
          ))}
        </span>
        {(crowned || view.ascended || unstable || monstersOnly || moved || attacked) && (
          <span className="mini-marks">
            {crowned && (
              <span className="tag" data-crown="" role="img" aria-label="Crowned" title="Crowned">
                <Glyph id="crown" size={12} filled />
              </span>
            )}
            {view.ascended && (
              <span className="tag" title="Ascended">
                <Glyph id="star" size={12} filled />
              </span>
            )}
            {unstable && (
              <span className="tag" data-unstable="" title="Unstable">
                <Glyph id="spark" size={12} />
              </span>
            )}
            {monstersOnly && (
              <span className="tag" data-sick="" title="Can attack monsters, not life, this turn">
                <Glyph id="nolife" size={12} />
              </span>
            )}
            {moved && (
              <span className="tag" data-moved="" title="Already moved this turn">
                <Glyph id="swap" size={12} />
              </span>
            )}
            {attacked && (
              <span className="tag" data-attacked="" title="Already attacked this turn">
                <Glyph id="check" size={12} />
              </span>
            )}
          </span>
        )}
      </span>
      {view.power !== null && (
        <span className="mini-stats">
          {/* the stat in play is reversed (paper with an ink outline), so no Attack/Guard badge is needed */}
          <span className="stat p" data-on={monster?.pos === 0 ? '' : undefined} aria-hidden="true">
            <Glyph id="sword" size={12} />
            <b>{view.power}</b>
          </span>
          <span className="stat g" data-on={monster?.pos === 1 ? '' : undefined} aria-hidden="true">
            <Glyph id="shield" size={12} />
            <b>{view.guard}</b>
          </span>
        </span>
      )}
      {cue?.kind === 'graft' && (
        <>
          <span className="fx-smoke">
            <i />
            <i />
            <i />
          </span>
          <svg className="fx-stitch" viewBox="0 0 100 125" preserveAspectRatio="none" aria-hidden="true">
            <path pathLength="1" d="M2 62 14 74 26 52 38 74 50 52 62 74 74 52 86 74 98 60" />
          </svg>
        </>
      )}
      {symbiote !== null && (
        <span className="sym-tab" title={`${symbiote.name}, attached`}>
          <Glyph id="link" size={11} />
          <Gem element={symbiote.element} />
          <span className="sym-name">{symbiote.name}</span>
        </span>
      )}
      {cue?.kind === 'riposte' && (
        <span className="fx-riposte" aria-hidden="true">
          <Glyph id="shield" size={22} />
        </span>
      )}
      {cue?.kind === 'ambush' && (
        <span className="fx-ambush" aria-hidden="true">
          <Glyph id="spark" size={14} /> +{cue.amount ?? 0}
        </span>
      )}
      {preview !== undefined && (
        <span className="preview-badge" data-warn={previewIcon !== undefined ? '' : undefined}>
          {previewIcon !== undefined && <Glyph id={previewIcon} size={12} />} {preview}
        </span>
      )}
      {preview !== undefined && mark === undefined && (
        <span className="preview-badge" data-warn={previewIcon !== undefined ? '' : undefined}>
          {previewIcon !== undefined && <Glyph id={previewIcon} size={12} />} {preview}
        </span>
      )}
      {mark !== undefined && (
        <span className="preview-badge">
          <Glyph id={mark.icon} size={13} /> {mark.label}
        </span>
      )}
    </button>
  );
}

/** The back of a card the player cannot see (the Monarch's traps and face-down monsters). */
export function CardBack({ icon, label, onTap, glow = null, selected = false, mark, preview, previewIcon }: { readonly preview?: string | undefined; readonly previewIcon?: string | undefined; readonly icon: string; readonly label: string; readonly onTap?: (() => void) | undefined; readonly glow?: Glow; readonly selected?: boolean; readonly mark?: { readonly icon: string; readonly label: string } | undefined }) {
  return (
    <button type="button" className="mini back" aria-label={label} data-glow={glow ?? undefined} data-selected={selected ? '' : undefined} onClick={onTap} disabled={onTap === undefined}>
      <span className="mini-clip" />
      <span className="back-icon">
        <Glyph id={icon} size={28} />
      </span>
      {preview !== undefined && mark === undefined && (
        <span className="preview-badge" data-warn={previewIcon !== undefined ? '' : undefined}>
          {previewIcon !== undefined && <Glyph id={previewIcon} size={12} />} {preview}
        </span>
      )}
      {mark !== undefined && (
        <span className="preview-badge">
          <Glyph id={mark.icon} size={13} /> {mark.label}
        </span>
      )}
    </button>
  );
}
