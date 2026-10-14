import { describe, expect, it } from 'vitest';
import { FX, fxEnv, fxKw } from '../../test-utils/fixture';
import { withGlobals } from '../../test-utils/globals';
import { StateBuilder } from '../../test-utils/state';
import type { Cond } from '../types/effects';
import { evalCond } from './conditions';

const env = fxEnv();

function world() {
  const b = new StateBuilder(FX).turn(2);
  const whelp = b.card('fx-ember-whelp', 0); // P3 G2 ember beast, face-up
  const ox = b.card('fx-warded-ox', 0); // face-down, ward
  const relic = b.card('fx-relic-brittle', 1);
  const chim = b.card('fx-family-hybrid', 0, { element: FX.elementIds.indexOf('fx-umbra'), kw: fxKw(FX, 'fx-swift'), ascended: false, materials: [] });
  const spell = b.card('fx-spell-bolt', 0);
  const inDiscard = b.card('fx-umbra-beast', 0);
  const s = b
    .place(0, 0, whelp, { entered: 2 })
    .place(0, 1, ox, { faceDown: true, pos: 1 })
    .place(0, 2, chim, { entered: 2 })
    .place(1, 0, relic)
    .discard(0, inDiscard)
    .build();
  return { s, whelp, ox, relic, chim, spell, inDiscard };
}

const t = (c: Cond, iid: number, w = world()): boolean => evalCond(c, { s: w.s, env }, iid);

