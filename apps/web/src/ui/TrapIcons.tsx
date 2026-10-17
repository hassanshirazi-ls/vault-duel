// Trap slots as small card-back icons beside a side's life (D-339). Empty is a dim outline, set is a gilt card back with the
// trap mark, and a slot that can take the picked trap (or that the Collector is about to use) glows. The player's own are
// buttons (set here, or read the set trap); the Collector's are not, since a trap he set is hidden.
import { Glyph } from '../visual/glyphs';

export interface TrapIcon {
  readonly state: 'empty' | 'set' | 'open';
  /** the Collector is about to set or spring it: lit and labelled by the telegraph */
  readonly marked?: boolean;
  readonly label: string;
  readonly onTap?: (() => void) | undefined;
}

export function TrapIcons({ traps, side }: { readonly traps: readonly TrapIcon[]; readonly side: 'me' | 'them' }) {
  return (
    <div className="traps" data-side={side} role="group" aria-label={side === 'me' ? 'Your trap slots' : "The Collector's trap slots"}>
      {traps.map((t, i) => {
        const glow = t.state === 'open' || t.marked === true ? 'slot' : undefined;
        const face = (
          <span className="trap-icon" data-state={t.state} data-glow={glow}>
            <Glyph id="trap" size={t.state === 'set' ? 13 : 11} />
          </span>
        );
        return t.onTap === undefined ? (
          <span key={i} className="trap-hit" role="img" aria-label={t.label}>
            {face}
          </span>
        ) : (
          <button key={i} type="button" className="trap-hit" aria-label={t.label} onClick={t.onTap}>
            {face}
          </button>
        );
      })}
    </div>
  );
}
