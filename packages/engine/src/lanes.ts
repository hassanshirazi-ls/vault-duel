// Lanes (ARCHITECTURE.md §5.4, D-281 to D-284). Lane `i` is slot index `i` on both sides, so player slot `i` faces
// Collector slot `i`. `laneTargets` is the one function that says which enemy monsters an attacker may declare on;
// legal.ts and combat.ts (`attackOptions`) call it. Pure and O(BOARD_SLOTS). With `FLAGS.LANES` off it is the classic
// rule (every enemy monster, narrowed to Sentinels, D-037, D-038) and reads no lane global.
import { TargetQueryContext, QueryContext } from './hooks/context';
import { attackTargets } from './hooks/dispatch';
import { lowBit } from './hooks/registry';
import type { Env } from './hooks/registry';
import { activeKwOf, locate, locSide, locSlot } from './stats';
import type { GameState, Iid, Monster, Side } from './types/state';

/** The default reach: the lane straight across (D-284). */
const OWN_LANE: readonly number[] = [0];

/**
 * Lane offsets a monster reaches: the union of its active keywords' `attackReach` hooks, ascending and without
 * duplicates; `[0]` when no hook answers (D-284). Order-independent (§8.3.6).
 */
export function attackReach(env: Env, s: GameState, m: Monster, side: Side): readonly number[] {
  const mask = activeKwOf(s, env, m) & env.reg.masks.attackReach;
  if (mask === 0) return OWN_LANE;
  const q = new QueryContext(env, s, m.iid, side);
  const out: number[] = [];
  for (let b = mask | 0; b !== 0; b &= b - 1) {
    const r = env.reg.kw[lowBit(b)]?.attackReach?.(q);
    if (r === undefined) continue;
    for (let i = 0; i < r.length; i++) if (!out.includes(r[i] as number)) out.push(r[i] as number);
  }
  if (out.length === 0) return OWN_LANE;
  return out.sort((x, y) => x - y);
}

/**
 * The monsters an attacker standing in `lane` may target under `FLAGS.LANES` (D-281, D-283):
 *  1. a face-up Sentinel in `lane` itself is the only target;
 *  2. else the face-up Sentinels within SENTINEL_REACH lanes of `lane` (the attacker chooses among them), even when
 *     the lane across is empty;
 *  3. else the monsters in the lanes `lane + o`, o in attackReach (default: the monster across), face-down included.
 * Empty when the enemy has nothing there; the caller adds the direct attack only for a wholly empty enemy board.
 * A "Sentinel" is any face-up monster whose `restrictTargets` hook answers true (the hook is the keyword's part; the
 * engine owns the geometry).
 */
export function targetsFromLane(env: Env, s: GameState, attacker: Monster, side: Side, lane: number): Iid[] {
  const defSide = (1 - side) as Side;
  const board = s.sides[defSide].board;
  const hookMask = env.reg.masks.restrictTargets;
  const reach = env.g.SENTINEL_REACH;
  let covering: Iid[] | null = null;
  if (hookMask !== 0) {
    for (let i = 0; i < board.length; i++) {
      const m = board[i];
      if (m === null || m === undefined) continue;
      const d = i > lane ? i - lane : lane - i;
      if (d > reach) continue;
      const mask = activeKwOf(s, env, m) & hookMask;
      if (mask === 0) continue;
      const q = new TargetQueryContext(env, s, m.iid, defSide, attacker.iid, lane);
      for (let b = mask | 0; b !== 0; b &= b - 1) {
        if (env.reg.kw[lowBit(b)]?.restrictTargets?.(q) !== true) continue;
        if (d === 0) return [m.iid];
        (covering ??= []).push(m.iid);
        break;
      }
    }
    if (covering !== null) return covering;
  }
  const offsets = attackReach(env, s, attacker, side);
  const out: Iid[] = [];
  for (let k = 0; k < offsets.length; k++) {
    const c = lane + (offsets[k] as number);
    if (c < 0 || c >= board.length) continue;
    const m = board[c];
    if (m !== null && m !== undefined && !out.includes(m.iid)) out.push(m.iid);
  }
  return out;
}

/**
 * Enemy monsters `attacker` may declare an attack on, ignoring its own permission and state (see
 * `combat.ts › attackOptions` for those). Empty for a card that is not on a board.
 */
export function laneTargets(env: Env, s: GameState, attacker: Iid): Iid[] {
  const loc = locate(s, attacker);
  if (loc < 0) return [];
  const side = locSide(loc);
  if (!env.g.FLAGS.LANES) return attackTargets(env, s, attacker, (1 - side) as Side);
  const m = s.sides[side].board[locSlot(loc)] as Monster;
  return targetsFromLane(env, s, m, side, locSlot(loc));
}
