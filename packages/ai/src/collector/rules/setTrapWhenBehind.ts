// Play rule 4: "If he has fewer monsters than you and holds a trap, set it" (D-081: Composed also sets it with equal
// numbers, `compare: fewerOrEqual`). Counts board monsters, face-down ones included. Which trap: the first held of
// `collector.json › ai.trapPreference` (D-088); a held trap not on the list is never set by this rule (D-177 warns).
import type { PlayRule } from './context';
import type { TrapCompare } from '../config';
import type { ChoiceOf, CollectorView } from '../view';

const count = (board: readonly unknown[]): number => board.filter((m) => m !== null).length;

/** The setTrap choices ordered by `trapPreference` (listed traps only), then instance id. */
export function preferredTraps(view: CollectorView, preference: readonly string[]): ChoiceOf<'setTrap'>[] {
  return view.choices
    .filter((c): c is ChoiceOf<'setTrap'> => c.t === 'setTrap' && preference.includes(c.card.id))
    .sort((a, b) => preference.indexOf(a.card.id) - preference.indexOf(b.card.id) || a.card.iid - b.card.iid);
}

/** One handler per `compare` value of the schema (D-145): is he behind, given his monster count and the opponent's? */
export const TRAP_COMPARE: Readonly<Record<TrapCompare, (mine: number, theirs: number) => boolean>> = {
  fewer: (mine, theirs) => mine < theirs,
  fewerOrEqual: (mine, theirs) => mine <= theirs,
};

export const setTrapWhenBehind: PlayRule = ({ view, ai }) => {
  const compare = ai.params.setTrapWhenBehind.compare;
  if (compare === undefined) throw new Error('collector.json › ai › params.setTrapWhenBehind.compare is missing');
  if (!TRAP_COMPARE[compare](count(view.board), count(view.foeBoard))) return null;
  return preferredTraps(view, ai.trapPreference)[0] ?? null;
};
