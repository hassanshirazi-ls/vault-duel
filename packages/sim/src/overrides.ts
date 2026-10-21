// Raw-content overrides for A/B runs (D-287): `--ring` rewrites elements.json `beats` and `--collector <path>=<json>` sets
// a collector.json `ai` field. Both apply to a copy of the raw content before parseContent and compileContent, so the
// parser still validates the result and the content hash reflects it. Workers get the same strings and apply them the same way.
import type { ContentKey } from '@vault-duel/content';

/** What the command line asks for; plain strings so they cross the worker boundary unchanged. */
export interface ContentOverrides {
  /** `--ring a,b,c,d,e`: each element beats the next, and the last beats the first */
  readonly ring?: string | undefined;
  /** `--collector path=json`, each path under collector.json `ai` */
  readonly collector?: readonly string[];
  /** `--card id.field=json`, repeatable: a monster, relic or Graft recipe stat (M-05, M-11) */
  readonly card?: readonly string[];
}

export class ContentOverrideError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'ContentOverrideError';
  }
}

/** The owner's ring and its two alternates (D-285). Convenience names only; any permutation of the element ids works. */
export const NAMED_RINGS: Readonly<Record<string, string>> = {
  A: 'ember,gale,tide,lumen,umbra',
  B: 'ember,gale,tide,umbra,lumen',
  C: 'ember,gale,umbra,lumen,tide',
};

type Raw = Readonly<Record<ContentKey, unknown>>;

interface RawElement {
  id: string;
  beats: string[];
  [key: string]: unknown;
}

const UNSAFE = new Set(['__proto__', 'constructor', 'prototype']);

/** The ring as an id list; `A`, `B` and `C` are accepted for the named rings. Throws for anything but a ring over the given ids. */
export function parseRing(text: string, elementIds: readonly string[]): string[] {
  const spelled = NAMED_RINGS[text] ?? text;
  const ring = spelled.split(',').map((s) => s.trim());
  const sorted = (xs: readonly string[]): string => [...xs].sort().join(',');
  if (ring.length !== elementIds.length || sorted(ring) !== sorted(elementIds)) {
    throw new ContentOverrideError(`--ring needs every element exactly once (${elementIds.join(', ')}), got "${text}"`);
  }
  return ring;
}

/** One `--collector path=json`: the path is dotted and starts with `ai.`; a value that is not JSON is taken as a bare word. */
export function parseCollectorSet(text: string): { path: string[]; value: unknown } {
  const eq = text.indexOf('=');
  if (eq < 1) throw new ContentOverrideError(`--collector needs path=json, got "${text}"`);
  const path = text.slice(0, eq).split('.');
  if (path[0] !== 'ai' || path.length < 2 || path.some((p) => p === '' || UNSAFE.has(p))) {
    throw new ContentOverrideError(`--collector path must be ai.<field>[.<field>...], got "${text.slice(0, eq)}"`);
  }
  const raw = text.slice(eq + 1);
  let value: unknown;
  try {
    value = JSON.parse(raw);
  } catch {
    value = raw;
  }
  return { path, value };
}

/** Raw files that hold monsters (player monsters, the Monarch's relics and ace) and Graft recipes, with the fields `--card` may set on each. */
const CARD_FILES: readonly { key: ContentKey; fields: readonly string[] }[] = [
  { key: 'playerMonsters', fields: ['power', 'guard', 'keywords'] },
  { key: 'relics', fields: ['power', 'guard', 'keywords'] },
  { key: 'recipes', fields: ['power', 'guard'] },
];

/** One `--card id.field=json`: the id may contain dots-free kebab text; the value must be JSON. */
export function parseCardSet(text: string): { id: string; field: string; value: unknown } {
  const eq = text.indexOf('=');
  const dot = text.indexOf('.');
  if (eq < 1 || dot < 1 || dot > eq - 1) throw new ContentOverrideError(`--card needs <id>.<field>=<json>, got "${text}"`);
  const id = text.slice(0, dot);
  const field = text.slice(dot + 1, eq);
  if (UNSAFE.has(id) || UNSAFE.has(field)) throw new ContentOverrideError(`--card: bad name in "${text}"`);
  const raw = text.slice(eq + 1);
  let value: unknown;
  try {
    value = JSON.parse(raw);
  } catch {
    throw new ContentOverrideError(`--card value must be JSON (for example 7 or ["ward"]), got "${raw}" in "${text}"`);
  }
  return { id, field, value };
}

function applyCardSets(raw: Raw, sets: readonly string[]): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  const cloned = new Map<ContentKey, Record<string, unknown>[]>();
  const rowsOf = (key: ContentKey): Record<string, unknown>[] => {
    let rows = cloned.get(key);
    if (rows === undefined) {
      rows = structuredClone(raw[key]) as Record<string, unknown>[];
      cloned.set(key, rows);
      out[key] = rows;
    }
    return rows;
  };
  for (const text of sets) {
    const { id, field, value } = parseCardSet(text);
    const found = CARD_FILES.find((f) => (raw[f.key] as { id?: unknown }[]).some((row) => row.id === id));
    if (found === undefined) {
      const ids = CARD_FILES.flatMap((f) => (raw[f.key] as { id: string }[]).map((row) => row.id));
      throw new ContentOverrideError(`--card: unknown card id "${id}" (valid: ${ids.join(', ')})`);
    }
    if (!found.fields.includes(field)) throw new ContentOverrideError(`--card: "${id}" has no overridable field "${field}" (valid: ${found.fields.join(', ')})`);
    const row = rowsOf(found.key).find((r) => r['id'] === id) as Record<string, unknown>;
    row[field] = value;
  }
  return out;
}

/** Human-readable list of the content overrides, for the report header. */
export function describeOverrides(o: ContentOverrides): string[] {
  const out: string[] = [];
  if (o.ring !== undefined) out.push(`ring=${NAMED_RINGS[o.ring] ?? o.ring}`);
  for (const c of o.collector ?? []) out.push(`collector.${c}`);
  for (const c of o.card ?? []) out.push(`card.${c}`);
  return out;
}

/** A copy of `raw` with the overrides applied; `raw` itself is never touched. With no overrides it returns `raw`. */
export function applyContentOverrides(raw: Raw, o: ContentOverrides): Raw {
  const collectorSets = o.collector ?? [];
  const cardSets = o.card ?? [];
  if (o.ring === undefined && collectorSets.length === 0 && cardSets.length === 0) return raw;
  const out: Record<string, unknown> = { ...raw };
  if (cardSets.length > 0) Object.assign(out, applyCardSets(raw, cardSets));
  if (o.ring !== undefined) {
    const elements = structuredClone(raw.elements) as RawElement[];
    const ring = parseRing(o.ring, elements.map((e) => e.id));
    for (const element of elements) {
      const at = ring.indexOf(element.id);
      element.beats = [ring[(at + 1) % ring.length] as string];
    }
    out['elements'] = elements;
  }
  if (collectorSets.length > 0) {
    const collector = structuredClone(raw.collector) as Record<string, unknown>;
    for (const text of collectorSets) {
      const { path, value } = parseCollectorSet(text);
      let node = collector;
      for (const key of path.slice(0, -1)) {
        const next = node[key];
        if (typeof next !== 'object' || next === null || Array.isArray(next)) throw new ContentOverrideError(`--collector: "${path.join('.')}" is not a field of collector.json`);
        node = next as Record<string, unknown>;
      }
      node[path[path.length - 1] as string] = value;
    }
    out['collector'] = collector;
  }
  return out as Raw;
}
