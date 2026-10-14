// Hook registry (ARCHITECTURE.md §8.1, §8.3.8). Keywords/Flaws are bit-indexed: bit i of a
// KwMask selects `c.keywords[i]` (registry order = bit order). Traps compile to hook tables
// per DefIdx (traps.ts, later milestone) and are supplied here.
import { EngineError } from '../errors';
import type { CompiledContent, DefIdx, KwMask } from '../types/content';
import type { Globals } from '../types/globals';
import { HOOK_NAMES } from '../types/hooks';
import type { HookName, Hooks } from '../types/hooks';

export const MAX_KEYWORD_BITS = 32;

export interface HookRegistry {
  /** bit index -> hooks of that keyword/Flaw */
  readonly kw: readonly Hooks[];
  /** hook name -> mask of keyword bits that implement it (same object as c.hookMask) */
  readonly masks: Readonly<Record<HookName, KwMask>>;
  /** DefIdx -> hooks compiled from a trap's DSL (null for non-traps) */
  readonly trapHooks: readonly (Hooks | null)[];
}

/** Everything the rules need besides the state: compiled content, globals, hook registry. */
export interface Env {
  readonly c: CompiledContent;
  readonly g: Globals;
  readonly reg: HookRegistry;
}

/** Index of the lowest set bit of a non-zero mask. */
export function lowBit(m: number): number {
  return 31 - Math.clz32(m & -m);
}

export function createRegistry(c: CompiledContent, trapHooks: readonly (Hooks | null)[] = []): HookRegistry {
  if (c.keywords.length > MAX_KEYWORD_BITS) {
    throw new EngineError(`more than ${MAX_KEYWORD_BITS} keywords/Flaws`);
  }
  const kw = c.keywords.map((k) => k.hooks);
  // hookMask must agree with the keyword hook tables (compile.ts builds it by iterating HOOK_NAMES).
  for (let i = 0; i < HOOK_NAMES.length; i++) {
    const name = HOOK_NAMES[i] as HookName;
    const mask = c.hookMask[name] ?? 0;
    for (let bit = 0; bit < kw.length; bit++) {
      const has = (kw[bit] as Hooks)[name] !== undefined;
      const flagged = (mask & (1 << bit)) !== 0;
      if (has !== flagged) {
        throw new EngineError(`hookMask.${name} disagrees with keyword '${c.keywords[bit]?.id ?? bit}'`);
      }
    }
  }
  return { kw, masks: c.hookMask, trapHooks };
}

export function createEnv(c: CompiledContent, g: Globals, trapHooks: readonly (Hooks | null)[] = []): Env {
  return { c, g, reg: createRegistry(c, trapHooks) };
}

export function trapHooksOf(env: Env, def: DefIdx): Hooks | null {
  return env.reg.trapHooks[def] ?? null;
}
