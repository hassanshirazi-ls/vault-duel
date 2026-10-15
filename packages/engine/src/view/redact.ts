// State redaction (ARCHITECTURE.md §8.7; D-209). Encodes which parts of GameState are hidden from `viewer`.
// A new hidden zone (such as D-184's `aside`) is redacted by the same change that adds it.
import type { GameState, Side, SideState, TrapSlot } from '../types/state';

/**
 * What `viewer` can know: the opponent's hand, deck and trap slots are emptied (slot count kept), and
 * the viewer's own deck is emptied too, because its order is unknown even to him. `log` is null.
 * Everything else is shared by reference. A face-down opponent monster keeps its identity (the board needs it
 * for legality), so look-ahead code must not apply an action that targets one (D-209).
 * Pure; needs no Env.
 */
export function redactState(s: GameState, viewer: Side): GameState {
  const hide = (side: Side): SideState => {
    const sd = s.sides[side];
    const own = side === viewer;
    const traps: readonly (TrapSlot | null)[] = own ? sd.traps : sd.traps.map(() => null);
    return { ...sd, deck: [], hand: own ? sd.hand : [], traps };
  };
  return { ...s, sides: [hide(0), hide(1)], log: null };
}
