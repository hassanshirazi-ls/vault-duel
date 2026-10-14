import { beforeEach, describe, expect, it } from 'vitest';
import { GC, GENV, graftEnv } from '../test-utils/graft-fixture';
import { withGlobals } from '../test-utils/globals';
import { SPY } from '../test-utils/pipeline-fixture';
import { allCards, harness } from '../test-utils/run';
import { StateBuilder } from '../test-utils/state';
import { EngineError } from './errors';
import {
  canGraft,
  forEachGraftAction,
  graftAllowed,
  graftBegin,
  graftCancel,
  graftKeywords,
  graftPick,
  graftPosition,
  graftSkipAscend,
  previewGraft,
  subsetsOfSize,
  unstableExpiry,
} from './graft';
import type { Action } from './types/actions';
import type { Globals } from './types/globals';
import type { GameState, Iid } from './types/state';
import { RoundFlag } from './types/state';

beforeEach(() => {
  SPY.length = 0;
});

const kwBit = (id: string): number => 1 << (GC.kwBit[id] as number);
const FAM_HYBRID = GC.index.get('fx-family-hybrid') as number;
const FAM_BB = GC.index.get('fx-family-bb') as number;
const FAM_SS = GC.index.get('fx-family-ss') as number;
const ELEM = (id: string): number => GC.elementIds.indexOf(id);

function actions(s: GameState, env = GENV): Action[] {
  const out: Action[] = [];
  forEachGraftAction(s, env, (a) => {
    out.push(a);
    return false;
  });
  return out;
}

/** Player turn 2, hand = given cards (in order). */
function handOf(...ids: string[]): { s: GameState; c: Iid[]; b: StateBuilder } {
  const b = new StateBuilder(GC).turn(2);
  const c = ids.map((id) => b.card(id, 0));
  return { s: b.hand(0, ...c).build(), c, b };
}

