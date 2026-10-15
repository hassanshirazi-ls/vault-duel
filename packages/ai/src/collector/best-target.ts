// "Best legal target" (D-091), used for Vain and Desperate attacks. In order:
//   (1) a lethal direct attack; (2) a target it destroys without losing the attacker, highest target Power;
//   (3) a target it trades with, highest target Power; (4) a direct attack; (5) a target whose Ward it strips;
//   (6) the attack that costs him the least life; (7) then the least board (the attacker survives).
// A face-down target has an unknown outcome and ranks after the known ones in (6) and (7). Ties: leftmost target slot.
import { attackInfos, byTargetSlot } from './attacks';
import type { AttackInfo } from './attacks';
import type { ChoiceOf, CollectorView } from './view';

const targetPower = (i: AttackInfo): number => (i.foe !== null && !i.foe.faceDown ? i.foe.power : -1);

/** Highest target Power first, then leftmost. */
const byPowerThenSlot = (a: AttackInfo, b: AttackInfo): number => targetPower(b) - targetPower(a) || byTargetSlot(a, b);

export function bestTarget(view: CollectorView, attackerSlot: number): ChoiceOf<'attack'> | null {
  const mine = attackInfos(view).filter((i) => i.attacker.slot === attackerSlot);
  if (mine.length === 0) return null;

  const direct = mine.find((i) => i.foe === null);
  if (direct?.est.known === true && direct.est.foeLifeLoss >= view.foeLife) return direct.choice; // (1)

  const known = mine.filter((i) => i.foe !== null && i.est.known);
  const clean = known.filter((i) => i.est.known && i.est.destroysDefender && !i.est.losesAttacker).sort(byPowerThenSlot);
  if (clean[0] !== undefined) return clean[0].choice; // (2)

  const trades = known.filter((i) => i.est.known && i.est.destroysDefender && i.est.losesAttacker).sort(byPowerThenSlot);
  if (trades[0] !== undefined) return trades[0].choice; // (3)

  if (direct !== undefined) return direct.choice; // (4)

  const strips = known.filter((i) => i.est.known && i.est.stripsWard).sort(byPowerThenSlot);
  if (strips[0] !== undefined) return strips[0].choice; // (5)

  const rest = mine.filter((i) => i.foe !== null);
  const cost = (i: AttackInfo): readonly [number, number, number] =>
    i.est.known ? [0, i.est.lifeLoss, i.est.losesAttacker ? 1 : 0] : [1, 0, 0];
  rest.sort((a, b) => {
    const x = cost(a);
    const y = cost(b);
    return x[0] - y[0] || x[1] - y[1] || x[2] - y[2] || byTargetSlot(a, b);
  });
  return rest[0]?.choice ?? null; // (6), (7)
}
