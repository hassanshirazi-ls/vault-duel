// Hand-made CompiledContent builder for engine tests (no dependency on packages/content).
import { DefType, Pool } from '../src/types/content';
import type { CompiledContent, CompiledTwist, DefIdx } from '../src/types/content';
import type { SpellDef, TrapDef } from '../src/types/effects';
import { HOOK_NAMES } from '../src/types/hooks';
import type { HookName, KeywordDef } from '../src/types/hooks';

export interface DefSpec {
  readonly id: string;
  readonly type: 'monster' | 'spell' | 'trap' | 'family';
  readonly pool?: 'player' | 'collector';
  readonly power?: number;
  readonly guard?: number;
  readonly element?: string;
  readonly kind?: string;
  /** keyword / Flaw ids (must exist in `keywords`) */
  readonly kw?: readonly string[];
  readonly spell?: SpellDef;
  readonly trap?: TrapDef;
}

export interface ContentSpec {
  /** element id and the ids it beats */
  readonly elements: readonly { readonly id: string; readonly beats: readonly string[] }[];
  readonly kinds: readonly string[];
  readonly recipes?: readonly { readonly kinds: readonly [string, string]; readonly family: string }[];
  readonly keywords: readonly KeywordDef[];
  readonly defs: readonly DefSpec[];
  readonly twists?: readonly CompiledTwist[];
}

const TYPE = { monster: DefType.Monster, spell: DefType.Spell, trap: DefType.Trap, family: DefType.Family } as const;

export function buildContent(spec: ContentSpec): CompiledContent {
  // Registry order = bit order: keywords by id, then Flaws by id (§3).
  const byId = (a: KeywordDef, b: KeywordDef): number => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0);
  const keywords = [
    ...spec.keywords.filter((k) => k.kind === 'keyword').sort(byId),
    ...spec.keywords.filter((k) => k.kind === 'flaw').sort(byId),
  ];
  const kwBit: Record<string, number> = {};
  keywords.forEach((k, i) => {
    kwBit[k.id] = i;
  });
  const hookMask = {} as Record<HookName, number>;
  for (const name of HOOK_NAMES) {
    let m = 0;
    keywords.forEach((k, i) => {
      if (k.hooks[name] !== undefined) m |= 1 << i;
    });
    hookMask[name] = m >>> 0;
  }

  const nE = spec.elements.length;
  const nK = spec.kinds.length;
  const elementIds = spec.elements.map((e) => e.id);
  const n = spec.defs.length;
  const index = new Map<string, DefIdx>();
  spec.defs.forEach((d, i) => index.set(d.id, i));

  const type = new Uint8Array(n);
  const pool = new Uint8Array(n);
  const power = new Int8Array(n);
  const guard = new Int8Array(n);
  const element = new Int8Array(n).fill(-1);
  const kind = new Int8Array(n).fill(-1);
  const kw = new Uint32Array(n);
  const spell: (SpellDef | null)[] = [];
  const trap: (TrapDef | null)[] = [];
  spec.defs.forEach((d, i) => {
    type[i] = TYPE[d.type];
    pool[i] = d.pool === 'collector' ? Pool.Collector : Pool.Player;
    power[i] = d.power ?? 0;
    guard[i] = d.guard ?? 0;
    if (d.element !== undefined) element[i] = elementIds.indexOf(d.element);
    if (d.kind !== undefined) kind[i] = spec.kinds.indexOf(d.kind);
    let mask = 0;
    for (const id of d.kw ?? []) {
      const bit = kwBit[id];
      if (bit === undefined) throw new Error(`fixture: unknown keyword ${id}`);
      mask |= 1 << bit;
    }
    kw[i] = mask >>> 0;
    spell.push(d.spell ?? null);
    trap.push(d.trap ?? null);
  });

  const beats = new Uint8Array(nE * nE);
  const opposes = new Uint8Array(nE * nE);
  spec.elements.forEach((e, a) => {
    for (const bid of e.beats) {
      const b = elementIds.indexOf(bid);
      beats[a * nE + b] = 1;
    }
  });
  for (let a = 0; a < nE; a++) {
    for (let b = 0; b < nE; b++) {
      opposes[a * nE + b] = beats[a * nE + b] === 1 || beats[b * nE + a] === 1 ? 1 : 0;
    }
  }
  const recipe = new Int16Array(nK * nK).fill(-1);
  for (const r of spec.recipes ?? []) {
    const k1 = spec.kinds.indexOf(r.kinds[0]);
    const k2 = spec.kinds.indexOf(r.kinds[1]);
    const fam = index.get(r.family) ?? -1;
    recipe[k1 * nK + k2] = fam;
    recipe[k2 * nK + k1] = fam;
  }

  return {
    version: 'fixture',
    hash: 'fixture',
    ids: spec.defs.map((d) => d.id),
    index,
    type, pool, power, guard, element, kind, kw,
    spell, trap,
    nElements: nE,
    nKinds: nK,
    elementIds,
    kindIds: spec.kinds,
    beats, opposes, recipe,
    keywords,
    kwBit,
    hookMask,
    playerPool: { monsters: [], spells: [], traps: [] },
    collector: { deck: [], ace: 0, canGraft: true },
    twists: spec.twists ?? [],
  };
}
