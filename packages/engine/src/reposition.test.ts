import { beforeEach, describe, expect, it } from 'vitest';
import { GC, GENV, graftEnv } from '../test-utils/graft-fixture';
import { withGlobals } from '../test-utils/globals';
import { attackOptions } from './combat';
import { effectivePower } from './stats';
import { SPY } from '../test-utils/pipeline-fixture';
import { harness } from '../test-utils/run';
import { StateBuilder } from '../test-utils/state';
import { EngineError } from './errors';
import { ambushPreview, reposition } from './reposition';

beforeEach(() => {
  SPY.length = 0;
});

describe('reposition (D-014, D-022, D-023, D-024, D-161)', () => {
  it('toggles a face-up monster between attack and guard and records the turn', () => {
    const b = new StateBuilder(GC).turn(4);
    const m = b.card('fx-ember-whelp', 0);
    const h = harness(b.place(0, 0, m, { entered: 2 }).build(), GENV);
    reposition(h.run, m);
    reposition(h.run, m); // the reducer's legality check is what stops a second one
    const n = h.done();
    expect(n.sides[0].board[0]).toMatchObject({ pos: 0, repositioned: 4, faceDown: false });
    expect(h.events).toEqual([{ e: 'Repositioned', iid: m, pos: 1 }, { e: 'Repositioned', iid: m, pos: 0 }]);
  });

  it('a face-down monster becomes face-up attack: Revealed, then Repositioned (D-161)', () => {
    const b = new StateBuilder(GC).turn(4);
    const m = b.card('fx-ember-whelp', 0);
    const h = harness(b.place(0, 0, m, { entered: 0, faceDown: true, pos: 1 }).build(), GENV);
    reposition(h.run, m);
    expect(h.done().sides[0].board[0]).toMatchObject({ pos: 0, faceDown: false, repositioned: 4 });
    expect(h.events).toEqual([{ e: 'Revealed', iid: m, side: 0 }, { e: 'Repositioned', iid: m, pos: 0 }]);
  });

  it('uses no play, leaves step alone and fires no hook; the Collector repositions on his own turn', () => {
    const b = new StateBuilder(GC).turn(3);
    const spy = b.card('fx-spy-card', 1);
    const h = harness(b.place(1, 0, spy, { entered: 1 }).build(), GENV);
    reposition(h.run, spy);
    const n = h.done();
    expect(n.played).toBe(false);
    expect(n.step).toBe('main');
    expect(SPY).toEqual([]);
    expect(n.sides[1].board[0]).toMatchObject({ pos: 1, repositioned: 3 });
  });

  it("throws for a card that is not on the active side's board", () => {
    const b = new StateBuilder(GC).turn(4);
    const mine = b.card('fx-ember-whelp', 0);
    const his = b.card('fx-tide-sprite', 1);
    const h = harness(b.place(0, 0, mine).place(1, 0, his).build(), GENV);
    expect(() => reposition(h.run, his)).toThrow(EngineError);
    expect(() => reposition(h.run, 99)).toThrow(EngineError);
  });
});

describe('Ambush flip (D-338, FLAGS.AMBUSH)', () => {
  const AENV = graftEnv(withGlobals({ AMBUSH_POWER: 3, FLAGS: { AMBUSH: true } }));
  const setup = (over: Parameters<StateBuilder['place']>[3] = {}) => {
    const b = new StateBuilder(GC).turn(4);
    const m = b.card('fx-ember-whelp', 0);
    return { m, s: b.place(0, 0, m, { entered: 0, faceDown: true, pos: 1, ...over }).build() };
  };

  it('flipping face-down to attack adds +AMBUSH_POWER until the end of the turn and emits Ambushed', () => {
    const { m, s } = setup();
    const base = effectivePower(s, AENV, m);
    const h = harness(s, AENV);
    reposition(h.run, m);
    const n = h.done();
    expect(h.events).toEqual([{ e: 'Revealed', iid: m, side: 0 }, { e: 'Repositioned', iid: m, pos: 0 }, { e: 'Ambushed', iid: m, p: 3 }]);
    expect(n.sides[0].board[0]?.timed).toEqual([{ p: 3, g: 0, until: 4 }]);
    expect(effectivePower(n, AENV, m)).toBe(base + 3);
    expect(effectivePower({ ...n, turn: 6 }, AENV, m)).toBe(base); // gone on the next own turn
  });
  it('the preview matches the flip', () => {
    const { m, s } = setup();
    const pv = ambushPreview(s, AENV, m);
    const h = harness(s, AENV);
    reposition(h.run, m);
    expect(pv).toEqual({ p: 3, power: effectivePower(h.done(), AENV, m) });
  });
  it('a ambushed monster may attack that turn', () => {
    const b = new StateBuilder(GC).turn(4);
    const m = b.card('fx-ember-whelp', 0);
    const t = b.card('fx-ember-whelp', 1);
    const env = graftEnv(withGlobals({ AMBUSH_POWER: 3, FLAGS: { AMBUSH: true, LANES: false } }));
    const eng = harness(b.place(0, 0, m, { entered: 0, faceDown: true, pos: 1 }).place(1, 0, t).build(), env);
    reposition(eng.run, m);
    expect(attackOptions(eng.done(), env, m)).toEqual([t]);
  });
  it('is not an Ambush with the flag off, for a face-up toggle, or when null for non-face-down', () => {
    const { m, s } = setup();
    const h = harness(s, GENV);
    reposition(h.run, m);
    expect(h.events.map((e) => e.e)).toEqual(['Revealed', 'Repositioned']);
    expect(h.done().sides[0].board[0]?.timed).toEqual([]);
    expect(ambushPreview(s, GENV, m)).toBeNull();
    const up = setup({ faceDown: false, pos: 1 });
    const h2 = harness(up.s, AENV);
    reposition(h2.run, up.m);
    expect(h2.events.map((e) => e.e)).toEqual(['Repositioned']);
    expect(ambushPreview(up.s, AENV, up.m)).toBeNull();
  });
});