describe('graft stages (§5.6, §6.2, D-064)', () => {
  it('graftBegin opens mat1; picks advance to mat2 and then to position (no third material, no keyword choice)', () => {
    const { s, c } = handOf('fx-ember-whelp', 'fx-tide-sprite');
    const h = harness(s, GENV);
    graftBegin(h.run);
    expect(h.tx.state.pending).toEqual({ kind: 'graft', stage: 'mat1', mats: [], kw: 0 });
    graftPick(h.run, c[0] as Iid);
    expect(h.tx.state.pending).toEqual({ kind: 'graft', stage: 'mat2', mats: [c[0]], kw: 0 });
    graftPick(h.run, c[1] as Iid);
    expect(h.tx.state.pending).toEqual({ kind: 'graft', stage: 'position', mats: c, kw: 0 });
    expect(h.events).toEqual([
      { e: 'GraftStarted' },
      { e: 'GraftStep', stage: 'mat2', mats: [c[0]] },
      { e: 'GraftStep', stage: 'position', mats: c },
    ]);
  });

  it('legal actions per stage: mat1 = eligible monsters, mat2 = valid partners, position = both, always cancel', () => {
    const b = new StateBuilder(GC).turn(2);
    const whelp = b.card('fx-ember-whelp', 0);
    const sprite = b.card('fx-tide-sprite', 0);
    const boardBeast = b.card('fx-umbra-beast', 0);
    const spell = b.card('fx-bolt', 0);
    const chim = b.card('fx-family-hybrid', 0, { element: 0, kw: 0, ascended: false, materials: [], grafted: 0 });
    const s = b.hand(0, whelp, spell, sprite).place(0, 0, boardBeast).place(0, 1, chim).build();
    expect(graftAllowed(s, GENV, 0)).toBe(true);
    const h = harness(s, GENV);
    graftBegin(h.run);
    expect(actions(h.tx.state)).toEqual([
      { t: 'graftPick', m: whelp }, { t: 'graftPick', m: sprite }, { t: 'graftPick', m: boardBeast }, { t: 'graftCancel' },
    ]);
    graftPick(h.run, sprite);
    expect(actions(h.tx.state)).toEqual([
      { t: 'graftPick', m: whelp }, { t: 'graftPick', m: boardBeast }, { t: 'graftCancel' },
    ]);
    graftSkipAscendOrPick(h, whelp);
  });

  function graftSkipAscendOrPick(h: ReturnType<typeof harness>, m: Iid): void {
    graftPick(h.run, m);
    const st = h.tx.state;
    expect(st.pending?.stage).toBe('ascend'); // the board beast is a valid third material
    expect(actions(st)).toEqual([{ t: 'graftPick', m: 2 }, { t: 'graftSkipAscend' }, { t: 'graftCancel' }]);
    graftSkipAscend(h.run);
    expect(actions(h.tx.state)).toEqual([
      { t: 'graftPosition', pos: 0 }, { t: 'graftPosition', pos: 1 }, { t: 'graftCancel' },
    ]);
  }

  it('Chimeras and spells are never materials (D-056); a pair needs a recipe', () => {
    const b = new StateBuilder(GC).turn(2);
    const a = b.card('fx-ember-whelp', 0);
    const chim = b.card('fx-family-hybrid', 0, { element: 0, kw: 0, ascended: false, materials: [], grafted: 0 });
    const s = b.hand(0, a).place(0, 0, chim).build();
    expect(graftAllowed(s, GENV, 0)).toBe(false); // one eligible monster only
  });

  it('slot feasibility (D-057): with a full board, two hand materials are infeasible; a board material makes it feasible', () => {
    const b = new StateBuilder(GC).turn(2);
    const h1 = b.card('fx-ember-whelp', 0);
    const h2 = b.card('fx-tide-sprite', 0);
    const full = [0, 1, 2].map(() => b.card('fx-family-hybrid', 0, { element: 0, kw: 0, ascended: false, materials: [], grafted: 0 }));
    let bb = b.hand(0, h1, h2);
    full.forEach((iid, i) => (bb = bb.place(0, i, iid)));
    expect(graftAllowed(bb.build(), GENV, 0)).toBe(false);

    const b2 = new StateBuilder(GC).turn(2);
    const x = b2.card('fx-ember-whelp', 0);
    const y = b2.card('fx-tide-sprite', 0);
    const z1 = b2.card('fx-family-hybrid', 0, { element: 0, kw: 0, ascended: false, materials: [], grafted: 0 });
    const z2 = b2.card('fx-family-hybrid', 0, { element: 0, kw: 0, ascended: false, materials: [], grafted: 0 });
    const s2 = b2.hand(0, x).place(0, 0, y).place(0, 1, z1).place(0, 2, z2).build();
    expect(graftAllowed(s2, GENV, 0)).toBe(true);
    const h = harness(s2, GENV);
    graftBegin(h.run);
    expect(actions(h.tx.state)).toEqual([{ t: 'graftPick', m: x }, { t: 'graftPick', m: y }, { t: 'graftCancel' }]);
  });

  it("the Collector cannot graft when collector.json says canGraft is false (D-026)", () => {
    const off = { ...GC, collector: { ...GC.collector, canGraft: false } };
    const env = graftEnv(undefined, off);
    const b = new StateBuilder(GC).turn(3);
    const s = b.hand(1, b.card('fx-relic-slow', 1), b.card('fx-relic-vain', 1)).build();
    expect(canGraft(env, 1)).toBe(false);
    expect(graftAllowed(s, env, 1)).toBe(false);
    expect(graftAllowed(s, GENV, 1)).toBe(true);
  });

  it('wrong-stage calls throw EngineError', () => {
    const { s } = handOf('fx-ember-whelp', 'fx-tide-sprite');
    const h = harness(s, GENV);
    expect(() => graftPick(h.run, 0)).toThrow(EngineError);
    graftBegin(h.run);
    expect(() => graftPosition(h.run, 0)).toThrow(EngineError);
    expect(() => graftKeywords(h.run, 0)).toThrow(EngineError);
    expect(() => graftSkipAscend(h.run)).toThrow(EngineError);
  });
});

