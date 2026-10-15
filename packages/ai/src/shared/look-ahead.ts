// Look-ahead (ARCHITECTURE.md §13.1, D-209). Every "what if" the AI asks goes through here:
//   - the actions are applied with the Brain's engine to `redactState(s, viewer)`, a copy made at most once per
//     decision (lazily, on the first question) and shared by all of that decision's look-aheads;
//   - an action that targets a face-down opponent monster is refused (null), because `redactState` keeps that
//     monster's identity for legality and applying the action would let the answer depend on it;
//   - stats, keyword state, attack permission and combat outcomes are the engine's own queries. Nothing here is a rule.
// `previewSummon`, `after`, `winsAfter`, `winningAttacks` and `attackPotential` are search policy, not rules.
import { redactState } from '@vault-duel/engine';
import type { Action, CombatPreview, GameState, Iid, Side } from '@vault-duel/engine';
import type { Brain } from './brain';

type AttackAction = Extract<Action, { t: 'attack' }>;

/** A hand monster as it would be right after a summon in attack position (D-209), as engine answers. */
export interface SummonLook {
  /** effective Power and Guard right after the summon */
  readonly power: number;
  readonly guard: number;
  /** an active keyword restricts its attack permission to `none` on the entry turn (Slow, D-212) */
  readonly slow: boolean;
  /** the summoned monster attacking the foe monster at `foeSlot` */
  asAttacker(foeSlot: number): CombatPreview;
  /** the foe monster at `foeSlot` attacking the summoned monster */
  asDefender(foeSlot: number): CombatPreview;
}

export interface LookAhead {
  /** The state after `action` on the redacted copy, or null if the action is refused (it targets a face-down foe monster). */
  after(action: Action): GameState | null;
  /** The summon in attack position applied to the copy and queried; null without a free slot or if refused. */
  previewSummon(iid: Iid): SummonLook | null;
  /** His attacks that start a sequence finishing the opponent this turn (D-082), strongest attacker first. */
  winningAttacks(): readonly AttackAction[];
  /** After `play`, does an attack sequence finish the opponent (D-220)? */
  winsAfter(play: Action): boolean;
  /** An upper bound on the life his attackers can take with the attacks legal now. */
  attackPotential(): number;
}

const UNKNOWN: CombatPreview = { known: false };

/** Board slot of `iid` on side `side`, or -1. */
export function slotIn(s: GameState, side: Side, iid: Iid): number {
  return s.sides[side].board.findIndex((m) => m?.iid === iid);
}

/** Does `a` target a face-down monster of `viewer`'s opponent? Such an action is never applied in a look-ahead. */
function refuses(s: GameState, viewer: Side, a: Action): boolean {
  if (a.t !== 'attack' && a.t !== 'cast') return false;
  if (a.target < 0) return false;
  for (const m of s.sides[(1 - viewer) as Side].board) if (m !== null && m.iid === a.target) return m.faceDown;
  return false;
}

export function lookAhead(b: Brain, s: GameState, viewer: Side): LookAhead {
  const foe = (1 - viewer) as Side;
  const e = b.engine;
  let copy: GameState | null = null;
  const base = (): GameState => (copy ??= redactState(s, viewer));
  const summons = new Map<Iid, SummonLook | null>();
  let wins: readonly AttackAction[] | null = null;

  const apply = (from: GameState, a: Action): GameState | null => (refuses(from, viewer, a) ? null : e.applyAction(from, a).state);
  const won = (st: GameState): boolean => st.result !== null && st.result.winner === viewer;

  interface Candidate {
    readonly action: AttackAction;
    readonly power: number;
    readonly slot: number;
    readonly targetSlot: number;
  }

  /** His attacks that need no hidden information (direct or on a face-up monster), strongest attacker first. */
  const candidates = (st: GameState): Candidate[] => {
    const out: Candidate[] = [];
    for (const a of e.getLegalActions(st)) {
      if (a.t !== 'attack' || refuses(st, viewer, a)) continue;
      out.push({
        action: a,
        power: e.effectivePower(st, a.a),
        slot: slotIn(st, viewer, a.a),
        targetSlot: a.target < 0 ? -1 : slotIn(st, foe, a.target),
      });
    }
    return out.sort((x, y) => y.power - x.power || x.slot - y.slot || x.targetSlot - y.targetSlot);
  };

  /** Upper bound on the life one more round of attacks can take: each attacker deals at most its Power plus the element bonus. */
  const potential = (list: readonly Candidate[]): number => {
    let sum = 0;
    const seen: Iid[] = [];
    for (const c of list) {
      if (seen.includes(c.action.a)) continue;
      seen.push(c.action.a);
      sum += c.power + b.globals.ELEMENT_BONUS;
    }
    return sum;
  };

  const search = (st: GameState, budget: { n: number }): boolean => {
    if (st.result !== null) return won(st);
    const list = candidates(st);
    if (potential(list) < st.sides[foe].life) return false;
    for (const c of list) {
      if (budget.n-- <= 0) return false;
      const next = e.applyAction(st, c.action).state;
      if (won(next) || (next.result === null && search(next, budget))) return true;
    }
    return false;
  };

  const summonLook = (iid: Iid): SummonLook | null => {
    const from = base();
    if (!from.sides[viewer].board.includes(null)) return null;
    const hyp = apply(from, { t: 'summon', c: iid, mode: 'atk' });
    if (hyp === null) return null;
    const foeIid = (slot: number): Iid => {
      const t = hyp.sides[foe].board[slot];
      return t === null || t === undefined || t.faceDown || slotIn(hyp, viewer, iid) < 0 ? -2 : t.iid;
    };
    return {
      power: e.effectivePower(hyp, iid),
      guard: e.effectiveGuard(hyp, iid),
      slow: e.attackRestriction(hyp, iid) === 'none',
      asAttacker: (slot) => {
        const t = foeIid(slot);
        return t === -2 ? UNKNOWN : e.previewCombat(hyp, iid, t);
      },
      asDefender: (slot) => {
        const t = foeIid(slot);
        return t === -2 ? UNKNOWN : e.previewCombat(hyp, t, iid);
      },
    };
  };

  return {
    after: (action) => apply(base(), action),

    previewSummon(iid) {
      if (!summons.has(iid)) summons.set(iid, summonLook(iid));
      return summons.get(iid) ?? null;
    },

    winningAttacks() {
      if (wins !== null) return wins;
      const st = base();
      const list = candidates(st);
      if (potential(list) < st.sides[foe].life) return (wins = []);
      const budget = { n: b.globals.AI_SEARCH_NODE_BUDGET };
      const out: AttackAction[] = [];
      for (const c of list) {
        if (budget.n-- <= 0) break;
        const next = e.applyAction(st, c.action).state;
        if (won(next) || (next.result === null && search(next, budget))) out.push(c.action);
      }
      return (wins = out);
    },

    winsAfter(play) {
      const next = apply(base(), play);
      if (next === null) return false;
      if (next.result !== null) return won(next);
      return search(next, { n: b.globals.AI_SEARCH_NODE_BUDGET });
    },

    attackPotential: () => potential(candidates(base())),
  };
}
