import { describe, expect, it } from 'vitest';
import { GC, GENV, graftEnv } from '../test-utils/graft-fixture';
import { withGlobals } from '../test-utils/globals';
import { StateBuilder } from '../test-utils/state';
import { countLegal, forEachLegal, getLegalActions, isLegal, sameAction } from './legal';
import { graftBegin } from './graft';
import { harness } from '../test-utils/run';
import type { Action } from './types/actions';
import type { GameState } from './types/state';

const legal = (s: GameState, env = GENV): Action[] => getLegalActions(env, s);
const types = (as: readonly Action[]): string[] => as.map((a) => a.t);

describe('step gating (§6.2)', () => {
  it('a finished game has no legal actions', () => {
    const b = new StateBuilder(GC).step('over');
    expect(legal(b.build())).toEqual([]);
    const s = b.build();
    expect(legal({ ...s, step: 'main', result: { winner: 0, reason: 'collectorDefeated', round: 1 } })).toEqual([]);
  });

  it('mulligan: keep, then redraw while a redraw is left and FLAGS.REDRAW is on', () => {
    const s = new StateBuilder(GC).turn(0).step('mulligan').build();
    expect(legal(s)).toEqual([{ t: 'keep' }, { t: 'redraw' }]);
    expect(legal({ ...s, redrawsLeft: 0 })).toEqual([{ t: 'keep' }]);
    expect(legal(s, graftEnv(withGlobals({ FLAGS: { REDRAW: false } })))).toEqual([{ t: 'keep' }]);
  });

  it('after the play (step attack) only attacks and endTurn remain; pending Graft is only graft actions', () => {
    const b = new StateBuilder(GC).turn(4);
    const a = b.card('fx-ember-whelp', 0);
    const hand = b.card('fx-tide-sprite', 0);
    const base = b.place(0, 0, a).hand(0, hand).build();
    expect(types(legal(base))).toEqual(['reposition', 'summon', 'summon', 'summon', 'graftBegin', 'attack', 'endTurn']);
    const played = { ...base, step: 'attack' as const, played: true };
    expect(types(legal(played))).toEqual(['attack', 'endTurn']);

    const g = new StateBuilder(GC).turn(4);
    const x = g.card('fx-ember-whelp', 0);
    const y = g.card('fx-tide-sprite', 0);
    const h = harness(g.hand(0, x, y).build(), GENV);
    graftBegin(h.run);
    expect(types(legal(h.tx.state))).toEqual(['graftPick', 'graftPick', 'graftCancel']);
  });
});

describe('reposition (D-022, D-023, D-014)', () => {
  it('needs entered < turn and not repositioned this turn; a face-down monster has the single flip', () => {
    const b = new StateBuilder(GC).turn(4);
    const old = b.card('fx-ember-whelp', 0);
    const fresh = b.card('fx-tide-sprite', 0);
    const done = b.card('fx-umbra-beast', 0);
    const s = b.place(0, 0, old, { entered: 2 }).place(0, 1, fresh, { entered: 4 }).place(0, 2, done, { entered: 0, repositioned: 4 }).build();
    expect(legal(s).filter((a) => a.t === 'reposition')).toEqual([{ t: 'reposition', m: old }]);
    const down = new StateBuilder(GC).turn(4);
    const d = down.card('fx-ember-whelp', 0);
    expect(legal(down.place(0, 0, d, { entered: 0, faceDown: true, pos: 1 }).build()).filter((a) => a.t === 'reposition')).toEqual([
      { t: 'reposition', m: d },
    ]);
  });
});