describe('graft commit (§5.6)', () => {
  it('family from the kind pair, element from the FIRST material, hand + board materials sacrificed to the owner discard', () => {
    const b = new StateBuilder(GC).turn(2);
    const sprite = b.card('fx-tide-sprite', 0); // hand, tide spirit
    const whelp = b.card('fx-ember-whelp', 0); // board slot 1, ember beast
    const keep = b.card('fx-umbra-beast', 0); // board slot 0 stays
    const s = b.hand(0, sprite).place(0, 0, keep).place(0, 1, whelp).build();
    const h = harness(s, GENV);
    graftBegin(h.run);
    graftPick(h.run, whelp);
    graftPick(h.run, sprite);
    // ember+tide: third umbra-beast is a candidate on the board; skip Ascend
    graftSkipAscend(h.run);
    const slot = graftPosition(h.run, 1);
    const n = h.done();
    const chim = n.inst.length - 1;
    expect(slot).toBe(1); // the freed slot is the leftmost free one
    expect(n.inst[chim]).toEqual({
      def: FAM_HYBRID, owner: 0,
      chimera: { element: ELEM('fx-ember'), kw: 0, ascended: false, materials: [whelp, sprite], grafted: 2 },
    });
    expect(n.sides[0].board[1]).toMatchObject({ iid: chim, pos: 1, faceDown: false, entered: 2, unstableUntil: 4 });
    expect(n.sides[0].board[0]?.iid).toBe(keep);
    expect(n.sides[0].hand).toEqual([]);
    expect(n.sides[0].discard).toEqual([whelp, sprite]);
    expect(n.pending).toBeNull();
    expect(n.played).toBe(true);
    expect(n.step).toBe('attack');
    expect(n.track.grafts).toBe(1);
    expect(n.track.families).toEqual([FAM_HYBRID]);
    expect((n.track.round[1] ?? 0) & RoundFlag.Grafted).toBe(RoundFlag.Grafted);
    expect(h.events.map((e) => e.e)).toEqual(['GraftStarted', 'GraftStep', 'GraftStep', 'GraftStep', 'Sacrificed', 'Sacrificed', 'Grafted']);
    expect(h.events.at(-1)).toEqual({
      e: 'Grafted', side: 0, iid: chim, family: FAM_HYBRID, element: ELEM('fx-ember'), materials: [whelp, sprite],
      kw: 0, ascended: false, unstable: true, slot: 1, pos: 1,
    });
    expect(h.events.filter((e) => e.e === 'Sacrificed')).toEqual([
      { e: 'Sacrificed', iid: whelp, reason: 'graft', from: 'board' },
      { e: 'Sacrificed', iid: sprite, reason: 'graft', from: 'hand' },
    ]);
  });

  it('order matters: swapping the materials swaps the element', () => {
    const run = (first: 'fx-ember-whelp' | 'fx-lumen-seer'): number => {
      const { s, c } = handOf('fx-ember-whelp', 'fx-lumen-seer');
      const h = harness(s, GENV);
      graftBegin(h.run);
      graftPick(h.run, first === 'fx-ember-whelp' ? (c[0] as Iid) : (c[1] as Iid));
      graftPick(h.run, first === 'fx-ember-whelp' ? (c[1] as Iid) : (c[0] as Iid));
      graftPosition(h.run, 0);
      const n = h.done();
      return n.inst[n.inst.length - 1]?.chimera?.element ?? -1;
    };
    expect(run('fx-ember-whelp')).toBe(ELEM('fx-ember'));
    expect(run('fx-lumen-seer')).toBe(ELEM('fx-lumen'));
  });

  it('same-kind recipes work: beast+beast and spirit+spirit', () => {
    const bb = handOf('fx-ember-whelp', 'fx-umbra-beast');
    const h = harness(bb.s, GENV);
    graftBegin(h.run);
    graftPick(h.run, 0);
    graftPick(h.run, 1);
    graftPosition(h.run, 0);
    expect(h.done().inst.at(-1)?.def).toBe(FAM_BB);
    const ss = handOf('fx-tide-sprite', 'fx-lumen-seer');
    const h2 = harness(ss.s, GENV);
    graftBegin(h2.run);
    graftPick(h2.run, 0);
    graftPick(h2.run, 1);
    graftPosition(h2.run, 0);
    expect(h2.done().inst.at(-1)?.def).toBe(FAM_SS);
  });

  it('Unstable: any opposing pair (D-061), expiry turn + UNSTABLE_EXPIRY_TURNS, gated by FLAGS.UNSTABLE', () => {
    const go = (env: typeof GENV, a: string, bId: string) => {
      const { s } = handOf(a, bId);
      const h = harness(s, env);
      graftBegin(h.run);
      graftPick(h.run, 0);
      graftPick(h.run, 1);
      graftPosition(h.run, 0);
      return h.done();
    };
    // umbra + lumen oppose (both ways); ember + lumen do not
    expect(go(GENV, 'fx-umbra-beast', 'fx-lumen-seer').sides[0].board[0]?.unstableUntil).toBe(4);
    expect(go(GENV, 'fx-ember-whelp', 'fx-lumen-seer').sides[0].board[0]?.unstableUntil).toBe(-1);
    const off = graftEnv(withGlobals({ FLAGS: { UNSTABLE: false } }));
    expect(go(off, 'fx-umbra-beast', 'fx-lumen-seer').sides[0].board[0]?.unstableUntil).toBe(-1);
    const slow = graftEnv(withGlobals({ UNSTABLE_EXPIRY_TURNS: 4 }));
    expect(go(slow, 'fx-umbra-beast', 'fx-lumen-seer').sides[0].board[0]?.unstableUntil).toBe(6);
  });

  it('UNSTABLE_EXPIRY picks the expiry turn, in the commit and in the preview (D-183)', () => {
    // grafted on turn 2; UNSTABLE_EXPIRY_TURNS 2 and DURATION_NEXT_OWN_TURN 2 (TEST_GLOBALS)
    const go = (g: Globals) => {
      const env = graftEnv(g);
      const { s, c } = handOf('fx-umbra-beast', 'fx-lumen-seer');
      const h = harness(s, env);
      graftBegin(h.run);
      graftPick(h.run, c[0] as Iid);
      graftPick(h.run, c[1] as Iid);
      const preview = previewGraft(h.tx.state, env)?.unstableUntil;
      graftPosition(h.run, 0);
      return { preview, committed: h.done().sides[0].board[0]?.unstableUntil };
    };
    expect(go(withGlobals({ UNSTABLE_EXPIRY: 'endOfNextOwnTurn' }))).toEqual({ preview: 4, committed: 4 });
    expect(go(withGlobals({ UNSTABLE_EXPIRY: 'startOfOwnTurnAfterNext' }))).toEqual({ preview: 5, committed: 5 });
    expect(go(withGlobals({ UNSTABLE_EXPIRY: 'startOfOwnTurnAfterNext', DURATION_NEXT_OWN_TURN: 4 }))).toEqual({ preview: 7, committed: 7 });
  });
  it('unstableExpiry: end of the next own turn, or through the turn before the start of the turn after next (D-136, D-183)', () => {
    expect(unstableExpiry(2, withGlobals({ UNSTABLE_EXPIRY: 'endOfNextOwnTurn', UNSTABLE_EXPIRY_TURNS: 3 }))).toBe(5);
    expect(unstableExpiry(2, withGlobals({ UNSTABLE_EXPIRY: 'startOfOwnTurnAfterNext' }))).toBe(5);
    expect(unstableExpiry(3, withGlobals({ UNSTABLE_EXPIRY: 'startOfOwnTurnAfterNext' }))).toBe(6);
  });

  it('a Chimera enters like a summon: entered = turn, no onSummon; onGraft dispatches once after it entered', () => {
    const b = new StateBuilder(GC).turn(2);
    const x = b.card('fx-gspy-card', 0);
    const y = b.card('fx-tide-sprite', 0);
    const spy = b.card('fx-gspy-card', 0);
    const s = b.hand(0, x, y).place(0, 2, spy).build();
    const h = harness(s, GENV);
    graftBegin(h.run);
    graftPick(h.run, x);
    graftPick(h.run, y);
    graftSkipAscend(h.run);
    graftPosition(h.run, 0);
    const n = h.done();
    const chim = n.inst.length - 1;
    // the Chimera inherited fx-gspy from its material, so it hears its own Graft first (slot 0), then the bystander (slot 2)
    expect(SPY).toEqual([`onGraft:${chim}@${chim}`, `onGraft:${chim}@${spy}`]);
    expect(n.sides[0].board[0]).toMatchObject({ iid: chim, entered: 2 });
  });

  it('keywords of the materials are inherited into ChimeraInfo.kw (Swift here)', () => {
    const { s } = handOf('fx-swift-scout', 'fx-tide-sprite');
    const h = harness(s, GENV);
    graftBegin(h.run);
    graftPick(h.run, 0);
    graftPick(h.run, 1);
    graftPosition(h.run, 0);
    const n = h.done();
    expect(n.inst.at(-1)?.chimera?.kw).toBe(kwBit('fx-swift'));
  });

  it('cancel restores the pre-Graft state exactly at every stage (D-064)', () => {
    const { s, c } = handOf('fx-ember-whelp', 'fx-tide-sprite', 'fx-umbra-beast');
    for (const picks of [[], [c[0]], [c[0], c[1]]] as Iid[][]) {
      const h = harness(s, GENV);
      graftBegin(h.run);
      for (const m of picks) graftPick(h.run, m);
      graftCancel(h.run);
      const n = h.done();
      expect(n).toEqual(s);
      expect(h.events.at(-1)).toEqual({ e: 'GraftCancelled' });
    }
  });

  it('conservation: every card stays in exactly one place across a commit (plus the new Chimera)', () => {
    const { s } = handOf('fx-ember-whelp', 'fx-tide-sprite', 'fx-umbra-beast');
    const before = allCards(s);
    const h = harness(s, GENV);
    graftBegin(h.run);
    graftPick(h.run, 0);
    graftPick(h.run, 1);
    graftSkipAscend(h.run);
    graftPosition(h.run, 0);
    expect(allCards(h.done())).toEqual([...before, before.length]);
  });
});

