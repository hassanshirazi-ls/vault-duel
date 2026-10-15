// Turn arithmetic comes from the engine (`activeSide`, `roundOf`); these names are the web app's stable aliases.
import { activeSide, roundOf } from '@vault-duel/engine';
import type { GameState } from '@vault-duel/engine';

export const activeSideOf = activeSide;
export const roundOfState = roundOf;

/** The mulligan belongs to the player even though turn 0 is his anyway. */
export const isPlayerToAct = (s: GameState): boolean => s.step === 'mulligan' || activeSideOf(s) === 0;
