// Ref and target resolution (ARCHITECTURE.md §9.1 semantics).
import { evalCond } from './conditions';
import type { Env } from '../hooks/registry';
import { locate, locSide } from '../stats';
import type { Effect, Ref, TargetSpec } from '../types/effects';
import type { GameState, Iid, Side } from '../types/state';
import type { Refs } from './run';

export const NO_REFS: Refs = {
  chosen: -1,
  self: -1,
  attacker: -1,
  defender: -1,
  destroyed: -1,
  destroyer: -1,
  grafted: -1,
};

export function makeRefs(over: Partial<Refs>): Refs {
  return { ...NO_REFS, ...over };
}

export function resolveRef(refs: Refs, ref: Ref): Iid | -1 {
  return refs[ref];
}

/** Which side an `ally`/`enemy` target spec means for a caster. */
export const specSide = (spec: TargetSpec, caster: Side): Side => (spec.side === 'ally' ? caster : ((1 - caster) as Side));

/**
 * Legal candidates for a spell TargetSpec (one legal `cast` per candidate; used by legal.ts).
 * Board: monsters in slot order. Discard: cards in discard order. `where` filters.
 * With FLAGS.CHIMERA_TO_HAND off, a spell that returns its chosen target to hand does not offer
 * Chimeras (M-12, D-140): the effect would fizzle on them.
 */
export function targetCandidates(
  s: GameState,
  env: Env,
  caster: Side,
  spec: TargetSpec,
  effects: readonly Effect[],
): Iid[] {
  const side = specSide(spec, caster);
  const out: Iid[] = [];
  const cx = { s, env };
  const skipChimeras =
    !env.g.FLAGS.CHIMERA_TO_HAND && effects.some((e) => e.op === 'returnToHand' && e.target === 'chosen');
  const ok = (iid: Iid): boolean => !skipChimeras || (s.inst[iid]?.chimera ?? null) === null;
  if (spec.zone === 'board') {
    const board = s.sides[side].board;
    for (let i = 0; i < board.length; i++) {
      const m = board[i];
      if (m === null || m === undefined) continue;
      if (ok(m.iid) && (spec.where === undefined || evalCond(spec.where, cx, m.iid))) out.push(m.iid);
    }
  } else {
    const discard = s.sides[side].discard;
    for (let i = 0; i < discard.length; i++) {
      const iid = discard[i] as Iid;
      if (ok(iid) && (spec.where === undefined || evalCond(spec.where, cx, iid))) out.push(iid);
    }
  }
  return out;
}

/** Controller side of an on-board card, or -1. */
export function controllerOf(s: GameState, iid: Iid): Side | -1 {
  const loc = locate(s, iid);
  return loc < 0 ? -1 : locSide(loc);
}