describe('Ascend and keywords (D-059, D-060)', () => {
  it('a third material ascends: 3 materials, ascended, same family and element', () => {
    const { s, c } = handOf('fx-ember-whelp', 'fx-tide-sprite', 'fx-umbra-beast');
    const h = harness(s, GENV);
    graftBegin(h.run);
    graftPick(h.run, c[0] as Iid);
    graftPick(h.run, c[1] as Iid);
    expect(h.tx.state.pending?.stage).toBe('ascend');
    graftPick(h.run, c[2] as Iid);
    expect(h.tx.state.pending?.stage).toBe('position');
    graftPosition(h.run, 0);
    const n = h.done();
    const ch = n.inst.at(-1);
    expect(ch).toMatchObject({ def: FAM_HYBRID, chimera: { ascended: true, element: ELEM('fx-ember'), materials: c } });
    expect(n.sides[0].discard).toEqual(c);
    // preview-equivalent stats: 7 + ASCEND_POWER
  });

  it('FLAGS.ASCEND off skips the ascend stage; MAX_GRAFT_MATERIALS caps it', () => {
    const { s, c } = handOf('fx-ember-whelp', 'fx-tide-sprite', 'fx-umbra-beast');
    for (const env of [graftEnv(withGlobals({ FLAGS: { ASCEND: false } })), graftEnv(withGlobals({ MAX_GRAFT_MATERIALS: 2 }))]) {
      const h = harness(s, env);
      graftBegin(h.run);
      graftPick(h.run, c[0] as Iid);
      graftPick(h.run, c[1] as Iid);
      expect(h.tx.state.pending?.stage).toBe('position');
    }
  });

  it('ascend is skipped when no third material would leave a free slot', () => {
    const b = new StateBuilder(GC).turn(2);
    const x = b.card('fx-ember-whelp', 0);
    const y = b.card('fx-tide-sprite', 0);
    const z = b.card('fx-umbra-beast', 0);
    const fill = [0, 1, 2].map(() => b.card('fx-family-hybrid', 0, { element: 0, kw: 0, ascended: false, materials: [], grafted: 0 }));
    const s = b.hand(0, x, y, z).place(0, 0, fill[0] as Iid).place(0, 1, fill[1] as Iid).place(0, 2, fill[2] as Iid).build();
    expect(graftAllowed(s, GENV, 0)).toBe(false);
  });

  it('keywords: <= MAX_INHERITED are inherited automatically (union of distinct keywords)', () => {
    const { s, c } = handOf('fx-pierce-fang', 'fx-pierce-fang');
    const h = harness(s, GENV);
    graftBegin(h.run);
    graftPick(h.run, c[0] as Iid);
    graftPick(h.run, c[1] as Iid);
    expect(h.tx.state.pending).toMatchObject({ stage: 'position', kw: kwBit('fx-pierce') });
  });

  it('more than MAX_INHERITED available: a keywords stage lists every 2-subset, and the pick is used', () => {
    const { s, c } = handOf('fx-multi-kw', 'fx-warded-ox', 'fx-swift-scout');
    // multi-kw (pierce, haunt) + warded-ox (ward): beast + beast, 3 keywords -> choose; swift-scout is the ascend option
    const h = harness(s, GENV);
    graftBegin(h.run);
    graftPick(h.run, c[0] as Iid);
    graftPick(h.run, c[1] as Iid);
    graftSkipAscend(h.run);
    expect(h.tx.state.pending?.stage).toBe('keywords');
    const opts = actions(h.tx.state);
    expect(opts.slice(0, -1)).toHaveLength(3);
    expect(opts.at(-1)).toEqual({ t: 'graftCancel' });
    const chosen = opts[0];
    expect(chosen?.t).toBe('graftKeywords');
    if (chosen?.t !== 'graftKeywords') return;
    // lexicographic bit order: the first option holds the two lowest bits
    const order = ['fx-haunt', 'fx-pierce', 'fx-ward'].map((id) => GC.kwBit[id] as number).sort((x, y) => x - y);
    expect(chosen.kw).toBe(((1 << (order[0] as number)) | (1 << (order[1] as number))) >>> 0);
    graftKeywords(h.run, chosen.kw);
    expect(h.tx.state.pending).toMatchObject({ stage: 'position', kw: chosen.kw });
    graftPosition(h.run, 0);
    expect(h.done().inst.at(-1)?.chimera?.kw).toBe(chosen.kw);
  });

  it('the Ascend material contributes its keyword to the union (D-059)', () => {
    const { s, c } = handOf('fx-pierce-fang', 'fx-tide-sprite', 'fx-warded-ox');
    const h = harness(s, GENV);
    graftBegin(h.run);
    graftPick(h.run, c[0] as Iid);
    graftPick(h.run, c[1] as Iid);
    graftPick(h.run, c[2] as Iid);
    expect(h.tx.state.pending).toMatchObject({ stage: 'position', kw: kwBit('fx-pierce') | kwBit('fx-ward') });
  });

  it('only keywords are inherited, never Flaws (D-181)', () => {
    const { s, c } = handOf('fx-relic-slow', 'fx-tide-sprite'); // a Flaw plus a keyword-less monster
    const h = harness(s, GENV);
    graftBegin(h.run);
    graftPick(h.run, c[0] as Iid);
    graftPick(h.run, c[1] as Iid);
    expect(h.tx.state.pending).toMatchObject({ stage: 'position', kw: 0 });
  });

  it('every material gives its printed keywords: a face-down Sentinel and a Ward-used board material pass them on (D-182 B)', () => {
    const b = new StateBuilder(GC).turn(2);
    const wall = b.card('fx-sentinel-wall', 0); // face-down on the board: no active keyword
    const ox = b.card('fx-warded-ox', 0); // Ward used
    const sprite = b.card('fx-tide-sprite', 0);
    const s = b.hand(0, sprite).place(0, 0, wall, { faceDown: true, pos: 1 }).place(0, 1, ox, { wardUsed: true }).build();
    const down = harness(s, GENV);
    graftBegin(down.run);
    graftPick(down.run, wall);
    graftPick(down.run, sprite);
    graftSkipAscend(down.run);
    expect(down.tx.state.pending).toMatchObject({ stage: 'position', kw: kwBit('fx-sentinel') });
    expect(previewGraft(down.tx.state, GENV)).toMatchObject({ keywordsAvailable: kwBit('fx-sentinel'), kw: kwBit('fx-sentinel') });
    graftPosition(down.run, 0);
    expect(down.done().inst.at(-1)?.chimera?.kw).toBe(kwBit('fx-sentinel'));

    const used = harness(s, GENV);
    graftBegin(used.run);
    graftPick(used.run, ox);
    graftPick(used.run, sprite);
    graftSkipAscend(used.run);
    expect(used.tx.state.pending).toMatchObject({ stage: 'position', kw: kwBit('fx-ward') });
  });

  it('subsetsOfSize lists n-subsets in lexicographic bit order', () => {
    expect(subsetsOfSize(0b1011, 2)).toEqual([0b0011, 0b1001, 0b1010]);
    expect(subsetsOfSize(0b1011, 3)).toEqual([0b1011]);
    expect(subsetsOfSize(0b11, 3)).toEqual([]);
  });
});

