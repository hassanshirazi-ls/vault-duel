// Whole-duel fixture: GRAFT content plus player pools and a 20-card Collector deck, so newGame can run.
// Every id is `fx-` prefixed.
import { createEngineInternals } from '../src/engine';
import type { EngineInternals, EngineOptions } from '../src/engine';
import type { CompiledContent, DefIdx } from '../src/types/content';
import type { Globals } from '../src/types/globals';
import { buildContent } from './content-builder';
import type { DefSpec } from './content-builder';
import { GRAFT_SPEC } from './graft-fixture';
import { TEST_GLOBALS, withGlobals } from './globals';

import { constantIntent } from './intent';
export { constantIntent };

const BIGS: readonly DefSpec[] = [
  { id: 'fx-big-ember', type: 'monster', power: 7, guard: 3, element: 'fx-ember', kind: 'fx-beast' },
  { id: 'fx-big-tide', type: 'monster', power: 6, guard: 4, element: 'fx-tide', kind: 'fx-spirit' },
  { id: 'fx-big-umbra', type: 'monster', power: 8, guard: 2, element: 'fx-umbra', kind: 'fx-beast' },
  { id: 'fx-big-lumen', type: 'monster', power: 6, guard: 5, element: 'fx-lumen', kind: 'fx-spirit' },
];

const SPEC = { ...GRAFT_SPEC, defs: [...GRAFT_SPEC.defs, ...BIGS] };
const base = buildContent(SPEC);
const idx = (id: string): DefIdx => base.index.get(id) as DefIdx;
const ids = (...list: string[]): DefIdx[] => list.map(idx);

/** 13 Relics (incl. the ace), 4 spells, 3 traps, in "collector.json order". */
const COLLECTOR_DECK = ids(
  'fx-relic-brittle', 'fx-relic-tether', 'fx-relic-vain', 'fx-relic-slow', 'fx-relic-covetous', 'fx-relic-brittle',
  'fx-relic-tether', 'fx-relic-vain', 'fx-relic-slow', 'fx-relic-covetous', 'fx-relic-brittle', 'fx-relic-slow', 'fx-ace',
  'fx-scry', 'fx-siphon', 'fx-bolt', 'fx-bloodlust',
  'fx-display', 'fx-counterfeit', 'fx-insurance',
);

/** Content for whole-duel tests. */
export const DC: CompiledContent = {
  ...base,
  playerPool: {
    monsters: ids(
      'fx-ember-whelp', 'fx-tide-sprite', 'fx-umbra-beast', 'fx-lumen-seer', 'fx-swift-scout', 'fx-sentinel-wall',
      'fx-warded-ox', 'fx-pierce-fang', 'fx-echo-moth', 'fx-haunt-shade', 'fx-big-ember', 'fx-big-tide', 'fx-big-umbra', 'fx-big-lumen',
    ),
    spells: ids('fx-bolt', 'fx-bloodlust', 'fx-recall', 'fx-scry', 'fx-siphon'),
    traps: ids('fx-snare', 'fx-mirror', 'fx-thornwall', 'fx-last-rites'),
  },
  collector: { deck: COLLECTOR_DECK, ace: idx('fx-ace'), canGraft: false },
};

/** Globals for whole-duel tests: the fixture has two kinds, so the deck needs only two. */
export const DUEL_GLOBALS: Globals = withGlobals({ DECK_MIN_KINDS: 2, APPRAISAL_MIN_POWER: 5 });

export function duelEngine(
  g: Globals = DUEL_GLOBALS,
  options: EngineOptions = { dev: true },
  c: CompiledContent = DC,
): EngineInternals {
  return createEngineInternals(c, g, g.FLAGS.INTENTS ? { intent: constantIntent } : {}, options);
}

export { TEST_GLOBALS };
