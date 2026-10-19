// The "How to play seen" flag: a small versioned value in browser storage. Raising HOWTO_VERSION shows the primer again
// to everyone. Every read and write is wrapped, so a throwing or full storage means "show it again", never a crash.
import { getJson } from './storage';
import type { KV } from './storage';

// 2: the turn slots (D-335); 3: Graft only, quiet table, Riposte and Ambush (D-336..D-339);
// 4: the royal court words (D-350), the crowned levy (D-349) and the Ink Spiral look (D-351)
export const HOWTO_VERSION = 4;
export const HOWTO_KEY = 'vd:howto';

export function howToSeen(kv: KV): boolean {
  try {
    const value = getJson(kv, HOWTO_KEY);
    if (typeof value !== 'object' || value === null) return false;
    const v = (value as { v?: unknown }).v;
    return typeof v === 'number' && v >= HOWTO_VERSION;
  } catch {
    return false;
  }
}

export function markHowToSeen(kv: KV): void {
  try {
    kv.set(HOWTO_KEY, JSON.stringify({ v: HOWTO_VERSION }));
  } catch {
    // nothing to do: the primer shows again next time
  }
}
