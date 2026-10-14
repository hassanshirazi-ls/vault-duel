// Attack pipeline and combat preview (ARCHITECTURE.md §5.4; D-029 to D-036, D-039, D-040, D-049,
// D-122, D-124, D-135, D-141).
//
//   declare: attacked = turn, AttackDeclared, onAttackDeclared (traps may cancel, immediately)
//   direct:  damage = Power
//   monster: reveal a face-down target, snapshot, beforeCombat (flags OR-folded), queued effects
//            (a vanished combatant fizzles the attack), resolve from the snapshot, CombatResolved,
//            destroyBatch, then damage ("keywords and traps resolve before damage", D-032).
import { attackTargets, Dispatcher } from './hooks/dispatch';
import type { Env } from './hooks/registry';
import { EngineError } from './errors';
import { dealDamage } from './pipeline';
import type { Run } from './pipeline';
import { destroyBatch } from './destroy';
import { markRound } from './track';
import type { EffectSink } from './effects/run';
import {
  activeKw,
  attackPermission,
  effectiveGuard,
  effectivePower,
  hasAdvantage,
  locate,
  locSide,
  locSlot,
  monsterOf,
} from './stats';
import type { AttackEvt, CombatSnapshot } from './types/hooks';
import { RoundFlag } from './types/state';
import type { GameState, Iid, Monster, Pos, Side } from './types/state';

/** Outcome of one monster-vs-monster combat, a pure function of the snapshot and the two flags. */
export interface CombatOutcome {
  readonly destroyAttacker: boolean;
  readonly destroyDefender: boolean;
  /** life lost by the attacker's controller / the defender's controller */
  readonly dmgToAttacker: number;
  readonly dmgToDefender: number;
}

/**
 * The §5.4 resolve table. Brittle: the attacker automatically wins (D-049), damage as the normal
 * rule gives it. Pierce only matters against guard position (D-039); against attack position the
 * normal rule applies.
 */
export function resolveCombat(c: CombatSnapshot, pierce: boolean, brittleWin: boolean): CombatOutcome {
  const { aP, dP, dG } = c;
  if (c.defPos === 0) {
    if (brittleWin || aP > dP) {
      return { destroyAttacker: false, destroyDefender: true, dmgToAttacker: 0, dmgToDefender: Math.max(0, aP - dP) };
    }
    if (aP < dP) return { destroyAttacker: true, destroyDefender: false, dmgToAttacker: dP - aP, dmgToDefender: 0 };
    return { destroyAttacker: true, destroyDefender: true, dmgToAttacker: 0, dmgToDefender: 0 };
  }
  if (brittleWin || aP > dG) {
    return {
      destroyAttacker: false,
      destroyDefender: true,
      dmgToAttacker: 0,
      dmgToDefender: pierce ? Math.max(0, aP - dG) : 0,
    };
  }
  if (aP < dG) return { destroyAttacker: false, destroyDefender: false, dmgToAttacker: dG - aP, dmgToDefender: 0 };
  return { destroyAttacker: false, destroyDefender: false, dmgToAttacker: 0, dmgToDefender: 0 };
}

function snapshotOf(s: GameState, env: Env, a: Iid, t: Iid, defPos: Pos): CombatSnapshot {
  const advantage = hasAdvantage(s, env, a, t);
  const snap: CombatSnapshot = {
    aP: effectivePower(s, env, a) + (advantage ? env.g.ELEMENT_BONUS : 0),
    dP: effectivePower(s, env, t),
    dG: effectiveGuard(s, env, t),
    defPos,
    advantage,
  };
  return env.dev ? Object.freeze(snap) : snap; // hooks that write throw in dev/test (D-141)
}

/**
 * Targets `attacker` may declare an attack on right now (§6.2): empty unless it is a face-up
 * attack-position monster that has not attacked this turn with permission to attack. Enemy monsters
 * in slot order, narrowed to face-up Sentinels if any (D-037, D-038); `-1` (direct) only when the
 * enemy board is empty and the permission is 'any' (D-027, D-041). legal.ts enumerates from this.
 */
export function attackOptions(s: GameState, env: Env, attacker: Iid): Iid[] {
  const m = monsterOf(s, attacker);
  if (m === null || m.pos !== 0 || m.faceDown || m.attacked === s.turn) return [];
  const perm = attackPermission(s, env, attacker);
  if (perm === 'none') return [];
  const defSide = (1 - locSide(locate(s, attacker))) as Side;
  const targets = attackTargets(env, s, attacker, defSide);
  if (targets.length > 0) return targets;
  return perm === 'any' ? [-1] : [];
}

/**
 * `attack` action. `target === -1` is a direct attack. Assumes a legal attack (legal.ts); throws
 * EngineError when the attacker or target is not where the action says.
 */
