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

/** Human-readable list of the content overrides, for the report header. */
export function describeOverrides(o: ContentOverrides): string[] {
  const out: string[] = [];
  if (o.ring !== undefined) out.push(`ring=${NAMED_RINGS[o.ring] ?? o.ring}`);
  for (const c of o.collector ?? []) out.push(`collector.${c}`);
  return out;
}

/** A copy of `raw` with the overrides applied; `raw` itself is never touched. With no overrides it returns `raw`. */
export function applyContentOverrides(raw: Raw, o: ContentOverrides): Raw {
  const collectorSets = o.collector ?? [];
  if (o.ring === undefined && collectorSets.length === 0) return raw;
  const out: Record<string, unknown> = { ...raw };
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
