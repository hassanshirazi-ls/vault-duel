// Turn arithmetic. MISSING PACKAGE API: the engine keeps `roundOf` and `activeSide` internal (engine/src/stats.ts),
// and the ai difficulty runner repeats the same expressions. They are read here from `state.turn` (player on even
// turns, round = turn >> 1 + 1) in one place only, for display and for choosing who acts. See the W1 report.
import type { GameState, Side } from '@vault-duel/engine';

export const activeSideOf = (s: GameState): Side => (s.turn & 1) as Side;
export const roundOfState = (s: GameState): number => (s.turn >> 1) + 1;

/** The mulligan belongs to the player even though turn 0 is his anyway. */
export const isPlayerToAct = (s: GameState): boolean => s.step === 'mulligan' || activeSideOf(s) === 0;
