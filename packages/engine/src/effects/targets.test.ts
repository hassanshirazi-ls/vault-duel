import { describe, expect, it } from 'vitest';
import { FX, fxEnv } from '../../test-utils/fixture';
import { StateBuilder } from '../../test-utils/state';
import { FX_DEFS } from '../../test-utils/fixture';
import type { SpellDef } from '../types/effects';
import { controllerOf, makeRefs, NO_REFS, resolveRef, specSide, targetCandidates } from './targets';

const env = fxEnv();
const bolt = FX_DEFS.find((d) => d.id === 'fx-spell-bolt')?.spell as SpellDef;
const spec = bolt.target as NonNullable<SpellDef['target']>;

describe('refs', () => {
  it('makeRefs fills unset refs with -1 and resolveRef reads them', () => {
    const r = makeRefs({ attacker: 4, destroyer: 9 });
    expect(r).toEqual({ ...NO_REFS, attacker: 4, destroyer: 9 });
    expect(resolveRef(r, 'attacker')).toBe(4);
    expect(resolveRef(r, 'chosen')).toBe(-1);
  });
  it('ally/enemy are relative to the caster', () => {
    expect(specSide({ side: 'ally', zone: 'board' }, 1)).toBe(1);
    expect(specSide({ side: 'enemy', zone: 'board' }, 1)).toBe(0);
  });
});

describe('targetCandidates', () => {
  it('filters enemy board by the spell where-condition, in slot order', () => {
    const b = new StateBuilder(FX);
    const low = b.card('fx-ember-whelp', 1); // P3 ok
    const hidden = b.card('fx-tide-sprite', 1); // face-down
    const big = b.card('fx-relic-brittle', 1); // P7 too big
    const mine = b.card('fx-ember-whelp', 0);
    const s = b
      .place(1, 0, low)
      .place(1, 1, hidden, { faceDown: true, pos: 1 })
      .place(1, 2, big)
      .place(0, 0, mine)
      .build();
    expect(targetCandidates(s, env, 0, spec)).toEqual([low]);
    const b2 = new StateBuilder(FX);
    const m1 = b2.card('fx-umbra-beast', 1);
    const m2 = b2.card('fx-ember-whelp', 1);
    const s2 = b2.place(1, 0, m2).place(1, 1, m1).build();
    expect(targetCandidates(s2, env, 0, spec)).toEqual([m2, m1]);
  });
  it('discard zone lists cards in discard order, filtered', () => {
    const b = new StateBuilder(FX);
    const m = b.card('fx-ember-whelp', 0);
    const sp = b.card('fx-spell-bolt', 0);
    const m2 = b.card('fx-umbra-beast', 0);
    const s = b.discard(0, m, sp, m2).build();
    const grave = { side: 'ally', zone: 'discard', where: { type: 'monster' } } as const;
    expect(targetCandidates(s, env, 0, grave)).toEqual([m, m2]);
    expect(targetCandidates(s, env, 1, grave)).toEqual([]);
  });
  it('no where-condition lists every board monster, face-down included', () => {
    const b = new StateBuilder(FX);
    const a = b.card('fx-ember-whelp', 0);
    const c = b.card('fx-tide-sprite', 0);
    const s = b.place(0, 0, a).place(0, 2, c, { faceDown: true, pos: 1 }).build();
    expect(targetCandidates(s, env, 0, { side: 'ally', zone: 'board' })).toEqual([a, c]);
  });
  it('controllerOf', () => {
    const b = new StateBuilder(FX);
    const a = b.card('fx-ember-whelp', 1);
    const s = b.place(1, 0, a).build();
    expect(controllerOf(s, a)).toBe(1);
    expect(controllerOf(s, 99)).toBe(-1);
  });
});
