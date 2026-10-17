// The turn's budget under BOND_ACTION (D-306, D-327): one card play and one bond action, each shown with an icon and a
// mark. Shared by the duel footer and the How to play page that teaches it.
import { Glyph } from '../visual/glyphs';

export function Budget({ played, bond }: { readonly played: boolean; readonly bond: 0 | 1 | 2 }) {
  const playState = played ? 'used' : 'open';
  const bondState = bond === 0 ? 'open' : bond === 1 ? 'used' : 'closed';
  const word = { open: 'available', used: 'used', closed: 'closed by your attack' } as const;
  return (
    <div className="budget" role="group" aria-label="This turn">
      <span className="pip" data-state={playState} aria-label={`Card play: ${word[playState]}`}>
        <span className="mark">{played ? <Glyph id="check" size={11} /> : null}</span>
        <Glyph id="deck" size={14} /> Play
      </span>
      <span className="pip" data-state={bondState} aria-label={`Bond action: ${word[bondState]}`}>
        <span className="mark">{bondState === 'used' ? <Glyph id="check" size={11} /> : bondState === 'closed' ? <Glyph id="cross" size={11} /> : null}</span>
        <Glyph id="link" size={14} /> Bond
      </span>
    </div>
  );
}
