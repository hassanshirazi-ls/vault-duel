// CombatEstimate: what the Collector's view answers to "what would this attack do?" (ARCHITECTURE.md §13.1).
// Public information only: a face-down target has an unknown outcome.
import type { Preview } from '../shared/mirror';

export type CombatEstimate =
  | { readonly known: false }
  | {
      readonly known: true;
      readonly direct: boolean;
      /** attacker Power with the element bonus; compared with `dStat` */
      readonly aP: number;
      readonly dStat: number;
      readonly advantage: boolean;
      readonly pierce: boolean;
      readonly brittle: boolean;
      /** the defender is destroyed (a Ward that absorbs the destruction is already counted) */
      readonly destroysDefender: boolean;
      /** the attack would destroy the defender but its Ward absorbs it: the Ward is stripped instead */
      readonly stripsWard: boolean;
      /** the attacker is destroyed (its own Ward counted) */
      readonly losesAttacker: boolean;
      /** the attacker's life loss, as the attacker's controller */
      readonly lifeLoss: number;
      /** the damage the defender's controller takes */
      readonly foeLifeLoss: number;
    };

export const UNKNOWN_ESTIMATE: CombatEstimate = { known: false };

export function estimateOf(p: Preview): CombatEstimate {
  return {
    known: true,
    direct: p.direct,
    aP: p.aP,
    dStat: p.dStat,
    advantage: p.advantage,
    pierce: p.pierce,
    brittle: p.brittle,
    destroysDefender: p.destroyDefender && !p.defenderWarded,
    stripsWard: p.destroyDefender && p.defenderWarded,
    losesAttacker: p.destroyAttacker && !p.attackerWarded,
    lifeLoss: p.dmgToAttacker,
    foeLifeLoss: p.dmgToDefender,
  };
}
