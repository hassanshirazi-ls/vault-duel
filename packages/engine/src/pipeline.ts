// Shared plumbing for the §5 pipelines (turn, summon, combat, destroy). A `Run` is one applyAction:
// it owns the Tx, the event list, the FIFO effect queue and the services other pipelines inject.
// Engine-internal (not exported from the package root).
import { EngineError } from './errors';
import { Dispatcher } from './hooks/dispatch';
import type { Env } from './hooks/registry';
import { EffectQueue } from './effects/run';
import type { EffectHost, EffectSink, QueuedEffect } from './effects/run';
import { destroyBatch } from './destroy';
import { moodOf } from './mood';
import type { Tx } from './tx';
import type { GameEvent } from './types/events';
import type { GameState, Intent, Iid, Side } from './types/state';

/** Intent policy injected by createEngine (D-096). The engine never imports `ai`. */
export type IntentPolicy = (s: GameState) => Intent;

/** Injected services (D-150). Required when FLAGS.INTENTS is on: createEngine enforces it. */
export interface Services {
  readonly intent?: IntentPolicy;
}

export class Run implements EffectSink {
  readonly fx = new EffectQueue();
  readonly host: EffectHost;
  private draining = false;

  /** `events === null` turns event collection off (`{ events: false }`, §7, §18.4). */
  constructor(
    readonly tx: Tx,
    readonly env: Env,
    readonly events: GameEvent[] | null,
    readonly services: Services = {},
  ) {
    this.host = {
      emit: (ev) => this.emit(ev),
      destroy: (iids) => destroyBatch(this, iids, 'effect'),
      lifeChanged: () => lifeChanged(this),
    };
  }

  get state(): GameState {
    return this.tx.state;
  }

  emit(ev: GameEvent): void {
    this.events?.push(ev);
  }

  /** A set trap fires: out of its slot into its owner's discard, then TrapTriggered (§8.3.3, D-071, D-158). */
  spendTrap(side: Side, iid: Iid): void {
    const { tx } = this;
    const traps = tx.state.sides[side].traps;
    let slot = -1;
    for (let i = 0; i < traps.length; i++) if (traps[i]?.iid === iid) slot = i;
    if (slot < 0) throw new EngineError(`spendTrap: ${iid} is not a set trap of side ${side}`);
    tx.setTrap(side, slot, null);
    tx.zonePush(tx.state.inst[iid]?.owner ?? side, 'discard', iid);
    this.emit({ e: 'TrapTriggered', side, iid, slot });
  }

  queue(q: QueuedEffect): void {
    this.fx.queue(q);
  }

  /** A dispatcher over the state as it is now; build one immediately before every dispatch. */
  dispatcher(): Dispatcher {
    return new Dispatcher(this.env, this.tx.state, this);
  }

  /**
   * Run queued effects FIFO (§8.3.2). Re-entrant calls (a destruction raised by a queued effect
   * dispatches onDestroyed, which flushes) do nothing: the outer drain loop picks the new effects up.
   */
  flush(): void {
    if (this.draining) return;
    this.draining = true;
    try {
      this.fx.drain(this.tx, this.env, this.host);
    } finally {
      this.draining = false;
    }
  }

  get over(): boolean {
    return this.tx.state.result !== null;
  }
}

/** Win check and mood refresh after any life change (§5.8, D-018, D-080). */
export function lifeChanged(run: Run): void {
  const { tx, env } = run;
  const s = tx.state;
  const mood = moodOf(s.sides[1].life, env.g); // pinned Composed when FLAGS.MOODS is off
  if (mood !== s.collector.mood) {
    run.emit({ e: 'MoodChanged', from: s.collector.mood, to: mood });
    tx.set('collector', { ...s.collector, mood });
  }
  checkWin(run);
}

/** Collector <= 0 -> player wins; else player <= 0 -> player loses. Ends the game immediately (D-018). */
export function checkWin(run: Run): void {
  const { tx } = run;
  const s = tx.state;
  if (s.result !== null) return;
  const round = (s.turn >> 1) + 1;
  if (s.sides[1].life <= 0) endGame(run, { winner: 0, reason: 'collectorDefeated', round });
  else if (s.sides[0].life <= 0) endGame(run, { winner: 1, reason: 'playerDefeated', round });
}

export function endGame(run: Run, result: NonNullable<GameState['result']>): void {
  run.tx.set('result', result);
  run.tx.set('step', 'over');
  run.emit({ e: 'GameOver', result });
}

/** Life loss from combat or an effect; emits Damage, refreshes mood, checks the win (§5.4). */
export function dealDamage(run: Run, side: Side, amount: number, source: Iid | -1): void {
  if (amount <= 0) return;
  const lifeAfter = run.tx.state.sides[side].life - amount;
  run.tx.setLife(side, lifeAfter);
  run.emit({ e: 'Damage', side, amount, source, lifeAfter });
  lifeChanged(run);
}
