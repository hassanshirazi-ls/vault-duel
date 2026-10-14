// Effect-primitive interpreter (ARCHITECTURE.md §9.1). The only place hook-queued effects change
// state. Writes go through the Tx; everything that belongs to a later pipeline (destruction batch,
// win check) is reached through EffectHost.
import { EngineError } from '../errors';
import type { Env } from '../hooks/registry';
import { locate, locSide, locSlot } from '../stats';
import type { Tx } from '../tx';
import type { Effect } from '../types/effects';
import type { GameEvent } from '../types/events';
import type { GameState, Iid, Side } from '../types/state';
import { evalCond } from './conditions';
import { resolveNum } from './num';
import { resolveRef } from './targets';

/** Event references bound at queue time (`chosen` for spells; the others from the triggering event). */
export interface Refs {
  readonly chosen: Iid | -1;
  readonly self: Iid | -1;
  readonly attacker: Iid | -1;
  readonly defender: Iid | -1;
  readonly destroyed: Iid | -1;
  readonly destroyer: Iid | -1;
  readonly grafted: Iid | -1;
}

export interface QueuedEffect {
  readonly effect: Effect;
  readonly refs: Refs;
  /** the card (monster or trap/spell) whose hook or text produced the effect */
  readonly source: Iid;
  /** controller of that card at queue time (durations are relative to it) */
  readonly side: Side;
}

/** What hooks and dispatch write into: queued effects and events. */
export interface EffectSink {
  queue(q: QueuedEffect): void;
  emit(ev: GameEvent): void;
}

/** Services owned by later pipelines (destroy.ts, reducer.ts). */
export interface EffectHost {
  emit(ev: GameEvent): void;
  /** Destruction batch with Ward replacement and onDestroyed dispatch (§5.5). No destroyer (D-045, D-160). */
  destroy(iids: readonly Iid[]): void;
  /** Called after any life change (win check, mood). */
  lifeChanged(): void;
}

/** The controller's next own turn index (D-069): own turn t -> t + DURATION_NEXT_OWN_TURN, else t + 1. */
export function nextOwnTurn(s: GameState, env: Env, side: Side): number {
  return (s.turn & 1) === side ? s.turn + env.g.DURATION_NEXT_OWN_TURN : s.turn + 1;
}

function otherSide(side: Side): Side {
  return (1 - side) as Side;
}

/** The card an `if` guard looks at: the effect's target ref, or `self` for target-less ops. */
function guardSubject(e: Effect, refs: Refs): Iid | -1 {
  switch (e.op) {
    case 'modifyStats':
    case 'destroy':
    case 'returnToHand':
    case 'changePosition':
    case 'preventAppraisal':
      return resolveRef(refs, e.target);
    case 'cancelAttack':
      return refs.attacker;
    default:
      return refs.self;
  }
}

