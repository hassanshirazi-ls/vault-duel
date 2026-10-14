// Helpers for pipeline tests: open a Tx + Run over a state, collect events, commit.
import { Run } from '../src/pipeline';
import type { Services } from '../src/pipeline';
import type { Env } from '../src/hooks/registry';
import { Tx } from '../src/tx';
import type { GameEvent } from '../src/types/events';
import type { GameState, Iid } from '../src/types/state';

export interface Harness {
  readonly run: Run;
  readonly tx: Tx;
  readonly events: GameEvent[];
  /** Commit and return the new state. */
  done(): GameState;
}

export function harness(s: GameState, env: Env, services: Services = {}): Harness {
  const tx = new Tx(s);
  const events: GameEvent[] = [];
  const run = new Run(tx, env, events, services);
  return { run, tx, events, done: () => tx.commit() };
}

/** Event names in order, for compact assertions. */
export const names = (events: readonly GameEvent[]): string[] => events.map((e) => e.e);

/** Every iid held by any zone of either side (deck, hand, discard, board, traps, vault), sorted. */
export function allCards(s: GameState): Iid[] {
  const out: Iid[] = [];
  for (const sd of s.sides) {
    out.push(...sd.deck, ...sd.hand, ...sd.discard, ...sd.vault);
    for (const m of sd.board) if (m !== null) out.push(m.iid);
    for (const t of sd.traps) if (t !== null) out.push(t.iid);
  }
  return out.sort((a, b) => a - b);
}
