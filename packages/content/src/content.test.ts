// Content files parse, match the entity counts of ARCHITECTURE.md §10.1 and are internally consistent.
import { describe, expect, it } from 'vitest';
import { loadContent } from './load';

const content = loadContent();
const { data } = content;

describe('content files', () => {
  it('parse with their zod schemas without errors', () => {
    expect(content.errors.map((error) => error.file + ' ' + error.problem)).toEqual([]);
  });

  it('load every §10.1 file as defined data', () => {
    for (const [key, value] of Object.entries(data)) {
      expect(value, key).toBeDefined();
    }
  });
});

describe('entity counts (§10.1, DESIGN.md)', () => {
  it('has 5 elements', () => {
    expect(data.elements).toHaveLength(5);
  });

  it('has 5 kinds', () => {
    expect(data.kinds).toHaveLength(5);
  });

  it('has 15 Chimera recipes, one per unordered kind pair', () => {
    expect(data.recipes).toHaveLength(15);
    const pairs = new Set(data.recipes?.map((recipe) => [...recipe.kinds].sort().join('+')));
    expect(pairs.size).toBe(15);
  });

  it('has 25 player monsters', () => {
    expect(data.playerMonsters).toHaveLength(25);
  });

  it('has 6 player spells and 4 player traps', () => {
    expect(data.playerSpells).toHaveLength(6);
    expect(data.playerTraps).toHaveLength(4);
  });

  it('has 13 Relics', () => {
    expect(data.relics).toHaveLength(13);
  });

  it('has 4 Collector spells and 3 Collector traps', () => {
    expect(data.collectorSpells).toHaveLength(4);
    expect(data.collectorTraps).toHaveLength(3);
  });

  it('has a Collector deck of 20 cards', () => {
    expect(data.collector?.deck).toHaveLength(20);
  });

  it('has 4 bonus objectives and no weekly twists yet', () => {
    expect(data.objectives).toHaveLength(4);
    expect(data.twists).toHaveLength(0);
  });
});

describe('ids', () => {
  const listFiles = [
    'elements', 'kinds', 'recipes', 'playerMonsters', 'playerSpells', 'playerTraps',
    'relics', 'collectorSpells', 'collectorTraps', 'objectives', 'twists',
  ] as const;

  for (const key of listFiles) {
    it(`has unique ids within ${key}`, () => {
      const ids = (data[key] ?? []).map((entry) => entry.id);
      expect(new Set(ids).size).toBe(ids.length);
    });
  }

  it('gives every card and Chimera family an art brief and no orphan briefs', () => {
    const cardIds = [
      ...(data.playerMonsters ?? []),
      ...(data.playerSpells ?? []),
      ...(data.playerTraps ?? []),
      ...(data.relics ?? []),
      ...(data.collectorSpells ?? []),
      ...(data.collectorTraps ?? []),
      ...(data.recipes ?? []),
    ].map((entry) => entry.id);
    const briefIds = Object.keys(data.artBriefs ?? {});
    expect(briefIds.filter((id) => !cardIds.includes(id))).toEqual([]);
    expect(cardIds.filter((id) => !briefIds.includes(id))).toEqual([]);
  });

  it('resolves every Collector deck entry to a Collector-pool card', () => {
    const collectorIds = new Set([
      ...(data.relics ?? []),
      ...(data.collectorSpells ?? []),
      ...(data.collectorTraps ?? []),
    ].map((entry) => entry.id));
    const unknown = (data.collector?.deck ?? []).filter((id) => !collectorIds.has(id));
    expect(unknown).toEqual([]);
    expect(collectorIds.has(data.collector?.ace ?? '')).toBe(true);
  });
});
