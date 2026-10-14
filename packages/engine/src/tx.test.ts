import { describe, expect, it } from 'vitest';
import fc from 'fast-check';
import { EngineError } from './errors';
import { Tx } from './tx';
import type { GameState, Monster, SideState } from './types/state';

const mon = (iid: number): Monster => ({
  iid, pos: 0, faceDown: false, entered: 0, repositioned: -1, attacked: -1, wardUsed: false,
  permP: 0, permG: 0, timed: [], unstableUntil: -1, shroudUntil: -1, appraised: false,
});
const side = (life: number, deck: number[], hand: number[]): SideState => ({
  life, deck, hand, discard: [], board: [mon(100), null, null], traps: [null, null], vault: [],
});

function deepFreeze<T>(o: T): T {
  if (o !== null && typeof o === 'object' && !Object.isFrozen(o)) {
    Object.freeze(o);
    for (const v of Object.values(o as object)) deepFreeze(v);
  }
  return o;
}

const makeState = (): GameState =>
  deepFreeze({
    v: 1, cfg: 'c', seed: 's', rng: [1, 2, 3, 4], turn: 0, step: 'main', played: false, redrawsLeft: 1,
    pending: null,
    sides: [side(20, [1, 2, 3], [4, 5]), side(25, [6, 7], [8])],
    inst: [{ def: 0, owner: 0, chimera: null }],
    appraisal: { attempts: 0, successes: 0, taken: [] },
    collector: { mood: 0, intent: null },
    twist: -1,
    track: { round: [], grafts: 0, families: [], unpriced: false, appraisedLost: 0 },
    result: null, log: null, nActions: 0,
  });

