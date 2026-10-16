// The duel loop around the engine. Every legal move comes from `engine.getLegalActions`, every state change from
// `engine.applyAction`; the Collector's turn runs synchronously through the ai policy (ARCHITECTURE.md §16).
import { createCollector } from '@vault-duel/ai';
import type { Collector, DailySetup } from '@vault-duel/ai';
import { createEngine, rerollSeed } from '@vault-duel/engine';
import type { Action, Engine, GameEvent, GameState, Side } from '@vault-duel/engine';
import type { GameCtx } from '../content/load';
import { collectorTrapCount } from '../view/undo';
import type { ActionRecord } from '../view/undo';
import { isPlayerToAct } from './turn';

export interface Runtime {
  readonly ctx: GameCtx;
  readonly engine: Engine;
  readonly collector: Collector;
}

/** One applied action with the state on both sides of it, so the animation layer can show the step one action at a time. */
export interface Frame {
  readonly action: Action;
  /** who acted: 0 the player, 1 the Collector */
  readonly side: Side;
  readonly before: GameState;
  readonly after: GameState;
  readonly events: readonly GameEvent[];
}

export const recordOf = (f: Frame): ActionRecord => ({ action: f.action, events: f.events, collectorTraps: collectorTrapCount(f.before) });

export interface Step {
  readonly state: GameState;
  /** every event of the step, in order: the player's action, then the Collector's turn */
  readonly events: readonly GameEvent[];
  /** every action applied, in order (the player's, then the Collector's) */
  readonly applied: readonly Action[];
  /** the same actions one by one, each with its own events and the states around it (presentation only) */
  readonly frames: readonly Frame[];
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
  return { state: r.state, events: r.events, applied: [], frames: [] };
}

/** Applies the player's action, then plays the Collector's whole turn if the turn passed to him. */
export function playerStep(rt: Runtime, from: GameState, action: Action): Step {
  const events: GameEvent[] = [];
  const applied: Action[] = [action];
  const frames: Frame[] = [];
  let r = rt.engine.applyAction(from, action);
  events.push(...r.events);
  frames.push({ action, side: 0, before: from, after: r.state, events: r.events });
  let state = r.state;
  while (state.result === null && !isPlayerToAct(state)) {
    if (applied.length > MAX_COLLECTOR_ACTIONS) throw new Error('the Collector never ended his turn');
    const a = rt.collector.act(state);
    applied.push(a);
    r = rt.engine.applyAction(state, a);
    events.push(...r.events);
    frames.push({ action: a, side: 1, before: state, after: r.state, events: r.events });
    state = r.state;
  }
  return { state, events, applied, frames };
}

/** Rebuilds a duel from its action log, keeping what undo and the duel log need from every action. */
export function replayTrail(rt: Runtime, setup: DailySetup, actions: readonly Action[]): { readonly state: GameState; readonly trail: ActionRecord[] } {
  let state = rt.engine.newGame(seedOf(setup), { twist: setup.twist }).state;
  const trail: ActionRecord[] = [];
  for (const action of actions) {
    const r = rt.engine.applyAction(state, action);
    trail.push({ action, events: r.events, collectorTraps: collectorTrapCount(state) });
    state = r.state;
  }
  return { state, trail };
}
