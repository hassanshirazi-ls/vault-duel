// The in-duel element compass (D-272), as a strip over the round track so it never covers a lane. For the picked
// monster it reads: its own gem, the elements it beats (with the bonus) and the elements that beat it. It is drawn from
// the compiled element list and `beats` matrix (view/wheel.ts), never hard-coded, and every element is a color plus its
// icon (the gem). It overlays the track only, takes no tap, and has no motion of its own.
import { useMemo } from 'react';
import { stripFor, wheelLayout } from '../view/wheel';
import { Glyph } from '../visual/glyphs';
import { useGame } from './context';
import { Gem } from './Gem';

const names = (list: readonly { readonly name: string }[]): string => (list.length === 0 ? 'nothing' : list.map((e) => e.name).join(' and '));

export function ElementStrip({ focus }: { readonly focus: string }) {
  const ctx = useGame((s) => s.ctx);
  const elements = useMemo(() => (ctx === null ? [] : [...ctx.elements.values()]), [ctx]);
  const layout = useMemo(() => wheelLayout(elements), [elements]);
  if (ctx === null) return null;
  const strip = stripFor(layout, focus);
  if (strip === null) return null;
  const bonus = ctx.render('+{ELEMENT_BONUS}');
  return (
    <div className="compass-strip" role="img" aria-label={`${strip.me.name} beats ${names(strip.beats)}, weak to ${names(strip.weakTo)}`}>
      <Gem element={strip.me} large />
      <span className="cs-group" data-dir="out">
        <Glyph id="next" size={16} />
        <span className="cs-word">Beats</span>
        {strip.beats.length === 0 ? <span className="cs-none">none</span> : strip.beats.map((e) => <Gem key={e.id} element={e} />)}
        {strip.beats.length > 0 && <b className="cs-bonus">{bonus}</b>}
      </span>
      <span className="cs-group" data-dir="in">
        <Glyph id="back" size={16} />
        <span className="cs-word">Weak to</span>
        {strip.weakTo.length === 0 ? <span className="cs-none">none</span> : strip.weakTo.map((e) => <Gem key={e.id} element={e} />)}
      </span>
    </div>
  );
}
