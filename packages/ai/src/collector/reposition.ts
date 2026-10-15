// Repositioning before the play (D-089, D-081). The reposition step runs first (ARCHITECTURE.md §13.3); the policy asks
// again after each reposition, so "zero or more" falls out.
//   toAttackIfUsable  a guard (or face-down) monster switches to attack only if that gives it an attack under attack
//                     rule 1, 2 or 4 this turn (the rules that are in the mood's attack list). Never attack -> guard.
//   allAttack         (Desperate) every guard monster switches to attack.
import { ATTACK_RULES } from './rules';
import type { RuleCtx } from './rules/context';
import type { Reposition, AttackRuleId } from './config';
import type { ChoiceOf, CollectorView, ViewChoice } from './view';

type Handler = (ctx: RuleCtx, reps: readonly ChoiceOf<'reposition'>[]) => ViewChoice | null;

/** Rules 1, 2 and 4 of the attack phase: lethal, killWithoutLoss, directIfEmpty. */
const USABLE_RULES: readonly AttackRuleId[] = ['lethal', 'killWithoutLoss', 'directIfEmpty'];

/** A reposition choice that would turn an attack-position monster to guard is never taken. */
const toAttack = (view: CollectorView, c: ChoiceOf<'reposition'>): boolean => {
  const m = view.board[c.slot];
  return m !== null && m !== undefined && (m.pos === 'grd' || m.faceDown);
};

function hasUsableAttack(ctx: RuleCtx, after: CollectorView, slot: number): boolean {
  const next: RuleCtx = { ...ctx, view: after };
  for (const id of ctx.ai.attack) {
    if (!USABLE_RULES.includes(id)) continue;
    if (ATTACK_RULES[id](next).some((a) => a.slot === slot)) return true;
  }
  return false;
}

export const REPOSITION_MODES: Readonly<Record<Reposition, Handler>> = {
  toAttackIfUsable: (ctx, reps) => {
    for (const rep of reps) {
      if (!toAttack(ctx.view, rep)) continue;
      const after = ctx.view.after(rep);
      if (after !== null && hasUsableAttack(ctx, after, rep.slot)) return rep;
    }
    return null;
  },
  allAttack: (ctx, reps) => reps.find((rep) => toAttack(ctx.view, rep)) ?? null,
};

export function repositionChoice(ctx: RuleCtx): ViewChoice | null {
  const reps = ctx.view.choices.filter((c): c is ChoiceOf<'reposition'> => c.t === 'reposition').sort((a, b) => a.slot - b.slot);
  if (reps.length === 0) return null;
  return REPOSITION_MODES[ctx.ai.reposition](ctx, reps);
}
