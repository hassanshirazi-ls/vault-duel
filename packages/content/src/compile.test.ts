// compileContent (ARCHITECTURE.md §3): the dense form of the synthetic fixture has the right sizes, bits, matrices and
// Collector pool, and is frozen (D-168: fixture content, so no live value is pinned). The source objects are the
// fixture data, so each expectation reads the same data it compiles.
import { describe, expect, it } from 'vitest';
import { HOOK_NAMES } from '@vault-duel/engine';
import { compileContent } from './compile';
import { KEYWORDS } from '../keywords/index.gen';
import { FIXTURE_GLOBALS, fixtureData } from '../test-utils/fixture';

const data = fixtureData();
const compiled = compileContent(data, KEYWORDS, FIXTURE_GLOBALS);

function need<T>(value: T | undefined, what: string): T {
  if (value === undefined) throw new Error(`fixture: ${what} is missing`);
  return value;
}

const idx = (id: string): number => need(compiled.index.get(id), `def ${id}`);
const bit = (id: string): number => need(compiled.kwBit[id], `keyword bit ${id}`);
const registryIndex = (id: string): number => KEYWORDS.findIndex((keyword) => keyword.id === id);

describe('compileContent on the fixture', () => {
  it('numbers every card and Chimera family once, monsters and Relics first, families last', () => {
    const cards = [
      ...(data.playerMonsters ?? []),
      ...(data.relics ?? []),
      ...(data.playerSpells ?? []),
      ...(data.playerTraps ?? []),
      ...(data.collectorSpells ?? []),
      ...(data.collectorTraps ?? []),
    ];
    const families = data.recipes ?? [];
    expect(compiled.ids).toHaveLength(cards.length + families.length);
    expect(compiled.ids[0]).toBe(data.playerMonsters?.[0]?.id);
    expect(compiled.ids.slice(-families.length)).toEqual(families.map((recipe) => recipe.id));
  });

  it('gives every id a unique index that points back to it', () => {
    expect(compiled.index.size).toBe(compiled.ids.length);
    compiled.ids.forEach((id, i) => expect(compiled.index.get(id)).toBe(i));
  });

  it('stores the Collector deck and ace as definition indices, with canGraft false', () => {
    const collector = need(data.collector, 'collector');
    expect(compiled.collector.deck).toHaveLength(collector.deck.length);
    expect(compiled.collector.ace).toBe(idx(collector.ace));
    expect(compiled.collector.canGraft).toBe(false);
    expect(compiled.collector.deck.every((def) => compiled.pool[def] === 1)).toBe(true);
  });

  it('marks Relics as Collector pool and base cards as Player pool', () => {
    expect(compiled.pool[idx('fixture-hydra')]).toBe(1);
    expect(compiled.pool[idx('fixture-whelp')]).toBe(0);
    expect(compiled.playerPool.monsters).toHaveLength(data.playerMonsters?.length ?? -1);
    expect(compiled.playerPool.spells).toHaveLength(data.playerSpells?.length ?? -1);
    expect(compiled.playerPool.traps).toHaveLength(data.playerTraps?.length ?? -1);
  });

  it('assigns keyword and Flaw bits in KEYWORDS order (bit = registry index)', () => {
    expect(compiled.keywords.map((keyword) => keyword.id)).toEqual(KEYWORDS.map((keyword) => keyword.id));
    for (const keyword of KEYWORDS) expect(compiled.kwBit[keyword.id], keyword.id).toBe(registryIndex(keyword.id));
    expect(compiled.kw[idx('fixture-hydra')]).toBe((1 << bit('brittle')) >>> 0);
    expect(compiled.kw[idx('fixture-stag')]).toBe((1 << bit('swift')) >>> 0);
    expect(compiled.kw[idx('fixture-whelp')]).toBe(0);
  });

  it('sets a hook bit only for keywords that define the hook', () => {
    expect(compiled.hookMask.attackPermission).toBe(((1 << bit('swift')) | (1 << bit('slow'))) >>> 0);
    expect(compiled.hookMask.beforeDestroy).toBe((1 << bit('ward')) >>> 0);
    expect(compiled.hookMask.onDestroyed).toBe(((1 << bit('echo')) | (1 << bit('haunt'))) >>> 0);
    for (const name of HOOK_NAMES) expect(typeof compiled.hookMask[name]).toBe('number');
  });

  it('keeps spell and trap definitions as the DSL, with no id or name fields', () => {
    const bolt = need(data.playerSpells?.find((spell) => spell.id === 'fixture-bolt'), 'fixture-bolt');
    const def = need(compiled.spell[idx('fixture-bolt')] ?? undefined, 'fixture-bolt def');
    expect(def.effects).toEqual(bolt.effects);
    expect(Object.keys(def)).not.toContain('name');
    const snare = need(data.playerTraps?.[0], 'trap');
    const trap = need(compiled.trap[idx(snare.id)] ?? undefined, 'trap def');
    expect(trap.trigger).toBe(snare.trigger);
    expect(compiled.spell[idx('fixture-whelp')]).toBeNull();
  });

  it('builds a symmetric Chimera recipe table with a family for every kind pair', () => {
    const n = compiled.nKinds;
    expect(n).toBe(data.kinds?.length ?? -1);
    for (let a = 0; a < n; a++) {
      for (let b = 0; b < n; b++) {
        const family = compiled.recipe[a * n + b] ?? -1;
        expect(family, `pair ${a},${b}`).toBeGreaterThanOrEqual(0);
        expect(family).toBe(compiled.recipe[b * n + a]);
        expect(compiled.type[family]).toBe(3);
      }
    }
  });

  it('builds the element matrices: opposes is beats in either direction', () => {
    const n = compiled.nElements;
    const ember = compiled.elementIds.indexOf('ember');
    const gale = compiled.elementIds.indexOf('gale');
    expect(compiled.beats[ember * n + gale]).toBe(1);
    expect(compiled.beats[gale * n + ember] ?? 0).toBe(0);
    for (let a = 0; a < n; a++) {
      for (let b = 0; b < n; b++) {
        const expected = (compiled.beats[a * n + b] ?? 0) | (compiled.beats[b * n + a] ?? 0);
        expect(compiled.opposes[a * n + b]).toBe(expected);
      }
    }
  });

  it('gives a stable hash of 32 hex digits, the same on every compile', () => {
    expect(compiled.hash).toMatch(/^[0-9a-f]{32}$/);
    expect(compileContent(data, KEYWORDS, FIXTURE_GLOBALS).hash).toBe(compiled.hash);
  });

  it('carries the version and freezes the plain parts', () => {
    expect(compiled.version).toBe(FIXTURE_GLOBALS.CONTENT_VERSION);
    expect(Object.isFrozen(compiled)).toBe(true);
    expect(Object.isFrozen(compiled.spell)).toBe(true);
    expect(Object.isFrozen(compiled.keywords)).toBe(true);
  });
});
