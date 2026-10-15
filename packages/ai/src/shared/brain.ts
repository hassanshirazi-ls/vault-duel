// What the AI needs besides a state: compiled content, globals, the stat mirror, and an engine used only for
// legality and for looking ahead on a scrubbed copy of a state (no events, no log).
import { createEngine } from '@vault-duel/engine';
import type { CompiledContent, Engine, GameState, Globals, Side } from '@vault-duel/engine';
import { Mirror } from './mirror';

export interface Brain {
  readonly content: CompiledContent;
  readonly globals: Globals;
  readonly mirror: Mirror;
  /** Legality and look-ahead only. It never plays a real duel, so its intent policy is never called. */
  readonly engine: Engine;
}

export function createBrain(content: CompiledContent, globals: Globals): Brain {
  return {
    content,
    globals,
    mirror: new Mirror(content, globals),
    engine: createEngine(content, globals, { intent: () => 'guard' }, { events: false, log: false, trusted: true }),
  };
}

/**
 * A copy of `s` fit for looking ahead as `viewer`: the opponent's hand, deck and set traps are removed, and so is
 * the viewer's own deck. Only public information and the viewer's own hand and board remain, so a look-ahead
 * can neither peek at hidden information nor draw a card whose identity the viewer does not know.
 */
export function scrub(s: GameState, viewer: Side): GameState {
  const foe = (1 - viewer) as Side;
  const f = s.sides[foe];
  const m = s.sides[viewer];
  const foeSide = { ...f, deck: [], hand: [], traps: f.traps.map(() => null) };
  const mySide = { ...m, deck: [] };
  return { ...s, sides: viewer === 0 ? [mySide, foeSide] : [foeSide, mySide], log: null };
}
