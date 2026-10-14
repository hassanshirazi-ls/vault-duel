// Compiles validated content into CompiledContent (ARCHITECTURE.md §3): dense integer indices, typed arrays for
// the element and kind matrices, keyword bits, hook masks and the Collector pool. String ids stay only in `ids`,
// `index`, the keyword registry and the boundary maps. Runs only on data that passed load + validateContent, so a
// missing entry or unknown reference here is a bug and throws.
import { cyrb128, DefType, deepFreeze, HOOK_NAMES, Pool } from '@vault-duel/engine';
import type {
  CompiledContent,
  CompiledSpell,
  CompiledTrap,
  CompiledTwist,
  DefIdx,
  Globals,
  HookName,
  KeywordDef,
} from '@vault-duel/engine';
import { KEYWORDS } from '../keywords/index.gen';
import { DEFAULT_GLOBALS } from './globals';
import type { ContentData } from './load';

/** One definition row before the typed arrays are built. Index in the row list = DefIdx. */
interface Row {
  readonly id: string;
  readonly type: number;
  readonly pool: number;
  readonly power: number;
  readonly guard: number;
  readonly element: number;
  readonly kind: number;
  readonly kw: number;
  readonly spell: CompiledSpell | null;
  readonly trap: CompiledTrap | null;
}

interface MonsterLike {
  readonly id: string;
  readonly element: string;
  readonly kind: string;
  readonly power: number;
  readonly guard: number;
  readonly keywords: readonly string[];
}

function need<T>(value: T | undefined, what: string): T {
  if (value === undefined) throw new Error(`compile: ${what} is missing; compile only runs on validated content`);
  return value;
}

function lookup(map: ReadonlyMap<string, number>, id: string, what: string): number {
  const found = map.get(id);
  if (found === undefined) throw new Error(`compile: unknown ${what} "${id}"`);
  return found;
}

