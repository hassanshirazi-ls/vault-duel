// Seed strings and RNG sub-streams (ARCHITECTURE.md §12.2; D-001 to D-003). The date comes from the
// caller; the engine never reads a clock.
import { canonicalJson } from '../canonical';
import { cyrb128, Sfc32 } from '../rng';
import type { CompiledContent } from '../types/content';
import type { Globals } from '../types/globals';

/** One independent stream per purpose (D-002). */
export const STREAM_PURPOSES = ['deck', 'shuffle-player', 'shuffle-collector', 'signature', 'objectives', 'twist', 'engine'] as const;
export type StreamPurpose = (typeof STREAM_PURPOSES)[number];

/** D-001: `SEED_PREFIX:YYYY-MM-DD:CONTENT_VERSION`. */
export function seedString(g: Pick<Globals, 'SEED_PREFIX' | 'CONTENT_VERSION'>, date: string): string {
  return `${g.SEED_PREFIX}:${date}:${g.CONTENT_VERSION}`;
}

/** D-003: reroll k (0 = the unmodified daily seed) is `seedString#k`; this is what `GameState.seed` holds. */
export function rerollSeed(base: string, k: number): string {
  return `${base}#${k}`;
}

/** The stream for one purpose: `Sfc32.from(seed + "/" + purpose)` where `seed` already carries `#k` (§12.2). */
export function stream(seed: string, purpose: StreamPurpose): Sfc32 {
  return Sfc32.from(`${seed}/${purpose}`);
}

/** Replay guard stored in `GameState.cfg`: the content hash plus a hash of the bound globals (§11). */
export function configHash(c: Pick<CompiledContent, 'hash'>, g: Globals): string {
  // D-191: canonical form, so equal Globals hash equal whatever order their keys were built in.
  const words = cyrb128(canonicalJson(g));
  return `${c.hash}:${words.map((w) => w.toString(16).padStart(8, '0')).join('')}`;
}
