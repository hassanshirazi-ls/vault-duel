// Repositioning before the play (D-089, D-081). The reposition step runs first (ARCHITECTURE.md §13.3); the policy asks
// again after each reposition, so "zero or more" falls out.
//   toAttackIfUsable  a guard (or face-down) monster switches to attack only if that gives it an attack under attack
//                     rule 1, 2 or 4 this turn (the rules that are in the mood's attack list). Never attack -> guard.
//   allAttack         (Desperate) every guard monster switches to attack.
//   laneAware         (D-286, FLAGS.LANES) toAttackIfUsable, then lane moves and swaps, see `laneMove` below.
import { ATTACK_RULES } from './rules';
import type { RuleCtx } from './rules/context';
import type { Reposition, AttackRuleId } from './config';
import type { ChoiceOf, CollectorView, ViewChoice } from './view';

type Handler = (ctx: RuleCtx, reps: readonly ChoiceOf<'reposition'>[], moves: readonly ChoiceOf<'moveLane'>[]) => ViewChoice | null;

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

const SENTINEL = 'sentinel';

/**
 * What the usable rules (lethal, killWithoutLoss, directIfEmpty, those in the mood's list) take in `view`: the number of
 * distinct targets they attack (a direct attack is one target), plus a large bonus when a lethal attack exists.
 */
function killScore(ctx: RuleCtx, view: CollectorView): number {
  const next: RuleCtx = { ...ctx, view };
  const targets = new Set<number | 'direct'>();
  let score = 0;
  for (const id of ctx.ai.attack) {
    if (!USABLE_RULES.includes(id)) continue;
    const list = ATTACK_RULES[id](next);
    if (id === 'lethal' && list.length > 0) score += LETHAL_BONUS;
    for (const a of list) targets.add(a.target);
  }
  return score + targets.size;
}

const LETHAL_BONUS = 100;

/**
 * D-286 lane move. A move or swap is taken only if, on the redacted copy afterwards, the usable rules take strictly more kills
 * than now, or it brings a face-up Sentinel into the middle lane and loses no attack (no fewer kills, and the Sentinel keeps
 * a usable attack if it had one). Candidates: monsters in slot order, destination lane ascending, empty lanes before swaps.
 * The engine allows one move per monster and turn, so the step ends.
 */
function laneMove(ctx: RuleCtx, moves: readonly ChoiceOf<'moveLane'>[]): ViewChoice | null {
  const { view } = ctx;
  const mid = Math.floor((ctx.globals.BOARD_SLOTS - 1) / 2);
  const isSwap = (c: ChoiceOf<'moveLane'>): number => (view.board[c.to] === null ? 0 : 1);
  const ordered = [...moves].sort((a, b) => a.slot - b.slot || isSwap(a) - isSwap(b) || a.to - b.to);
  const before = killScore(ctx, view);
  for (const c of ordered) {
    const m = view.board[c.slot];
    if (m === null || m === undefined) continue;
    const after = view.after(c);
    if (after === null) continue;
    const now = killScore(ctx, after);
    if (now > before) return c;
    if (!m.faceDown && m.card.keywords.includes(SENTINEL) && c.to === mid && c.slot !== mid && now >= before) {
      const had = hasUsableAttack(ctx, view, c.slot);
      if (!had || hasUsableAttack(ctx, after, c.to)) return c;
    }
  }
  return null;
}

const toAttackIfUsable: Handler = (ctx, reps) => {
  for (const rep of reps) {
    if (!toAttack(ctx.view, rep)) continue;
    const after = ctx.view.after(rep);
    if (after !== null && hasUsableAttack(ctx, after, rep.slot)) return rep;
  }
  return null;
};

export const REPOSITION_MODES: Readonly<Record<Reposition, Handler>> = {
  toAttackIfUsable,
  allAttack: (ctx, reps) => reps.find((rep) => toAttack(ctx.view, rep)) ?? null,
  laneAware: (ctx, reps, moves) => toAttackIfUsable(ctx, reps, moves) ?? laneMove(ctx, moves),
};

export function repositionChoice(ctx: RuleCtx): ViewChoice | null {
  const reps = ctx.view.choices.filter((c): c is ChoiceOf<'reposition'> => c.t === 'reposition').sort((a, b) => a.slot - b.slot);
  const moves = ctx.view.choices.filter((c): c is ChoiceOf<'moveLane'> => c.t === 'moveLane');
  if (reps.length === 0 && moves.length === 0) return null;
  return REPOSITION_MODES[ctx.ai.reposition](ctx, reps, moves);
}
