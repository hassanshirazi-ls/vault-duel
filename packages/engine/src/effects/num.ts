// Num resolution (ARCHITECTURE.md §9.1, D-074, D-120): literals pass through; `$NAME` / `-$NAME`
// read a numeric Globals key. Anything else is an EngineError (the validator rejects it earlier).
import { EngineError } from '../errors';
import type { Globals, NumericGlobal } from '../types/globals';
import type { Num } from '../types/effects';

export function resolveNum(n: Num, g: Globals): number {
  if (typeof n === 'number') return n;
  const negate = n.charCodeAt(0) === 45; // '-'
  const name = n.slice(negate ? 2 : 1);
  if (!Object.hasOwn(g, name)) throw new EngineError(`unknown global ref '${n}'`);
  const v = g[name as NumericGlobal];
  if (typeof v !== 'number') throw new EngineError(`global ref '${n}' is not numeric`);
  return negate ? 0 - v : v;
}
