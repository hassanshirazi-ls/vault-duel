import { describe, expect, it } from 'vitest';
import { monsterSlotKeys } from '../src/view/keys';
import { simplePick, started } from './helpers';

// Bug: in the monster row an empty slot was keyed by its index (0, 1, 2) and a monster by its iid. The player's iids
// start at 0, so a monster with iid 1 beside an empty slot 1 gave two children with the key 1. React then reuses or
// drops DOM nodes by key, which showed as extra summoning zones and monsters in the wrong places.
// The pre-flip rules, pinned so the old collision shape stays reachable; the shipped defaults are checked for uniqueness too
const OFF = ['FLAGS.LANES=false', 'FLAGS.SPLIT=false', 'FLAGS.SYMBIOSIS=false', 'FLAGS.BOND_ACTION=false', 'SICKNESS_MODE=classic'];

describe('monster row keys', () => {
  it('are unique in every state of real duels, including states where an iid equals a slot index', async () => {
    let clashing = 0;
    let rows = 0;
    for (const [date, overrides] of [...Array.from({ length: 6 }, (_, i) => [`2026-10-${14 + i}`, OFF] as const), ['2026-10-14', []], ['2026-10-15', []]] as const) {
      const h = await started(date, undefined, overrides);
      for (let i = 0; i < 400 && h.store.getState().state?.result === null; i++) {
        const s = h.store.getState();
        for (const side of [0, 1] as const) {
          const board = s.state?.sides[side].board ?? [];
          const ghosts = new Set(board.flatMap((m, slot) => (m === null && slot % 2 === 0 ? [slot] : [])));
          const keys = monsterSlotKeys(board, ghosts);
          rows++;
          expect(new Set(keys).size, `${date} side ${side} keys ${keys.join(',')}`).toBe(keys.length);
          if (board.some((m, slot) => m !== null && board.some((n, other) => n === null && other === m.iid && slot !== other))) clashing++;
        }
        s.act(simplePick(s.legal));
      }
    }
    expect(rows).toBeGreaterThan(30);
    // the test must actually reach the colliding shape, or it proves nothing
    expect(clashing).toBeGreaterThan(0);
  });
});
