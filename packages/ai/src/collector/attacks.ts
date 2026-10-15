// The attack choices of a view with their facts, in the order D-090 gives attackers: descending effective Power,
// ties by the configured tie-break (leftmost slot first). Computed once per view.
import type { CombatEstimate } from './combat-estimate';
import type { TieKey } from './config';
import { tieCompare } from './rules/context';
import type { ChoiceOf, CollectorView, FoeMonster, OwnMonster } from './view';

export interface AttackInfo {
  readonly choice: ChoiceOf<'attack'>;
  readonly attacker: OwnMonster;
  /** null for a direct attack */
  readonly foe: FoeMonster | null;
  readonly est: CombatEstimate;
}

const cache = new WeakMap<CollectorView, readonly AttackInfo[]>();

/** Every legal attack with its estimate. A face-down target has an unknown estimate. */
export function attackInfos(view: CollectorView): readonly AttackInfo[] {
  const hit = cache.get(view);
  if (hit !== undefined) return hit;
  const out: AttackInfo[] = [];
  for (const choice of view.choices) {
    if (choice.t !== 'attack') continue;
    const attacker = view.board[choice.slot];
    if (attacker === null || attacker === undefined) continue;
    const foe = choice.target === 'direct' ? null : (view.foeBoard[choice.target] ?? null);
    out.push({ choice, attacker, foe, est: view.previewAttack(choice.slot, choice.target) });
  }
  cache.set(view, out);
  return out;
}

/** Attacker order of D-090: descending Power, then the tie-break. */
export function byAttacker(tie: readonly TieKey[]): (a: AttackInfo, b: AttackInfo) => number {
  return (a, b) =>
    b.attacker.power - a.attacker.power ||
    tieCompare(tie, { slot: a.attacker.slot, id: a.attacker.card.id, iid: a.attacker.card.iid }, { slot: b.attacker.slot, id: b.attacker.card.id, iid: b.attacker.card.iid });
}

/** Target order: direct first, then leftmost slot. */
export const byTargetSlot = (a: AttackInfo, b: AttackInfo): number => slotOf(a) - slotOf(b);
const slotOf = (i: AttackInfo): number => (i.foe === null ? -1 : i.foe.slot);

/** Attackers with at least one attack, in D-090 order, one entry each. */
export function attackersInOrder(view: CollectorView, tie: readonly TieKey[]): readonly OwnMonster[] {
  const seen = new Set<number>();
  const out: AttackInfo[] = [];
  for (const i of attackInfos(view)) {
    if (seen.has(i.attacker.slot)) continue;
    seen.add(i.attacker.slot);
    out.push(i);
  }
  return out.sort(byAttacker(tie)).map((i) => i.attacker);
}
