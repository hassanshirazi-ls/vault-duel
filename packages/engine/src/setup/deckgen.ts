// Player deck generation (ARCHITECTURE.md §12.3; D-005, D-006). Rejection sampling from the 'deck'
// stream: pick each card uniformly among pool entries with fewer than MAX_COPIES copies, check the
// monster constraints, and retry up to DECKGEN_MAX_ATTEMPTS continuing the same stream.
import { EngineError } from '../errors';
import type { Sfc32 } from '../rng';
import type { CompiledContent, DefIdx } from '../types/content';
import type { Globals } from '../types/globals';
import { stream } from './seed';

/** `n` picks from `pool`, each uniform among entries used fewer than `cap` times (D-005). */
// Judgment call: D-005 names a ContentError; the engine has only EngineError, so exhaustion throws that.
export function pickWithCap(pool: readonly DefIdx[], n: number, cap: number, rng: Sfc32): DefIdx[] {
  const used = pool.map(() => 0);
  const out: DefIdx[] = [];
  for (let i = 0; i < n; i++) {
    const open: number[] = [];
    for (let p = 0; p < pool.length; p++) if ((used[p] as number) < cap) open.push(p);
    if (open.length === 0) throw new EngineError(`deckgen: pool of ${pool.length} cannot supply ${n} cards at ${cap} copies`);
    const p = open[rng.int(open.length)] as number;
    used[p] = (used[p] as number) + 1;
    out.push(pool[p] as DefIdx);
  }
  return out;
}

/** D-006: sorted by (type, element, kind, id). Ids compare by code unit, never by locale. */
export function sortDeckList(c: CompiledContent, list: readonly DefIdx[]): DefIdx[] {
  const key = (d: DefIdx): readonly [number, number, number, string] => [
    c.type[d] ?? 0,
    c.element[d] ?? -1,
    c.kind[d] ?? -1,
    c.ids[d] ?? '',
  ];
  return list.slice().sort((a, b) => {
    const ka = key(a);
    const kb = key(b);
    for (let i = 0; i < 3; i++) if (ka[i] !== kb[i]) return (ka[i] as number) - (kb[i] as number);
    return ka[3] < kb[3] ? -1 : ka[3] > kb[3] ? 1 : 0;
  });
}

function distinct(values: readonly number[]): number {
  const seen: boolean[] = [];
  let n = 0;
  for (const v of values) {
    if (v >= 0 && seen[v] !== true) {
      seen[v] = true;
      n++;
    }
  }
  return n;
}

/** The monster constraints of §12.3 (elements, kinds, low and high curve). */
export function monstersAcceptable(c: CompiledContent, g: Globals, monsters: readonly DefIdx[]): boolean {
  let low = 0;
  let high = 0;
  for (const d of monsters) {
    const p = c.power[d] ?? 0;
    if (p <= g.CURVE_LOW_MAX_POWER) low++;
    if (p >= g.CURVE_HIGH_MIN_POWER) high++;
  }
  return (
    distinct(monsters.map((d) => c.element[d] ?? -1)) >= g.DECK_MIN_ELEMENTS &&
    distinct(monsters.map((d) => c.kind[d] ?? -1)) >= g.DECK_MIN_KINDS &&
    low >= g.CURVE_LOW_MIN_COUNT &&
    high >= g.CURVE_HIGH_MIN_COUNT
  );
}

/** The player's deck list (DefIdx per card, D-006 order). Throws EngineError when no attempt passes (D-005). */
export function generateDeck(c: CompiledContent, g: Globals, rng: Sfc32): DefIdx[] {
  for (let attempt = 1; attempt <= g.DECKGEN_MAX_ATTEMPTS; attempt++) {
    const monsters = pickWithCap(c.playerPool.monsters, g.DECK_MONSTERS, g.MAX_COPIES, rng);
    if (!monstersAcceptable(c, g, monsters)) continue;
    const spells = pickWithCap(c.playerPool.spells, g.DECK_SPELLS, g.MAX_COPIES, rng);
    const traps = pickWithCap(c.playerPool.traps, g.DECK_TRAPS, g.MAX_COPIES, rng);
    return sortDeckList(c, [...monsters, ...spells, ...traps]);
  }
  throw new EngineError(`deckgen: no acceptable deck in ${g.DECKGEN_MAX_ATTEMPTS} attempts`);
}

/** The player's deck for a full seed string (`...#k`): exactly what `newGame` generates from the 'deck' stream (D-200). */
export function deckForSeed(c: CompiledContent, g: Globals, seed: string): DefIdx[] {
  return generateDeck(c, g, stream(seed, 'deck'));
}
