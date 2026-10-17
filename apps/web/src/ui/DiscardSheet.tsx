// The discard picker (Grave Recall): a spell whose legal casts name cards in a discard pile cannot light them on the board,
// so they are listed here. Every card shown is the target of a legal `cast` (view/selection.ts `Plan.discard`); tapping one
// plays that action. Nothing here decides what may be picked.
import type { Action, Iid } from '@vault-duel/engine';
import type { CardView } from '../view/cards';
import { Glyph } from '../visual/glyphs';
import { MiniCard } from './MiniCard';
import { Sheet } from './Sheet';

export interface DiscardSheetProps {
  /** the spell being cast, for the title */
  readonly spell: string;
  /** the legal choices in the order of the pile, each with the cast that picks it */
  readonly choices: readonly { readonly view: CardView; readonly action: Action }[];
  readonly onPick: (a: Action) => void;
  readonly onInspect: (iid: Iid) => void;
  readonly onClose: () => void;
}

export function DiscardSheet({ spell, choices, onPick, onInspect, onClose }: DiscardSheetProps) {
  return (
    <Sheet modal onClose={onClose} label={`${spell}: pick a card from your discard pile`} className="discard-sheet">
      <div className="bonds-body">
        <div className="bench-head">
          <h2>
            <Glyph id="tomb" size={20} /> {spell}
          </h2>
          <button type="button" className="btn ghost" onClick={onClose}>
            <Glyph id="cross" size={16} /> Close
          </button>
        </div>
        <p className="muted">Tap a card from your discard pile to take it.</p>
        {choices.length === 0 ? (
          <p className="muted">Nothing in your discard pile can be picked.</p>
        ) : (
          <ul className="discard-list" aria-label="Discard pile">
            {choices.map(({ view, action }) => (
              <li key={view.iid}>
                <MiniCard view={view} side="me" glow="target" onTap={() => onPick(action)} onLong={() => onInspect(view.iid)} />
              </li>
            ))}
          </ul>
        )}
      </div>
    </Sheet>
  );
}
