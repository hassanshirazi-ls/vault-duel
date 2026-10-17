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
  /** what the bond is called: "Graft" when Graft is the only bond (D-336), "Bond" when Split or Symbiosis are on */
  readonly bondName?: string | undefined;
}

/**
 * The quiet-table version (D-339): four small dots beside End turn, each with its icon, filled while the slot is open and
 * hollow once used. The Attacks dot shows how many monsters can still attack. Labels are for screen readers and long-press.
 */
export function SlotDots({ played, bond, spell, attacks, bondName = 'Bond' }: { readonly played: boolean; readonly bond: 0 | 1 | 2; readonly spell: 0 | 1; readonly attacks: number; readonly bondName?: string | undefined }) {
  const dot = (key: string, open: boolean, icon: string, label: string, count?: number) => (
    <span key={key} className="sdot" data-open={open ? '' : undefined} role="img" aria-label={`${label}: ${count === undefined ? (open ? 'available' : 'used') : `${count} left`}`} title={label}>
      {count !== undefined && count > 0 ? <b>{count}</b> : open ? <Glyph id={icon} size={12} /> : <Glyph id="check" size={12} />}
    </span>
  );
  return (
    <div className="sdots" role="group" aria-label="Left this turn, in any order">
      {dot('m', !played, 'deck', 'Monster summon')}
      {dot('s', spell === 0, 'spell', 'Spell or trap')}
      {dot('b', bond === 0, 'link', `${bondName} action`)}
      {dot('a', attacks > 0, 'sword', 'Attacks', attacks)}
    </div>
  );
}

export function Budget({ played, bond, slots, bondName = 'Bond' }: BudgetProps) {
  const bondState: PipState = bond === 0 ? 'open' : bond === 1 ? 'used' : 'closed';
  if (slots !== undefined) {
    return (
      <div className="budget slots" role="group" aria-label="Left this turn, in any order">
        <Pip state={played ? 'used' : 'open'} icon="deck" label="Monster" name="Monster summon" />
        <Pip state={slots.spell === 1 ? 'used' : 'open'} icon="spell" label="Spell/Trap" name="Spell or trap" />
        <Pip state={bondState} icon="link" label={bondName} name={`${bondName} action`} />
        <Pip state={slots.attacks > 0 ? 'open' : 'used'} icon="sword" label="Attacks" name="Attacks" count={slots.attacks} />
      </div>
    );
  }
  return (
    <div className="budget" role="group" aria-label="This turn">
      <Pip state={played ? 'used' : 'open'} icon="deck" label="Play" name="Card play" />
      <Pip state={bondState} icon="link" label={bondName} name={`${bondName} action`} />
    </div>
  );
}
