// Attack rule 5: "Otherwise hold; Vain monsters still attack the best legal target" (D-091). When the engine still lists
// endTurn nothing is forced, so the rule holds. Otherwise a monster whose keyword obliges it to attack (Vain) has a legal
// attack: strongest such attacker first, each with its best target.
import { attackersInOrder } from '../attacks';
import { bestTarget } from '../best-target';
import type { AttackRule } from './context';
import type { ChoiceOf } from '../view';

export const holdExceptVain: AttackRule = ({ view, ai }) => {
  if (view.choices.some((c) => c.t === 'endTurn')) return [];
  const out: ChoiceOf<'attack'>[] = [];
  for (const m of attackersInOrder(view, ai.tieBreak)) {
    if (!m.forced) continue;
    const t = bestTarget(view, m.slot);
    if (t !== null) out.push(t);
  }
  return out;
};
