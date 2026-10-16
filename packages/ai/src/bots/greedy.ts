// Greedy bot (D-116, D-222): one ply. Apply each legal action on a redacted copy (the Collector's hand, deck and traps
// removed; see PlayerView.after), score the resulting position with evaluate(), take the best. Damage dealt and board
// value are what evaluate() measures. Ties go to the earliest legal action, and endTurn is last, so a tie never
// ends the turn early. It keeps its opening hand; a Graft is valued by the position after its first-choice completion
// (a Graft has no value until it commits, so one ply cannot see it otherwise); a look-ahead that the helper refuses (an
// action on a face-down Collector monster) scores as the current position.
import { evaluate, GREEDY_WEIGHTS } from './evaluate';
import type { EvalWeights } from './evaluate';
import type { Bot, PlayerView } from './player-view';

/** Longest Graft is begin + 3 materials + keywords + position; the cap only guards a loop. */
const MAX_GRAFT_STEPS = 12;

/** A lane move that changes nothing the evaluation sees must lose to ending the turn (it would otherwise come first). */
const MOVE_COST = 1e-6;

function scoreAfter(v: PlayerView, index: number, w: EvalWeights): number {
  const next = v.after(index);
  return evaluate(next ?? v, w) - (v.legal[index]?.t === 'moveLane' ? MOVE_COST : 0);
}

/** Index of the best action in `v`, the first of equals; `graftCancel` only when nothing else is legal. */
function best(v: PlayerView, w: EvalWeights, depth: number): number {
  let bestI = -1;
  let bestScore = Number.NEGATIVE_INFINITY;
  for (let i = 0; i < v.legal.length; i++) {
    const a = v.legal[i];
    if (a === undefined || (a.t === 'graftCancel' && v.legal.length > 1)) continue;
    const score = a.t === 'graftBegin' && depth === 0 ? graftScore(v, i, w) : scoreAfter(v, i, w);
    if (bestI < 0 || score > bestScore) {
      bestI = i;
      bestScore = score;
    }
  }
  return bestI < 0 ? 0 : bestI;
}

/** The position after beginning a Graft and then taking the best action at each of its steps. */
function graftScore(v: PlayerView, index: number, w: EvalWeights): number {
  let cur = v.after(index);
  for (let n = 0; n < MAX_GRAFT_STEPS && cur !== null && cur.pendingGraft; n++) cur = cur.after(best(cur, w, 1));
  return cur === null || cur.pendingGraft ? Number.NEGATIVE_INFINITY : evaluate(cur, w);
}

export function createGreedy(weights: EvalWeights = GREEDY_WEIGHTS): Bot {
  return (ctx) => {
    const keep = ctx.legal.findIndex((a) => a.t === 'keep');
    if (keep >= 0) return keep;
    return best(ctx.view(), weights, 0);
  };
}
