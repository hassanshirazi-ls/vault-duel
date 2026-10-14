import { describe, expect, it } from 'vitest';
import { GC, GENV } from '../test-utils/graft-fixture';
import { harness } from '../test-utils/run';
import { StateBuilder } from '../test-utils/state';
import { declareAttack } from './combat';
import { EngineError } from './errors';
import { graftBegin, graftPick, graftPosition } from './graft';
import { compileTraps } from './traps';
import { endTurn } from './turn';
import type { GameEvent } from './types/events';
import type { Iid } from './types/state';

const evs = <K extends GameEvent['e']>(events: readonly GameEvent[], k: K): Extract<GameEvent, { e: K }>[] =>
  events.filter((e): e is Extract<GameEvent, { e: K }> => e.e === k);

/** Player turn 4 (round 3). P0 = attacker (ember-whelp 3/2), C0 = defender (relic-slow 5/5), Collector traps as given. */
function duel(trapIds: string[], opts: { attacker?: string; defender?: string | null } = {}) {
  const b = new StateBuilder(GC).turn(4);
  const a = b.card(opts.attacker ?? 'fx-ember-whelp', 0);
  b.place(0, 0, a);
  let d: Iid = -1;
  if (opts.defender !== null) {
    d = b.card(opts.defender ?? 'fx-relic-slow', 1);
    b.place(1, 0, d);
  }
  const traps = trapIds.map((id, i) => {
    const t = b.card(id, 1);
    b.setTrap(1, i, t);
    return t;
  });
  return { b, a, d, traps };
}

describe('compileTraps', () => {
  it('is null for non-traps and a hook table for each trap', () => {
    const t = compileTraps(GC);
    expect(t).toHaveLength(GC.ids.length);
    expect(t[GC.index.get('fx-ember-whelp') as number]).toBeNull();
    expect(t[GC.index.get('fx-snare') as number]?.onAttackDeclared).toBeTypeOf('function');
    expect(t[GC.index.get('fx-last-rites') as number]?.onDestroyed).toBeTypeOf('function');
    expect(t[GC.index.get('fx-counterfeit') as number]?.onGraft).toBeTypeOf('function');
  });
});