describe('previewGraft (§5.6)', () => {
  it('null without a pending Graft or before two materials are chosen', () => {
    const { s, c } = handOf('fx-ember-whelp', 'fx-tide-sprite');
    expect(previewGraft(s, GENV)).toBeNull();
    const h = harness(s, GENV);
    graftBegin(h.run);
    graftPick(h.run, c[0] as Iid);
    expect(previewGraft(h.tx.state, GENV)).toBeNull();
  });

  it('family, element, stats incl. Unstable and Ascend, expiry and keyword options', () => {
    const { s, c } = handOf('fx-umbra-beast', 'fx-lumen-seer', 'fx-pierce-fang');
    const h = harness(s, GENV);
    graftBegin(h.run);
    graftPick(h.run, c[0] as Iid);
    graftPick(h.run, c[1] as Iid);
    expect(previewGraft(h.tx.state, GENV)).toEqual({
      family: FAM_HYBRID, element: ELEM('fx-umbra'), power: 7 + 3, guard: 5, ascended: false, unstable: true, unstableUntil: 4,
      keywordsAvailable: 0, keywordOptions: [], kw: 0, slot: 0,
    });
    graftPick(h.run, c[2] as Iid);
    const p = previewGraft(h.tx.state, GENV);
    expect(p).toMatchObject({ ascended: true, power: 7 + 2 + 3, guard: 5 + 1, kw: kwBit('fx-pierce') });
  });

  it('slot is the leftmost free slot after the board materials leave', () => {
    const b = new StateBuilder(GC).turn(2);
    const f1 = b.card('fx-family-hybrid', 0, { element: 0, kw: 0, ascended: false, materials: [], grafted: 0 });
    const x = b.card('fx-ember-whelp', 0);
    const y = b.card('fx-tide-sprite', 0);
    const s = b.hand(0, y).place(0, 0, f1).place(0, 1, x).build();
    const h = harness(s, GENV);
    graftBegin(h.run);
    graftPick(h.run, x);
    graftPick(h.run, y);
    expect(previewGraft(h.tx.state, GENV)?.slot).toBe(1);
  });
});
