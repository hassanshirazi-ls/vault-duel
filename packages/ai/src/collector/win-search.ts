// "Can he win this turn?" (D-082): a search over his own attack sequences on a scrubbed copy of the state, so it
// uses only what he knows: his hand and board, the public board, no set traps (unknown traps are ignored), no
// face-down targets (assumed to survive), no deck. The engine resolves each attack, so Pierce, Ward and a
// destroyed blocker opening a direct attack are all counted. Depth is at most one attack per monster.
import type { Action, GameState } from '@vault-duel/engine';
import type { Brain } from '../shared/brain';

const COLLECTOR = 1;
/** Node budget per search, so a pathological board cannot stall a decision. */
const NODE_BUDGET = 600;

interface Candidate {
  readonly action: Extract<Action, { t: 'attack' }>;
  readonly power: number;
  readonly slot: number;
  readonly targetSlot: number;
}

/** His attacks that need no hidden information (direct or on a face-up monster), strongest attacker first. */
function candidates(b: Brain, s: GameState): Candidate[] {
  const out: Candidate[] = [];
  const legal = b.engine.getLegalActions(s);
  for (const a of legal) {
    if (a.t !== 'attack') continue;
    let targetSlot = -1;
    if (a.target >= 0) {
      const m = b.mirror.monster(s, a.target);
      if (m === null || m.faceDown) continue;
      targetSlot = b.mirror.slotOf(s, a.target);
    }
    out.push({
      action: a,
      power: b.mirror.power(s, a.a),
      slot: b.mirror.slotOf(s, a.a),
      targetSlot,
    });
  }
  return out.sort((x, y) => y.power - x.power || x.slot - y.slot || x.targetSlot - y.targetSlot);
}

/** Upper bound on the life one more round of attacks can take: each attacker deals at most its Power plus the element bonus. */
function potential(b: Brain, list: readonly Candidate[]): number {
  let sum = 0;
  const seen: number[] = [];
  for (const c of list) {
    const iid = c.action.a;
    if (seen.includes(iid)) continue;
    seen.push(iid);
    sum += c.power + b.globals.ELEMENT_BONUS;
  }
  return sum;
}

const won = (s: GameState): boolean => s.result !== null && s.result.winner === COLLECTOR;

function search(b: Brain, s: GameState, budget: { n: number }): boolean {
  if (s.result !== null) return won(s);
  const list = candidates(b, s);
  if (potential(b, list) < s.sides[0].life) return false;
  for (const c of list) {
    if (budget.n-- <= 0) return false;
    const next = b.engine.applyAction(s, c.action).state;
    if (won(next) || (next.result === null && search(b, next, budget))) return true;
  }
  return false;
}

/** The first attacks of every winning sequence from `s` (his turn, already scrubbed), strongest attacker first. */
export function winningAttacks(b: Brain, s: GameState): readonly Extract<Action, { t: 'attack' }>[] {
  const list = candidates(b, s);
  if (potential(b, list) < s.sides[0].life) return [];
  const budget = { n: NODE_BUDGET };
  const out: Extract<Action, { t: 'attack' }>[] = [];
  for (const c of list) {
    if (budget.n-- <= 0) break;
    const next = b.engine.applyAction(s, c.action).state;
    if (won(next) || (next.result === null && search(b, next, budget))) out.push(c.action);
  }
  return out;
}

/** After `play` on the scrubbed copy `s`, does a winning attack sequence exist? */
export function winsAfter(b: Brain, s: GameState, play: Action): boolean {
  const next = b.engine.applyAction(s, play).state;
  if (next.result !== null) return won(next);
  return search(b, next, { n: NODE_BUDGET });
}

/** Cheap pre-check for plays: the attackers' total potential, to skip a search that cannot succeed. */
export function attackPotential(b: Brain, s: GameState): number {
  return potential(b, candidates(b, s));
}
