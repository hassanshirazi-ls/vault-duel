// getLegalActions micro-bench. Run: `npx tsx packages/engine/scripts/legal-bench.ts` (vitest 5 has no `bench`).
// A pool of mid-game states from seeded random-legal walks; each config is timed over the same kind of pool.
// Fixture content only (D-168). Outside src/, so the determinism bans on wall-clock time do not apply to it.
import { duelEngine, DUEL_GLOBALS } from '../test-utils/duel-fixture';
import { withGlobals } from '../test-utils/globals';
import type { EngineInternals } from '../src/engine';
import { Sfc32 } from '../src/rng';
import type { Action } from '../src/types/actions';
import type { Globals } from '../src/types/globals';
import type { GameState } from '../src/types/state';

// The engine tsconfig has no DOM or Node types (types: []); only these two ambient globals are used here.
declare const performance: { now(): number };
declare const console: { log(line: string): void };

function pool(engine: EngineInternals): GameState[] {
  const out: GameState[] = [];
  const rng = Sfc32.from('bench-walk');
  for (let g = 0; g < 20; g++) {
    let s = engine.newGame(`bench-${g}`).state;
    for (let i = 0; i < 400 && s.result === null; i++) {
      const legal = engine.getLegalActions(s);
      if (i % 3 === 0) out.push(s);
      s = engine.applyAction(s, legal[i > 300 ? legal.length - 1 : rng.int(legal.length)] as Action).state;
    }
  }
  return out;
}

const base = { DECK_MIN_KINDS: 2, APPRAISAL_MIN_POWER: 5 };
const configs: readonly (readonly [string, Globals])[] = [
  ['default', DUEL_GLOBALS],
  ['LANES on', withGlobals({ ...base, FLAGS: { LANES: true } })],
  ['LANES on + monstersOnly', withGlobals({ ...base, SICKNESS_MODE: 'monstersOnly', FLAGS: { LANES: true } })],
];

for (const [name, g] of configs) {
  const engine = duelEngine(g, { dev: false });
  const states = pool(engine);
  const run = (): number => {
    let n = 0;
    for (let i = 0; i < states.length; i++) n += engine.getLegalActions(states[i] as GameState).length;
    return n;
  };
  for (let i = 0; i < 20; i++) run(); // warm-up
  const rounds = 200;
  const start = performance.now();
  let actions = 0;
  for (let i = 0; i < rounds; i++) actions += run();
  const ms = performance.now() - start;
  const calls = rounds * states.length;
  console.log(`${name.padEnd(26)} ${states.length} states, ${(calls / ms * 1000).toFixed(0)} getLegalActions/s, ${(ms * 1000 / calls).toFixed(2)} us/call, ${(actions / calls).toFixed(1)} actions/call`);
}
