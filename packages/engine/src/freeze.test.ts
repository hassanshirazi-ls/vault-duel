import { describe, expect, it } from 'vitest';
import { TEST_GLOBALS } from '@vault-duel/engine/test-utils/globals';
import { deepFreeze, EngineError } from './index';

describe('deepFreeze', () => {
  it('freezes nested objects and arrays and returns the same value', () => {
    const v = { a: [1, { b: 2 }], c: { d: [3] } };
    expect(deepFreeze(v)).toBe(v);
    expect(Object.isFrozen(v)).toBe(true);
    expect(Object.isFrozen(v.a)).toBe(true);
    expect(Object.isFrozen(v.a[1])).toBe(true);
    expect(Object.isFrozen(v.c.d)).toBe(true);
  });
  it('passes primitives and null through, and tolerates already-frozen values', () => {
    expect(deepFreeze(3)).toBe(3);
    expect(deepFreeze(null)).toBeNull();
    const f = Object.freeze({ x: 1 });
    expect(deepFreeze(f)).toBe(f);
  });
  it('the package subpath @vault-duel/engine/test-utils/* resolves (D-143)', () => {
    expect(TEST_GLOBALS.PLAYER_LIFE).toBe(20);
  });
  it('EngineError is a public export', () => {
    expect(new EngineError('x')).toBeInstanceOf(Error);
  });
});
