// Novice bot (D-117): a uniformly random legal action at every decision, pending Graft steps included. The randomness is
// the engine's seeded generator, keyed by the caller's string, so the same seed gives the same choices.
import { Sfc32 } from '@vault-duel/engine';
import type { Bot } from './player-view';

/** `seed` names the stream, e.g. `${duelSeed}/novice/${runIndex}`. */
export function createNovice(seed: string): Bot {
  const rng = Sfc32.from(seed);
  return (ctx) => rng.int(ctx.legal.length);
}
