import { describe, expect, it } from 'vitest';
import { TEST_GLOBALS } from '../../test-utils/globals';
import { EngineError } from '../errors';
import { resolveNum } from './num';

describe('resolveNum', () => {
  it('passes literals through', () => {
    expect(resolveNum(4, TEST_GLOBALS)).toBe(4);
    expect(resolveNum(-2, TEST_GLOBALS)).toBe(-2);
  });
  it('resolves $NAME and -$NAME against numeric globals', () => {
    expect(resolveNum('$UNMAKE_MAX_POWER', TEST_GLOBALS)).toBe(5);
    expect(resolveNum('-$HAUNT_PENALTY', TEST_GLOBALS)).toBe(-2);
  });
  it('negating zero gives +0', () => {
    expect(Object.is(resolveNum('-$STAT_FLOOR', TEST_GLOBALS), 0)).toBe(true);
  });
  it('rejects unknown, non-numeric and inherited names', () => {
    for (const bad of ['$NOPE', '$SEED_PREFIX', '$FLAGS', '$APPRAISAL_ROUNDS', '$constructor', '$toString', '$__proto__'] as const) {
      expect(() => resolveNum(bad, TEST_GLOBALS)).toThrow(EngineError);
    }
  });
  it('honours overridden globals', () => {
    expect(resolveNum('$HAUNT_PENALTY', { ...TEST_GLOBALS, HAUNT_PENALTY: 7 })).toBe(7);
  });
});
