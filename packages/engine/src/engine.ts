// createEngine (ARCHITECTURE.md §1, §6.2, §11, §18.9; D-096, D-150). Binds compiled content, globals and
// injected policies into a facade over the pure functions. Content is passed in compiled form; the engine
// never imports content data or `ai`.
import { EngineError } from './errors';
import { deepFreeze } from './freeze';
import { createEnv } from './hooks/registry';
import type { Env } from './hooks/registry';
import { countLegal, forEachLegal, getLegalActions, isLegal } from './legal';
import type { IntentPolicy, Services } from './pipeline';
import { Run } from './pipeline';
import { applyAction, beginDuel, NO_EVENTS } from './reducer';
import type { ActionResult, RunOptions } from './reducer';
import { replay } from './replay';
import { buildInitialState } from './setup/initial-state';
import type { NewGameOptions } from './setup/initial-state';
import { Tx } from './tx';
import { compileTraps } from './traps';
import type { Action, ActionVisitor } from './types/actions';
import type { CompiledContent } from './types/content';
import type { GameEvent } from './types/events';
import type { Globals } from './types/globals';
import type { GameState } from './types/state';

export interface EnginePolicies {
  /** Required when FLAGS.INTENTS is on (D-150). Pure, read-only, keeps no references into the state. */
  readonly intent?: IntentPolicy;
}

export interface EngineOptions {
  /** freeze committed states and combat snapshots so a write throws (D-141); default false */
  readonly dev?: boolean;
  /** collect events; default true */
  readonly events?: boolean;
  /** append actions to `state.log`; default true */
  readonly log?: boolean;
  /** skip the legality check in applyAction (the sim, where every action came from the generator); default false */
  readonly trusted?: boolean;
}

export interface Engine {
  readonly content: CompiledContent;
  readonly globals: Globals;
  /** `seed` is the full seed string including `#k` (D-003). */
  newGame(seed: string, opts?: NewGameOptions): ActionResult;
  applyAction(state: GameState, action: Action): ActionResult;
  getLegalActions(state: GameState): Action[];
  forEachLegal(state: GameState, visit: ActionVisitor): void;
  countLegal(state: GameState): number;
  isLegal(state: GameState, action: Action): boolean;
  replay(seed: string, actions: readonly Action[], opts?: NewGameOptions): GameState;
}

/** Internal view for modules and test helpers that need the Env (not part of the public surface). */
export interface EngineInternals extends Engine {
  readonly env: Env;
}

/** Same as `createEngine`, also exposing the Env (engine tests and test-utils; not exported from the package root). */
export function createEngineInternals(
  content: CompiledContent,
  globals: Globals,
  policies: EnginePolicies = {},
  options: EngineOptions = {},
): EngineInternals {
  if (globals.FLAGS.INTENTS && policies.intent === undefined) {
    // The intent is stored state and bots read it: two engines with and without a policy would diverge (D-150).
    throw new EngineError('createEngine: FLAGS.INTENTS is on but no intent policy was given');
  }
  const dev = options.dev ?? false;
  const env = createEnv(content, globals, compileTraps(content), dev);
  const services: Services = policies.intent === undefined ? {} : { intent: policies.intent };
  const run: RunOptions = {
    events: options.events ?? true,
    log: options.log ?? true,
    trusted: options.trusted ?? false,
  };

  const self: EngineInternals = {
    content,
    globals,
    env,
    newGame(seed, opts = {}) {
      const init = buildInitialState(env, seed, opts);
      let state = init.state;
      let events: GameEvent[] = init.events;
      if (!globals.FLAGS.REDRAW) {
        // The mulligan step is skipped (D-008): round 1 starts straight away, exactly as `keep` would.
        // Judgment call: D-008 says only "skipped"; running the keep path in newGame is the smallest reading.
        const tx = new Tx(state);
        const r = new Run(tx, env, events, services);
        beginDuel(r);
        state = tx.commit();
        events = r.events ?? events;
      }
      if (dev) deepFreeze(state);
      return { state, events: run.events ? events : NO_EVENTS };
    },
    applyAction: (state, action) => applyAction(env, services, run, state, action),
    getLegalActions: (state) => getLegalActions(env, state),
    forEachLegal: (state, visit) => forEachLegal(env, state, visit),
    countLegal: (state) => countLegal(env, state),
    isLegal: (state, action) => isLegal(env, state, action),
    replay: (seed, actions, opts = {}) => replay(self, seed, actions, opts),
  };
  return self;
}

export function createEngine(
  content: CompiledContent,
  globals: Globals,
  policies: EnginePolicies = {},
  options: EngineOptions = {},
): Engine {
  return createEngineInternals(content, globals, policies, options);
}
