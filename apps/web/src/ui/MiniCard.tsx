// The mini card (D-237): art, name, Power/Guard, element gem, keyword frame and corner glyphs. Also used for the
// hand. Tap and long-press are handled by the caller's callbacks; this component draws and nothing else.
import type { CSSProperties } from 'react';
import type { Monster } from '@vault-duel/engine';
import type { CardView } from '../view/cards';
import { elementStyle } from '../visual/elements';
import { Glyph } from '../visual/glyphs';
import { frameFor } from '../visual/keywordFrame';
import { Art } from './Art';
import { Gem } from './Gem';
import { useLongPress } from './hooks';

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
  readonly cue?: { readonly kind: string; readonly beat: number } | undefined;
  readonly large?: boolean;
  readonly preview?: string | undefined;
  readonly style?: CSSProperties;
  readonly label?: string;
}

export function MiniCard({ view, monster, side, onTap, onLong, glow = null, selected = false, dim = false, cue, large = false, preview, style, label }: MiniCardProps) {
  const press = useLongPress(onTap, onLong);
  const frame = frameFor(view.keywords);
  const faceDown = monster?.faceDown === true;
  const unstable = monster !== undefined && monster.unstableUntil >= 0;
  const cueStyle = cue === undefined ? undefined : ({ '--b': cue.beat } as CSSProperties);
  const classes = ['mini', large ? 'large' : '', cue === undefined ? '' : `cue cue-${cue.kind}`].filter(Boolean).join(' ');
  const stat = (base: number | null): string => (base === null ? '' : String(base));
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
      data-pos={monster?.pos}
      style={{ ...elementStyle(view.element?.id), ...cueStyle, ...style }}
      aria-label={label ?? `${view.name}${view.power !== null ? `, Power ${stat(view.power)}, Guard ${stat(view.guard)}` : ''}`}
      {...press}
    >
      <span className="fx fx-a" />
      <span className="fx fx-b" />
      <span className="mini-clip">
        <Art cardId={view.id} silhouette={view.silhouette} elementId={view.element?.id ?? null} />
        <span className="mini-shade" />
        {faceDown && (
          <span className="down-mark">
            <Glyph id="facedown" size={26} />
          </span>
        )}
      </span>
      <span className="mini-gem">
        <Gem element={view.element} />
        {view.element === null && (
          <span className="gem" style={elementStyle(null)}>
            <Glyph id={view.type === 'trap' ? 'trap' : 'spell'} size={14} />
          </span>
        )}
      </span>
      <span className="mini-tags">
        {monster !== undefined && (
          <span className="tag" title={monster.pos === 0 ? 'Attack position' : 'Guard position'}>
            <Glyph id={monster.pos === 0 ? 'sword' : 'shield'} size={12} />
          </span>
        )}
        {view.ascended && (
          <span className="tag" title="Ascended">
            <Glyph id="star" size={12} filled />
          </span>
        )}
        {unstable && (
          <span className="tag" data-warn="" title="Unstable">
            <Glyph id="brittle" size={12} />
          </span>
        )}
      </span>
      <span className="mini-kw">
        {frame.glyphs.map((k) => (
          <span key={k.id} className="kw-glyph" data-flaw={k.flaw ? '' : undefined} title={k.name}>
            <Glyph id={k.icon} size={14} cracked={k.flaw} />
          </span>
        ))}
      </span>
      <span className="mini-name">{view.name}</span>
      {view.power !== null && (
        <span className="mini-stats">
          <span className="stat p" aria-hidden="true">
            <Glyph id="sword" size={12} />
            <b>{view.power}</b>
          </span>
          <span className="stat g" aria-hidden="true">
            <Glyph id="shield" size={12} />
            <b>{view.guard}</b>
          </span>
        </span>
      )}
      {preview !== undefined && <span className="preview-badge">{preview}</span>}
    </button>
  );
}

/** The back of a card the player cannot see (the Collector's traps and face-down monsters). */
export function CardBack({ icon, label, onTap, glow = null }: { readonly icon: string; readonly label: string; readonly onTap?: (() => void) | undefined; readonly glow?: Glow }) {
  return (
    <button type="button" className="mini back" aria-label={label} data-glow={glow ?? undefined} onClick={onTap} disabled={onTap === undefined}>
      <span className="mini-clip" />
      <span className="back-icon">
        <Glyph id={icon} size={28} />
      </span>
    </button>
  );
}