describe('evalCond', () => {
  it('faceUp: true only for face-up board monsters', () => {
    const w = world();
    expect(t({ faceUp: true }, w.whelp, w)).toBe(true);
    expect(t({ faceUp: true }, w.ox, w)).toBe(false);
    expect(t({ faceUp: true }, w.inDiscard, w)).toBe(false);
  });
  it('powerLte / powerGte use effective Power and resolve $ refs', () => {
    const w = world();
    expect(t({ powerLte: 3 }, w.whelp, w)).toBe(true);
    expect(t({ powerLte: 2 }, w.whelp, w)).toBe(false);
    expect(t({ powerGte: '$UNMAKE_MAX_POWER' }, w.whelp, w)).toBe(false);
    expect(t({ powerLte: '$UNMAKE_MAX_POWER' }, w.whelp, w)).toBe(true);
    expect(t({ powerGte: 5 }, w.inDiscard, w)).toBe(true); // discard: printed Power
  });
  it('type monster covers base cards and Chimeras, not spells', () => {
    const w = world();
    expect(t({ type: 'monster' }, w.whelp, w)).toBe(true);
    expect(t({ type: 'monster' }, w.chim, w)).toBe(true);
    expect(t({ type: 'monster' }, w.spell, w)).toBe(false);
  });
  it('relic: Collector monster cards only', () => {
    const w = world();
    expect(t({ relic: true }, w.relic, w)).toBe(true);
    expect(t({ relic: true }, w.whelp, w)).toBe(false);
    expect(t({ relic: true }, w.chim, w)).toBe(false);
  });
  it('chimera and onBoard', () => {
    const w = world();
    expect(t({ chimera: true }, w.chim, w)).toBe(true);
    expect(t({ chimera: true }, w.whelp, w)).toBe(false);
    expect(t({ onBoard: true }, w.whelp, w)).toBe(true);
    expect(t({ onBoard: true }, w.inDiscard, w)).toBe(false);
  });
  it('element via elementIds, Chimera element from its record (D-129)', () => {
    const w = world();
    expect(t({ element: 'fx-ember' }, w.whelp, w)).toBe(true);
    expect(t({ element: 'fx-tide' }, w.whelp, w)).toBe(false);
    expect(t({ element: 'fx-umbra' }, w.chim, w)).toBe(true);
    expect(t({ element: 'fx-ember' }, w.spell, w)).toBe(false);
    expect(t({ element: 'nope' }, w.whelp, w)).toBe(false);
  });
  it('kind via kindIds; always false for Chimeras (D-129)', () => {
    const w = world();
    expect(t({ kind: 'fx-beast' }, w.whelp, w)).toBe(true);
    expect(t({ kind: 'fx-spirit' }, w.whelp, w)).toBe(false);
    expect(t({ kind: 'fx-beast' }, w.chim, w)).toBe(false);
    expect(t({ kind: 'fx-spirit' }, w.chim, w)).toBe(false);
  });
  it('keyword: active keywords only (face-down and Chimera-inherited)', () => {
    const w = world();
    expect(t({ keyword: 'fx-swift' }, w.chim, w)).toBe(true);
    expect(t({ keyword: 'fx-ward' }, w.ox, w)).toBe(false); // face-down
    expect(t({ keyword: 'fx-unknown' }, w.chim, w)).toBe(false);
  });
  it('graftedThisTurn: a Chimera created by a Graft this turn (D-139)', () => {
    const w = world();
    expect(t({ graftedThisTurn: true }, w.chim, w)).toBe(true);
    expect(t({ graftedThisTurn: true }, w.whelp, w)).toBe(false); // entered this turn but not a Chimera
    expect(t({ graftedThisTurn: true }, w.spell, w)).toBe(false);
  });
  it('graftedThisTurn is false for a Chimera re-summoned this turn (grafted < turn)', () => {
    const b = new StateBuilder(FX).turn(4);
    const ch = b.card('fx-family-hybrid', 0, { element: 0, kw: 0, ascended: false, materials: [], grafted: 2 });
    const s = b.place(0, 0, ch, { entered: 4 }).build(); // re-summoned from hand on turn 4
    expect(evalCond({ graftedThisTurn: true }, { s, env }, ch)).toBe(false);
    // the builder default is the monster's `entered` turn
    const b2 = new StateBuilder(FX).turn(4);
    const ch2 = b2.card('fx-family-hybrid', 0, { element: 0, kw: 0, ascended: false, materials: [] });
    const s2 = b2.place(0, 0, ch2, { entered: 4 }).build();
    expect(s2.inst[ch2]?.chimera?.grafted).toBe(4);
    expect(evalCond({ graftedThisTurn: true }, { s: s2, env }, ch2)).toBe(true);
    // location does not matter: a Chimera in the discard grafted this turn still counts
    const b3 = new StateBuilder(FX).turn(4);
    const ch3 = b3.card('fx-family-hybrid', 0, { element: 0, kw: 0, ascended: false, materials: [], grafted: 4 });
    expect(evalCond({ graftedThisTurn: true }, { s: b3.discard(0, ch3).build(), env }, ch3)).toBe(true);
  });
  it('directAttack reads the event refs; false outside an attack', () => {
    const w = world();
    const direct = { s: w.s, env, refs: { attacker: w.relic, defender: -1 } } as const;
    const onMonster = { s: w.s, env, refs: { attacker: w.relic, defender: w.whelp } } as const;
    expect(evalCond({ directAttack: true }, direct, w.relic)).toBe(true);
    expect(evalCond({ directAttack: false }, direct, w.relic)).toBe(false);
    expect(evalCond({ directAttack: false }, onMonster, w.relic)).toBe(true);
    expect(evalCond({ directAttack: true }, { s: w.s, env }, w.relic)).toBe(false);
  });
  it('all / any / not compose', () => {
    const w = world();
    expect(t({ all: [{ faceUp: true }, { element: 'fx-ember' }] }, w.whelp, w)).toBe(true);
    expect(t({ all: [{ faceUp: true }, { element: 'fx-tide' }] }, w.whelp, w)).toBe(false);
    expect(t({ any: [{ element: 'fx-tide' }, { kind: 'fx-beast' }] }, w.whelp, w)).toBe(true);
    expect(t({ not: { faceUp: true } }, w.ox, w)).toBe(true);
    expect(t({ all: [] }, w.whelp, w)).toBe(true);
    expect(t({ any: [] }, w.whelp, w)).toBe(false);
  });
  it('powerLte sees global overrides', () => {
    const w = world();
    const e2 = fxEnv(withGlobals({ UNMAKE_MAX_POWER: 2 }));
    expect(evalCond({ powerLte: '$UNMAKE_MAX_POWER' }, { s: w.s, env: e2 }, w.whelp)).toBe(false);
  });
});