describe('Tx', () => {
  it('commit with no writes returns the base state itself', () => {
    const s = makeState();
    const tx = new Tx(s);
    expect(tx.dirty).toBe(false);
    expect(tx.commit()).toBe(s);
  });

  it('root write copies only the root', () => {
    const s = makeState();
    const tx = new Tx(s);
    tx.set('turn', 1);
    const n = tx.commit();
    expect(n).not.toBe(s);
    expect(n.turn).toBe(1);
    expect(s.turn).toBe(0);
    expect(n.sides).toBe(s.sides);
    expect(n.inst).toBe(s.inst);
    expect(n.track).toBe(s.track);
  });

  it('side write copies the path and shares everything else', () => {
    const s = makeState();
    const tx = new Tx(s);
    tx.setLife(1, 10);
    const n = tx.commit();
    expect(n.sides).not.toBe(s.sides);
    expect(n.sides[0]).toBe(s.sides[0]);
    expect(n.sides[1]).not.toBe(s.sides[1]);
    expect(n.sides[1].life).toBe(10);
    expect(n.sides[1].deck).toBe(s.sides[1].deck);
    expect(n.sides[1].board).toBe(s.sides[1].board);
    expect(s.sides[1].life).toBe(25);
  });

  it('zone edit copies one array only', () => {
    const s = makeState();
    const tx = new Tx(s);
    tx.zonePush(0, 'discard', 9);
    const n = tx.commit();
    expect(n.sides[0].discard).toEqual([9]);
    expect(s.sides[0].discard).toEqual([]);
    expect(n.sides[0].deck).toBe(s.sides[0].deck);
    expect(n.sides[0].hand).toBe(s.sides[0].hand);
    expect(n.sides[0].board).toBe(s.sides[0].board);
    expect(n.sides[1]).toBe(s.sides[1]);
  });

  it('repeated edits in one Tx copy the array once', () => {
    const s = makeState();
    const tx = new Tx(s);
    tx.zonePush(0, 'hand', 10);
    const first = tx.state.sides[0].hand;
    tx.zonePush(0, 'hand', 11);
    expect(tx.state.sides[0].hand).toBe(first);
    expect(tx.commit().sides[0].hand).toEqual([4, 5, 10, 11]);
    expect(s.sides[0].hand).toEqual([4, 5]);
  });

  it('board edits replace the Monster record, leaving the old one intact', () => {
    const s = makeState();
    const old = s.sides[0].board[0] as Monster;
    const tx = new Tx(s);
    const next = tx.patchMonster(0, 0, { attacked: 3, permP: -2 });
    const n = tx.commit();
    expect(n.sides[0].board[0]).toBe(next);
    expect(next).not.toBe(old);
    expect(old.attacked).toBe(-1);
    expect(next.attacked).toBe(3);
    expect(next.timed).toBe(old.timed);
    expect(n.sides[0].traps).toBe(s.sides[0].traps);
  });

  it('patchMonster on an empty slot throws EngineError', () => {
    expect(() => new Tx(makeState()).patchMonster(0, 1, { permP: 1 })).toThrow(EngineError);
  });

  it('setSlot and setTrap', () => {
    const s = makeState();
    const tx = new Tx(s);
    tx.setSlot(1, 2, mon(7));
    tx.setTrap(1, 0, { iid: 3, set: 0 });
    tx.setSlot(0, 0, null);
    const n = tx.commit();
    expect(n.sides[1].board[2]?.iid).toBe(7);
    expect(n.sides[1].traps[0]).toEqual({ iid: 3, set: 0 });
    expect(n.sides[0].board[0]).toBeNull();
    expect(s.sides[0].board[0]?.iid).toBe(100);
  });

  it('zoneTake, zoneRemove, zoneUnshift', () => {
    const s = makeState();
    const tx = new Tx(s);
    expect(tx.zoneTake(0, 'deck', 2)).toEqual([1, 2]);
    expect(tx.zoneRemove(0, 'hand', 5)).toBe(true);
    expect(tx.zoneRemove(0, 'hand', 99)).toBe(false);
    tx.zoneUnshift(0, 'deck', 42);
    const n = tx.commit();
    expect(n.sides[0].deck).toEqual([42, 3]);
    expect(n.sides[0].hand).toEqual([4]);
    expect(s.sides[0].deck).toEqual([1, 2, 3]);
  });

  it('failed removal and empty take do not copy', () => {
    const s = makeState();
    const tx = new Tx(s);
    expect(tx.zoneRemove(0, 'hand', 99)).toBe(false);
    expect(tx.zoneTake(0, 'discard', 3)).toEqual([]);
    expect(tx.dirty).toBe(false);
  });

  it('setZone adopts the array and later pushes copy it first', () => {
    const s = makeState();
    const adopted = [1, 2];
    const tx = new Tx(s);
    tx.setZone(0, 'discard', adopted);
    tx.zonePush(0, 'discard', 3);
    expect(adopted).toEqual([1, 2]);
    expect(tx.commit().sides[0].discard).toEqual([1, 2, 3]);
  });

  it('pushInstance appends without touching the base inst array', () => {
    const s = makeState();
    const tx = new Tx(s);
    expect(tx.pushInstance({ def: 5, owner: 1, chimera: null })).toBe(1);
    expect(tx.pushInstance({ def: 6, owner: 1, chimera: null })).toBe(2);
    const n = tx.commit();
    expect(n.inst).toHaveLength(3);
    expect(s.inst).toHaveLength(1);
  });

  it('writes after commit throw', () => {
    const tx = new Tx(makeState());
    tx.commit();
    expect(() => tx.set('turn', 1)).toThrow(EngineError);
  });

  it('a committed state is not changed by a later Tx on it', () => {
    const s = makeState();
    const t1 = new Tx(s);
    t1.zonePush(0, 'hand', 50);
    const s1 = deepFreeze(t1.commit());
    const t2 = new Tx(s1);
    t2.zonePush(0, 'hand', 51);
    const s2 = t2.commit();
    expect(s1.sides[0].hand).toEqual([4, 5, 50]);
    expect(s2.sides[0].hand).toEqual([4, 5, 50, 51]);
  });

  it('property: random edit sequences never mutate the (frozen) base and untouched sides are shared', () => {
    fc.assert(
      fc.property(
        fc.array(fc.tuple(fc.constantFrom(0, 1), fc.integer({ min: 0, max: 50 })), { maxLength: 20 }),
        (ops) => {
          const s = makeState();
          const before = JSON.stringify(s);
          const tx = new Tx(s);
          const touched = new Set<number>();
          for (const [sd, v] of ops) {
            tx.zonePush(sd as 0 | 1, 'discard', v);
            touched.add(sd);
          }
          const n = tx.commit();
          if (JSON.stringify(s) !== before) return false;
          for (const sd of [0, 1] as const) {
            if (!touched.has(sd) && n.sides[sd] !== s.sides[sd]) return false;
          }
          return ops.length === 0 ? n === s : true;
        },
      ),
    );
  });
});
