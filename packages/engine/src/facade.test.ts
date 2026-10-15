// Engine facade queries and redactState (ARCHITECTURE.md §8.7; D-209) on fixture content (D-168).
import { describe, expect, it } from 'vitest';
import { createEngine } from './engine';
import { EngineError } from './errors';
import { FX, fxKw } from '../test-utils/fixture';
import { TEST_GLOBALS, withGlobals } from '../test-utils/globals';
import { StateBuilder } from '../test-utils/state';
import { hashState } from './replay';
import { redactState } from './view/redact';

const eng = createEngine(FX, TEST_GLOBALS, { intent: () => 'guard' });
const kw = (id: string): number => fxKw(FX, id);
const E = (id: string): number => FX.elementIds.indexOf(id);
const K = (id: string): number => FX.kindIds.indexOf(id);

describe('Engine facade queries (D-209)', () => {
  it('effectivePower / effectiveGuard: board mods, floor, and printed off the board', () => {
    const b = new StateBuilder(FX).turn(4);
    const a = b.card('fx-umbra-beast', 0);
    const off = b.card('fx-ember-whelp', 0);
    const weak = b.card('fx-tide-sprite', 1);
    const s = b.place(0, 0, a, { permP: 2, permG: -1 }).place(1, 0, weak, { permP: -9 }).build();
    expect(eng.effectivePower(s, a)).toBe(7);
    expect(eng.effectiveGuard(s, a)).toBe(2);
    expect(eng.effectivePower(s, weak)).toBe(TEST_GLOBALS.STAT_FLOOR);
    expect(eng.effectivePower(s, off)).toBe(3);
    expect(eng.effectiveGuard(s, off)).toBe(2);
  });
  it('printedKeywords / activeKeywords: face-down, used Ward, off the board', () => {
    const b = new StateBuilder(FX).turn(4);
    const ox = b.card('fx-warded-ox', 0);
    const ox2 = b.card('fx-warded-ox', 0);
    const hid = b.card('fx-sentinel-wall', 1);
    const hand = b.card('fx-pierce-fang', 0);
    const s = b.place(0, 0, ox).place(0, 1, ox2, { wardUsed: true }).place(1, 0, hid, { faceDown: true }).build();
    expect(eng.printedKeywords(s, ox)).toBe(kw('fx-ward'));
    expect(eng.activeKeywords(s, ox)).toBe(kw('fx-ward'));
    expect(eng.printedKeywords(s, ox2)).toBe(kw('fx-ward'));
    expect(eng.activeKeywords(s, ox2)).toBe(0);
    expect(eng.printedKeywords(s, hid)).toBe(kw('fx-sentinel'));
    expect(eng.activeKeywords(s, hid)).toBe(0);
    expect(eng.printedKeywords(s, hand)).toBe(kw('fx-pierce'));
    expect(eng.activeKeywords(s, hand)).toBe(0);
  });
  it('elementOf / kindOf: monsters, Chimeras, spells', () => {
    const b = new StateBuilder(FX);
    const m = b.card('fx-tide-sprite', 0);
    const sp = b.card('fx-spell-bolt', 0);
    const ch = b.card('fx-family-hybrid', 0, { element: E('fx-lumen'), kw: 0, ascended: false, materials: [] });
    const s = b.build();
    expect(eng.elementOf(s, m)).toBe(E('fx-tide'));
    expect(eng.kindOf(s, m)).toBe(K('fx-spirit'));
    expect(eng.elementOf(s, sp)).toBe(-1);
    expect(eng.kindOf(s, sp)).toBe(-1);
    expect(eng.elementOf(s, ch)).toBe(E('fx-lumen'));
    expect(eng.kindOf(s, ch)).toBe(-1);
  });
  it('attackPermission and attackRestriction: Slow restricts, Swift grants, off the board', () => {
    const b = new StateBuilder(FX).turn(3);
    const slow = b.card('fx-relic-slow', 1);
    const swift = b.card('fx-swift-scout', 1);
    const plain = b.card('fx-relic-vain', 1);
    const off = b.card('fx-ember-whelp', 1);
    const s = b
      .place(1, 0, slow, { entered: 3 })
      .place(1, 1, swift, { entered: 3 })
      .place(1, 2, plain, { entered: 1 })
      .build();
    expect(eng.attackPermission(s, slow)).toBe('none');
    expect(eng.attackRestriction(s, slow)).toBe('none');
    expect(eng.attackPermission(s, swift)).toBe('monstersOnly');
    expect(eng.attackRestriction(s, swift)).toBe('any');
    expect(eng.attackPermission(s, plain)).toBe('any');
    expect(eng.attackRestriction(s, plain)).toBe('any');
    expect(eng.attackPermission(s, off)).toBe('none');
    expect(eng.attackRestriction(s, off)).toBe('any');
  });
  it('the round-1 ban is in attackPermission but not in attackRestriction', () => {
    const b = new StateBuilder(FX).turn(0);
    const a = b.card('fx-ember-whelp', 0);
    const s = b.place(0, 0, a, { entered: 0 }).build();
    expect(eng.attackPermission(s, a)).toBe('none');
    expect(eng.attackRestriction(s, a)).toBe('any');
  });
  it('mustAttack: Vain only, and not face-down or off the board', () => {
    const b = new StateBuilder(FX).turn(3);
    const vain = b.card('fx-relic-vain', 1);
    const hidden = b.card('fx-relic-vain', 1);
    const plain = b.card('fx-relic-slow', 1);
    const off = b.card('fx-relic-vain', 1);
    const s = b.place(1, 0, vain).place(1, 1, hidden, { faceDown: true }).place(1, 2, plain).build();
    expect(eng.mustAttack(s, vain)).toBe(true);
    expect(eng.mustAttack(s, hidden)).toBe(false);
    expect(eng.mustAttack(s, plain)).toBe(false);
    expect(eng.mustAttack(s, off)).toBe(false);
  });
  it('previewCombat: known, direct, face-down target, and EngineError off the board', () => {
    const b = new StateBuilder(FX).turn(3);
    const fang = b.card('fx-pierce-fang', 1);
    const wall = b.card('fx-sentinel-wall', 0);
    const down = b.card('fx-umbra-beast', 0);
    const off = b.card('fx-ember-whelp', 0);
    const s = b.place(1, 0, fang).place(0, 0, wall, { pos: 1 }).place(0, 1, down, { faceDown: true, pos: 1 }).build();
    const pv = eng.previewCombat(s, fang, wall);
    expect(pv).toMatchObject({ known: true, direct: false, pierce: true, advantage: true, aP: 6, dStat: 6, brittle: false });
    expect(eng.previewCombat(s, fang, down)).toEqual({ known: false });
    const direct = eng.previewCombat(s, fang, -1);
    expect(direct).toMatchObject({ known: true, direct: true, aP: 4 });
    expect(() => eng.previewCombat(s, off, wall)).toThrow(EngineError);
    expect(() => eng.previewCombat(s, fang, off)).toThrow(EngineError);
  });
  it('previewGraft: null without a pending Graft', () => {
    expect(eng.previewGraft(new StateBuilder(FX).build())).toBeNull();
  });
  it('queries never write the state', () => {
    const b = new StateBuilder(FX).turn(3);
    const fang = b.card('fx-pierce-fang', 1);
    const wall = b.card('fx-sentinel-wall', 0);
    const s = b.place(1, 0, fang).place(0, 0, wall).build();
    const before = hashState(s);
    eng.effectivePower(s, fang);
    eng.previewCombat(s, fang, wall);
    eng.attackPermission(s, fang);
    expect(hashState(s)).toBe(before);
  });
  it('queries use the bound globals (a different STAT_FLOOR changes the answer)', () => {
    const floor3 = createEngine(FX, withGlobals({ STAT_FLOOR: 3 }), { intent: () => 'guard' });
    const b = new StateBuilder(FX);
    const a = b.card('fx-tide-sprite', 0);
    const s = b.place(0, 0, a, { permP: -9 }).build();
    expect(floor3.effectivePower(s, a)).toBe(3);
    expect(eng.effectivePower(s, a)).toBe(TEST_GLOBALS.STAT_FLOOR);
  });
});

