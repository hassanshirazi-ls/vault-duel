// Position evaluation from the player's point of view, over a `PlayerView`. Greedy uses the base terms; the expert adds
// the `ExpertTerms` (a term whose weight is absent is skipped, so greedy's results do not change). The weights are
// settings of a measuring instrument, not game rules: they live in bots/greedy.weights.json and bots/expert.weights.json,
// not in globals, and no test pins them (D-222).
import weights from './greedy.weights.json';
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
  /**
   * Lanes only (FLAGS.LANES, D-281): per lane where both sides have a face-up monster, plus when mine beats the monster across
   * and minus when it beats mine. Absent means 0.
   */
  readonly laneFace?: number;
  /** Lanes only: per own occupied lane a face-up own Sentinel covers (D-283). Absent means 0. */
  readonly sentinelCover?: number;
}

/** The expert's extra terms (ARCHITECTURE.md §14). Each is optional in `evaluate`; the expert's weights file has all of them. */
export interface ExpertTerms {
  /** share (0 to 1) of an own face-down monster's board value that counts; greedy counts none */
  readonly faceDownOwn: number;
  /** per Power point of the monster the Collector would Appraise next turn */
  readonly appraisal: number;
  /** flat, on top, when any monster is exposed to Appraisal */
  readonly appraisalFlat: number;
  /** per own Unstable monster still on the board (it is doomed) */
  readonly unstable: number;
  /** per pair of face-up monsters: plus when mine has the element advantage, minus when his does */
  readonly matchup: number;
  /** per face-up Sentinel on the Collector's board */
  readonly sentinel: number;
  /** per face-down Collector monster: an unknown threat */
  readonly foeFaceDown: number;
}

export const GREEDY_WEIGHTS: EvalWeights = weights;

const SENTINEL = 'sentinel';

/** Board value of one monster record (own or the Collector's public one). */
export function monsterValue(w: EvalWeights, power: number, guard: number, atk: boolean, faceDown = false): number {
  if (faceDown) return 0;
  return w.power * power + w.guard * guard + (atk ? w.attackPos : 0);
}

/** Higher is better for the player. A finished duel is +-`win`. */
export function evaluate(v: PlayerView, w: EvalWeights & Partial<ExpertTerms> = GREEDY_WEIGHTS): number {
  if (v.winner === 0) return w.win;
  if (v.winner === 1) return -w.win;
  let score = w.myLife * v.myLife - w.damage * v.foeLife;
  const down = w.faceDownOwn ?? 0;
  for (const m of v.board) {
    if (m === null) continue;
    score += m.faceDown ? down * monsterValue(w, m.power, m.guard, m.pos === 'atk', false) : monsterValue(w, m.power, m.guard, m.pos === 'atk', false);
  }
  for (const m of v.foeBoard) {
    if (m === null) continue;
    if (m.faceDown) score -= w.foeFaceDown ?? 0;
    else score -= monsterValue(w, m.power, m.guard, m.pos === 'atk', false);
  }
  score += w.handCard * v.hand.length;
  for (const t of v.traps) if (t !== null) score += w.trap;
  if (w.appraisal !== undefined || w.appraisalFlat !== undefined) {
    const target = v.appraisalTarget;
    if (target !== null) score -= (w.appraisal ?? 0) * target.power + (w.appraisalFlat ?? 0);
  }
  if (w.unstable !== undefined) for (const m of v.board) if (m !== null && m.unstableUntil >= 0) score -= w.unstable;
  if (w.matchup !== undefined) {
    for (const m of v.board) {
      if (m === null || m.faceDown) continue;
      for (const f of v.foeBoard) {
        if (f === null || f.faceDown) continue;
        if (v.beats(m.card.element, f.element)) score += w.matchup;
        else if (v.beats(f.element, m.card.element)) score -= w.matchup;
      }
    }
  }
  if (w.sentinel !== undefined) for (const f of v.foeBoard) if (f !== null && !f.faceDown && f.keywords.includes(SENTINEL)) score -= w.sentinel;
  if (v.lanes) score += laneTerms(v, w);
  return score;
}

/** Stat a monster shows to an attacker: its Power in attack position, its Guard in guard. */
const shown = (m: { power: number; guard: number; pos: 'atk' | 'grd' }): number => (m.pos === 'atk' ? m.power : m.guard);

/** The lane terms (D-281, D-283): who wins each face-to-face pair, and how much of his board his Sentinels cover. */
function laneTerms(v: PlayerView, w: EvalWeights): number {
  let score = 0;
  const face = w.laneFace ?? 0;
  const cover = w.sentinelCover ?? 0;
  for (let lane = 0; lane < v.board.length; lane++) {
    const m = v.board[lane];
    if (m === null || m === undefined) continue;
    const f = v.foeBoard[lane];
    if (face !== 0 && !m.faceDown && f !== null && f !== undefined && !f.faceDown) {
      const mine = m.power + (v.beats(m.card.element, f.element) ? v.elementBonus : 0);
      const his = f.power + (v.beats(f.element, m.card.element) ? v.elementBonus : 0);
      if (mine > shown(f)) score += face;
      if (his > shown(m)) score -= face;
    }
    if (cover !== 0 && !m.faceDown && m.card.keywords.includes(SENTINEL)) {
      for (let l = Math.max(0, lane - v.sentinelReach); l <= Math.min(v.board.length - 1, lane + v.sentinelReach); l++) {
        if (l !== lane && v.board[l] != null) score += cover;
      }
    }
  }
  return score;
}
