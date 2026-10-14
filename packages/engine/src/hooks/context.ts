// Hook contexts (ARCHITECTURE.md §8.2). A context is created per dispatch over the state as it is
// at dispatch time; no write happens while a subscriber list runs (hooks only queue effects), so
// that snapshot equals the live Tx view for the whole list. `bind` re-targets it per subscriber.
import { evalCond } from '../effects/conditions';
import type { EffectSink, Refs } from '../effects/run';
import { EngineError } from '../errors';
import { activeKw, effectiveGuard, effectivePower, locate, locSide, locSlot, monsterOf } from '../stats';
import type { CompiledContent } from '../types/content';
import type { Effect } from '../types/effects';
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
} from '../types/hooks';
import type { GameState, Iid, Side } from '../types/state';
import type { Env } from './registry';

export class QueryContext implements QueryCtx {
  readonly g: Globals;
  readonly c: CompiledContent;
  self: Iid;
  side: Side;
  protected readonly attackerIid: Iid | -1;

  constructor(
    protected readonly env: Env,
    readonly s: GameState,
    self: Iid,
    side: Side,
    attacker: Iid | -1 = -1,
  ) {
    this.g = env.g;
    this.c = env.c;
    this.self = self;
    this.side = side;
    this.attackerIid = attacker;
  }

  /** Re-target at the next subscriber of the same dispatch. */
  bind(self: Iid, side: Side): void {
    this.self = self;
    this.side = side;
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
  isAttacker(i: Iid): boolean {
    return i === this.attackerIid;
  }
}

export class TargetQueryContext extends QueryContext implements TargetQueryCtx {
  constructor(
    env: Env,
    s: GameState,
    self: Iid,
    side: Side,
    readonly attacker: Iid,
  ) {
    super(env, s, self, side, attacker);
  }
}

export class EventContext<E> extends QueryContext implements HookCtx<E> {
  constructor(
    env: Env,
    s: GameState,
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
    s: GameState,
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
