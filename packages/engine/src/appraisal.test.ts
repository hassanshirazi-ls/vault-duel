import { describe, expect, it } from 'vitest';
import { withGlobals } from '../test-utils/globals';
import { PC, pipeEnv } from '../test-utils/pipeline-fixture';
import { harness } from '../test-utils/run';
import { StateBuilder } from '../test-utils/state';
import { appraisal, appraisalTarget } from './appraisal';
import { RoundFlag } from './types/state';

// Fixture powers: umbra-beast 5, lumen-seer 4, ember-whelp 3. APPRAISAL_MIN_POWER is lowered to 4.
const env = pipeEnv(withGlobals({ APPRAISAL_MIN_POWER: 4 }));

function setup(configure: (b: StateBuilder, c: (id: string, owner?: 0 | 1) => number) => void, turn = 5) {
  const b = new StateBuilder(PC).turn(turn);
  configure(b, (id, owner = 0) => b.card(id, owner));
  return b;
}

describe('appraisal (§5.7, D-075 to D-079)', () => {
  it('takes the highest-Power eligible monster to his leftmost free slot, keeping its state (D-077)', () => {
    const b = setup((b, c) => {
      const low = c('fx-lumen-seer');
      const high = c('fx-umbra-beast');
      b.place(0, 0, low).place(0, 1, high, { pos: 1, wardUsed: true, permP: 1, attacked: 3, repositioned: 3, unstableUntil: 7 });
    });
    const h = harness(b.build(), env);
    appraisal(h.run);
    const n = h.done();
    expect(n.sides[0].board[1]).toBeNull();
    expect(n.sides[0].board[0]).not.toBeNull();
    expect(n.sides[1].board[0]).toEqual({
      iid: 1, pos: 1, faceDown: false, entered: 5, repositioned: 3, attacked: 3, wardUsed: true,
      permP: 1, permG: 0, timed: [], unstableUntil: 7, shroudUntil: -1, appraised: true, sym: -1,
    });
    expect(n.appraisal).toEqual({ attempts: 1, successes: 1, taken: [1] });
    expect(n.track.appraisedLost).toBe(1);
    expect((n.track.round[2] ?? 0) & RoundFlag.Appraised).toBe(RoundFlag.Appraised);
    expect(h.events).toEqual([
      { e: 'AppraisalAttempt', round: 3 },
      { e: 'Appraised', iid: 1, fromSlot: 1, to: 'board', toSlot: 0 },
    ]);
  });

  it('compares effective Power (D-076), ties go to the leftmost slot', () => {
    const b = setup((b, c) => {
      const a = c('fx-umbra-beast');
      const bb = c('fx-umbra-beast');
      b.place(0, 0, a).place(0, 1, bb);
    });
    expect(appraisalTarget(harness(b.build(), env).run)).toBe(0);
    const b2 = setup((b, c) => {
      const a = c('fx-umbra-beast');
      const bb = c('fx-lumen-seer');
      b.place(0, 0, a).place(0, 1, bb, { permP: 2 }); // 4 + 2 beats 5
    });
    expect(appraisalTarget(harness(b2.build(), env).run)).toBe(1);
  });

  it('skips face-down, Shrouded (turn < shroudUntil) and under-Power monsters', () => {
    const b = setup((b, c) => {
      b.place(0, 0, c('fx-umbra-beast'), { faceDown: true, pos: 1 });
      b.place(0, 1, c('fx-umbra-beast'), { shroudUntil: 6 });
      b.place(0, 2, c('fx-ember-whelp'));
    });
    const h = harness(b.build(), env);
    appraisal(h.run);
    expect(h.events).toEqual([
      { e: 'AppraisalAttempt', round: 3 },
      { e: 'AppraisalFailed', round: 3, reason: 'noTarget' },
    ]);
    const n = h.done();
    expect(n.appraisal).toEqual({ attempts: 1, successes: 0, taken: [] });
    expect(n.sides[0].board.filter((m) => m !== null)).toHaveLength(3);
    expect(n.track.appraisedLost).toBe(0);
  });

  it('a Shroud that ends this turn no longer protects (shrouded while turn < shroudUntil)', () => {
    const b = setup((b, c) => void b.place(0, 0, c('fx-umbra-beast'), { shroudUntil: 5 }));
    expect(appraisalTarget(harness(b.build(), env).run)).toBe(0);
  });

  it('goes to the vault when his board is full; the vault holds only the iid', () => {
    const b = setup((b, c) => {
      b.place(0, 0, c('fx-umbra-beast'));
      for (let i = 0; i < 3; i++) b.place(1, i, c('fx-relic-slow', 1));
    });
    const h = harness(b.build(), env);
    appraisal(h.run);
    const n = h.done();
    expect(n.sides[1].vault).toEqual([0]);
    expect(n.sides[0].board[0]).toBeNull();
    expect(h.events[1]).toEqual({ e: 'Appraised', iid: 0, fromSlot: 0, to: 'vault', toSlot: -1 });
    expect(n.appraisal.taken).toEqual([0]);
  });

  it('FLAGS.APPRAISED_ENTERS_GUARD (proposal M-03) puts the stolen monster in guard', () => {
    const g = pipeEnv(withGlobals({ APPRAISAL_MIN_POWER: 4, FLAGS: { APPRAISED_ENTERS_GUARD: true } }));
    const b = setup((b, c) => void b.place(0, 0, c('fx-umbra-beast')));
    const h = harness(b.build(), g);
    appraisal(h.run);
    expect(h.done().sides[1].board[0]?.pos).toBe(1);
  });

  it('a second attempt accumulates attempts, successes and taken in order', () => {
    const b = setup((b, c) => {
      b.place(0, 0, c('fx-umbra-beast'));
      b.place(0, 1, c('fx-lumen-seer'));
    });
    const h = harness(b.build(), env);
    appraisal(h.run);
    appraisal(h.run);
    appraisal(h.run);
    expect(h.done().appraisal).toEqual({ attempts: 3, successes: 2, taken: [0, 1] });
  });
});
