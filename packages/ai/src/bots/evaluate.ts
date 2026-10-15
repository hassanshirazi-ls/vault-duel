// Position evaluation from the player's point of view, over a `PlayerView`. Greedy uses it directly; the expert bot
// (milestone 2) extends it. The weights are heuristic tuning, not game rules, so they live here rather than in globals;
// milestone 2 moves them into bots/expert.weights.json.
import type { PlayerView } from './player-view';

export interface EvalWeights {
  /** per point of the player's life */
  readonly myLife: number;
  /** per point of the Collector's life lost (damage dealt) */
  readonly damage: number;
  readonly power: number;
  readonly guard: number;
  /** extra for an attack-position monster that is face-up */
  readonly attackPos: number;
  readonly handCard: number;
  readonly trap: number;
  readonly win: number;
}

export const GREEDY_WEIGHTS: EvalWeights = {
  myLife: 1,
  damage: 1.5,
  power: 1,
  guard: 0.5,
  attackPos: 0.5,
  handCard: 0.7,
  trap: 1,
  win: 1e6,
};

/** Board value of one monster record (own or the Collector's public one). */
function monsterValue(w: EvalWeights, power: number, guard: number, atk: boolean, faceDown: boolean): number {
  if (faceDown) return 0;
  return w.power * power + w.guard * guard + (atk ? w.attackPos : 0);
}

/** Higher is better for the player. A finished duel is +-`win`. */
export function evaluate(v: PlayerView, w: EvalWeights = GREEDY_WEIGHTS): number {
  if (v.winner === 0) return w.win;
  if (v.winner === 1) return -w.win;
  let score = w.myLife * v.myLife - w.damage * v.foeLife;
  for (const m of v.board) if (m !== null) score += monsterValue(w, m.power, m.guard, m.pos === 'atk', m.faceDown);
  for (const m of v.foeBoard) if (m !== null && !m.faceDown) score -= monsterValue(w, m.power, m.guard, m.pos === 'atk', false);
  score += w.handCard * v.hand.length;
  for (const t of v.traps) if (t !== null) score += w.trap;
  return score;
}
