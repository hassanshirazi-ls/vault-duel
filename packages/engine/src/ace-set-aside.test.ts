// FLAGS.ACE_SET_ASIDE (M-04, D-184): the ace waits in `aside` and joins his hand on the duel's first Appraisal success.
import { describe, expect, it } from 'vitest';
import { DC, DUEL_GLOBALS } from '../test-utils/duel-fixture';
import { withGlobals } from '../test-utils/globals';
import { PC, pipeEnv } from '../test-utils/pipeline-fixture';
import { harness } from '../test-utils/run';
import { StateBuilder } from '../test-utils/state';
import { appraisal } from './appraisal';
import { createEnv } from './hooks/registry';
import { canonicalState, hashState } from './replay';
import { buildInitialState } from './setup/initial-state';
import { rerollSeed, seedString } from './setup/seed';
import { compileTraps } from './traps';
import { DefType } from './types/content';
import type { GameState, Iid } from './types/state';

const SEED = rerollSeed(seedString(DUEL_GLOBALS, '2026-10-14'), 0);
const onG = { ...DUEL_GLOBALS, FLAGS: { ...DUEL_GLOBALS.FLAGS, ACE_SET_ASIDE: true } };
const setupOn = (seed = SEED) => buildInitialState(createEnv(DC, onG, compileTraps(DC), true), seed).state;
const setupOff = (seed = SEED) => buildInitialState(createEnv(DC, DUEL_GLOBALS, compileTraps(DC), true), seed).state;

describe('setup with FLAGS.ACE_SET_ASIDE on', () => {
  it('puts the ace in aside, shuffles the other 19, and keeps the opening-hand guarantee', () => {
    for (let k = 0; k < 40; k++) {
      const s = setupOn(rerollSeed(SEED, k));
      const col = s.sides[1];
      expect(col.aside).toHaveLength(1);
      expect(s.inst[col.aside[0] as Iid]?.def).toBe(DC.collector.ace);
      expect(col.hand).toHaveLength(5);
      expect(col.deck).toHaveLength(14);
      expect([...col.hand, ...col.deck, ...col.aside].sort((a, b) => a - b)).toEqual(Array.from({ length: 20 }, (_, i) => 24 + i));
      const monsters = col.hand.filter((iid) => DC.type[s.inst[iid]?.def ?? 0] === DefType.Monster).length;
      expect(monsters).toBeGreaterThanOrEqual(DUEL_GLOBALS.OPENING_MIN_MONSTERS);
      expect(s.sides[0].aside).toEqual([]);
    }
  });
});

describe('flag off is byte-identical', () => {
  it('has an empty aside and hashes without it', () => {
    const s = setupOff();
    expect(s.sides[0].aside).toEqual([]);
    expect(s.sides[1].aside).toEqual([]);
    expect(canonicalState(s)).not.toContain('aside');
    // pre-change fixture: this hash was verified equal to the old replay.ts output for the same layout
    expect(hashState(s)).toBe('e9b67b5db5fa3bbd456acb8987f00cc5');
  });
  it('hashes a non-empty aside, distinguishing states', () => {
    const s = setupOn();
    expect(canonicalState(s)).toContain('aside');
    const moved: GameState = { ...s, sides: [s.sides[0], { ...s.sides[1], aside: [] }] };
    expect(hashState(moved)).not.toBe(hashState(s));
  });
});

describe('first Appraisal success', () => {
  const env = pipeEnv(withGlobals({ APPRAISAL_MIN_POWER: 4 }));
  function start() {
    const b = new StateBuilder(PC).turn(5);
    const mon = b.card('fx-umbra-beast', 0);
    const ace = b.card('fx-ace', 1);
    b.place(0, 0, mon);
    const s = b.build();
    return { s: { ...s, sides: [s.sides[0], { ...s.sides[1], aside: [ace] }] as GameState['sides'] }, ace };
  }
  it('moves the ace to his hand right after Appraised, once', () => {
    const { s, ace } = start();
    const h = harness(s, env);
    appraisal(h.run);
    const n = h.done();
    expect(n.sides[1].aside).toEqual([]);
    expect(n.sides[1].hand).toContain(ace);
    expect(h.events.map((e) => e.e)).toEqual(['AppraisalAttempt', 'Appraised', 'CardDrawn']);
    expect(h.events[2]).toEqual({ e: 'CardDrawn', side: 1, iid: ace, byEffect: true });
  });
  it('does not move anything on a second success', () => {
    const { s, ace } = start();
    const h1 = harness(s, env);
    appraisal(h1.run);
    const n1 = h1.done();
    const extra: Iid = n1.inst.length;
    const withAside: GameState = {
      ...n1,
      inst: [...n1.inst, { def: n1.inst[ace]?.def ?? 0, owner: 1, chimera: null }],
      sides: [{ ...n1.sides[0], board: n1.sides[0].board.map((m, i) => (i === 0 ? { ...(n1.sides[1].board[0] as NonNullable<typeof m>), iid: 1, appraised: false } : m)) }, { ...n1.sides[1], aside: [extra] }] as GameState['sides'],
    };
    const h2 = harness(withAside, env);
    appraisal(h2.run);
    const n2 = h2.done();
    expect(n2.appraisal.successes).toBe(2);
    expect(n2.sides[1].aside).toEqual([extra]);
    expect(h2.events.map((e) => e.e)).not.toContain('CardDrawn');
  });
  it('with an empty aside (flag off) the first success draws nothing', () => {
    const { s } = start();
    const h = harness({ ...s, sides: [s.sides[0], { ...s.sides[1], aside: [] }] as GameState['sides'] }, env);
    appraisal(h.run);
    expect(h.events.map((e) => e.e)).toEqual(['AppraisalAttempt', 'Appraised']);
  });
});
