// The turn's budget, shown as pips above the hand. Under TURN_SLOTS (D-335): one monster, one spell or trap, one bond and
// the attacks left (each monster attacks once), in any order. Under BOND_ACTION alone (D-306, D-327): one card play and
// one bond action, and the first attack closes the bond. Shared by the duel footer and the How to play page that teaches it.
import { Glyph } from '../visual/glyphs';

type PipState = 'open' | 'used' | 'closed';
const WORD = { open: 'available', used: 'used', closed: 'closed by your attack' } as const;

function Pip({ state, icon, label, name, count }: { readonly state: PipState; readonly icon: string; readonly label: string; readonly name: string; readonly count?: number }) {
  return (
    <span className="pip" data-state={state} aria-label={count === undefined ? `${name}: ${WORD[state]}` : `${name}: ${count} left`}>
      <span className="mark" data-count={count !== undefined ? '' : undefined}>
        {count !== undefined ? count : state === 'used' ? <Glyph id="check" size={11} /> : state === 'closed' ? <Glyph id="cross" size={11} /> : null}
      </span>
      <Glyph id={icon} size={14} />
      <span className="pip-word">{label}</span>
    </span>
  );
}

export interface BudgetProps {
  readonly played: boolean;
  readonly bond: 0 | 1 | 2;
  /** FLAGS.TURN_SLOTS: the spell-or-trap slot (GameState.spell) and the number of monsters that can still attack */
  readonly slots?: { readonly spell: 0 | 1; readonly attacks: number } | undefined;
}

export function Budget({ played, bond, slots }: BudgetProps) {
  const bondState: PipState = bond === 0 ? 'open' : bond === 1 ? 'used' : 'closed';
  if (slots !== undefined) {
    return (
      <div className="budget slots" role="group" aria-label="Left this turn, in any order">
        <Pip state={played ? 'used' : 'open'} icon="deck" label="Monster" name="Monster summon" />
        <Pip state={slots.spell === 1 ? 'used' : 'open'} icon="spell" label="Spell/Trap" name="Spell or trap" />
        <Pip state={bondState} icon="link" label="Bond" name="Bond action" />
        <Pip state={slots.attacks > 0 ? 'open' : 'used'} icon="sword" label="Attacks" name="Attacks" count={slots.attacks} />
      </div>
    );
  }
  return (
    <div className="budget" role="group" aria-label="This turn">
      <Pip state={played ? 'used' : 'open'} icon="deck" label="Play" name="Card play" />
      <Pip state={bondState} icon="link" label="Bond" name="Bond action" />
    </div>
  );
}
