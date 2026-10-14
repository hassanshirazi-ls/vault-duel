import { describe, expect, it } from 'vitest';
import { FX, fxEnv } from '../../test-utils/fixture';
import { StateBuilder } from '../../test-utils/state';
import { QueryContext } from './context';

describe('QueryCtx.ownTurnsSinceEntered (D-183)', () => {
  const at = (turn: number, side: 0 | 1, entered: number): number => {
    const b = new StateBuilder(FX).turn(turn);
    const m = b.card('fx-ember-whelp', side);
    const s = b.place(side, 0, m, { entered }).build();
    return new QueryContext(fxEnv(), s, m, side).ownTurnsSinceEntered(m);
  };
  it('counts the controller\'s own turns started after the entry turn (player: even turns)', () => {
    expect([2, 3, 4, 5, 6, 8].map((t) => at(t, 0, 2))).toEqual([0, 0, 1, 1, 2, 3]);
  });
  it('and the Collector\'s (odd turns)', () => {
    expect([3, 4, 5, 6, 7, 9].map((t) => at(t, 1, 3))).toEqual([0, 0, 1, 1, 2, 3]);
  });
  it('a monster that entered on the opponent\'s turn (taken by Appraisal) counts the controller\'s next turn as 1', () => {
    expect([1, 2, 3, 4].map((t) => at(t, 0, 1))).toEqual([0, 1, 1, 2]);
  });
  it('works with the DSL\'s entered = -1 (older than any turn)', () => {
    expect(at(0, 0, -1)).toBeGreaterThanOrEqual(1);
    expect(at(3, 1, -1)).toBeGreaterThanOrEqual(1);
  });
  it('is -1 for a monster that is not on a board', () => {
    const b = new StateBuilder(FX).turn(2);
    const m = b.card('fx-ember-whelp', 0);
    expect(new QueryContext(fxEnv(), b.hand(0, m).build(), m, 0).ownTurnsSinceEntered(m)).toBe(-1);
  });
});