describe('redactState (D-209)', () => {
  const b = new StateBuilder(FX).turn(3);
  const myHand = b.card('fx-ember-whelp', 0);
  const myDeck = b.card('fx-ember-whelp', 0);
  const myTrap = b.card('fx-trap-snare', 0);
  const hisHand = b.card('fx-umbra-beast', 1);
  const hisDeck = b.card('fx-umbra-beast', 1);
  const hisTrap = b.card('fx-trap-snare', 1);
  const hisDown = b.card('fx-relic-slow', 1);
  const s = b
    .hand(0, myHand).deck(0, myDeck).setTrap(0, 0, myTrap)
    .hand(1, hisHand).deck(1, hisDeck).setTrap(1, 1, hisTrap)
    .place(1, 0, hisDown, { faceDown: true, pos: 1 })
    .build();

  it('empties the opponent hand, deck and traps and the viewer deck; keeps the viewer hand and traps', () => {
    const r = redactState(s, 0);
    expect(r.sides[0].hand).toEqual([myHand]);
    expect(r.sides[0].deck).toEqual([]);
    expect(r.sides[0].traps).toBe(s.sides[0].traps);
    expect(r.sides[1].hand).toEqual([]);
    expect(r.sides[1].deck).toEqual([]);
    expect(r.sides[1].traps).toHaveLength(s.sides[1].traps.length);
    expect(r.sides[1].traps.every((t) => t === null)).toBe(true);
    expect(r.log).toBeNull();
  });
  it('keeps a face-down opponent monster identity and shares everything else by reference', () => {
    const r = redactState(s, 0);
    expect(r.sides[1].board).toBe(s.sides[1].board);
    expect(r.sides[1].board[0]?.iid).toBe(hisDown);
    expect(r.inst).toBe(s.inst);
    expect(r.sides[0].board).toBe(s.sides[0].board);
  });
  it('is symmetric for the other viewer, and does not touch its input', () => {
    const before = hashState(s);
    const r = redactState(s, 1);
    expect(r.sides[1].hand).toEqual([hisHand]);
    expect(r.sides[0].hand).toEqual([]);
    expect(r.sides[1].deck).toEqual([]);
    expect(s.sides[0].hand).toEqual([myHand]);
    expect(hashState(s)).toBe(before);
  });
});
