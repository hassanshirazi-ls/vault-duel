// Keyword examples (D-169, D-183, ARCHITECTURE.md §8.4): every example of every keyword runs under TEST_GLOBALS on
// its declared cards only (scenarioContent), so no example depends on a live card id or a live value. Slow is also
// run under SLOW_TURNS = 2 (D-183), where the same Relic stays restricted one own turn longer.
import { describe, expect, it } from 'vitest';
import { parseScenario, runScenario, scenarioEngine } from '@vault-duel/engine/test-utils/board-dsl';
import { TEST_GLOBALS, withGlobals } from '@vault-duel/engine/test-utils/globals';
import type { Globals } from '@vault-duel/engine';
import { KEYWORDS } from '../keywords/index.gen';
import { scenarioContent } from '../test-utils/scenario-content';

/** Parses, builds the declared content, and runs the script. Throws ScenarioError on any failed expectation. */
function runExample(text: string, g: Globals = TEST_GLOBALS): void {
  const engine = scenarioEngine(scenarioContent(parseScenario(text).declared), g);
  runScenario(text, engine);
}

describe('keyword examples (D-169)', () => {
  for (const keyword of KEYWORDS) {
    (keyword.examples ?? []).forEach((text, i) => {
      it(`${keyword.id}: example ${i + 1}`, () => runExample(text));
    });
  }
});

describe('Slow honours SLOW_TURNS (D-183)', () => {
  // Summoned on turn 3; the Collector's own turns are 3, 5 and 7.
  const twoTurns = `
card ex-relic C ember beast 4/2 slow
turn 3
step attack
C board [ex-relic A new]
expect illegal attack C0 > face
do end
do end
expect illegal attack C0 > face
do end
do end
expect legal attack C0 > face
`;

  it('with SLOW_TURNS = 2, the monster stays restricted through its first own turn after summon', () => {
    expect(() => runExample(twoTurns, withGlobals({ SLOW_TURNS: 2 }))).not.toThrow();
  });

  it('with SLOW_TURNS = 1 the same script is legal on the second own turn, so its second expectation fails', () => {
    expect(() => runExample(twoTurns, withGlobals({ SLOW_TURNS: 1 }))).toThrow(/expectation failed/);
  });
});
