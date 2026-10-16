// Hook contexts (ARCHITECTURE.md §8.2). A context is created per dispatch and reads the state through a
// `StateSource` on every access (D-186): a trap subscriber's `spendTrap` writes during the subscriber list, so a
// state captured at construction would go stale (§4.1 contract 1). `bind` re-targets it per subscriber.
import { evalCond } from '../effects/conditions';
import { globalByName } from '../effects/num';
import type { EffectSink, Refs } from '../effects/run';
import { EngineError } from '../errors';
import { activeKw, effectiveGuard, effectivePower, locate, locSide, locSlot, monsterOf } from '../stats';
import type { CompiledContent } from '../types/content';
import type { Cond, Effect } from '../types/effects';
import type { GameEvent } from '../types/events';
import type { Globals } from '../types/globals';
import type {
  AttackCtx,
  AttackEvt,
  CombatCtx,
  CombatSnapshot,
  HookCtx,
  QueryCtx,
  TargetQueryCtx,
  TrapCtx,
} from '../types/hooks';
import type { GameState, Iid, Side } from '../types/state';
import type { Env } from './registry';

/** Where a context reads the current state from; a `Run` is one (`run.state` is the live Tx view). */
export interface StateSource {
  readonly state: GameState;
}

/** A fixed state (read-only query folds, tests) or a live source. */
export type StateRef = GameState | StateSource;

export function sourceOf(r: StateRef): StateSource {
  return 'state' in r ? r : { state: r };
}

export class QueryContext implements QueryCtx {
  readonly g: Globals;
  readonly c: CompiledContent;
  self: Iid;
  side: Side;
  protected readonly attackerIid: Iid | -1;
  protected readonly src: StateSource;
  /** set by EventContext.spendTrap; the dispatcher reads and clears it per subscriber (D-071) */
  trapSpent = false;
  /** true while a compiled trap's subscriber runs; only then may `spendTrap` be called (D-186) */
  protected inTrap = false;

  constructor(
    protected readonly env: Env,
    s: StateRef,
    self: Iid,
    side: Side,
    attacker: Iid | -1 = -1,
  ) {
    this.src = sourceOf(s);
    this.g = env.g;
    this.c = env.c;
    this.self = self;
    this.side = side;
    this.attackerIid = attacker;
  }

  /** The state as it is now. */
  get s(): GameState {
    return this.src.state;
  }

  /** Re-target at the next subscriber of the same dispatch. */
  bind(self: Iid, side: Side, trap = false): void {
    this.self = self;
    this.side = side;
    this.trapSpent = false;
    this.inTrap = trap;
  }

  power(i: Iid): number {
    return effectivePower(this.s, this.env, i);
  }
  guard(i: Iid): number {
    return effectiveGuard(this.s, this.env, i);
  }
  controller(i: Iid): Side | -1 {
    const loc = locate(this.s, i);
    return loc < 0 ? -1 : locSide(loc);
  }
  slot(i: Iid): number {
    const loc = locate(this.s, i);
    return loc < 0 ? -1 : locSlot(loc);
  }
  isFaceUp(i: Iid): boolean {
    const m = monsterOf(this.s, i);
    return m !== null && !m.faceDown;
  }
  hasKw(i: Iid, id: string): boolean {
    const bit = this.c.kwBit[id];
    return bit !== undefined && (activeKw(this.s, this.env, i) & (1 << bit)) !== 0;
  }
  monsters(side: Side): readonly Iid[] {
    const out: Iid[] = [];
    const board = this.s.sides[side].board;
    for (let i = 0; i < board.length; i++) {
      const m = board[i];
      if (m !== null && m !== undefined) out.push(m.iid);
    }
    return out;
  }
  enteredThisTurn(i: Iid): boolean {
    return monsterOf(this.s, i)?.entered === this.s.turn;
  }
  ownTurnsSinceEntered(i: Iid): number {
    const loc = locate(this.s, i);
    if (loc < 0) return -1;
    const m = this.s.sides[locSide(loc)].board[locSlot(loc)];
    if (m === null || m === undefined) return -1;
    // Turns with index parity x are the controller's own; the arithmetic shift also handles the DSL's entered = -1.
    const x = locSide(loc);
    return ((this.s.turn - x) >> 1) - ((m.entered - x) >> 1);
  }
  isAttacker(i: Iid): boolean {
    return i === this.attackerIid;
  }
  num(name: string): number {
    return globalByName(this.g, name);
  }
}

