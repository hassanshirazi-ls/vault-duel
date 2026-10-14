// Signature card (ARCHITECTURE.md §12.5; D-010): uniform among the distinct monster cards of the
// player's deck, from the 'signature' stream. Objectives and the twist are chosen outside the engine
// (they need objectives.json and the ISO week, D-102, D-103); newGame only takes the twist index.
import { EngineError } from '../errors';
import type { Sfc32 } from '../rng';
import type { CompiledContent, DefIdx } from '../types/content';
import { DefType } from '../types/content';

export function pickSignature(c: CompiledContent, deckList: readonly DefIdx[], rng: Sfc32): DefIdx {
  const distinct: DefIdx[] = [];
  for (const d of deckList) if (c.type[d] === DefType.Monster && !distinct.includes(d)) distinct.push(d);
  if (distinct.length === 0) throw new EngineError('signature: the deck has no monster');
  return distinct[rng.int(distinct.length)] as DefIdx;
}
