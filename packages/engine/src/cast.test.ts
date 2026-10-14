import { describe, expect, it } from 'vitest';
import { GC, GENV } from '../test-utils/graft-fixture';
import { harness } from '../test-utils/run';
import { StateBuilder } from '../test-utils/state';
import { castSpell } from './cast';
import { EngineError } from './errors';
import { effectivePower } from './stats';

describe('castSpell (§5.1, §9.1, D-155)', () => {
  it('Unmake-like: the card goes to its owner discard, the target is destroyed, the play is used', () => {
    const b = new StateBuilder(GC).turn(2);
    const bolt = b.card('fx-bolt', 0);
    const target = b.card('fx-relic-slow', 1);
    const h = harness(b.hand(0, bolt).place(1, 0, target).build(), GENV);
    castSpell(h.run, bolt, target);
    const n = h.done();
    expect(n.sides[0].hand).toEqual([]);
    expect(n.sides[0].discard).toEqual([bolt]);
    expect(n.sides[1].discard).toEqual([target]);
    expect(n.sides[1].board[0]).toBeNull();
    expect(n.played).toBe(true);
    expect(n.step).toBe('attack');
    expect(h.events.map((e) => e.e)).toEqual(['SpellCast', 'Destroyed']);
    expect(h.events[0]).toEqual({ e: 'SpellCast', side: 0, iid: bolt, target });
  });

  it('Bloodlust-like: a timed modifier that stops applying after this turn (D-069)', () => {
    const b = new StateBuilder(GC).turn(2);
    const spell = b.card('fx-bloodlust', 0);
    const m = b.card('fx-ember-whelp', 0);
    const h = harness(b.hand(0, spell).place(0, 0, m).build(), GENV);
    castSpell(h.run, spell, m);
    const n = h.done();
    expect(effectivePower(n, GENV, m)).toBe(6);
    expect(effectivePower({ ...n, turn: 3 }, GENV, m)).toBe(3);
  });

  it('Scrying-like draw ignores the draw cap (D-011); an empty deck emits DrawSkipped', () => {
    const b = new StateBuilder(GC).turn(2);
    const spell = b.card('fx-scry', 0);
    const hand = [0, 1, 2, 3].map(() => b.card('fx-ember-whelp', 0));
    const d1 = b.card('fx-tide-sprite', 0);
    const h = harness(b.hand(0, spell, ...hand).deck(0, d1).build(), GENV);
    castSpell(h.run, spell, -1);
    const n = h.done();
    expect(n.sides[0].hand).toEqual([...hand, d1]);
    expect(h.events.map((e) => e.e)).toEqual(['SpellCast', 'CardDrawn', 'DrawSkipped']);
  });

  it('Siphon-like: damage then heal, with mood and win checks (the Collector at 3 life dies)', () => {
    const b = new StateBuilder(GC).turn(2);
    const spell = b.card('fx-siphon', 0);
    const h = harness(b.hand(0, spell).life(1, 3).build(), GENV);
    castSpell(h.run, spell, -1);
    const n = h.done();
    expect(n.result).toEqual({ winner: 0, reason: 'collectorDefeated', round: 2 });
    expect(n.step).toBe('over');
    expect(h.events.map((e) => e.e)).toEqual(['SpellCast', 'Damage', 'MoodChanged', 'GameOver']);
  });

  it('Grave Recall-like: a discarded monster returns to its owner hand', () => {
    const b = new StateBuilder(GC).turn(2);
    const spell = b.card('fx-recall', 0);
    const dead = b.card('fx-ember-whelp', 0);
    const h = harness(b.hand(0, spell).discard(0, dead).build(), GENV);
    castSpell(h.run, spell, dead);
    const n = h.done();
    expect(n.sides[0].hand).toEqual([dead]);
    expect(n.sides[0].discard).toEqual([spell]);
  });

  it('a target that left the board before resolution fizzles silently', () => {
    const b = new StateBuilder(GC).turn(2);
    const spell = b.card('fx-bolt', 0);
    const h = harness(b.hand(0, spell).build(), GENV);
    castSpell(h.run, spell, 77);
    expect(h.events.map((e) => e.e)).toEqual(['SpellCast']);
  });

  it('throws EngineError for a non-spell or a card not in hand', () => {
    const b = new StateBuilder(GC).turn(2);
    const mon = b.card('fx-ember-whelp', 0);
    const spell = b.card('fx-scry', 0);
    const h = harness(b.hand(0, mon).build(), GENV);
    expect(() => castSpell(h.run, mon, -1)).toThrow(EngineError);
    expect(() => castSpell(h.run, spell, -1)).toThrow(EngineError);
  });
});
