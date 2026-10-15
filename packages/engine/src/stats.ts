// Derived stats and queries (ARCHITECTURE.md §4 "Derived, never stored", §5.4, §6.2, §8.5; D-031).
// Everything here is a pure function of (state, env). Hooks are consulted only through
// QueryContext, and folded order-independently (§8.3.6).
import { QueryContext } from './hooks/context';
import { lowBit } from './hooks/registry';
import type { Env } from './hooks/registry';
import { evalCond } from './effects/conditions';
import { DefType } from './types/content';
import type { ElemIdx, KwMask } from './types/content';
import type { AttackPerm } from './types/hooks';
import type { GameState, Iid, Monster, Side } from './types/state';

// ---- locating cards -----------------------------------------------------------------------

/** Board location code: -1 = not on a board, else `side * LOC_STRIDE + slot`. */
export const LOC_NONE = -1;
export const LOC_STRIDE = 16;
export const locSide = (loc: number): Side => (loc >= LOC_STRIDE ? 1 : 0);
export const locSlot = (loc: number): number => loc % LOC_STRIDE;

export function locate(s: GameState, iid: Iid): number {
  for (let side = 0; side < 2; side++) {
    const board = s.sides[side as Side].board;
    for (let i = 0; i < board.length; i++) {
      if (board[i]?.iid === iid) return side * LOC_STRIDE + i;
    }
  }
  return LOC_NONE;
}

export function monsterOf(s: GameState, iid: Iid): Monster | null {
  const loc = locate(s, iid);
  return loc < 0 ? null : (s.sides[locSide(loc)].board[locSlot(loc)] ?? null);
}

/** Round number (1-based) and active side derived from the turn index (§4). */
export const roundOf = (s: GameState): number => (s.turn >> 1) + 1;
export const activeSide = (s: GameState): Side => (s.turn & 1) as Side;

// ---- card facts ---------------------------------------------------------------------------

export function elementOf(s: GameState, env: Env, iid: Iid): ElemIdx {
  const inst = s.inst[iid];
  if (inst === undefined) return -1;
  if (inst.chimera !== null) return inst.chimera.element;
  return env.c.element[inst.def] ?? -1;
}

/** Chimeras have no kind (family kind = -1, D-056, D-129). */
export function kindOf(s: GameState, env: Env, iid: Iid): number {
  const inst = s.inst[iid];
  if (inst === undefined || inst.chimera !== null) return -1;
  return env.c.kind[inst.def] ?? -1;
}

export function isMonsterCard(s: GameState, env: Env, iid: Iid): boolean {
  const inst = s.inst[iid];
  if (inst === undefined) return false;
  const t = env.c.type[inst.def];
  return t === DefType.Monster || t === DefType.Family;
}

/** Printed keyword bits: def keywords | inherited Chimera keywords (before face-down / Ward state). */
export function printedKw(s: GameState, env: Env, iid: Iid): KwMask {
  const inst = s.inst[iid];
  if (inst === undefined) return 0;
  return ((env.c.kw[inst.def] ?? 0) | (inst.chimera?.kw ?? 0)) >>> 0;
}

/**
 * Active keyword bits of a board monster: none if face-down (D-037); a used Ward is no longer
 * active (D-044). "Ward" is identified by its hook, not its id: the keywords with a
 * `beforeDestroy` hook are the replacement-style keywords that `wardUsed` switches off.
 */
export function activeKwOf(s: GameState, env: Env, m: Monster): KwMask {
  if (m.faceDown) return 0;
  let kw = printedKw(s, env, m.iid);
  if (m.wardUsed) kw &= ~env.reg.masks.beforeDestroy;
  return kw >>> 0;
}

export function activeKw(s: GameState, env: Env, iid: Iid): KwMask {
  const m = monsterOf(s, iid);
  return m === null ? 0 : activeKwOf(s, env, m);
}

// ---- effective stats (D-031) ---------------------------------------------------------------

function printedStat(s: GameState, env: Env, iid: Iid, power: boolean): number {
  const inst = s.inst[iid];
  if (inst === undefined) return 0;
  const arr = power ? env.c.power : env.c.guard;
  let v = arr[inst.def] ?? 0;
  if (inst.chimera?.ascended === true) v += power ? env.g.ASCEND_POWER : env.g.ASCEND_GUARD;
  return v;
}

function twistBonus(s: GameState, env: Env, iid: Iid, power: boolean): number {
  if (!env.g.FLAGS.WEEKLY_TWIST || s.twist < 0) return 0;
  const twist = env.c.twists[s.twist];
  if (twist === undefined) return 0;
  let sum = 0;
  for (let i = 0; i < twist.modifiers.length; i++) {
    const mod = twist.modifiers[i];
    const v = power ? mod?.power : mod?.guard;
    if (mod === undefined || v === undefined || v === 0) continue;
    // `where` is evaluated without twist bonuses so a powerLte condition cannot recurse.
    if (evalCond(mod.where, { s, env, twist: false }, iid)) sum += v;
  }
  return sum;
}