export function declareAttack(run: Run, attacker: Iid, target: Iid | -1): void {
  const { tx, env } = run;
  const s0 = tx.state;
  const aLoc = locate(s0, attacker);
  if (aLoc < 0) throw new EngineError(`attack: ${attacker} is not on a board`);
  const aSide = locSide(aLoc);
  const dSide = (1 - aSide) as Side;
  if (target >= 0 && (locate(s0, target) < 0 || locSide(locate(s0, target)) !== dSide)) {
    throw new EngineError(`attack: ${target} is not on the defending board`);
  }

  // Declaration. The first attack closes the Reposition step and forfeits an unused play (D-014).
  tx.patchMonster(aSide, locSlot(aLoc), { attacked: s0.turn }); // a cancelled attack still counts (D-033)
  if (aSide === 0) markRound(tx, RoundFlag.Attacked);
  if (tx.state.step !== 'attack') tx.set('step', 'attack');
  if (!tx.state.played) tx.set('played', true);
  run.emit({ e: 'AttackDeclared', attacker, target });

  const evt: AttackEvt = { attacker, target };
  const cancelledBy = run.dispatcher().onAttackDeclared(evt);
  if (cancelledBy >= 0) run.emit({ e: 'AttackCancelled', attacker, by: cancelledBy });
  run.flush(); // the card's other effects (Mirror Sigil, Thornwall's position switch) still resolve
  if (run.over || cancelledBy >= 0) return;
  if (monsterOf(tx.state, attacker) === null) return; // attacker left the board: fizzle (§9.1)

  if (target < 0) {
    dealDamage(run, dSide, effectivePower(tx.state, env, attacker), attacker);
    return;
  }
  if (monsterOf(tx.state, target) === null) return; // target left the board: fizzle

  // Reveal: a face-down target becomes face-up guard before the snapshot (D-029, D-037).
  const tLoc = locate(tx.state, target);
  const tm = tx.state.sides[dSide].board[locSlot(tLoc)];
  if (tm !== null && tm !== undefined && tm.faceDown) {
    tx.patchMonster(dSide, locSlot(tLoc), { faceDown: false, pos: 1 });
    run.emit({ e: 'Revealed', iid: target, side: dSide });
  }

  const s1 = tx.state;
  const snap = snapshotOf(s1, env, attacker, target, (monsterOf(s1, target) as Monster).pos);
  const { pierce, brittleWin } = run.dispatcher().beforeCombat(evt, snap);
  run.flush(); // queued beforeCombat effects run before resolve and cannot change the snapshot (D-032, D-124)
  if (run.over) return;
  if (monsterOf(tx.state, attacker) === null || monsterOf(tx.state, target) === null) return; // fizzle (D-124)

  const out = resolveCombat(snap, pierce, brittleWin);
  const destroyed: Iid[] = [];
  if (out.destroyAttacker) destroyed.push(attacker);
  if (out.destroyDefender) destroyed.push(target);
  run.emit({
    e: 'CombatResolved',
    attacker,
    defender: target,
    aP: snap.aP,
    dStat: snap.defPos === 0 ? snap.dP : snap.dG,
    advantage: snap.advantage,
    pierce,
    brittle: brittleWin,
    destroyed,
  });
  // Destruction (Ward, onDestroyed hooks) resolves before damage; the amounts are already fixed.
  destroyBatch(run, destroyed, 'combat', [
    { victim: target, by: attacker },
    { victim: attacker, by: target },
  ]);
  if (run.over) return;
  dealDamage(run, aSide, out.dmgToAttacker, target);
  if (run.over) return;
  dealDamage(run, dSide, out.dmgToDefender, attacker);
}

// ---- preview -------------------------------------------------------------------------------

export type CombatPreview =
  | { readonly known: false }
  | {
      readonly known: true;
      readonly direct: boolean;
      readonly aP: number;
      /** the stat the attacker faces: Power for attack position, Guard for guard position; 0 for direct */
      readonly dStat: number;
      readonly advantage: boolean;
      readonly pierce: boolean;
      readonly brittle: boolean;
      readonly outcome: CombatOutcome;
      /** a Ward-style replacement (active beforeDestroy keyword) would save the attacker / defender */
      readonly attackerWarded: boolean;
      readonly defenderWarded: boolean;
    };

const NULL_SINK: EffectSink = { queue: () => undefined, emit: () => undefined };

/**
 * Same `resolveCombat` as the pipeline, without side effects (§5.4): no reveal, no traps, no queued
 * effects. For a face-down target the result is unknown. beforeCombat hooks run against a sink that
 * discards what they queue, so Pierce and Brittle are visible to AI and UI. `attacker` must be on a board.
 */
export function previewCombat(s: GameState, env: Env, attacker: Iid, target: Iid | -1): CombatPreview {
  if (monsterOf(s, attacker) === null) throw new EngineError(`preview: ${attacker} is not on a board`);
  if (target < 0) {
    const aP = effectivePower(s, env, attacker);
    return {
      known: true,
      direct: true,
      aP,
      dStat: 0,
      advantage: false,
      pierce: false,
      brittle: false,
      outcome: { destroyAttacker: false, destroyDefender: false, dmgToAttacker: 0, dmgToDefender: aP },
      attackerWarded: false,
      defenderWarded: false,
    };
  }
  const t = monsterOf(s, target);
  if (t === null) throw new EngineError(`preview: ${target} is not on a board`);
  if (t.faceDown) return { known: false };
  const snap = snapshotOf(s, env, attacker, target, t.pos);
  const flags = new Dispatcher(env, s, NULL_SINK).beforeCombat({ attacker, target }, snap);
  const outcome = resolveCombat(snap, flags.pierce, flags.brittleWin);
  const ward = env.reg.masks.beforeDestroy;
  return {
    known: true,
    direct: false,
    aP: snap.aP,
    dStat: snap.defPos === 0 ? snap.dP : snap.dG,
    advantage: snap.advantage,
    pierce: flags.pierce,
    brittle: flags.brittleWin,
    outcome,
    attackerWarded: (activeKw(s, env, attacker) & ward) !== 0,
    defenderWarded: (activeKw(s, env, target) & ward) !== 0,
  };
}