/** JSON with sorted object keys and no undefined members, so the same content always hashes the same. */
function canonicalJson(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map((item) => canonicalJson(item)).join(',')}]`;
  if (value !== null && typeof value === 'object') {
    const record = value as Record<string, unknown>;
    const parts = Object.keys(record)
      .sort()
      .filter((key) => record[key] !== undefined)
      .map((key) => `${JSON.stringify(key)}:${canonicalJson(record[key])}`);
    return `{${parts.join(',')}}`;
  }
  return JSON.stringify(value) ?? 'null';
}

function hashOf(text: string): string {
  return cyrb128(text)
    .map((word) => (word >>> 0).toString(16).padStart(8, '0'))
    .join('');
}

/**
 * Builds CompiledContent. DefIdx order (see the report): player monsters, Relics, player spells, player traps,
 * Collector spells, Collector traps, then one Chimera family per recipe in recipes.json order.
 */
export function compileContent(
  data: ContentData,
  keywords: readonly KeywordDef[] = KEYWORDS,
  globals: Globals = DEFAULT_GLOBALS,
): CompiledContent {
  if (keywords.length > 32) throw new Error(`compile: ${keywords.length} keywords, the mask holds 32`);
  const elements = need(data.elements, 'elements');
  const kinds = need(data.kinds, 'kinds');
  const monsters = need(data.playerMonsters, 'cards/player-monsters.json');
  const relics = need(data.relics, 'cards/relics.json');
  const playerSpells = need(data.playerSpells, 'cards/player-spells.json');
  const playerTraps = need(data.playerTraps, 'cards/player-traps.json');
  const collectorSpells = need(data.collectorSpells, 'cards/collector-spells.json');
  const collectorTraps = need(data.collectorTraps, 'cards/collector-traps.json');
  const recipes = need(data.recipes, 'recipes.json');
  const collector = need(data.collector, 'collector.json');

  const elementIdx = new Map(elements.map((element, i) => [element.id, i] as const));
  const kindIdx = new Map(kinds.map((kind, i) => [kind.id, i] as const));
  const keywordIdx = new Map(keywords.map((keyword, bit) => [keyword.id, bit] as const));
  const kwBit: Record<string, number> = {};
  keywords.forEach((keyword, bit) => {
    kwBit[keyword.id] = bit;
  });

  const bitOf = (id: string): number => lookup(keywordIdx, id, 'keyword or Flaw');
  const monsterRow = (card: MonsterLike, pool: number, flaw: string | undefined): Row => {
    let kw = 0;
    for (const id of card.keywords) kw |= 1 << bitOf(id);
    if (flaw !== undefined) kw |= 1 << bitOf(flaw);
    return {
      id: card.id,
      type: DefType.Monster,
      pool,
      power: card.power,
      guard: card.guard,
      element: lookup(elementIdx, card.element, 'element'),
      kind: lookup(kindIdx, card.kind, 'kind'),
      kw: kw >>> 0,
      spell: null,
      trap: null,
    };
  };
  const blankRow = (id: string, type: number, pool: number): Row => ({
    id,
    type,
    pool,
    power: 0,
    guard: 0,
    element: -1,
    kind: -1,
    kw: 0,
    spell: null,
    trap: null,
  });

  const rows: Row[] = [
    ...monsters.map((card) => monsterRow(card, Pool.Player, undefined)),
    ...relics.map((card) => monsterRow(card, Pool.Collector, card.flaw)),
    ...playerSpells.map((card) => ({
      ...blankRow(card.id, DefType.Spell, Pool.Player),
      spell: card.target ? { target: card.target, effects: card.effects } : { effects: card.effects },
    })),
    ...playerTraps.map((card) => ({
      ...blankRow(card.id, DefType.Trap, Pool.Player),
      trap: card.when
        ? { trigger: card.trigger, when: card.when, effects: card.effects }
        : { trigger: card.trigger, effects: card.effects },
    })),
    ...collectorSpells.map((card) => ({
      ...blankRow(card.id, DefType.Spell, Pool.Collector),
      spell: card.target ? { target: card.target, effects: card.effects } : { effects: card.effects },
    })),
    ...collectorTraps.map((card) => ({
      ...blankRow(card.id, DefType.Trap, Pool.Collector),
      trap: card.when
        ? { trigger: card.trigger, when: card.when, effects: card.effects }
        : { trigger: card.trigger, effects: card.effects },
    })),
  ];
  const familyStart = rows.length;
  for (const recipe of recipes) {
    rows.push({
      id: recipe.id,
      type: DefType.Family,
      pool: Pool.Player,
      power: recipe.power,
      guard: recipe.guard,
      element: -1,
      kind: -1,
      kw: 0,
      spell: null,
      trap: null,
    });
  }

  const index = new Map<string, DefIdx>(rows.map((row, i) => [row.id, i] as const));
  const lookupDef = (id: string): DefIdx => lookup(index, id, 'card id');
  const indicesOf = (list: readonly { readonly id: string }[]): DefIdx[] => list.map((entry) => lookupDef(entry.id));

  const nElements = elements.length;
  const nKinds = kinds.length;

  const beats = new Uint8Array(nElements * nElements);
  elements.forEach((element, a) => {
    for (const beaten of element.beats) {
      beats[a * nElements + lookup(elementIdx, beaten, 'element')] = 1;
    }
  });
  const opposes = new Uint8Array(nElements * nElements);
  for (let a = 0; a < nElements; a++) {
    for (let b = 0; b < nElements; b++) {
      opposes[a * nElements + b] = (beats[a * nElements + b] ?? 0) | (beats[b * nElements + a] ?? 0);
    }
  }

  const recipe = new Int16Array(nKinds * nKinds).fill(-1);
  recipes.forEach((entry, i) => {
    const k1 = lookup(kindIdx, entry.kinds[0], 'kind');
    const k2 = lookup(kindIdx, entry.kinds[1], 'kind');
    recipe[k1 * nKinds + k2] = familyStart + i;
    recipe[k2 * nKinds + k1] = familyStart + i;
  });

  const hookMask = {} as Record<HookName, number>;
  for (const name of HOOK_NAMES) hookMask[name] = 0;
  keywords.forEach((keyword, bit) => {
    for (const name of HOOK_NAMES) {
      if (keyword.hooks[name] !== undefined) hookMask[name] = (hookMask[name] | (1 << bit)) >>> 0;
    }
  });

  const twists: CompiledTwist[] = (data.twists ?? []).map((twist) => ({
    id: twist.id,
    text: twist.text,
    ...(twist.isoWeek !== undefined ? { isoWeek: twist.isoWeek } : {}),
    modifiers: twist.modifiers.map((modifier) => ({
      where: modifier.where,
      ...(modifier.power !== undefined ? { power: modifier.power } : {}),
      ...(modifier.guard !== undefined ? { guard: modifier.guard } : {}),
    })),
  }));

  const hash = hashOf(canonicalJson({ content: data, keywords: keywords.map((keyword) => keyword.id) }));
  const playerMonsters = indicesOf(monsters);
  const playerSpellIdx = indicesOf(playerSpells);
  const playerTrapIdx = indicesOf(playerTraps);

  return Object.freeze({
    version: globals.CONTENT_VERSION,
    hash,
    ids: Object.freeze(rows.map((row) => row.id)),
    index,
    type: Uint8Array.from(rows, (row) => row.type),
    pool: Uint8Array.from(rows, (row) => row.pool),
    power: Int8Array.from(rows, (row) => row.power),
    guard: Int8Array.from(rows, (row) => row.guard),
    element: Int8Array.from(rows, (row) => row.element),
    kind: Int8Array.from(rows, (row) => row.kind),
    kw: Uint32Array.from(rows, (row) => row.kw),
    spell: deepFreeze(rows.map((row) => row.spell)),
    trap: deepFreeze(rows.map((row) => row.trap)),
    nElements,
    nKinds,
    elementIds: Object.freeze(elements.map((element) => element.id)),
    kindIds: Object.freeze(kinds.map((kind) => kind.id)),
    beats,
    opposes,
    recipe,
    keywords: Object.freeze([...keywords]),
    kwBit: Object.freeze(kwBit),
    hookMask: Object.freeze(hookMask),
    playerPool: Object.freeze({
      monsters: Object.freeze(playerMonsters),
      spells: Object.freeze(playerSpellIdx),
      traps: Object.freeze(playerTrapIdx),
    }),
    collector: Object.freeze({
      deck: Object.freeze(collector.deck.map((id) => lookupDef(id))),
      ace: lookupDef(collector.ace),
      canGraft: collector.canGraft,
    }),
    twists: deepFreeze(twists),
  });
}
