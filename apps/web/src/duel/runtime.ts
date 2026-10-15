// The duel loop around the engine. Every legal move comes from `engine.getLegalActions`, every state change from
// `engine.applyAction`; the Collector's turn runs synchronously through the ai policy (ARCHITECTURE.md §16).
import { createCollector } from '@vault-duel/ai';
import type { Collector, DailySetup } from '@vault-duel/ai';
import { createEngine, rerollSeed } from '@vault-duel/engine';
import type { Action, Engine, GameEvent, GameState } from '@vault-duel/engine';
import type { GameCtx } from '../content/load';
import { isPlayerToAct } from './turn';

export interface Runtime {
  readonly ctx: GameCtx;
  readonly engine: Engine;
  readonly collector: Collector;
}

export interface Step {
  readonly state: GameState;
  /** every event of the step, in order: the player's action, then the Collector's turn */
  readonly events: readonly GameEvent[];
  /** every action applied, in order (the player's, then the Collector's) */
  readonly applied: readonly Action[];
}

/** A hard stop against a policy that never ends its turn; a duel is at most a few hundred actions. */
const MAX_COLLECTOR_ACTIONS = 1000;

export function createRuntime(ctx: GameCtx, opts: { readonly dev?: boolean } = {}): Runtime {
  const collector = createCollector({ content: ctx.content, globals: ctx.globals });
  const engine = createEngine(ctx.content, ctx.globals, { intent: collector.intentPolicy }, { dev: opts.dev ?? false });
  return { ctx, engine, collector };
}

export const seedOf = (setup: Pick<DailySetup, 'seedString' | 'k'>): string => rerollSeed(setup.seedString, setup.k);

export function newDuel(rt: Runtime, setup: DailySetup): Step {
  const r = rt.engine.newGame(seedOf(setup), { twist: setup.twist });
  return { state: r.state, events: r.events, applied: [] };
}

/** Applies the player's action, then plays the Collector's whole turn if the turn passed to him. */
export function playerStep(rt: Runtime, from: GameState, action: Action): Step {
  const events: GameEvent[] = [];
  const applied: Action[] = [action];
  let r = rt.engine.applyAction(from, action);
  events.push(...r.events);
  let state = r.state;
  while (state.result === null && !isPlayerToAct(state)) {
    if (applied.length > MAX_COLLECTOR_ACTIONS) throw new Error('the Collector never ended his turn');
    const a = rt.collector.act(state);
    applied.push(a);
    r = rt.engine.applyAction(state, a);
    events.push(...r.events);
    state = r.state;
  }
  return { state, events, applied };
}