describe('summon, Covetous, cast, setTrap, graftBegin (§6.2)', () => {
  it('summon: one action per mode for each hand monster, in hand order; none with a full board', () => {
    const b = new StateBuilder(GC).turn(2);
    const m1 = b.card('fx-ember-whelp', 0);
    const sp = b.card('fx-scry', 0);
    const m2 = b.card('fx-tide-sprite', 0);
    const s = b.hand(0, m1, sp, m2).build();
    expect(legal(s).filter((a) => a.t === 'summon')).toEqual([
      { t: 'summon', c: m1, mode: 'atk' }, { t: 'summon', c: m1, mode: 'grd' }, { t: 'summon', c: m1, mode: 'down' },
      { t: 'summon', c: m2, mode: 'atk' }, { t: 'summon', c: m2, mode: 'grd' }, { t: 'summon', c: m2, mode: 'down' },
    ]);
    const f = new StateBuilder(GC).turn(2);
    const hm = f.card('fx-ember-whelp', 0);
    const cards = [0, 1, 2].map(() => f.card('fx-umbra-beast', 0));
    let bb = f.hand(0, hm);
    cards.forEach((c, i) => (bb = bb.place(0, i, c, { entered: 0 })));
    expect(legal(bb.build()).some((a) => a.t === 'summon')).toBe(false);
  });

  it('a Covetous card is only legal via summonCovetous with an Appraised board/vault sacrifice (D-054)', () => {
    const b = new StateBuilder(GC).turn(3);
    const ace = b.card('fx-ace', 1);
    const stolen = b.card('fx-ember-whelp', 0);
    const vaulted = b.card('fx-tide-sprite', 0);
    const s = b.hand(1, ace).place(1, 0, stolen, { appraised: true, entered: 1 }).vault(1, vaulted).build();
    expect(legal(s).filter((a) => a.t === 'summon' || a.t === 'summonCovetous')).toEqual([
      { t: 'summonCovetous', c: ace, sac: stolen, mode: 'atk' }, { t: 'summonCovetous', c: ace, sac: stolen, mode: 'grd' },
      { t: 'summonCovetous', c: ace, sac: vaulted, mode: 'atk' }, { t: 'summonCovetous', c: ace, sac: vaulted, mode: 'grd' },
    ]);
    const none = new StateBuilder(GC).turn(3);
    const ace2 = none.card('fx-ace', 1);
    expect(legal(none.hand(1, ace2).build()).filter((a) => a.t === 'summon' || a.t === 'summonCovetous')).toEqual([]);
  });

  it('cast: untargeted spells once; targeted spells once per legal target and not at all without one (D-067)', () => {
    const b = new StateBuilder(GC).turn(2);
    const scry = b.card('fx-scry', 0);
    const bolt = b.card('fx-bolt', 0);
    const weak = b.card('fx-relic-slow', 1); // power 5: <= UNMAKE_MAX_POWER
    const strong = b.card('fx-ace', 1); // power 10
    const down = b.card('fx-relic-vain', 1); // face-down: not a legal target
    const s = b.hand(0, scry, bolt).place(1, 0, weak).place(1, 1, strong).place(1, 2, down, { faceDown: true, pos: 1 }).build();
    expect(legal(s).filter((a) => a.t === 'cast')).toEqual([
      { t: 'cast', c: scry, target: -1 }, { t: 'cast', c: bolt, target: weak },
    ]);
    const empty = new StateBuilder(GC).turn(2);
    const b2 = empty.card('fx-bolt', 0);
    expect(legal(empty.hand(0, b2).build()).filter((a) => a.t === 'cast')).toEqual([]);
  });

  it('Grave Recall-like discard targets list the discard in order; FLAGS.CHIMERA_TO_HAND off hides Chimeras (D-140)', () => {
    const b = new StateBuilder(GC).turn(2);
    const recall = b.card('fx-recall', 0);
    const m = b.card('fx-ember-whelp', 0);
    const ch = b.card('fx-family-hybrid', 0, { element: 0, kw: 0, ascended: false, materials: [], grafted: 0 });
    const s = b.hand(0, recall).discard(0, m, ch).build();
    expect(legal(s).filter((a) => a.t === 'cast')).toEqual([
      { t: 'cast', c: recall, target: m }, { t: 'cast', c: recall, target: ch },
    ]);
    expect(legal(s, graftEnv(withGlobals({ FLAGS: { CHIMERA_TO_HAND: false } }))).filter((a) => a.t === 'cast')).toEqual([
      { t: 'cast', c: recall, target: m },
    ]);
  });

  it('setTrap needs a free trap slot', () => {
    const b = new StateBuilder(GC).turn(2);
    const t1 = b.card('fx-snare', 0);
    const t2 = b.card('fx-mirror', 0);
    expect(legal(b.hand(0, t1, t2).build()).filter((a) => a.t === 'setTrap')).toEqual([{ t: 'setTrap', c: t1 }, { t: 'setTrap', c: t2 }]);
    const full = new StateBuilder(GC).turn(2);
    const h = full.card('fx-snare', 0);
    const s1 = full.card('fx-snare', 0);
    const s2 = full.card('fx-snare', 0);
    expect(legal(full.hand(0, h).setTrap(0, 0, s1).setTrap(0, 1, s2).build()).some((a) => a.t === 'setTrap')).toBe(false);
  });

  it('graftBegin comes last of the plays and only when a pair exists', () => {
    const b = new StateBuilder(GC).turn(2);
    const x = b.card('fx-ember-whelp', 0);
    const y = b.card('fx-tide-sprite', 0);
    expect(types(legal(b.hand(0, x, y).build())).at(-2)).toBe('graftBegin'); // then endTurn
    const one = new StateBuilder(GC).turn(2);
    expect(legal(one.hand(0, one.card('fx-ember-whelp', 0)).build()).some((a) => a.t === 'graftBegin')).toBe(false);
  });
});