export class TargetQueryContext extends QueryContext implements TargetQueryCtx {
  readonly lanes: boolean;
  readonly reach: number;
  constructor(
    env: Env,
    s: StateRef,
    self: Iid,
    side: Side,
    readonly attacker: Iid,
    readonly attackerLane: number = -1,
  ) {
    super(env, s, self, side, attacker);
    this.lanes = env.g.FLAGS.LANES;
    this.reach = env.g.SENTINEL_REACH;
  }
}

export class EventContext<E> extends QueryContext implements HookCtx<E>, TrapCtx<HookCtx<E>> {
  constructor(
    env: Env,
    s: StateRef,
    protected readonly sink: EffectSink,
    readonly evt: E,
    protected readonly refs: Refs,
    attacker: Iid | -1 = -1,
  ) {
    super(env, s, -1, 0, attacker);
  }

  /** Queue an effect with refs bound to the event and `self` bound to the current subscriber. */
  effect(e: Effect): void {
    if (e.op === 'cancelAttack') {
      throw new EngineError('cancelAttack is only available inside onAttackDeclared (D-122)');
    }
    this.sink.queue({ effect: e, refs: { ...this.refs, self: this.self }, source: this.self, side: this.side });
  }

  emit(ev: GameEvent): void {
    this.sink.emit(ev);
  }

  holds(cond: Cond, iid: Iid): boolean {
    return evalCond(cond, { s: this.s, env: this.env, refs: this.refs }, iid);
  }

  /** Trap subscribers only (TrapCtx, D-186). Immediate and visible to every later subscriber of the same destruction batch (D-158). Not an effect. */
  spendTrap(): void {
    if (!this.inTrap) throw new EngineError('spendTrap is only available to trap hooks (D-186)');
    this.sink.spendTrap(this.side, this.self);
    this.trapSpent = true;
  }
}

export class AttackContext extends EventContext<AttackEvt> implements AttackCtx {
  #cancelledBy: Iid | -1 = -1;

  get cancelled(): boolean {
    return this.#cancelledBy >= 0;
  }

  /** Who cancelled (first canceller wins), or -1. */
  get cancelledBy(): Iid | -1 {
    return this.#cancelledBy;
  }

  /** Immediate and visible to every later subscriber (§8.3.4, D-122). Not an effect: nothing is written. */
  cancelAttack(by: Iid): void {
    if (this.#cancelledBy < 0) this.#cancelledBy = by;
  }

  override effect(e: Effect): void {
    if (e.op === 'cancelAttack') {
      if (e.if === undefined || evalCond(e.if, { s: this.s, env: this.env, refs: this.refs }, this.refs.attacker)) {
        this.cancelAttack(this.self);
      }
      return;
    }
    super.effect(e);
  }
}

/** Flags a beforeCombat dispatch folds (D-124); owned by the dispatcher, unreadable by hooks. */
export interface CombatFlags {
  pierce: boolean;
  brittleWin: boolean;
}

export class CombatContext extends EventContext<AttackEvt> implements CombatCtx {
  readonly #flags: CombatFlags;

  constructor(
    env: Env,
    s: StateRef,
    sink: EffectSink,
    evt: AttackEvt,
    refs: Refs,
    readonly combat: CombatSnapshot,
    flags: CombatFlags,
  ) {
    super(env, s, sink, evt, refs, evt.attacker);
    this.#flags = flags;
  }

  setPierce(): void {
    this.#flags.pierce = true;
  }
  setBrittleWin(): void {
    this.#flags.brittleWin = true;
  }
}