function statOf(s: GameState, env: Env, iid: Iid, power: boolean, twist: boolean): number {
  let v = printedStat(s, env, iid, power);
  const loc = locate(s, iid);
  if (loc < 0) return Math.max(env.g.STAT_FLOOR, v); // off-board: printed stats only (D-043)
  const side = locSide(loc);
  const m = s.sides[side].board[locSlot(loc)] as Monster;
  v += power ? m.permP : m.permG;
  for (let i = 0; i < m.timed.length; i++) {
    const t = m.timed[i];
    if (t !== undefined && s.turn <= t.until) v += power ? t.p : t.g;
  }
  if (power && m.unstableUntil >= 0) v += env.g.UNSTABLE_BONUS;
  const mask = activeKwOf(s, env, m) & (power ? env.reg.masks.staticPower : env.reg.masks.staticGuard);
  if (mask !== 0) {
    const q = new QueryContext(env, s, iid, side);
    for (let b = mask | 0; b !== 0; b &= b - 1) {
      const hooks = env.reg.kw[lowBit(b)];
      v += (power ? hooks?.staticPower?.(q) : hooks?.staticGuard?.(q)) ?? 0;
    }
  }
  if (twist) v += twistBonus(s, env, iid, power);
  return Math.max(env.g.STAT_FLOOR, v);
}

/** Effective Power (D-031), without the element bonus, floored at STAT_FLOOR (D-030). */
export const effectivePower = (s: GameState, env: Env, iid: Iid): number => statOf(s, env, iid, true, true);
export const effectiveGuard = (s: GameState, env: Env, iid: Iid): number => statOf(s, env, iid, false, true);
/** Same without the weekly twist (used while evaluating twist conditions). */
export const effectivePowerNoTwist = (s: GameState, env: Env, iid: Iid): number => statOf(s, env, iid, true, false);

// ---- element advantage (D-029) -------------------------------------------------------------

export function beats(env: Env, aElem: ElemIdx, bElem: ElemIdx): boolean {
  if (aElem < 0 || bElem < 0) return false;
  return env.c.beats[aElem * env.c.nElements + bElem] === 1;
}

/** Attacker's element beats the defender's element. Compute after a face-down defender is revealed. */
export function hasAdvantage(s: GameState, env: Env, attacker: Iid, defender: Iid): boolean {
  return beats(env, elementOf(s, env, attacker), elementOf(s, env, defender));
}

// ---- attack permission lattice (§6.2) ------------------------------------------------------

const PERM_RANK = { none: 0, monstersOnly: 1, any: 2 } as const satisfies Record<AttackPerm, number>;
const PERM_BY_RANK = ['none', 'monstersOnly', 'any'] as const satisfies readonly AttackPerm[];

/** Folds the active attackPermission hooks of a board monster into `grant * 4 + restrict` (ranks; no allocation). */
function foldPerm(s: GameState, env: Env, m: Monster, side: Side, grant0: number): number {
  let grant = grant0;
  let restrict: number = PERM_RANK.any;
  const mask = activeKwOf(s, env, m) & env.reg.masks.attackPermission;
  if (mask !== 0) {
    const q = new QueryContext(env, s, m.iid, side);
    for (let b = mask | 0; b !== 0; b &= b - 1) {
      const r = env.reg.kw[lowBit(b)]?.attackPermission?.(q);
      if (r === undefined) continue;
      if (r.grant !== undefined) grant = Math.max(grant, PERM_RANK[r.grant]);
      if (r.restrict !== undefined) restrict = Math.min(restrict, PERM_RANK[r.restrict]);
    }
  }
  return grant * 4 + restrict;
}

/**
 * perm = min(max(base, grants), restrictions). Order-independent by construction.
 * The player's round-1 ban is absolute (D-015, D-042).
 */
export function attackPermission(s: GameState, env: Env, iid: Iid): AttackPerm {
  const loc = locate(s, iid);
  if (loc < 0) return 'none';
  const side = locSide(loc);
  const m = s.sides[side].board[locSlot(loc)] as Monster;
  if (side === 0 && roundOf(s) < env.g.FIRST_ATTACK_ROUND_PLAYER) return 'none';
  // universal summoning sickness (D-022)
  const f = foldPerm(s, env, m, side, m.entered === s.turn ? PERM_RANK.none : PERM_RANK.any);
  return PERM_BY_RANK[Math.min(f >> 2, f & 3)] as AttackPerm;
}

/** The restriction fold alone (D-212): 'any' when no active hook restricts, and for a card off the board. */
export function attackRestriction(s: GameState, env: Env, iid: Iid): AttackPerm {
  const loc = locate(s, iid);
  if (loc < 0) return 'any';
  const side = locSide(loc);
  const m = s.sides[side].board[locSlot(loc)] as Monster;
  return PERM_BY_RANK[foldPerm(s, env, m, side, PERM_RANK.none) & 3] as AttackPerm;
}
