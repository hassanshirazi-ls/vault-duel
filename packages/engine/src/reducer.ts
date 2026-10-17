// applyAction (ARCHITECTURE.md §1, §4.1, §5; D-150, D-151, D-155, D-161). One `Run` per action: a Tx over
// the input state, the event list, the effect queue. Actions are atomic: the input state is never written,
// so an EngineError leaves the caller's state intact. Win checks live in pipeline.ts (lifeChanged /
// checkWin / endGame); there is no second check here.
import { split, symbiose } from './bond';
import { castSpell } from './cast';
import { declareAttack } from './combat';
import { EngineError } from './errors';
import { deepFreeze } from './freeze';
import {
  graftBegin,
  graftCancel,
  graftKeywords,
  graftPick,
  graftPosition,
  graftSkipAscend,
} from './graft';
import type { Env } from './hooks/registry';
import { isLegal } from './legal';
import { Run } from './pipeline';
import type { Services } from './pipeline';
import { moveLane } from './lane-move';
import { reposition } from './reposition';
import { setTrap, summon, summonCovetous } from './summon';
import { Tx } from './tx';
import { endTurn, startTurn } from './turn';
import type { Action } from './types/actions';
import type { GameEvent } from './types/events';
import type { GameState } from './types/state';

/** Engine options that change what applyAction does (not what the rules are): §7, §18.4. */
export interface RunOptions {
  /** collect events (`false` returns the shared empty array) */
  readonly events: boolean;
  /** append each action to `state.log` */
  readonly log: boolean;
  /** skip the `isLegal` check: every action came from the generator (sim) */
  readonly trusted: boolean;
}

export interface ActionResult {
  readonly state: GameState;
  readonly events: readonly GameEvent[];
}

export const NO_EVENTS: readonly GameEvent[] = [];

/** `keep`, or the start of the duel when FLAGS.REDRAW is off: round 1 begins (draw step, intent, main step). */
export function beginDuel(run: Run): void {
  run.tx.set('redrawsLeft', 0);
  startTurn(run);
}

/** `redraw`: the hand goes to the bottom of the deck in order, the next OPENING_HAND cards are drawn (D-008). */
function redraw(run: Run): void {
  const { tx, env } = run;
  const sd = tx.state.sides[0];
  const returned = sd.hand;
  const drawn = sd.deck.slice(0, env.g.OPENING_HAND);
  tx.setZone(0, 'deck', [...sd.deck.slice(env.g.OPENING_HAND), ...returned]);
  tx.setZone(0, 'hand', drawn);
  tx.set('redrawsLeft', tx.state.redrawsLeft - 1);
  run.emit({ e: 'Redrawn', returned, drawn });
}

function dispatch(run: Run, a: Action): void {
  switch (a.t) {
    case 'redraw':
      return redraw(run);
    case 'keep':
      return beginDuel(run);
    case 'reposition':
      return reposition(run, a.m);
    case 'moveLane':
      return moveLane(run, a.m, a.to);
    case 'summon':
      summon(run, a.c, a.mode, a.lane);
      return;
    case 'summonCovetous':
      summonCovetous(run, a.c, a.sac, a.mode, a.lane);
      return;
    case 'cast':
      return castSpell(run, a.c, a.target);
    case 'setTrap':
      setTrap(run, a.c);
      return;
    case 'graftBegin':
      return graftBegin(run);
    case 'graftPick':
      return graftPick(run, a.m);
    case 'graftSkipAscend':
      return graftSkipAscend(run);
    case 'graftKeywords':
      return graftKeywords(run, a.kw);
    case 'graftPosition':
      graftPosition(run, a.pos, a.lane);
      return;
    case 'graftCancel':
      return graftCancel(run);
    case 'split':
      return split(run, a.m);
    case 'symbiose':
      return symbiose(run, a.c, a.host);
    case 'attack':
      return declareAttack(run, a.a, a.target);
    case 'endTurn':
      return endTurn(run);
  }
}

export function applyAction(
  env: Env,
  services: Services,
  opts: RunOptions,
  state: GameState,
  action: Action,
): ActionResult {
  if (state.result !== null || state.step === 'over') throw new EngineError('the game is over');
  if (!opts.trusted && !isLegal(env, state, action)) {
    throw new EngineError(`illegal action ${JSON.stringify(action)}`);
  }
  const tx = new Tx(state);
  const events: GameEvent[] | null = opts.events ? [] : null;
  const run = new Run(tx, env, events, services);
  dispatch(run, action);
  tx.set('nActions', state.nActions + 1);
  if (opts.log) tx.set('log', { a: action, prev: state.log });
  const next = tx.commit();
  if (env.dev) deepFreeze(next); // dev mode (D-141, D-161): a later write to a committed state throws
  return { state: next, events: events ?? NO_EVENTS };
}
