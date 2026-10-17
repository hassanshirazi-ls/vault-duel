// Position evaluation from the player's point of view, over a `PlayerView`. Greedy uses the base terms; the expert adds
// the `ExpertTerms` (a term whose weight is absent is skipped, so greedy's results do not change). The weights are
// settings of a measuring instrument, not game rules: they live in bots/greedy.weights.json and bots/expert.weights.json,
// not in globals, and no test pins them (D-222).
import weights from './greedy.weights.json';
import bond from './bond.weights.json';
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
  /**
   * Bond terms (D-312), read only when a bond switch is on (`v.bonds`); each absent weight is 0.
   * `symbioteReserve`: per host, this share of the symbiote's printed board value (the body that comes out when the host dies).
   * `bondedKeyword`: per keyword a symbiote gives its host. `boardWidth`: per own body (Split's width, a thin board's risk).
   * `unstableLast`: share of an Unstable monster's board value lost when this is its last turn (Split escapes it).
   * `bondAppraisalPower`: per Power of the monster the next Appraisal would take. `bondAppraisalCard`: per card it would take
   * (a host with a symbiote is 2).
   */
  readonly symbioteReserve?: number;
  readonly bondedKeyword?: number;
  readonly boardWidth?: number;
  readonly unstableLast?: number;
  readonly bondAppraisalPower?: number;
  readonly bondAppraisalCard?: number;
  /**
   * Riposte (D-337): the Guards a face-down Collector monster may have (his public roster, never the real one), and the Power
   * assumed when one is destroyed. An attack on a face-down monster is worth the mean over the list of: the kill when Power is
   * above the Guard, nothing on a tie, and the attacker lost (and the difference paid) when below. Absent: such attacks are worth 0.
   */
  readonly faceDownGuards?: readonly number[];
  readonly foeDownPower?: number;
  /** Share (0 to 1) of an own monster's end-of-turn Power bonus (Ambush, buff spells) discounted from its value. Absent: 0. */
  readonly tempShare?: number;
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

/**
 * The greedy bot's weights. The bond terms are in bond.weights.json, not in greedy.weights.json or expert.weights.json,
 * so that the expert's hash (the seed check's cache key, D-222, D-236) stays the same while the bond switches are off.
 */
export const GREEDY_WEIGHTS: EvalWeights = { ...weights, ...bond.greedy };

const SENTINEL = 'sentinel';

/** Board value of one monster record (own or the Collector's public one). */
export function monsterValue(w: EvalWeights, power: number, guard: number, atk: boolean, faceDown = false): number {
  if (faceDown) return 0;
  return w.power * power + w.guard * guard + (atk ? w.attackPos : 0);
}

/**
 * Expected score change of attacking a face-down Collector monster with my monster `me` (D-337): its Guard is unknown, so it is
 * averaged over `faceDownGuards`. The element bonus is unknown before the reveal and not counted.
 */
export function faceDownAttackValue(w: EvalWeights, me: { readonly power: number; readonly guard: number; readonly pos: 'atk' | 'grd' }): number {
  const guards = w.faceDownGuards;
  if (guards === undefined || guards.length === 0) return 0;
  const foePower = w.foeDownPower ?? 0;
  let total = 0;
  for (const g of guards) {
    if (me.power > g) total += monsterValue(w, foePower, g, false);
    else if (me.power < g) total -= monsterValue(w, me.power, me.guard, me.pos === 'atk') + w.myLife * (g - me.power);
  }
  return total / guards.length;
}

/** Higher is better for the player. A finished duel is +-`win`. */
export function evaluate(v: PlayerView, w: EvalWeights & Partial<ExpertTerms> = GREEDY_WEIGHTS): number {
  if (v.winner === 0) return w.win;
  if (v.winner === 1) return -w.win;
  let score = w.myLife * v.myLife - w.damage * v.foeLife;
  const down = w.faceDownOwn ?? 0;
  const temp = w.tempShare ?? 0;
  for (const m of v.board) {
    if (m === null) continue;
    const power = temp === 0 ? m.power : m.power - temp * m.tempPower;
    score += m.faceDown ? down * monsterValue(w, power, m.guard, m.pos === 'atk', false) : monsterValue(w, power, m.guard, m.pos === 'atk', false);
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
  if (v.bonds) score += bondTerms(v, w);
  return score;
}

/** The bond terms (D-312): what a symbiote, a Split's width and the Appraisal's second card are worth. */
function bondTerms(v: PlayerView, w: EvalWeights): number {
  let score = 0;
  const reserve = w.symbioteReserve ?? 0;
  const kw = w.bondedKeyword ?? 0;
  const width = w.boardWidth ?? 0;
  const last = w.unstableLast ?? 0;
  for (const m of v.board) {
    if (m === null) continue;
    score += width;
    if (m.sym !== null) score += reserve * monsterValue(w, m.sym.power, m.sym.guard, true) + kw * m.bondedKeywords.length;
    if (last !== 0 && m.unstableUntil >= 0 && m.unstableUntil <= v.turn) {
      score -= last * monsterValue(w, m.power, m.guard, m.pos === 'atk');
    }
  }
  const target = v.appraisalTarget;
  if (target !== null) score -= (w.bondAppraisalPower ?? 0) * target.power + (w.bondAppraisalCard ?? 0) * (target.sym === null ? 1 : 2);
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
