// Summon lane (D-286), used by summonAce and summonFallback (summonBeater picks its own lane), active only with FLAGS.LANES.
// `collector.json › ai.params.summonLane` is an ordered list of closed-enum ids. Each id in turn narrows the candidate
// lanes when it yields at least one; an id that yields none leaves them as they were. The last tie-break is the leftmost
// lane. All inputs are public or his own: his board, the foe's board, and `previewSummon` on the redacted copy.
//   sentinelCenter  a Sentinel takes the middle lane if free, else the free lane covering the most of his occupied lanes
//   facingBeatable  a free lane from which the card's attack targets include a face-up monster it beats (previewAttack);
//                   the lanes whose best such target has the highest Power win
//   facingEmpty     a free lane across from an empty foe lane, so no monster attacks the card head on
//   leftmostFree    the lowest lane
import type { SummonLaneId } from '../config';
import type { OwnCard, SummonPreview } from '../view';
import { BEATER_COMPARE } from './summonBeater';
import type { RuleCtx } from './context';

const SENTINEL = 'sentinel';

/** The highest Power among the face-up foe monsters `pv`'s card would beat from its lane, or -1 when it beats none. */
export function beatenPower(ctx: RuleCtx, pv: SummonPreview): number {
  const compare = ctx.ai.params.summonBeater.compare ?? 'previewAttack';
  const beats = BEATER_COMPARE[compare];
  let best = -1;
  for (const slot of pv.targets) {
    const foe = ctx.view.foeBoard[slot];
    if (foe === null || foe === undefined || foe.faceDown) continue;
    if (beats(pv.asAttacker(slot)) && foe.power > best) best = foe.power;
  }
  return best;
}

type Narrow = (ctx: RuleCtx, card: OwnCard, lanes: readonly number[], preview: (lane: number) => SummonPreview | null) => readonly number[];

const maxBy = (lanes: readonly number[], score: (lane: number) => number): readonly number[] => {
  let best = Number.NEGATIVE_INFINITY;
  let out: number[] = [];
  for (const l of lanes) {
    const v = score(l);
    if (v > best) {
      best = v;
      out = [l];
    } else if (v === best) out.push(l);
  }
  return out;
};

export const SUMMON_LANE_RULES: Readonly<Record<SummonLaneId, Narrow>> = {
  sentinelCenter: ({ view, globals }, card, lanes) => {
    if (!card.keywords.includes(SENTINEL)) return [];
    const mid = Math.floor((globals.BOARD_SLOTS - 1) / 2);
    if (lanes.includes(mid)) return [mid];
    const covered = (lane: number): number =>
      view.board.filter((m, l) => m !== null && l !== lane && Math.abs(l - lane) <= globals.SENTINEL_REACH).length;
    return maxBy(lanes, covered);
  },
  facingBeatable: (ctx, card, lanes, preview) => {
    const power = (lane: number): number => {
      const pv = preview(lane);
      return pv === null ? -1 : beatenPower(ctx, pv);
    };
    const best = maxBy(lanes, power);
    return best.length > 0 && power(best[0] as number) >= 0 ? best : [];
  },
  facingEmpty: ({ view }, _card, lanes) => lanes.filter((l) => view.foeBoard[l] === null || view.foeBoard[l] === undefined),
  leftmostFree: (_ctx, _card, lanes) => (lanes[0] === undefined ? [] : [Math.min(...lanes)]),
};

/**
 * The lane for `card` among `lanes` (the lanes its legal summon choices name). `preview(lane)` is the card's summon preview
 * in that lane, or null when it has none (a lane the Covetous sacrifice stands in).
 */
export function chooseLane(
  ctx: RuleCtx,
  card: OwnCard,
  lanes: readonly number[],
  preview: (lane: number) => SummonPreview | null = (lane) => ctx.view.previewSummon(card, lane),
): number {
  const order = ctx.ai.summonLane;
  if (order === undefined) throw new Error('collector.json › ai › params.summonLane is missing');
  let cur = [...lanes].sort((a, b) => a - b);
  for (const id of order) {
    const next = SUMMON_LANE_RULES[id](ctx, card, cur, preview);
    if (next.length > 0) cur = [...next];
    if (cur.length === 1) break;
  }
  const lane = cur[0];
  if (lane === undefined) throw new Error('collector: no lane to summon into');
  return lane;
}