describe('a trap is spent when its subscriber runs (§8.3.3, D-071, D-158)', () => {
  it('Snare: cancels the attack, goes to its owner discard, TrapTriggered before AttackCancelled', () => {
    const { b, a, d, traps } = duel(['fx-snare']);
    const h = harness(b.build(), GENV);
    declareAttack(h.run, a, d);
    const n = h.done();
    expect(n.sides[1].traps).toEqual([null, null]);
    expect(n.sides[1].discard).toEqual(traps);
    expect(h.events.map((e) => e.e)).toEqual(['AttackDeclared', 'TrapTriggered', 'AttackCancelled']);
    expect(h.events[1]).toEqual({ e: 'TrapTriggered', side: 1, iid: traps[0], slot: 0 });
    expect(n.sides[1].board[0]?.iid).toBe(d); // no combat
  });

  it('Snare + Mirror: the leftmost trap cancels, the later trap stays set (D-071, §8.3.4)', () => {
    const { b, a, d, traps } = duel(['fx-snare', 'fx-mirror']);
    const h = harness(b.build(), GENV);
    declareAttack(h.run, a, d);
    const n = h.done();
    expect(n.sides[1].traps.map((t) => t?.iid ?? null)).toEqual([null, traps[1]]);
    expect(evs(h.events, 'TrapTriggered')).toHaveLength(1);
    expect(n.sides[0].board[0]?.permP).toBe(0);
  });

  it('Mirror then Snare: both fire; Mirror applies its penalty, Snare cancels', () => {
    const { b, a, d, traps } = duel(['fx-mirror', 'fx-snare']);
    const h = harness(b.build(), GENV);
    declareAttack(h.run, a, d);
    const n = h.done();
    expect(n.sides[1].traps).toEqual([null, null]);
    expect(n.sides[1].discard).toEqual(traps);
    expect(n.sides[0].board[0]?.permP).toBe(-3);
    expect(h.events.map((e) => e.e)).toEqual([
      'AttackDeclared', 'TrapTriggered', 'TrapTriggered', 'AttackCancelled', 'StatsModified',
    ]);
  });

  it('two identical traps: only the leftmost is used (D-071)', () => {
    const { b, a, d, traps } = duel(['fx-mirror', 'fx-mirror'], { defender: 'fx-relic-slow' });
    const h = harness(b.build(), GENV);
    declareAttack(h.run, a, d);
    const n = h.done();
    expect(n.sides[1].traps.map((t) => t?.iid ?? null)).toEqual([null, traps[1]]);
    expect(evs(h.events, 'StatsModified')).toHaveLength(1); // once, not twice
  });

  it('Mirror lets the attack continue with the reduced Power (D-036)', () => {
    const { b, a, d } = duel(['fx-mirror'], { attacker: 'fx-umbra-beast', defender: 'fx-sentinel-wall' });
    const h = harness(b.build(), GENV);
    declareAttack(h.run, a, d);
    expect(evs(h.events, 'CombatResolved')).toHaveLength(1);
    const cr = evs(h.events, 'CombatResolved')[0];
    expect(cr?.aP).toBe(2); // 5 - 3 from Mirror; umbra has no advantage over tide
  });

  it("traps never fire on their own side's attacks", () => {
    const b = new StateBuilder(GC).turn(5);
    const a = b.card('fx-relic-slow', 1);
    const d = b.card('fx-ember-whelp', 0);
    const t = b.card('fx-snare', 1);
    const s = b.place(1, 0, a, { entered: 1 }).place(0, 0, d).setTrap(1, 0, t).build();
    const h = harness(s, GENV);
    declareAttack(h.run, a, d);
    expect(evs(h.events, 'TrapTriggered')).toEqual([]);
    expect(h.done().sides[1].traps[0]?.iid).toBe(t);
  });

  it('Thornwall: only on a direct attack; cancels it and switches the attacker to guard', () => {
    const direct = duel(['fx-thornwall'], { defender: null });
    const h = harness(direct.b.build(), GENV);
    declareAttack(h.run, direct.a, -1);
    const n = h.done();
    expect(n.sides[0].board[0]?.pos).toBe(1);
    expect(n.sides[1].life).toBe(25);
    expect(n.sides[1].traps[0]).toBeNull();
    expect(h.events.map((e) => e.e)).toEqual(['AttackDeclared', 'TrapTriggered', 'AttackCancelled', 'PositionChanged']);

    const mon = duel(['fx-thornwall']);
    const h2 = harness(mon.b.build(), GENV);
    declareAttack(h2.run, mon.a, mon.d);
    expect(evs(h2.events, 'TrapTriggered')).toEqual([]);
    expect(h2.done().sides[1].traps[0]).not.toBeNull();
  });

  it('Display Case cancels and switches the attacker to guard', () => {
    const { b, a, d } = duel(['fx-display']);
    const h = harness(b.build(), GENV);
    declareAttack(h.run, a, d);
    expect(h.done().sides[0].board[0]?.pos).toBe(1);
  });

  it('TrapDef.when is checked when the trap\'s turn comes (D-071): a weak attacker leaves the trap set', () => {
    const weak = duel(['fx-snare-strong']);
    const h = harness(weak.b.build(), GENV);
    declareAttack(h.run, weak.a, weak.d);
    expect(evs(h.events, 'TrapTriggered')).toEqual([]);
    expect(evs(h.events, 'CombatResolved')).toHaveLength(1);

    const strong = duel(['fx-snare-strong'], { attacker: 'fx-umbra-beast' });
    const h2 = harness(strong.b.build(), GENV);
    declareAttack(h2.run, strong.a, strong.d);
    expect(evs(h2.events, 'TrapTriggered')).toHaveLength(1);
    expect(evs(h2.events, 'AttackCancelled')).toHaveLength(1);
  });
});

