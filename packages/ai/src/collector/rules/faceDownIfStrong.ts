// Attack rule 3: "Attack face-down monsters only with 7+ Power, unless Desperate" (D-093). The attacker's effective
// Power without the element bonus (the element is unknown before the reveal) must be at least `params.faceDownIfStrong
// .minPower`, a number or a `$NAME` from the globals. Strongest attacker first; the leftmost face-down target.
import { resolveNum } from '@vault-duel/engine';
import { attackInfos, byAttacker, byTargetSlot } from '../attacks';
import type { AttackRule } from './context';

export const faceDownIfStrong: AttackRule = ({ view, ai, globals }) => {
  const min = ai.params.faceDownIfStrong.minPower;
  if (min === undefined) throw new Error('collector.json › ai › params.faceDownIfStrong.minPower is missing');
  const need = resolveNum(globals, min);
  return attackInfos(view)
    .filter((i) => i.foe !== null && i.foe.faceDown && i.attacker.power >= need)
    .sort((a, b) => byAttacker(ai.tieBreak)(a, b) || byTargetSlot(a, b))
    .map((i) => i.choice);
};
