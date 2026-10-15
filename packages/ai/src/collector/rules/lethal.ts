// Attack rule 1: "Take any lethal attack." The first attack of any sequence that finishes the opponent this turn
// (D-082: public information only; set traps ignored, face-down monsters assumed to survive). Strongest attacker first.
import { attackInfos, byAttacker, byTargetSlot } from '../attacks';
import type { AttackRule } from './context';

export const lethal: AttackRule = ({ view, ai }) => {
  const wins = new Set(view.winningAttacks().map((c) => c.index));
  return attackInfos(view)
    .filter((i) => wins.has(i.choice.index))
    .sort((a, b) => byAttacker(ai.tieBreak)(a, b) || byTargetSlot(a, b))
    .map((i) => i.choice);
};
