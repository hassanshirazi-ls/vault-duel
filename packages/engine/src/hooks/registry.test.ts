import { describe, expect, it } from 'vitest';
import { FX, FX_SPEC } from '../../test-utils/fixture';
import { buildContent } from '../../test-utils/content-builder';
import { TEST_GLOBALS } from '../../test-utils/globals';
import { EngineError } from '../errors';
import { HOOK_NAMES } from '../types/hooks';
import { defineKeyword } from './define';
import { createEnv, createRegistry, lowBit } from './registry';

describe('defineKeyword', () => {
  it('returns its argument unchanged', () => {
    const k = defineKeyword({ id: 'fx-x', name: 'X', kind: 'keyword', icon: 'i', visual: 'v', text: 't.', hooks: {} });
    expect(k.id).toBe('fx-x');
  });
});

describe('lowBit', () => {
  it('finds the lowest set bit including bit 31', () => {
    expect(lowBit(1)).toBe(0);
    expect(lowBit(0b101000)).toBe(3);
    expect(lowBit(0x80000000 | 0)).toBe(31);
    expect(lowBit(0x80000000)).toBe(31);
  });
});

describe('createRegistry', () => {
  it('indexes keyword hooks by bit in registry order (keywords by id, then Flaws by id)', () => {
    const reg = createRegistry(FX);
    expect(reg.kw).toHaveLength(FX.keywords.length);
    const ids = FX.keywords.map((k) => k.id);
    const keywordIds = FX.keywords.filter((k) => k.kind === 'keyword').map((k) => k.id);
    expect(ids.slice(0, keywordIds.length)).toEqual([...keywordIds].sort());
    const flawIds = FX.keywords.filter((k) => k.kind === 'flaw').map((k) => k.id);
    expect(ids.slice(keywordIds.length)).toEqual([...flawIds].sort());
    expect(reg.masks).toBe(FX.hookMask);
  });
  it('hookMask built from HOOK_NAMES matches the keyword tables for every hook', () => {
    for (const name of HOOK_NAMES) {
      FX.keywords.forEach((k, i) => {
        expect((FX.hookMask[name] & (1 << i)) !== 0).toBe(k.hooks[name] !== undefined);
      });
    }
  });
  it('rejects a stale hookMask', () => {
    const bad = { ...FX, hookMask: { ...FX.hookMask, onSummon: 1 } };
    expect(() => createRegistry(bad)).toThrow(EngineError);
  });
  it('rejects more than 32 keywords', () => {
    const many = Array.from({ length: 33 }, (_, i) =>
      defineKeyword({ id: `fx-k${String(i).padStart(2, '0')}`, name: 'k', kind: 'keyword', icon: 'i', visual: 'v', text: 't.', hooks: {} }),
    );
    expect(() => createRegistry(buildContent({ ...FX_SPEC, keywords: many, defs: [] }))).toThrow(EngineError);
  });
  it('createEnv binds content, globals and trap hooks', () => {
    const trapHooks = [null, { onAttackDeclared: () => undefined }];
    const env = createEnv(FX, TEST_GLOBALS, trapHooks);
    expect(env.c).toBe(FX);
    expect(env.g).toBe(TEST_GLOBALS);
    expect(env.reg.trapHooks).toBe(trapHooks);
  });
});
