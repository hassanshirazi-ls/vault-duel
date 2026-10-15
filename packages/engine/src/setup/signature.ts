// Signature card (ARCHITECTURE.md §12.5; D-010): uniform among the distinct monster cards of the
// player's deck, from the 'signature' stream. Objectives and the twist are chosen outside the engine
// (they need objectives.json and the ISO week, D-102, D-103); newGame only takes the twist index.
import { EngineError } from '../errors';
import type { Sfc32 } from '../rng';
import { stream } from './seed';
import type { CompiledContent, DefIdx } from '../types/content';
import { DefType } from '../types/content';

/** D-010: uniform among the distinct monster cards of `deckList`, drawn from `rng` (the 'signature' stream). Throws when the deck has no monster. */
export function pickSignature(c: CompiledContent, deckList: readonly DefIdx[], rng: Sfc32): DefIdx {
  const distinct: DefIdx[] = [];
  for (const d of deckList) if (c.type[d] === DefType.Monster && !distinct.includes(d)) distinct.push(d);
  if (distinct.length === 0) throw new EngineError('signature: the deck has no monster');
  return distinct[rng.int(distinct.length)] as DefIdx;
}

/** The signature card newGame picks for `seed` (the full seed string, rerolls included): `pickSignature` on the seed's 'signature' stream (D-010). */
export function signatureForSeed(c: CompiledContent, deckList: readonly DefIdx[], seed: string): DefIdx {
  return pickSignature(c, deckList, stream(seed, 'signature'));
}