export function runEffect(tx: Tx, env: Env, q: QueuedEffect, host: EffectHost): void {
  const e = q.effect;
  const refs = q.refs;
  if (e.op === 'cancelAttack') {
    throw new EngineError('cancelAttack is applied immediately by the hook context, never queued (D-122)');
  }
  if (e.if !== undefined) {
    const subject = guardSubject(e, refs);
    // A guard on a vanished target fizzles; a guard on a target-less op with no self is vacuous.
    if (subject < 0) {
      if (e.op !== 'draw' && e.op !== 'damage' && e.op !== 'heal') return;
    } else if (!evalCond(e.if, { s: tx.state, env, refs }, subject)) {
      return;
    }
  }
  switch (e.op) {
    case 'draw': {
      const side = e.who === 'self' ? q.side : otherSide(q.side);
      const n = resolveNum(e.n, env.g);
      if (n <= 0) return;
      const drawn = tx.zoneTake(side, 'deck', n);
      for (let i = 0; i < drawn.length; i++) {
        const iid = drawn[i] as Iid;
        tx.zonePush(side, 'hand', iid);
        host.emit({ e: 'CardDrawn', side, iid, byEffect: true });
      }
      if (drawn.length < n) host.emit({ e: 'DrawSkipped', side, reason: 'deckEmpty' });
      return;
    }
    case 'damage': {
      const side = e.who === 'self' ? q.side : otherSide(q.side);
      const amount = resolveNum(e.n, env.g);
      if (amount <= 0) return;
      const lifeAfter = tx.state.sides[side].life - amount;
      tx.setLife(side, lifeAfter);
      host.emit({ e: 'Damage', side, amount, source: q.source, lifeAfter });
      host.lifeChanged();
      return;
    }
    case 'heal': {
      const side = e.who === 'self' ? q.side : otherSide(q.side);
      const amount = resolveNum(e.n, env.g);
      if (amount <= 0) return;
      const lifeAfter = tx.state.sides[side].life + amount; // no life cap (D-019)
      tx.setLife(side, lifeAfter);
      host.emit({ e: 'LifeGained', side, amount, source: q.source, lifeAfter });
      host.lifeChanged();
      return;
    }
    case 'modifyStats': {
      const target = resolveRef(refs, e.target);
      const loc = target < 0 ? -1 : locate(tx.state, target);
      if (loc < 0) return; // fizzle: not on a board
      const p = e.power === undefined ? 0 : resolveNum(e.power, env.g);
      const g = e.guard === undefined ? 0 : resolveNum(e.guard, env.g);
      if (p === 0 && g === 0) return;
      const side = locSide(loc);
      const slot = locSlot(loc);
      const m = tx.state.sides[side].board[slot];
      if (m === null || m === undefined) return;
      if (e.duration === 'permanent') {
        tx.patchMonster(side, slot, { permP: m.permP + p, permG: m.permG + g });
      } else {
        // Timed mods apply while state.turn <= until (D-031).
        const until =
          e.duration === 'thisTurn'
            ? tx.state.turn
            : e.duration === 'untilEndOfYourNextTurn'
              ? nextOwnTurn(tx.state, env, q.side)
              : nextOwnTurn(tx.state, env, q.side) - 1; // untilYourNextTurn: until the start of that turn
        tx.patchMonster(side, slot, { timed: [...m.timed, { p, g, until }] });
      }
      host.emit({ e: 'StatsModified', iid: target, p, g, duration: e.duration, source: q.source });
      return;
    }
    case 'destroy': {
      const target = resolveRef(refs, e.target);
      if (target < 0 || locate(tx.state, target) < 0) return;
      host.destroy([target]); // spells/traps have no destroyer (D-045)
      return;
    }
    case 'returnToHand': {
      const target = resolveRef(refs, e.target);
      const inst = target < 0 ? undefined : tx.state.inst[target];
      if (target < 0 || inst === undefined) return;
      // FLAGS.CHIMERA_TO_HAND off: a Chimera stays in the discard (proposal M-12).
      if (inst.chimera !== null && !env.g.FLAGS.CHIMERA_TO_HAND) return;
      const owner = inst.owner;
      const loc = locate(tx.state, target);
      if (loc >= 0) {
        tx.setSlot(locSide(loc), locSlot(loc), null);
        tx.zonePush(owner, 'hand', target);
        host.emit({ e: 'ReturnedToHand', iid: target, side: owner, from: 'board', source: q.source });
      } else if (tx.zoneRemove(owner, 'discard', target)) {
        tx.zonePush(owner, 'hand', target);
        host.emit({ e: 'ReturnedToHand', iid: target, side: owner, from: 'discard', source: q.source });
      }
      return;
    }
    case 'changePosition': {
      const target = resolveRef(refs, e.target);
      const loc = target < 0 ? -1 : locate(tx.state, target);
      if (loc < 0) return;
      const side = locSide(loc);
      const slot = locSlot(loc);
      const m = tx.state.sides[side].board[slot];
      if (m === null || m === undefined || m.faceDown) return; // face-down is always guard (D-037): fizzle
      const pos = e.to === 'attack' ? 0 : 1;
      if (m.pos === pos) return;
      tx.patchMonster(side, slot, { pos }); // never touches `repositioned` (D-024)
      host.emit({ e: 'PositionChanged', iid: target, pos, source: q.source });
      return;
    }
    case 'preventAppraisal': {
      const target = resolveRef(refs, e.target);
      const loc = target < 0 ? -1 : locate(tx.state, target);
      if (loc < 0) return;
      const side = locSide(loc);
      const slot = locSlot(loc);
      const m = tx.state.sides[side].board[slot];
      if (m === null || m === undefined) return;
      const until = Math.max(m.shroudUntil, nextOwnTurn(tx.state, env, q.side)); // shrouded while turn < until
      tx.patchMonster(side, slot, { shroudUntil: until });
      host.emit({ e: 'ShroudApplied', iid: target, until });
      return;
    }
  }
}

/** FIFO effect queue (§8.3.2). Implements EffectSink's `queue`; events go to the host. */
export class EffectQueue {
  private items: QueuedEffect[] = [];
  private head = 0;

  get length(): number {
    return this.items.length - this.head;
  }

  queue(q: QueuedEffect): void {
    this.items.push(q);
  }

  /**
   * Run effects until the queue is empty. Effects queued while draining (via the host) run after the
   * ones already queued. A drain longer than MAX_TRIGGER_CHAIN throws EngineError (§8.3.7); once a
   * result is set the remaining queue is dropped (§8.3.5).
   */
  drain(tx: Tx, env: Env, host: EffectHost): void {
    let n = 0;
    try {
      while (this.head < this.items.length) {
        if (tx.state.result !== null) return;
        if (++n > env.g.MAX_TRIGGER_CHAIN) {
          throw new EngineError(`effect chain longer than MAX_TRIGGER_CHAIN (${env.g.MAX_TRIGGER_CHAIN})`);
        }
        runEffect(tx, env, this.items[this.head++] as QueuedEffect, host);
      }
    } finally {
      this.items = [];
      this.head = 0;
    }
  }
}
