// D-145: the ai side mirrors the closed enums of content/src/schemas/collector.ts. The rule registry equals
// AI_PLAY_RULES + AI_ATTACK_RULES, and every other enum value of collector.json › ai has a handler. A missing rule file or
// handler fails here; the Record types fail tsc -b first.
import { describe, expect, it } from 'vitest';
import { AI_ATTACK_RULES, AI_PLAY_RULES, AI_REPOSITION, AI_TIE_BREAK, CollectorAi } from '@vault-duel/content';
import { ATTACK_RULES, PLAY_RULES } from '../src';
import { REPOSITION_MODES } from '../src/collector/reposition';
import { PICK_MODES, WHEN_MODES } from '../src/collector/rules/castHighValueSpell';
import { TIE_KEYS } from '../src/collector/rules/context';
import { POSITIONS, SLOW_PICKS, SLOW_POSITIONS } from '../src/collector/rules/summonFallback';
import { BEATER_COMPARE } from '../src/collector/rules/summonBeater';
import { TRAP_COMPARE } from '../src/collector/rules/setTrapWhenBehind';
import { UTILITY_STEPS } from '../src/collector/rules/utility';
import { createCollector, liveCollectorAi } from '../src';
import type { AiConfig } from '../src';
import { CONTENT, GLOBALS } from './helpers';

const sorted = (xs: readonly string[]): string[] => [...xs].sort();

/** Walks a zod schema down through wrappers and arrays to the enum's option list (zod's own introspection). */
function enumOptions(schema: unknown): string[] {
  let node: unknown = schema;
  for (let i = 0; i < 8 && typeof node === 'object' && node !== null; i++) {
    if ('options' in node && Array.isArray(node.options)) return node.options.map(String);
    if ('unwrap' in node && typeof node.unwrap === 'function') node = node.unwrap();
    else if ('element' in node) node = node.element;
    else break;
  }
  throw new Error('not an enum schema');
}

function shapeOf(schema: unknown): Record<string, unknown> {
  let node: unknown = schema;
  for (let i = 0; i < 8 && typeof node === 'object' && node !== null; i++) {
    if ('shape' in node && typeof node.shape === 'object' && node.shape !== null) return node.shape as Record<string, unknown>;
    if ('unwrap' in node && typeof node.unwrap === 'function') node = node.unwrap();
    else if ('valueType' in node) node = node.valueType;
    else break;
  }
  throw new Error('not an object schema');
}

const params = shapeOf(shapeOf(CollectorAi)['params']);
const cast = shapeOf(params['castHighValueSpell']);

describe('rule registry (D-145)', () => {
  it('equals AI_PLAY_RULES', () => {
    expect(sorted(Object.keys(PLAY_RULES))).toEqual(sorted(AI_PLAY_RULES.options));
  });
  it('equals AI_ATTACK_RULES', () => {
    expect(sorted(Object.keys(ATTACK_RULES))).toEqual(sorted(AI_ATTACK_RULES.options));
  });
  it('has no rule in both lists', () => {
    const both = Object.keys(PLAY_RULES).filter((k) => Object.hasOwn(ATTACK_RULES, k));
    expect(both).toEqual([]);
  });
});

describe('every other enum value has a handler (D-145)', () => {
  it('reposition modes', () => {
    expect(sorted(Object.keys(REPOSITION_MODES))).toEqual(sorted(AI_REPOSITION.options));
  });
  it('tie-break keys', () => {
    expect(sorted(Object.keys(TIE_KEYS))).toEqual(sorted(AI_TIE_BREAK.options));
  });
  it('castHighValueSpell pick and when modes', () => {
    expect(sorted(Object.keys(PICK_MODES))).toEqual(sorted(enumOptions(cast['pick'])));
    expect(sorted(Object.keys(WHEN_MODES))).toEqual(sorted(enumOptions(cast['when'])));
  });
  it('utility steps', () => {
    expect(sorted(Object.keys(UTILITY_STEPS))).toEqual(sorted(enumOptions(shapeOf(params['utility'])['order'])));
  });
  it('setTrapWhenBehind.compare and summonBeater.compare', () => {
    expect(sorted(Object.keys(TRAP_COMPARE))).toEqual(sorted(enumOptions(shapeOf(params['setTrapWhenBehind'])['compare'])));
    expect(sorted(Object.keys(BEATER_COMPARE))).toEqual(sorted(enumOptions(shapeOf(params['summonBeater'])['compare'])));
  });
  it('summonFallback position, slowPosition and slowPick', () => {
    const fb = shapeOf(params['summonFallback']);
    expect(sorted(Object.keys(POSITIONS))).toEqual(sorted(enumOptions(fb['position'])));
    expect(sorted(Object.keys(SLOW_POSITIONS))).toEqual(sorted(enumOptions(fb['slowPosition'])));
    expect(sorted(Object.keys(SLOW_PICKS))).toEqual(sorted(enumOptions(fb['slowPick'])));
  });
});

describe('the live collector.json', () => {
  it('builds a Collector', () => {
    expect(() => createCollector({ content: CONTENT, globals: GLOBALS })).not.toThrow();
  });

  it('refuses a rule list that names a rule with no handler', () => {
    const bad = { ...liveCollectorAi(), play: ['nope'] } as unknown as AiConfig;
    expect(() => createCollector({ content: CONTENT, globals: GLOBALS, ai: bad })).toThrow(/no rule "nope"/);
  });
});
