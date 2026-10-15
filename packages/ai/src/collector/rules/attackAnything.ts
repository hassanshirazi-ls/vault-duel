// Attack rule (Desperate, D-081): "attacks anything, including face-down monsters" - every able attack-position monster
// attacks its best legal target (D-091), strongest attacker first.
import { attackersInOrder } from '../attacks';
import { bestTarget } from '../best-target';
import type { AttackRule } from './context';
import type { ChoiceOf } from '../view';

export const attackAnything: AttackRule = ({ view, ai }) => {
  const out: ChoiceOf<'attack'>[] = [];
  for (const m of attackersInOrder(view, ai.tieBreak)) {
    const t = bestTarget(view, m.slot);
    if (t !== null) out.push(t);
  }
  return out;
};
