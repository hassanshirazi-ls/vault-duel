// Shuffles with the opening-hand monster guarantee (ARCHITECTURE.md §12.4; D-007, D-008, D-118).
// Fisher-Yates from the side's stream; reshuffle (continuing the stream) until every opening window
// holds at least OPENING_MIN_MONSTERS monsters; after SHUFFLE_MAX_ATTEMPTS repair deterministically.
import { EngineError } from '../errors';
import type { Sfc32 } from '../rng';
import type { Globals } from '../types/globals';
import type { Iid } from '../types/state';

/** Number of opening windows: the opening hand plus one per redraw (player), or just the opening hand (Collector). */
export function windowsFor(g: Globals, redrawable: boolean): number {
  return 1 + (redrawable && g.FLAGS.REDRAW ? g.REDRAWS : 0);
}

function monstersIn(order: readonly Iid[], isMonster: (iid: Iid) => boolean, lo: number, hi: number): number {
  let n = 0;
  for (let i = lo; i < hi; i++) if (isMonster(order[i] as Iid)) n++;
  return n;
}

function windowsOk(order: readonly Iid[], isMonster: (iid: Iid) => boolean, g: Globals, windows: number): boolean {
  for (let w = 0; w < windows; w++) {
    if (monstersIn(order, isMonster, w * g.OPENING_HAND, (w + 1) * g.OPENING_HAND) < g.OPENING_MIN_MONSTERS) return false;
  }
  return true;
}

/** D-007 repair: swap the leftmost non-monster of a deficient window with the first monster after the last window. */
function repair(order: Iid[], isMonster: (iid: Iid) => boolean, g: Globals, windows: number): void {
  const after = windows * g.OPENING_HAND;
  for (let w = 0; w < windows; w++) {
    const lo = w * g.OPENING_HAND;
    const hi = lo + g.OPENING_HAND;
    while (monstersIn(order, isMonster, lo, hi) < g.OPENING_MIN_MONSTERS) {
      let bad = lo;
      while (bad < hi && isMonster(order[bad] as Iid)) bad++;
      let good = after;
      while (good < order.length && !isMonster(order[good] as Iid)) good++;
      if (bad >= hi || good >= order.length) throw new EngineError('shuffle: not enough monsters to satisfy the opening windows');
      const x = order[bad] as Iid;
      order[bad] = order[good] as Iid;
      order[good] = x;
    }
  }
}

/** Shuffled copy of `cards` whose opening windows hold enough monsters. */
export function shuffleDeck(
  cards: readonly Iid[],
  isMonster: (iid: Iid) => boolean,
  g: Globals,
  windows: number,
  rng: Sfc32,
): Iid[] {
  let order = cards.slice();
  for (let attempt = 0; attempt < g.SHUFFLE_MAX_ATTEMPTS; attempt++) {
    order = cards.slice();
    rng.shuffle(order);
    if (windowsOk(order, isMonster, g, windows)) return order;
  }
  repair(order, isMonster, g, windows);
  return order;
}
