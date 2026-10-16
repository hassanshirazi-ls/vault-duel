// createEngine (ARCHITECTURE.md §1, §6.2, §11, §18.9; D-096, D-150). Binds compiled content, globals and
// injected policies into a facade over the pure functions. Content is passed in compiled form; the engine
// never imports content data or `ai`.
import { previewCombat } from './combat';
import type { CombatPreview } from './combat';
import { EngineError } from './errors';
import { deepFreeze } from './freeze';
import { mustAttack } from './hooks/dispatch';
import { previewGraft } from './graft';
import type { GraftPreview } from './graft';
import { createEnv } from './hooks/registry';
import type { Env } from './hooks/registry';
import { countLegal, forEachLegal, getLegalActions, isLegal } from './legal';
import { attackReach, laneTargets, targetsFromLane } from './lanes';
import type { IntentPolicy, Services } from './pipeline';
import { Run } from './pipeline';
import { applyAction, beginDuel, NO_EVENTS } from './reducer';
import type { ActionResult, RunOptions } from './reducer';
import { replay } from './replay';
import type { ReplayOptions } from './replay';
import { buildInitialState } from './setup/initial-state';
import type { NewGameOptions } from './setup/initial-state';
import * as stats from './stats';
import { Tx } from './tx';
import { compileTraps } from './traps';
import type { Action, ActionVisitor } from './types/actions';
import type { CompiledContent, ElemIdx, KindIdx, KwMask } from './types/content';
import type { GameEvent } from './types/events';
import type { Globals } from './types/globals';
import type { AttackPerm } from './types/hooks';
import type { GameState, Iid, Monster } from './types/state';

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
  /** `opts.cfg` is the `state.cfg` the actions were recorded under; a mismatch throws EngineError (D-191). */
  replay(seed: string, actions: readonly Action[], opts?: NewGameOptions & Pick<ReplayOptions, 'cfg'>): GameState;

  // Read-only queries (D-209, §8.7). Pure functions of the bound content, globals and arguments: they never
  // write `s`, keep no reference into it and cache nothing. `iid` is any instance id.
  /** D-031: no element bonus, floored at STAT_FLOOR. Off the board: printed (+ Ascend). */
  effectivePower(s: GameState, iid: Iid): number;
  effectiveGuard(s: GameState, iid: Iid): number;
  /** Definition bits | Chimera-inherited bits. */
  printedKeywords(s: GameState, iid: Iid): KwMask;
  /** 0 off the board or face-down; a used Ward's beforeDestroy bits removed (D-037, D-133). */
  activeKeywords(s: GameState, iid: Iid): KwMask;
  /** A Chimera's is its first material's; -1 for spells and traps. */
  elementOf(s: GameState, iid: Iid): ElemIdx;
  /** -1 for Chimeras, spells and traps (D-129). */
  kindOf(s: GameState, iid: Iid): KindIdx;
  /** The §6.2 lattice; 'none' off the board. */
  attackPermission(s: GameState, iid: Iid): AttackPerm;
  /** The restriction fold alone: 'any' when no hook restricts (D-212). */
  attackRestriction(s: GameState, iid: Iid): AttackPerm;
  /** OR of the active mustAttack hooks (Vain). */
  mustAttack(s: GameState, iid: Iid): boolean;
  /** §5.4 without side effects. Throws EngineError if the attacker or target is not on a board. Allocates. */
  previewCombat(s: GameState, attacker: Iid, target: Iid | -1): CombatPreview;
  /** §5.6. Allocates. */
  previewGraft(s: GameState): GraftPreview | null;
  /** D-281: the enemy monsters the monster `iid` may declare an attack on (lanes and Sentinel cover; classic with LANES off). Empty off the board. Ignores permission and state; a wholly empty enemy board is the direct attack, not listed. */
  laneTargets(s: GameState, iid: Iid): Iid[];
  /** The same for the monster `iid` as if it stood in `lane` of its own side (under LANES off: the classic targets). Empty off the board. */
  targetsFromLane(s: GameState, iid: Iid, lane: number): Iid[];
  /** D-284: lane offsets the monster `iid` reaches (`[0]` by default). */
  attackReach(s: GameState, iid: Iid): readonly number[];
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
    effectivePower: (s, iid) => stats.effectivePower(s, env, iid),
    effectiveGuard: (s, iid) => stats.effectiveGuard(s, env, iid),
    printedKeywords: (s, iid) => stats.printedKw(s, env, iid),
    activeKeywords: (s, iid) => stats.activeKw(s, env, iid),
    elementOf: (s, iid) => stats.elementOf(s, env, iid),
    kindOf: (s, iid) => stats.kindOf(s, env, iid),
    attackPermission: (s, iid) => stats.attackPermission(s, env, iid),
    attackRestriction: (s, iid) => stats.attackRestriction(s, env, iid),
    mustAttack: (s, iid) => mustAttack(env, s, iid),
    previewCombat: (s, attacker, target) => previewCombat(s, env, attacker, target),
    previewGraft: (s) => previewGraft(s, env),
    laneTargets: (s, iid) => laneTargets(env, s, iid),
    targetsFromLane(s, iid, lane) {
      const loc = stats.locate(s, iid);
      if (loc < 0) return [];
      if (!env.g.FLAGS.LANES) return laneTargets(env, s, iid);
      const side = stats.locSide(loc);
      return targetsFromLane(env, s, s.sides[side].board[stats.locSlot(loc)] as Monster, side, lane);
    },
    attackReach(s, iid) {
      const loc = stats.locate(s, iid);
      if (loc < 0) return [0];
      const side = stats.locSide(loc);
      return attackReach(env, s, s.sides[side].board[stats.locSlot(loc)] as Monster, side);
    },
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