describe('allyDestroyed traps (D-048, D-158)', () => {
  /** Player's turn 2 ends with two Unstable monsters of the player due: one destruction batch of two. */
  function unstablePair(trapIds: string[]) {
    const b = new StateBuilder(GC).turn(2);
    const m1 = b.card('fx-ember-whelp', 0);
    const m2 = b.card('fx-ember-whelp', 0);
    const traps = trapIds.map((id, i) => {
      const t = b.card(id, 0);
      b.setTrap(0, i, t);
      return t;
    });
    const deck = [b.card('fx-ember-whelp', 0), b.card('fx-ember-whelp', 0), b.card('fx-ember-whelp', 0)];
    b.place(0, 0, m1, { unstableUntil: 2 }).place(0, 1, m2, { unstableUntil: 2 }).deck(0, ...deck);
    // Collector keeps a full hand and an empty deck so only the player's draws matter.
    return { b, traps, m1, m2 };
  }

  it('Last Rites draws once per destroyed monster, spent at dispatch time so the next monster does not see it', () => {
    const { b, traps } = unstablePair(['fx-last-rites']);
    const h = harness(b.build(), GENV);
    endTurn(h.run);
    const n = h.done();
    expect(evs(h.events, 'CardDrawn').filter((e) => e.side === 0 && e.byEffect)).toHaveLength(1);
    expect(n.sides[0].traps[0]).toBeNull();
    expect(n.sides[0].discard).toContain(traps[0]);
  });

  it('two Last Rites: each destroyed monster uses one (the leftmost for the first, the other for the second)', () => {
    const { b } = unstablePair(['fx-last-rites', 'fx-last-rites']);
    const h = harness(b.build(), GENV);
    endTurn(h.run);
    const n = h.done();
    expect(evs(h.events, 'TrapTriggered')).toHaveLength(2);
    expect(evs(h.events, 'CardDrawn').filter((e) => e.byEffect)).toHaveLength(2);
    expect(n.sides[0].traps).toEqual([null, null]);
  });

  it("Insurance Claim triggers on the Collector's own destroyed monster, not on the player's", () => {
    const b = new StateBuilder(GC).turn(2);
    const mine = b.card('fx-ember-whelp', 0);
    const his = b.card('fx-relic-slow', 1);
    const ins = b.card('fx-insurance', 1);
    const s = b.place(0, 0, mine, { unstableUntil: 2 }).place(1, 0, his, { unstableUntil: 2 }).setTrap(1, 0, ins).build();
    const h = harness(s, GENV);
    endTurn(h.run);
    const n = h.done();
    expect(evs(h.events, 'TrapTriggered')).toHaveLength(1);
    expect(n.sides[1].life).toBe(28);
    expect(evs(h.events, 'LifeGained')).toHaveLength(1);

    // only the player's monster is destroyed: the claim stays set
    const b2 = new StateBuilder(GC).turn(2);
    const m2 = b2.card('fx-ember-whelp', 0);
    const i2 = b2.card('fx-insurance', 1);
    const h2 = harness(b2.place(0, 0, m2, { unstableUntil: 2 }).setTrap(1, 0, i2).build(), GENV);
    endTurn(h2.run);
    expect(evs(h2.events, 'TrapTriggered')).toEqual([]);
  });
});

describe('enemyGraft traps (D-065)', () => {
  it('Counterfeit: the Chimera grafted this turn loses Power (permanent), once, and the trap is spent', () => {
    const b = new StateBuilder(GC).turn(2);
    const x = b.card('fx-ember-whelp', 0);
    const y = b.card('fx-tide-sprite', 0);
    const t = b.card('fx-counterfeit', 1);
    const s = b.hand(0, x, y).setTrap(1, 0, t).build();
    const h = harness(s, GENV);
    graftBegin(h.run);
    graftPick(h.run, x);
    graftPick(h.run, y);
    graftPosition(h.run, 0);
    const n = h.done();
    const chim = n.inst.length - 1;
    expect(n.sides[0].board[0]).toMatchObject({ iid: chim, permP: -3 });
    expect(n.sides[1].traps[0]).toBeNull();
    expect(n.sides[1].discard).toEqual([t]);
    expect(evs(h.events, 'TrapTriggered')).toHaveLength(1);
  });

  it("does not fire on its owner's own Graft", () => {
    const b = new StateBuilder(GC).turn(2);
    const x = b.card('fx-ember-whelp', 0);
    const y = b.card('fx-tide-sprite', 0);
    const t = b.card('fx-counterfeit', 0);
    const s = b.hand(0, x, y).setTrap(0, 0, t).build();
    const h = harness(s, GENV);
    graftBegin(h.run);
    graftPick(h.run, x);
    graftPick(h.run, y);
    graftPosition(h.run, 0);
    expect(evs(h.events, 'TrapTriggered')).toEqual([]);
  });
});

describe('spendTrap guards', () => {
  it('throws EngineError for a card that is not a set trap of that side', () => {
    const { b } = duel([]);
    const h = harness(b.build(), GENV);
    expect(() => h.run.spendTrap(1, 0)).toThrow(EngineError);
  });
});