describe('attack and endTurn (§6.2, D-027, D-038, D-041, D-052)', () => {
  it("the player's round-1 attacks are banned (D-015); round 2 allows them", () => {
    const mk = (turn: number) => {
      const b = new StateBuilder(GC).turn(turn);
      const a = b.card('fx-ember-whelp', 0);
      const d = b.card('fx-relic-slow', 1);
      return b.place(0, 0, a, { entered: 0 }).place(1, 0, d).build();
    };
    expect(legal(mk(0)).some((a) => a.t === 'attack')).toBe(false);
    expect(legal(mk(2)).filter((a) => a.t === 'attack')).toEqual([{ t: 'attack', a: 0, target: 1 }]);
  });

  it('targets are the enemy monsters in slot order, narrowed to face-up Sentinels; direct only on an empty board', () => {
    const b = new StateBuilder(GC).turn(4);
    const a = b.card('fx-ember-whelp', 0);
    const d1 = b.card('fx-relic-slow', 1);
    const wall = b.card('fx-sentinel-wall', 1);
    const s = b.place(0, 0, a, { entered: 0 }).place(1, 0, d1).place(1, 1, wall).build();
    expect(legal(s).filter((x) => x.t === 'attack')).toEqual([{ t: 'attack', a, target: wall }]);
    const hidden = new StateBuilder(GC).turn(4);
    const a2 = hidden.card('fx-ember-whelp', 0);
    const w2 = hidden.card('fx-sentinel-wall', 1);
    const d2 = hidden.card('fx-relic-slow', 1);
    expect(legal(hidden.place(0, 0, a2, { entered: 0 }).place(1, 0, w2, { faceDown: true, pos: 1 }).place(1, 1, d2).build()).filter((x) => x.t === 'attack')).toEqual([
      { t: 'attack', a: a2, target: w2 }, { t: 'attack', a: a2, target: d2 },
    ]);
    const direct = new StateBuilder(GC).turn(4);
    const a3 = direct.card('fx-ember-whelp', 0);
    expect(legal(direct.place(0, 0, a3, { entered: 0 }).build()).filter((x) => x.t === 'attack')).toEqual([{ t: 'attack', a: a3, target: -1 }]);
  });

  it('only attack-position, face-up monsters that have not attacked this turn and did not just enter', () => {
    const b = new StateBuilder(GC).turn(4);
    const guard = b.card('fx-ember-whelp', 0);
    const done = b.card('fx-tide-sprite', 0);
    const fresh = b.card('fx-umbra-beast', 0);
    const d = b.card('fx-relic-slow', 1);
    const s = b.place(0, 0, guard, { pos: 1, entered: 0 }).place(0, 1, done, { attacked: 4, entered: 0 }).place(0, 2, fresh, { entered: 4 }).place(1, 0, d).build();
    expect(legal(s).some((a) => a.t === 'attack')).toBe(false);
  });

  it('Swift: a monster on its summon turn may attack monsters only (D-041)', () => {
    const b = new StateBuilder(GC).turn(4);
    const swift = b.card('fx-swift-scout', 0);
    const d = b.card('fx-relic-slow', 1);
    expect(legal(b.place(0, 0, swift, { entered: 4 }).place(1, 0, d).build()).filter((a) => a.t === 'attack')).toEqual([
      { t: 'attack', a: swift, target: d },
    ]);
    const b2 = new StateBuilder(GC).turn(4);
    const sw2 = b2.card('fx-swift-scout', 0);
    expect(legal(b2.place(0, 0, sw2, { entered: 4 }).build()).filter((a) => a.t === 'attack')).toEqual([]);
  });

  it('Slow: no attack on the summon turn; Vain blocks endTurn while an attack remains (D-052)', () => {
    const b = new StateBuilder(GC).turn(3);
    const vain = b.card('fx-relic-vain', 1);
    const target = b.card('fx-ember-whelp', 0);
    const s = b.place(1, 0, vain, { entered: 1 }).place(0, 0, target, { entered: 0 }).build();
    const acts = legal(s);
    expect(acts.some((a) => a.t === 'attack')).toBe(true);
    expect(acts.some((a) => a.t === 'endTurn')).toBe(false);
    const attacked = new StateBuilder(GC).turn(3);
    const v2 = attacked.card('fx-relic-vain', 1);
    const t2 = attacked.card('fx-ember-whelp', 0);
    expect(legal(attacked.place(1, 0, v2, { entered: 1, attacked: 3 }).place(0, 0, t2).build()).some((a) => a.t === 'endTurn')).toBe(true);
    const slow = new StateBuilder(GC).turn(3);
    const sl = slow.card('fx-relic-slow', 1);
    const t3 = slow.card('fx-ember-whelp', 0);
    expect(legal(slow.place(1, 0, sl, { entered: 3 }).place(0, 0, t3).build()).some((a) => a.t === 'attack')).toBe(false);
  });
});

