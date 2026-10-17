// Default equivalence (D-310, D-315): with FLAGS.SPLIT, FLAGS.SYMBIOSIS and FLAGS.BOND_ACTION off the engine is the engine
// as it was before the bond rules: the same legal actions, events and outcomes in whole duels, and no bond data in any state.
// The digests below were produced by that earlier engine (see test-utils/equivalence.ts); they pin its behavior, not content.
import { describe, expect, it } from 'vitest';
import { DUEL_GLOBALS, duelEngine } from '../test-utils/duel-fixture';
import { walkDigest } from '../test-utils/equivalence';
import { withGlobals } from '../test-utils/globals';
import type { Globals } from './types/globals';
import type { Action } from './types/actions';

const base = { DECK_MIN_KINDS: 2, APPRAISAL_MIN_POWER: 5 };
const OFF = { SPLIT: false, SYMBIOSIS: false, BOND_ACTION: false } as const;
const CONFIGS: readonly (readonly [string, Globals, readonly string[]])[] = [
  ['fixture defaults', withGlobals({ ...DUEL_GLOBALS, FLAGS: { ...OFF } }), ["fe5fd9b1915b9363475062af714a09ef", "19bf2a3a485badbe43eed5e127368d27", "61b1247292018faad3e3cdc0464a0dd3", "29aad3dac2f6ffc2bacd06cfe4b1d5a9", "b03b4b0fd18df854e08f80bd21c8ed04", "573e265cfb68bd7ddc41ff4480b09c7", "ffaf9cbf4c443f9e9f7474dde34bb790", "577e7c92f6aaefcd3afbb40a4eb5b36a"]],
  ['monstersOnly + LANES', withGlobals({ ...base, SICKNESS_MODE: 'monstersOnly', FLAGS: { ...OFF, LANES: true } }), ["73ff3ac91451b44e51abba388375bb72", "789f8dd0894d22e9e6cd61fbeed51111", "fa422c2b75b59b945cd3370d9bec4e43", "b03b10d817d03f40dd48af41da02a5e", "cc795c2225e4b5d0928ffc63514813e9", "e7eabbec3ebb9dc050989427800af625", "5c28abec36d3bbb452927d80ffec5595", "c94ddbb8f50f47795fddeb4d27c1b438"]],
  ['4 slots, no Ascend', withGlobals({ ...base, BOARD_SLOTS: 4, FLAGS: { ...OFF, ASCEND: false } }), ["2ae93eee9691395ff7905e316d183c6", "21f8ebae9bd52b92ba2c8bddc388fe5a", "5e50af7e35a796e7907fb2871648eac", "c7f2b483bdedbbfcb7a1f9928929e5b", "ee194128c293801ab4ca8ea29907305", "2c0f5a6df6c7b2c1e08dcd1fee05dd56", "3841147ba2f09c137c29d217bd4c30fe", "5fb931f96e48d39f4b6bb0c58559b703"]],
];

describe.each(CONFIGS)('all three bond switches off: %s', (_name, g, digests) => {
  it('plays the same duels as the engine before the bond rules', () => {
    digests.forEach((want, n) => expect(walkDigest(g, n), `walk ${n}`).toBe(want));
  });

  it('never offers split or symbiose, and keeps the bond fields at their defaults', () => {
    const engine = duelEngine(g);
    for (let n = 0; n < 6; n++) {
      let s = engine.newGame(`equivalence-${n}`).state;
      for (let i = 0; i < 4000 && s.result === null; i++) {
        const legal = engine.getLegalActions(s);
        expect(legal.some((a) => a.t === 'split' || a.t === 'symbiose')).toBe(false);
        expect(s.bond).toBe(0);
        for (const sd of s.sides) for (const m of sd.board) expect(m === null || m.sym === -1).toBe(true);
        s = engine.applyAction(s, legal[(i * 3 + n) % legal.length] as Action).state;
      }
    }
  });

  it('Graft is a play and a play closes it', () => {
    const engine = duelEngine(g);
    for (let n = 0; n < 40; n++) {
      let s = engine.newGame(`equivalence-graft-${n}`).state;
      for (let i = 0; i < 400 && s.result === null; i++) {
        const legal = engine.getLegalActions(s);
        if ((s.turn & 1) === 0 && s.played) expect(legal.some((a) => a.t === 'graftBegin')).toBe(false);
        const graft = legal.find((a) => a.t === 'graftBegin');
        s = engine.applyAction(s, (graft !== undefined && s.pending === null ? graft : legal[(i + n) % legal.length]) as Action).state;
      }
    }
  });
});
