import { describe, expect, it } from 'vitest';
import { canonicalJson } from './canonical';

describe('canonicalJson (D-191)', () => {
  it('sorts keys at every depth, so build order does not matter', () => {
    expect(canonicalJson({ b: 1, a: { d: [1, { z: 0, y: 1 }], c: 'x' } })).toBe('{"a":{"c":"x","d":[1,{"y":1,"z":0}]},"b":1}');
    expect(canonicalJson({ a: 1, b: 2 })).toBe(canonicalJson({ b: 2, a: 1 }));
  });
  it('drops undefined members, keeps array order, and writes scalars as JSON', () => {
    expect(canonicalJson({ a: undefined, b: null, c: true, d: 'é"' })).toBe('{"b":null,"c":true,"d":"é\\""}');
    expect(canonicalJson([3, 1, 2])).toBe('[3,1,2]');
    expect(canonicalJson([undefined])).toBe('[null]');
  });
  it('sorts by code unit, not by locale', () => {
    expect(canonicalJson({ b: 0, B: 0, a: 0 })).toBe('{"B":0,"a":0,"b":0}');
  });
  it('rejects values JSON cannot carry', () => {
    expect(() => canonicalJson(NaN)).toThrow(TypeError);
    expect(() => canonicalJson(() => 1)).toThrow(TypeError);
  });
});
