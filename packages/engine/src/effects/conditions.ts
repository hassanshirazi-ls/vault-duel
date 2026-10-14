// Condition evaluation (ARCHITECTURE.md §9.1, D-129). Pure function of (state, env, card).
import { EngineError } from '../errors';
import { activeKw, effectivePower, effectivePowerNoTwist, elementOf, isMonsterCard, kindOf, locate, monsterOf } from '../stats';
import type { Env } from '../hooks/registry';
import { DefType, Pool } from '../types/content';
import type { Cond } from '../types/effects';
import type { GameState, Iid } from '../types/state';
import { resolveNum } from './num';

/** Event references for conditions that look at the triggering event (directAttack). */
export interface CondRefs {
  readonly attacker: Iid | -1;
  readonly defender: Iid | -1;
}

export interface CondCx {
  readonly s: GameState;
  readonly env: Env;
  /** false while evaluating twist modifiers (avoids recursion); default true */
  readonly twist?: boolean;
  readonly refs?: CondRefs;
}

function power(cx: CondCx, iid: Iid): number {
  return cx.twist === false ? effectivePowerNoTwist(cx.s, cx.env, iid) : effectivePower(cx.s, cx.env, iid);
}

export function evalCond(cond: Cond, cx: CondCx, iid: Iid): boolean {
  const { s, env } = cx;
  if ('all' in cond) return cond.all.every((k) => evalCond(k, cx, iid));
  if ('any' in cond) return cond.any.some((k) => evalCond(k, cx, iid));
  if ('not' in cond) return !evalCond(cond.not, cx, iid);
  if ('faceUp' in cond) {
    const m = monsterOf(s, iid);
    return m !== null && !m.faceDown;
  }
  if ('powerLte' in cond) return power(cx, iid) <= resolveNum(env.g, cond.powerLte);
  if ('powerGte' in cond) return power(cx, iid) >= resolveNum(env.g, cond.powerGte);
  if ('type' in cond) return isMonsterCard(s, env, iid);
  if ('relic' in cond) {
    // "Relic" = Collector monster card (D-068); a Chimera is not a Relic.
    const inst = s.inst[iid];
    return inst !== undefined && env.c.type[inst.def] === DefType.Monster && env.c.pool[inst.def] === Pool.Collector;
  }
  if ('chimera' in cond) return (s.inst[iid]?.chimera ?? null) !== null;
  if ('onBoard' in cond) return locate(s, iid) >= 0;
  if ('directAttack' in cond) {
    const r = cx.refs;
    if (r === undefined || r.attacker < 0) return false;
    return (r.defender < 0) === cond.directAttack;
  }
  if ('graftedThisTurn' in cond) {
    return s.inst[iid]?.chimera?.grafted === s.turn;
  }
  if ('element' in cond) {
    const e = elementOf(s, env, iid);
    return e >= 0 && env.c.elementIds[e] === cond.element;
  }
  if ('kind' in cond) {
    const k = kindOf(s, env, iid); // -1 for Chimeras (D-129)
    return k >= 0 && env.c.kindIds[k] === cond.kind;
  }
  if ('keyword' in cond) {
    const bit = env.c.kwBit[cond.keyword];
    return bit !== undefined && (activeKw(s, env, iid) & (1 << bit)) !== 0;
  }
  throw new EngineError('unknown condition');
}