describe('wrappers agree with the generator (§6.2)', () => {
  const b = new StateBuilder(GC).turn(4);
  const a = b.card('fx-ember-whelp', 0);
  const h = b.card('fx-tide-sprite', 0);
  const sp = b.card('fx-scry', 0);
  const d = b.card('fx-relic-slow', 1);
  const s = b.place(0, 0, a, { entered: 0 }).place(1, 0, d).hand(0, h, sp).build();

  it('countLegal = length; isLegal = membership; forEachLegal stops early', () => {
    const all = legal(s);
    expect(countLegal(GENV, s)).toBe(all.length);
    for (const x of all) expect(isLegal(GENV, s, x)).toBe(true);
    expect(isLegal(GENV, s, { t: 'attack', a, target: 99 })).toBe(false);
    expect(isLegal(GENV, s, { t: 'summon', c: sp, mode: 'atk' })).toBe(false);
    let seen = 0;
    forEachLegal(GENV, s, () => ++seen === 2);
    expect(seen).toBe(2);
  });

  it('sameAction is structural for every action type', () => {
    const samples: Action[] = [
      { t: 'redraw' }, { t: 'keep' }, { t: 'reposition', m: 1 }, { t: 'summon', c: 1, mode: 'atk' },
      { t: 'summonCovetous', c: 1, sac: 2, mode: 'atk' }, { t: 'cast', c: 1, target: 2 }, { t: 'setTrap', c: 1 },
      { t: 'graftBegin' }, { t: 'graftPick', m: 1 }, { t: 'graftSkipAscend' }, { t: 'graftKeywords', kw: 3 },
      { t: 'graftPosition', pos: 0 }, { t: 'graftCancel' }, { t: 'attack', a: 1, target: 2 }, { t: 'endTurn' },
    ];
    for (const x of samples) {
      expect(sameAction(x, { ...x })).toBe(true);
      for (const y of samples) if (y !== x) expect(sameAction(x, y)).toBe(false);
    }
    expect(sameAction({ t: 'summon', c: 1, mode: 'atk' }, { t: 'summon', c: 1, mode: 'grd' })).toBe(false);
    expect(sameAction({ t: 'cast', c: 1, target: 2 }, { t: 'cast', c: 1, target: -1 })).toBe(false);
  });
});
