import { describe, expect, it } from 'vitest';
import { TEST_GLOBALS } from '../../test-utils/globals';
import { EngineError } from '../errors';
import { playerDeckSize } from '../types/globals';
import { globalByName, resolveNum } from './num';

describe('resolveNum', () => {
  it('passes literals through', () => {
    expect(resolveNum(TEST_GLOBALS, 4)).toBe(4);
    expect(resolveNum(TEST_GLOBALS, -2)).toBe(-2);
  });
  it('resolves $NAME and -$NAME against numeric globals', () => {
    expect(resolveNum(TEST_GLOBALS, '$UNMAKE_MAX_POWER')).toBe(5);
    expect(resolveNum(TEST_GLOBALS, '-$HAUNT_PENALTY')).toBe(-2);
  });
  it('negating zero gives +0', () => {
    expect(Object.is(resolveNum(TEST_GLOBALS, '-$STAT_FLOOR'), 0)).toBe(true);
  });
  it('rejects unknown, non-numeric and inherited names', () => {
    for (const bad of ['$NOPE', '$SEED_PREFIX', '$FLAGS', '$APPRAISAL_ROUNDS', '$constructor', '$toString', '$__proto__'] as const) {
      expect(() => resolveNum(TEST_GLOBALS, bad)).toThrow(EngineError);
    }
  });
  it('honours overridden globals', () => {
    expect(resolveNum({ ...TEST_GLOBALS, HAUNT_PENALTY: 7 }, '$HAUNT_PENALTY')).toBe(7);
  });
  it('looks up CONTENT_NUMBERS first, then core globals (D-171)', () => {
    const g = { ...TEST_GLOBALS, CONTENT_NUMBERS: { ...TEST_GLOBALS.CONTENT_NUMBERS, ONLY_HERE: 9, HAUNT_PENALTY: 4 } };
    expect(resolveNum(g, '$ONLY_HERE')).toBe(9);
    expect(resolveNum(g, '-$ONLY_HERE')).toBe(-9);
    expect(resolveNum(g, '$HAUNT_PENALTY')).toBe(4); // content namespace wins
    expect(resolveNum(g, '$MAX_ROUNDS')).toBe(g.MAX_ROUNDS);
  });
  it('rejects names that are only inherited from Object on CONTENT_NUMBERS', () => {
    expect(() => globalByName(TEST_GLOBALS, 'constructor')).toThrow(EngineError);
    expect(() => globalByName(TEST_GLOBALS, 'CONTENT_NUMBERS')).toThrow(EngineError);
  });
  it('playerDeckSize sums the three deck sections (D-170)', () => {
    const g = { ...TEST_GLOBALS, DECK_MONSTERS: 7, DECK_SPELLS: 3, DECK_TRAPS: 2 };
    expect(playerDeckSize(g)).toBe(12);
  });
});
