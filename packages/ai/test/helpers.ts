// Shared test setup: the live content compiled once, a duel runner, and scenario builders over the real cards.
import { DEFAULT_GLOBALS, compileContent, parseContent, RAW_CONTENT } from '@vault-duel/content';
import type { GameContent } from '@vault-duel/content';
import { createEngine, hashState } from '@vault-duel/engine';
import type { Action, Engine, GameEvent, GameState, Globals } from '@vault-duel/engine';
import { createBrain, createCollector, botAction } from '../src';
import type { Bot, Collector } from '../src';

export const LOAD = parseContent(RAW_CONTENT);
export const CONTENT: GameContent = compileContent(LOAD.data);
export const GLOBALS: Globals = DEFAULT_GLOBALS;

export const SEED = (n: number): string => `vault-duel:2026-01-${String((n % 28) + 1).padStart(2, '0')}:0.1.0#${Math.floor(n / 28)}`;

export interface DuelOptions {
  readonly seed: string;
  readonly player: (brain: ReturnType<typeof createBrain>) => Bot;
  readonly collector?: Collector;
  readonly engine?: Engine;
  readonly maxActions?: number;
  /** called with the events of every applied action */
  readonly onEvents?: (events: readonly GameEvent[], before: GameState, after: GameState) => void;
}

export interface DuelResult {
  readonly state: GameState;
  readonly actions: number;
  readonly hash: string;
}

/** Plays one duel to the end: the player bot on side 0, the Collector on side 1. Every action is checked as legal. */
export function playDuel(o: DuelOptions): DuelResult {
  const collector = o.collector ?? createCollector({ content: CONTENT, globals: GLOBALS });
  const engine = o.engine ?? createEngine(CONTENT, GLOBALS, { intent: collector.intentPolicy });
  const bot = o.player(collector.brain);
  let state = engine.newGame(o.seed).state;
  let n = 0;
  const max = o.maxActions ?? 2000;
  while (state.result === null) {
    if (n++ > max) throw new Error(`duel ${o.seed} did not finish in ${max} actions`);
    const side = state.turn & 1;
    const a: Action = side === 0 || state.step === 'mulligan' ? botAction(bot, collector.brain, state) : collector.act(state);
    const res = engine.applyAction(state, a);
    o.onEvents?.(res.events, state, res.state);
    state = res.state;
  }
  return { state, actions: n, hash: hashState(state) };
}
