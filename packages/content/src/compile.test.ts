// compileContent (ARCHITECTURE.md §3): the dense form of the real content has the right sizes, bits, matrices and
// Collector pool, and is frozen. The source objects are the parsed JSON, so each expectation reads the same data.
import { describe, expect, it } from 'vitest';
import { HOOK_NAMES } from '@vault-duel/engine';
import { compileContent } from './compile';
import { DEFAULT_GLOBALS } from './globals';
import { loadContent } from './load';
import { KEYWORDS } from '../keywords/index.gen';

const loaded = loadContent();
const data = loaded.data;
const compiled = compileContent(data, KEYWORDS, DEFAULT_GLOBALS);

function need<T>(value: T | undefined, what: string): T {
  if (value === undefined) throw new Error(`fixture: ${what} is missing`);
  return value;
}

const idx = (id: string): number => need(compiled.index.get(id), `def ${id}`);
const bit = (id: string): number => need(compiled.kwBit[id], `keyword bit ${id}`);

describe('compileContent on the real content', () => {
  it('has the real content loaded without errors', () => {
    expect(loaded.errors).toEqual([]);
  });

  it('numbers 70 definitions: 25 monsters, 13 Relics, 6+4 player spells and traps, 4+3 Collector spells and traps, 15 families', () => {
    expect(compiled.ids).toHaveLength(70);
    expect(compiled.ids.slice(-15)).toEqual(data.recipes?.map((recipe) => recipe.id));
    expect(compiled.ids[0]).toBe(data.playerMonsters?.[0]?.id);
  });

  it('gives every id a unique index that points back to it', () => {
    expect(compiled.index.size).toBe(compiled.ids.length);
    compiled.ids.forEach((id, i) => expect(compiled.index.get(id)).toBe(i));
  });

  it('stores the Collector deck and ace as definition indices, with canGraft false', () => {
    expect(compiled.collector.deck).toHaveLength(20);
    expect(compiled.collector.ace).toBe(idx('the-unpriced'));
    expect(compiled.collector.canGraft).toBe(false);
    expect(compiled.collector.deck.every((def) => compiled.pool[def] === 1)).toBe(true);
  });

  it('marks Relics as Collector pool and base cards as Player pool', () => {
    expect(compiled.pool[idx('stormglass-hydra')]).toBe(1);
    expect(compiled.pool[idx('cinderjaw-hound')]).toBe(0);
    expect(compiled.playerPool.monsters).toHaveLength(25);
    expect(compiled.playerPool.spells).toHaveLength(6);
    expect(compiled.playerPool.traps).toHaveLength(4);
  });

  it('assigns keyword and Flaw bits in KEYWORDS order (bit = registry index)', () => {
    expect(compiled.keywords.map((keyword) => keyword.id)).toEqual(KEYWORDS.map((keyword) => keyword.id));
    expect(compiled.kwBit['echo']).toBe(0);
    expect(compiled.kwBit['vain']).toBe(10);
    expect(compiled.kw[idx('stormglass-hydra')]).toBe((1 << bit('brittle')) >>> 0);
    expect(compiled.kw[idx('the-unpriced')]).toBe(((1 << bit('ward')) | (1 << bit('covetous'))) >>> 0);
    expect(compiled.kw[idx('cinderjaw-hound')]).toBe((1 << bit('swift')) >>> 0);
    expect(compiled.kw[idx('kiln-whelp')]).toBe(0);
  });

  it('sets a hook bit only for keywords that define the hook', () => {
    expect(compiled.hookMask.attackPermission).toBe(((1 << bit('swift')) | (1 << bit('slow'))) >>> 0);
    expect(compiled.hookMask.beforeDestroy).toBe((1 << bit('ward')) >>> 0);
    expect(compiled.hookMask.onDestroyed).toBe(((1 << bit('echo')) | (1 << bit('haunt'))) >>> 0);
    for (const name of HOOK_NAMES) expect(typeof compiled.hookMask[name]).toBe('number');
  });

  it('keeps spell and trap definitions as the DSL, with no id or name fields', () => {
    const bloodlust = need(data.playerSpells?.find((spell) => spell.id === 'bloodlust'), 'bloodlust');
    const def = need(compiled.spell[idx('bloodlust')] ?? undefined, 'bloodlust def');
    expect(def.effects).toEqual(bloodlust.effects);
    expect(Object.keys(def)).not.toContain('name');
    const sourceTrap = need(data.playerTraps?.[0], 'trap');
    const trap = need(compiled.trap[idx(sourceTrap.id)] ?? undefined, 'trap def');
    expect(trap.trigger).toBe(sourceTrap.trigger);
    expect(compiled.spell[idx('stormcrow')]).toBeNull();
  });

  it('builds a symmetric Chimera recipe table with a family for every kind pair', () => {
    const n = compiled.nKinds;
    expect(n).toBe(5);
    for (let a = 0; a < n; a++) {
      for (let b = 0; b < n; b++) {
        const family = compiled.recipe[a * n + b] ?? -1;
        expect(family, `pair ${a},${b}`).toBeGreaterThanOrEqual(0);
        expect(family).toBe(compiled.recipe[b * n + a]);
        expect(compiled.type[family]).toBe(3);
      }
    }
  });

  it('builds the element matrices: opposes is beats in either direction, and Lumen and Umbra beat each other', () => {
    const n = compiled.nElements;
    const lumen = compiled.elementIds.indexOf('lumen');
    const umbra = compiled.elementIds.indexOf('umbra');
    expect(compiled.beats[lumen * n + umbra]).toBe(1);
    expect(compiled.beats[umbra * n + lumen]).toBe(1);
    for (let a = 0; a < n; a++) {
      for (let b = 0; b < n; b++) {
        const expected = (compiled.beats[a * n + b] ?? 0) | (compiled.beats[b * n + a] ?? 0);
        expect(compiled.opposes[a * n + b]).toBe(expected);
      }
    }
  });

  it('gives a stable hash of 32 hex digits, the same on every compile', () => {
    expect(compiled.hash).toMatch(/^[0-9a-f]{32}$/);
    expect(compileContent(data, KEYWORDS, DEFAULT_GLOBALS).hash).toBe(compiled.hash);
  });

  it('carries the version and freezes the plain parts', () => {
    expect(compiled.version).toBe(DEFAULT_GLOBALS.CONTENT_VERSION);
    expect(Object.isFrozen(compiled)).toBe(true);
    expect(Object.isFrozen(compiled.spell)).toBe(true);
    expect(Object.isFrozen(compiled.keywords)).toBe(true);
  });
});
