// Live content (D-168): the only test that reads the real files. It checks that they parse, validate with no errors,
// compile, and play. It pins no count, id or value. Those are checked by content:check (validator) and the sim (balance).
import { describe, expect, it } from 'vitest';
import { createEngine, rerollSeed, seedString, Sfc32 } from '@vault-duel/engine';
import { compileContent } from './compile';
import { DEFAULT_GLOBALS, withOverrides } from './globals';
import { KEYWORDS } from '../keywords/index.gen';
import { RAW_CONTENT } from './data';
import { parseContent } from './files';
import { validateContent } from './validate';

const content = parseContent(RAW_CONTENT);
const { data } = content;

describe('live content', () => {
  it('parses with its zod schemas without errors', () => {
    expect(content.errors.map((error) => error.file + ' ' + error.problem)).toEqual([]);
  });

  it('loads every file as defined data', () => {
    for (const [key, value] of Object.entries(data)) {
      expect(value, key).toBeDefined();
    }
  });

  it('validates with zero errors (warnings are reported by content:check, not here)', () => {
    expect(validateContent(data, DEFAULT_GLOBALS, KEYWORDS).errors.map((error) => error.problem)).toEqual([]);
  });

  it('compiles', () => {
    const compiled = compileContent(data, KEYWORDS, DEFAULT_GLOBALS);
    expect(compiled.hash).toMatch(/^[0-9a-f]{32}$/);
  });
});

describe('smoke: live content plays to the end', () => {
  // FLAGS.INTENTS is off, so no intent policy is needed. Everything else is the live configuration.
  const globals = withOverrides(DEFAULT_GLOBALS, ['FLAGS.INTENTS=false']);
  const compiled = compileContent(data, KEYWORDS, globals);
  const engine = createEngine(compiled, globals);
  const SEED_COUNT = 20;
  const MAX_STEPS = 10000; // a safety cap; a duel ends by MAX_ROUNDS well before it
  const DATE = '2026-10-14';

  /** A uniformly random legal action at each step, for both sides, from a seed-derived stream (no Math.random). */
  function playToEnd(seed: string): { steps: number; ended: boolean } {
    const rng = Sfc32.from(`${seed}/smoke`);
    let state = engine.newGame(seed).state;
    let steps = 0;
    while (state.result === null && steps < MAX_STEPS) {
      const legal = engine.getLegalActions(state);
      const action = legal[rng.int(legal.length)];
      if (action === undefined) throw new Error(`no legal action at step ${steps} of ${seed}`);
      state = engine.applyAction(state, action).state;
      steps += 1;
    }
    return { steps, ended: state.result !== null };
  }

  it(`plays ${SEED_COUNT} seeds with no EngineError, each to a result`, () => {
    const base = seedString(globals, DATE);
    for (let k = 0; k < SEED_COUNT; k++) {
      const outcome = playToEnd(rerollSeed(base, k));
      expect(outcome.ended, `seed ${k}`).toBe(true);
    }
  });
});
