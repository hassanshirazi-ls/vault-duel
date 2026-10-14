// Num resolution (ARCHITECTURE.md §9.1, D-074, D-120, D-171): literals pass through; `$NAME` / `-$NAME`
// read `CONTENT_NUMBERS` first, then a numeric core Globals key. Anything else is an EngineError
// (the validator rejects it earlier).
import { EngineError } from '../errors';
import type { Globals, NumericGlobal } from '../types/globals';
import type { Num } from '../types/effects';

/** The value of a global name: an own property of `CONTENT_NUMBERS`, else a numeric core key. */
export function globalByName(g: Globals, name: string): number {
  if (Object.hasOwn(g.CONTENT_NUMBERS, name)) return g.CONTENT_NUMBERS[name] as number;
  if (Object.hasOwn(g, name)) {
    const v = g[name as NumericGlobal];
    if (typeof v === 'number') return v;
    throw new EngineError(`global '${name}' is not numeric`);
  }
  throw new EngineError(`unknown global '${name}'`);
}

export function resolveNum(g: Globals, n: Num): number {
  if (typeof n === 'number') return n;
  const negate = n.charCodeAt(0) === 45; // '-'
  const name = n.slice(negate ? 2 : 1);
  const v = globalByName(g, name);
  return negate ? 0 - v : v;
}
