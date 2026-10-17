// Lane geometry for display (D-281..D-284). The board is three facing lanes: your slot i faces the Collector's slot i.
// Nothing here decides a rule. What may be played, moved or attacked comes from `getLegalActions` (view/legal.ts); this
// file only says where to draw cover marks, which empty lane to label, and which sentence explains a missing attack.
import type { Engine, GameState, Globals, Iid, Monster, Side } from '@vault-duel/engine';

/** Is the lane mode on? It changes what the board draws, never what is legal. */
export const lanesOn = (g: Globals): boolean => g.FLAGS.LANES;

/**
 * Lanes (other than the Sentinel's own) that a face-up Sentinel on `side` covers (D-283), each mapped to the lane of the
 * Sentinel that pulls attacks there (the nearest; the left one on a tie). Empty with lanes off.
 */
export function coveredLanes(g: Globals, engine: Engine, kwBit: number | undefined, s: GameState, side: Side): ReadonlyMap<number, number> {
  const out = new Map<number, number>();
  if (!lanesOn(g) || kwBit === undefined) return out;
  const board = s.sides[side].board;
  board.forEach((m, i) => {
    if (m === null || ((engine.activeKeywords(s, m.iid) >>> kwBit) & 1) === 0) return;
    for (let d = -g.SENTINEL_REACH; d <= g.SENTINEL_REACH; d++) {
      const lane = i + d;
      if (d === 0 || lane < 0 || lane >= board.length) continue;
      const prev = out.get(lane);
      if (prev === undefined || Math.abs(prev - lane) > Math.abs(d)) out.set(lane, i);
    }
  });
  return out;
}

export type AttackNote =
  /** the lane across is empty while the Collector has monsters elsewhere: no attack, and no damage to his life */
  | 'emptyLane'
  | null;

/** Why the monster in `slot` has no attack, when the lane across is the reason. */
export function attackNote(g: Globals, s: GameState, slot: number): AttackNote {
  if (!lanesOn(g)) return null;
  const foes = s.sides[1].board;
  return foes.some((m) => m !== null) && foes[slot] === null ? 'emptyLane' : null;
}

/** Can this monster hit monsters but not life this turn (D-280)? Shown only under the monsters-only sickness mode. */
export function monstersOnly(g: Globals, engine: Engine, s: GameState, m: Monster): boolean {
  return g.SICKNESS_MODE === 'monstersOnly' && engine.attackPermission(s, m.iid) === 'monstersOnly';
}

/** Used this turn's reposition (a position switch or a lane move, D-282)? Lanes mode only. */
export const movedThisTurn = (g: Globals, s: GameState, m: Monster): boolean => lanesOn(g) && m.repositioned === s.turn;

export const slotOf = (s: GameState, side: Side, iid: Iid): number => s.sides[side].board.findIndex((m) => m !== null && m.iid === iid);
