// Attack rule 4: "Attack directly if your board is empty." The engine lists a direct attack only when the opposing board
// is empty (and the attacker may hit life), so the rule takes the direct attacks it finds, strongest attacker first.
import { attackInfos, byAttacker } from '../attacks';
import type { AttackRule } from './context';

export const directIfEmpty: AttackRule = ({ view, ai }) =>
  attackInfos(view)
    .filter((i) => i.foe === null)
    .sort(byAttacker(ai.tieBreak))
    .map((i) => i.choice);
