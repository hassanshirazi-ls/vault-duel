import { describe, expect, it } from 'vitest';
import { withGlobals } from '../test-utils/globals';
import { PC, pipeEnv, PENV } from '../test-utils/pipeline-fixture';
import { harness } from '../test-utils/run';
import { StateBuilder } from '../test-utils/state';
import { EngineError } from './errors';
import { makeMonster, NO_TIMED } from './monster';
import { moodOf } from './mood';
import { checkWin, dealDamage, lifeChanged, Run } from './pipeline';
import { emptyTrack, markRound } from './track';
import { Tx } from './tx';
import { RoundFlag } from './types/state';
import type { Refs } from './effects/run';

const NO_REFS: Refs = { chosen: -1, self: -1, attacker: -1, defender: -1, destroyed: -1, destroyer: -1, grafted: -1 };

describe('moodOf (D-080)', () => {
  const g = withGlobals();
  it.each([
    [25, 0], [16, 0], [15, 1], [8, 1], [7, 2], [1, 2], [0, 2], [40, 0],
  ] as const)('life %i -> mood %i', (life, mood) => {
    expect(moodOf(life, g)).toBe(mood);
  });
  it('FLAGS.MOODS = false pins Composed; thresholds are globals', () => {
    expect(moodOf(3, withGlobals({ FLAGS: { MOODS: false } }))).toBe(0);
    expect(moodOf(10, withGlobals({ MOOD_AGITATED_AT: 9 }))).toBe(0);
  });
});

describe('win check and mood after life changes (§5.8, D-018, D-019)', () => {
  it('Collector at 0 -> player wins; the Collector check runs first when both are 0', () => {
    const h = harness(new StateBuilder(PC).life(0, 0).life(1, 0).build(), PENV);
    checkWin(h.run);
    expect(h.done().result).toEqual({ winner: 0, reason: 'collectorDefeated', round: 2 });
  });
  it('player at 0 -> player loses; sets step over and emits GameOver once', () => {
    const h = harness(new StateBuilder(PC).life(0, 0).build(), PENV);
    checkWin(h.run);
    checkWin(h.run);
    expect(h.done()).toMatchObject({ step: 'over', result: { winner: 1, reason: 'playerDefeated' } });
    expect(h.events.filter((e) => e.e === 'GameOver')).toHaveLength(1);
  });
  it('healing can raise the mood again and there is no life cap (D-019)', () => {
    const h = harness(new StateBuilder(PC).life(1, 5).build(), PENV);
    dealDamage(h.run, 1, 1, -1); // 4: desperate
    expect(h.tx.state.collector.mood).toBe(2);
    h.tx.setLife(1, 30);
    lifeChanged(h.run);
    expect(h.tx.state.collector.mood).toBe(0);
    expect(h.events.filter((e) => e.e === 'MoodChanged')).toEqual([
      { e: 'MoodChanged', from: 0, to: 2 },
      { e: 'MoodChanged', from: 2, to: 0 },
    ]);
  });
  it('FLAGS.MOODS = false: no MoodChanged', () => {
    const h = harness(new StateBuilder(PC).life(1, 5).build(), pipeEnv(withGlobals({ FLAGS: { MOODS: false } })));
    dealDamage(h.run, 1, 1, -1);
    expect(h.events.filter((e) => e.e === 'MoodChanged')).toEqual([]);
  });
  it('dealDamage ignores amounts <= 0 and reports the source', () => {
    const h = harness(new StateBuilder(PC).build(), PENV);
    dealDamage(h.run, 0, 0, 3);
    expect(h.tx.dirty).toBe(false);
    dealDamage(h.run, 0, 4, 3);
    expect(h.events).toEqual([{ e: 'Damage', side: 0, amount: 4, source: 3, lifeAfter: 16 }]);
  });
});

describe('Run.flush', () => {
  it('runs queued effects FIFO and drops them once the game is over (§8.3.5)', () => {
    const h = harness(new StateBuilder(PC).life(0, 3).build(), PENV);
    const q = (n: number) => ({ effect: { op: 'damage', who: 'self', n } as const, refs: NO_REFS, source: 0, side: 0 as const });
    h.run.queue(q(5));
    h.run.queue(q(1));
    h.run.flush();
    expect(h.tx.state.sides[0].life).toBe(-2); // the second effect was dropped
    expect(h.tx.state.result?.reason).toBe('playerDefeated');
  });
  it('a runaway chain throws EngineError (MAX_TRIGGER_CHAIN, every mode)', () => {
    const env = pipeEnv(withGlobals({ MAX_TRIGGER_CHAIN: 2 }), false);
    const h = harness(new StateBuilder(PC).build(), env);
    for (let i = 0; i < 3; i++) h.run.queue({ effect: { op: 'heal', who: 'self', n: 1 }, refs: NO_REFS, source: 0, side: 0 });
    expect(() => h.run.flush()).toThrow(EngineError);
  });
  it('events off: nothing is collected and nothing breaks', () => {
    const tx = new Tx(new StateBuilder(PC).build());
    const run = new Run(tx, PENV, null);
    dealDamage(run, 0, 2, -1);
    expect(tx.state.sides[0].life).toBe(18);
  });
});

describe('Track (D-127)', () => {
  it('emptyTrack pre-fills round with MAX_ROUNDS zeros', () => {
    expect(emptyTrack(withGlobals())).toEqual({ round: new Array(12).fill(0), grafts: 0, families: [], unpriced: false, appraisedLost: 0 });
    expect(emptyTrack(withGlobals({ MAX_ROUNDS: 3 })).round).toEqual([0, 0, 0]);
  });
  it('the test StateBuilder uses it', () => {
    expect(new StateBuilder(PC).build().track.round).toHaveLength(12);
  });
  it('markRound ORs a bit into round - 1 and copies only when something changes', () => {
    const s = new StateBuilder(PC).turn(7).build(); // round 4
    const tx = new Tx(s);
    markRound(tx, RoundFlag.Attacked);
    markRound(tx, RoundFlag.Grafted);
    expect(tx.state.track.round[3]).toBe(3);
    const after = tx.state.track.round;
    markRound(tx, RoundFlag.Attacked);
    expect(tx.state.track.round).toBe(after);
    expect(s.track.round[3]).toBe(0);
    expect(new Tx(s).dirty).toBe(false);
  });
});

describe('makeMonster (§18.7)', () => {
  it('fills every field in a fixed order with defaults', () => {
    const m = makeMonster(4, { entered: 3, pos: 1 });
    expect(Object.getOwnPropertyNames(m)).toEqual([
      'iid', 'pos', 'faceDown', 'entered', 'repositioned', 'attacked', 'wardUsed', 'permP', 'permG',
      'timed', 'unstableUntil', 'shroudUntil', 'appraised', 'sym',
    ]);
    expect(m).toMatchObject({ iid: 4, pos: 1, faceDown: false, entered: 3, repositioned: -1, attacked: -1, unstableUntil: -1, shroudUntil: -1 });
    expect(m.timed).toBe(NO_TIMED);
  });
});
