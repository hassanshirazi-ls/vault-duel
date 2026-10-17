import { describe, expect, it } from 'vitest';
import { FX, FX_SPEC, fxEnv, fxKw } from '../../test-utils/fixture';
import { buildContent } from '../../test-utils/content-builder';
import { TEST_GLOBALS, withGlobals } from '../../test-utils/globals';
import { StateBuilder } from '../../test-utils/state';
import type { QueuedEffect } from '../effects/run';
import type { GameEvent } from '../types/events';
import type { CombatSnapshot, Hooks } from '../types/hooks';
import type { GameState, Iid, Side } from '../types/state';
import { effectivePower } from '../stats';
import { attackTargets, Dispatcher, mustAttack, summonRequirement } from './dispatch';
import { defineKeyword } from './define';
import { createEnv } from './registry';
import { harness } from '../../test-utils/run';
import { EngineError } from '../errors';
import type { TrapHooks } from '../types/hooks';

// ---- recording content -----------------------------------------------------------------------
// Two recorder keywords whose hooks append "<keyword>@<self iid>" to a shared log.

const log: string[] = [];
const rec = (name: string, extra: Partial<Hooks> = {}): Hooks => ({
  onSummon: (ctx) => void log.push(`${name}@${ctx.self}`),
  onTurnStart: (ctx) => void log.push(`${name}@${ctx.self}`),
  onTurnEnd: (ctx) => void log.push(`${name}@${ctx.self}`),
  onGraft: (ctx) => void log.push(`${name}@${ctx.self}`),
  onDestroyed: (ctx) => void log.push(`${name}@${ctx.self}`),
  onAttackDeclared: (ctx) => void log.push(`${name}@${ctx.self}`),
  beforeCombat: (ctx) => void log.push(`${name}@${ctx.self}`),
  ...extra,
});
const kwdef = (id: string, hooks: Hooks) => defineKeyword({ id, name: id, kind: 'keyword', icon: 'i', visual: 'v', text: 't.', hooks });

// Listed b-before-a on purpose: bit order must come from sorting by id, not declaration order.
const RC = buildContent({
  ...FX_SPEC,
  keywords: [...FX_SPEC.keywords, kwdef('fx-rec-b', rec('b')), kwdef('fx-rec-a', rec('a'))],
  defs: [
    ...FX_SPEC.defs,
    { id: 'fx-rec-a-card', type: 'monster', power: 1, guard: 1, element: 'fx-ember', kind: 'fx-beast', kw: ['fx-rec-a'] },
    { id: 'fx-rec-ab-card', type: 'monster', power: 1, guard: 1, element: 'fx-ember', kind: 'fx-beast', kw: ['fx-rec-a', 'fx-rec-b'] },
    { id: 'fx-rec-b-card', type: 'monster', power: 1, guard: 1, element: 'fx-ember', kind: 'fx-beast', kw: ['fx-rec-b'] },
    { id: 'fx-rec-trap', type: 'trap' },
  ],
});
const trapDef = RC.index.get('fx-rec-trap') as number;
const trapHooks: (Hooks | null)[] = [];
trapHooks[trapDef] = rec('trap');
const renv = createEnv(RC, TEST_GLOBALS, trapHooks, true);

interface Sink {
  queued: QueuedEffect[];
  events: GameEvent[];
  queue(q: QueuedEffect): void;
  emit(ev: GameEvent): void;
  spendTrap(side: Side, iid: Iid): void;
}
const sink = (): Sink => {
  const s: Sink = {
    queued: [],
    events: [],
    queue: (q) => void s.queued.push(q),
    emit: (ev) => void s.events.push(ev),
    spendTrap: (side, iid) => void s.events.push({ e: 'TrapTriggered', side, iid, slot: -1 }),
  };
  return s;
};

/** Player: A (a) slot0, B (a,b) slot1; Collector: C (b) slot0; player trap T0, collector trap TC. */
function board(turn: number) {
  const b = new StateBuilder(RC).turn(turn);
  const A = b.card('fx-rec-a-card', 0);
  const B = b.card('fx-rec-ab-card', 0);
  const C = b.card('fx-rec-b-card', 1);
  const T0 = b.card('fx-rec-trap', 0);
  const TC = b.card('fx-rec-trap', 1);
  const s = b.place(0, 0, A).place(0, 1, B).place(1, 0, C).setTrap(0, 0, T0).setTrap(1, 1, TC).build();
  return { s, A, B, C, T0, TC };
}

describe('subscriber order (§8.3.1)', () => {
  it('active side monsters (slot order), inactive monsters, active traps, inactive traps; bits in registry order', () => {
    const { s, A, B, C, T0, TC } = board(2); // active = player
    log.length = 0;
    new Dispatcher(renv, s, sink()).onSummon({ iid: A, side: 0, slot: 0, covetous: false });
    expect(log).toEqual([`a@${A}`, `a@${B}`, `b@${B}`, `b@${C}`, `trap@${T0}`, `trap@${TC}`]);
  });
  it('flips with the active side', () => {
    const { s, A, B, C, T0, TC } = board(3); // active = Collector
    log.length = 0;
    new Dispatcher(renv, s, sink()).onTurn('onTurnStart', { turn: 3, round: 2, side: 1 });
    expect(log).toEqual([`b@${C}`, `a@${A}`, `a@${B}`, `b@${B}`, `trap@${TC}`, `trap@${T0}`]);
  });
  it('every event hook uses the same order', () => {
    const { s, A, B, C, T0, TC } = board(2);
    const expected = [`a@${A}`, `a@${B}`, `b@${B}`, `b@${C}`, `trap@${T0}`, `trap@${TC}`];
    const d = new Dispatcher(renv, s, sink());
    for (const fire of [
      () => d.onTurn('onTurnEnd', { turn: 2, round: 2, side: 0 }),
      () => d.onGraft({ iid: A, side: 0, family: 0, materials: [] }),
      () => d.onAttackDeclared({ attacker: A, target: C }),
      () => d.beforeCombat({ attacker: A, target: C }, { aP: 1, dP: 1, dG: 1, defPos: 0, advantage: false }),
    ]) {
      log.length = 0;
      fire();
      expect(log).toEqual(expected);
    }
  });
  it('face-down monsters are skipped (D-037) and a missing hook is skipped', () => {
    const b = new StateBuilder(RC).turn(2);
    const A = b.card('fx-rec-a-card', 0);
    const W = b.card('fx-warded-ox', 0);
    const s = b.place(0, 0, A, { faceDown: true, pos: 1 }).place(0, 1, W).build();
    log.length = 0;
    new Dispatcher(renv, s, sink()).onSummon({ iid: W, side: 0, slot: 1, covetous: false });
    expect(log).toEqual([]);
  });
  it('onDestroyed: the destroyed monster\'s own hooks (from the LKI mask) run first, then the board', () => {
    const { s, A, B, C, T0, TC } = board(2);
    const D = 77; // removed from the board already; only its LKI exists
    log.length = 0;
    new Dispatcher(renv, s, sink()).onDestroyed({
      iid: D, side: 1, slot: 2, cause: 'effect', by: -1, power: 1, guard: 1, kw: fxKw(RC, 'fx-rec-a', 'fx-rec-b'), sym: -1,
    });
    expect(log).toEqual([`a@${D}`, `b@${D}`, `a@${A}`, `a@${B}`, `b@${B}`, `b@${C}`, `trap@${T0}`, `trap@${TC}`]);
  });
  it('onDestroyed own hooks with an empty LKI mask are not called', () => {
    const { s, A, B, C, T0, TC } = board(2);
    log.length = 0;
    new Dispatcher(renv, s, sink()).onDestroyed({ iid: 77, side: 0, slot: 2, cause: 'combat', by: A, power: 1, guard: 1, kw: 0, sym: -1 });
    expect(log).toEqual([`a@${A}`, `a@${B}`, `b@${B}`, `b@${C}`, `trap@${T0}`, `trap@${TC}`]);
  });
  it('the subscriber list is fixed before any hook runs', () => {
    // A hook cannot add or remove subscribers mid-dispatch: no hook writes state, and the list is local.
    const { s } = board(2);
    const before = s;
    new Dispatcher(renv, s, sink()).onSummon({ iid: 0, side: 0, slot: 0, covetous: false });
    expect(s).toBe(before);
  });
});

describe('queued effects and event refs (§8.3.2)', () => {
  const qc = buildContent({
    ...FX_SPEC,
    keywords: [
      ...FX_SPEC.keywords,
      kwdef('fx-q', {
        onAttackDeclared: (ctx) => ctx.effect({ op: 'modifyStats', target: 'attacker', power: -1, duration: 'permanent' }),
        onDestroyed: (ctx) => {
          ctx.effect({ op: 'destroy', target: 'destroyer' });
          ctx.effect({ op: 'returnToHand', target: 'destroyed' });
        },
        onGraft: (ctx) => ctx.effect({ op: 'destroy', target: 'grafted' }),
      }),
    ],
    defs: [...FX_SPEC.defs, { id: 'fx-q-card', type: 'monster', power: 1, guard: 1, element: 'fx-ember', kind: 'fx-beast', kw: ['fx-q'] }],
  });
  const qenv = createEnv(qc, TEST_GLOBALS, [], true);

  it('hooks only queue: nothing is written, refs bind the event, self and source are the subscriber', () => {
    const b = new StateBuilder(qc).turn(2);
    const q1 = b.card('fx-q-card', 0);
    const foe = b.card('fx-ember-whelp', 1);
    const s = b.place(0, 0, q1).place(1, 0, foe).build();
    const sk = sink();
    new Dispatcher(qenv, s, sk).onAttackDeclared({ attacker: foe, target: q1 });
    expect(sk.queued).toHaveLength(1);
    const first = sk.queued[0] as QueuedEffect;
    expect(first.source).toBe(q1);
    expect(first.side).toBe(0);
    expect(first.refs).toMatchObject({ attacker: foe, defender: q1, self: q1 });
    expect(s.sides[0].board[0]?.permP).toBe(0);
  });
  it('onDestroyed refs: destroyed and destroyer; onGraft ref: grafted', () => {
    const b = new StateBuilder(qc).turn(2);
    const dead = b.card('fx-q-card', 0);
    const killer = b.card('fx-ember-whelp', 1);
    const s = b.place(1, 0, killer).build();
    const sk = sink();
    const d = new Dispatcher(qenv, s, sk);
    d.onDestroyed({ iid: dead, side: 0, slot: 0, cause: 'combat', by: killer, power: 1, guard: 1, kw: fxKw(qc, 'fx-q'), sym: -1 });
    expect(sk.queued.map((x) => x.effect.op)).toEqual(['destroy', 'returnToHand']);
    expect(sk.queued[0]?.refs).toMatchObject({ destroyed: dead, destroyer: killer, self: dead });
    expect(sk.queued[0]?.side).toBe(0); // controller at destruction
    const sk2 = sink();
    const b2 = new StateBuilder(qc).turn(2);
    const watcher = b2.card('fx-q-card', 0);
    const ch = b2.card('fx-family-hybrid', 1, { element: 0, kw: 0, ascended: false, materials: [] });
    new Dispatcher(qenv, b2.place(0, 0, watcher).place(1, 0, ch).build(), sk2).onGraft({ iid: ch, side: 1, family: 0, materials: [] });
    expect(sk2.queued[0]?.refs.grafted).toBe(ch);
  });
});

describe('attack cancellation is immediate (§8.3.4, D-122)', () => {
  const seen: string[] = [];
  const cc = buildContent({
    ...FX_SPEC,
    keywords: [
      ...FX_SPEC.keywords,
      kwdef('fx-c1', { onAttackDeclared: (ctx) => { seen.push(`c1 sees ${String(ctx.cancelled)}`); ctx.cancelAttack(ctx.self); } }),
      kwdef('fx-c2', { onAttackDeclared: (ctx) => { seen.push(`c2 sees ${String(ctx.cancelled)}`); ctx.cancelAttack(ctx.self); } }),
      kwdef('fx-c3', { onAttackDeclared: (ctx) => { seen.push(`c3 sees ${String(ctx.cancelled)}`); ctx.effect({ op: 'cancelAttack' }); } }),
    ],
    defs: [
      ...FX_SPEC.defs,
      { id: 'fx-c1-card', type: 'monster', power: 1, guard: 1, element: 'fx-ember', kind: 'fx-beast', kw: ['fx-c1'] },
      { id: 'fx-c2-card', type: 'monster', power: 1, guard: 1, element: 'fx-ember', kind: 'fx-beast', kw: ['fx-c2'] },
      { id: 'fx-c3-card', type: 'monster', power: 1, guard: 1, element: 'fx-ember', kind: 'fx-beast', kw: ['fx-c3'] },
    ],
  });
  const cenv = createEnv(cc, TEST_GLOBALS, [], true);

  it('later subscribers see cancelled === true; the first canceller is reported', () => {
    const b = new StateBuilder(cc).turn(2);
    const m1 = b.card('fx-c1-card', 0);
    const m2 = b.card('fx-c2-card', 0);
    const foe = b.card('fx-ember-whelp', 1);
    const s = b.place(0, 0, m1).place(0, 1, m2).place(1, 0, foe).build();
    seen.length = 0;
    const sk = sink();
    const by = new Dispatcher(cenv, s, sk).onAttackDeclared({ attacker: foe, target: m1 });
    expect(seen).toEqual(['c1 sees false', 'c2 sees true']);
    expect(by).toBe(m1);
    expect(sk.queued).toEqual([]);
  });
  it('ctx.effect({op:"cancelAttack"}) cancels at once and queues nothing', () => {
    const b = new StateBuilder(cc).turn(2);
    const m3 = b.card('fx-c3-card', 0);
    const m1 = b.card('fx-c1-card', 0);
    const foe = b.card('fx-ember-whelp', 1);
    const s = b.place(0, 0, m3).place(0, 1, m1).place(1, 0, foe).build();
    seen.length = 0;
    const sk = sink();
    const by = new Dispatcher(cenv, s, sk).onAttackDeclared({ attacker: foe, target: m3 });
    expect(seen).toEqual(['c3 sees false', 'c1 sees true']);
    expect(by).toBe(m3);
    expect(sk.queued).toEqual([]);
  });
  it('returns -1 when nobody cancels', () => {
    const b = new StateBuilder(cc).turn(2);
    const foe = b.card('fx-ember-whelp', 1);
    const s = b.place(1, 0, foe).build();
    expect(new Dispatcher(cenv, s, sink()).onAttackDeclared({ attacker: foe, target: -1 })).toBe(-1);
  });
  it('cancelAttack outside onAttackDeclared is an error', () => {
    const bad = buildContent({
      ...FX_SPEC,
      keywords: [...FX_SPEC.keywords, kwdef('fx-bad', { onSummon: (ctx) => ctx.effect({ op: 'cancelAttack' }) })],
      defs: [...FX_SPEC.defs, { id: 'fx-bad-card', type: 'monster', power: 1, guard: 1, element: 'fx-ember', kind: 'fx-beast', kw: ['fx-bad'] }],
    });
    const b = new StateBuilder(bad).turn(2);
    const m = b.card('fx-bad-card', 0);
    const s = b.place(0, 0, m).build();
    expect(() => new Dispatcher(createEnv(bad, TEST_GLOBALS, [], true), s, sink()).onSummon({ iid: m, side: 0, slot: 0, covetous: false })).toThrow();
  });
});

describe('beforeCombat flags (D-124, §8.3.6)', () => {
  const reads: CombatSnapshot[] = [];
  const attempts: string[] = [];
  const fc = buildContent({
    ...FX_SPEC,
    keywords: [
      ...FX_SPEC.keywords,
      // fx-f1 raises pierce, then tries to rewrite the snapshot.
      kwdef('fx-f1', {
        beforeCombat: (ctx) => {
          ctx.setPierce();
          ctx.setPierce(); // idempotent
          try {
            (ctx.combat as { aP: number }).aP = 99;
            attempts.push('wrote');
          } catch {
            attempts.push('blocked');
          }
        },
      }),
      // fx-f2 runs later and reads the snapshot and tries to read the flags.
      kwdef('fx-f2', {
        beforeCombat: (ctx) => {
          reads.push(ctx.combat);
          attempts.push(`flagVisible=${String('pierce' in ctx || 'brittleWin' in ctx)}`);
        },
      }),
      kwdef('fx-f3', { beforeCombat: (ctx) => ctx.setBrittleWin() }),
    ],
    defs: [
      ...FX_SPEC.defs,
      { id: 'fx-f1-card', type: 'monster', power: 1, guard: 1, element: 'fx-ember', kind: 'fx-beast', kw: ['fx-f1'] },
      { id: 'fx-f2-card', type: 'monster', power: 1, guard: 1, element: 'fx-ember', kind: 'fx-beast', kw: ['fx-f2'] },
      { id: 'fx-f3-card', type: 'monster', power: 1, guard: 1, element: 'fx-ember', kind: 'fx-beast', kw: ['fx-f3'] },
    ],
  });
  const fenv = createEnv(fc, TEST_GLOBALS, [], true);
  const snap = (): CombatSnapshot => Object.freeze({ aP: 5, dP: 3, dG: 4, defPos: 1, advantage: true });

  function fight(turn: number, order: [string, string, string]): { pierce: boolean; brittleWin: boolean; s: GameState } {
    const b = new StateBuilder(fc).turn(turn);
    const ids: Iid[] = order.map((id, i) => b.card(id, (i === 2 ? 1 : 0)));
    const s = b.place(0, 0, ids[0] as Iid).place(0, 1, ids[1] as Iid).place(1, 0, ids[2] as Iid).build();
    const r = new Dispatcher(fenv, s, sink()).beforeCombat({ attacker: ids[0] as Iid, target: ids[2] as Iid }, snap());
    return { ...r, s };
  }

  it('flags are OR-folded across subscribers and reported to the caller only', () => {
    reads.length = 0;
    attempts.length = 0;
    const r = fight(2, ['fx-f1-card', 'fx-f2-card', 'fx-f3-card']);
    expect(r.pierce).toBe(true);
    expect(r.brittleWin).toBe(true);
  });
  it('a hook\'s write cannot reach another hook\'s read: the snapshot is read-only and flags are hidden', () => {
    reads.length = 0;
    attempts.length = 0;
    fight(2, ['fx-f1-card', 'fx-f2-card', 'fx-f3-card']);
    expect(attempts).toEqual(['blocked', 'flagVisible=false']);
    expect(reads[0]).toEqual({ aP: 5, dP: 3, dG: 4, defPos: 1, advantage: true });
  });
  it('outcome does not depend on subscriber order (which side is active, who is in which slot)', () => {
    const a = fight(2, ['fx-f1-card', 'fx-f2-card', 'fx-f3-card']);
    const b = fight(3, ['fx-f1-card', 'fx-f2-card', 'fx-f3-card']);
    const c = fight(2, ['fx-f3-card', 'fx-f2-card', 'fx-f1-card']);
    for (const r of [a, b, c]) expect({ pierce: r.pierce, brittleWin: r.brittleWin }).toEqual({ pierce: true, brittleWin: true });
  });
  it('no flags when nobody raises them', () => {
    const b = new StateBuilder(fc).turn(2);
    const x = b.card('fx-f2-card', 0);
    const y = b.card('fx-ember-whelp', 1);
    const s = b.place(0, 0, x).place(1, 0, y).build();
    expect(new Dispatcher(fenv, s, sink()).beforeCombat({ attacker: x, target: y }, snap())).toEqual({ pierce: false, brittleWin: false });
  });
  it('fixture Pierce / Brittle follow §8.5', () => {
    const env = fxEnv();
    const b = new StateBuilder(FX).turn(2);
    const fang = b.card('fx-pierce-fang', 0);
    const guardMon = b.card('fx-sentinel-wall', 1);
    const glass = b.card('fx-relic-brittle', 1);
    const s = b.place(0, 0, fang).place(1, 0, guardMon).place(1, 1, glass).build();
    const guardSnap: CombatSnapshot = { aP: 4, dP: 2, dG: 6, defPos: 1, advantage: false };
    expect(new Dispatcher(env, s, sink()).beforeCombat({ attacker: fang, target: guardMon }, guardSnap)).toEqual({ pierce: true, brittleWin: false });
    expect(new Dispatcher(env, s, sink()).beforeCombat({ attacker: fang, target: guardMon }, { ...guardSnap, defPos: 0 })).toEqual({ pierce: false, brittleWin: false });
    expect(new Dispatcher(env, s, sink()).beforeCombat({ attacker: fang, target: glass }, { ...guardSnap, advantage: true })).toEqual({ pierce: true, brittleWin: true });
    expect(new Dispatcher(env, s, sink()).beforeCombat({ attacker: fang, target: glass }, { ...guardSnap, advantage: false, defPos: 0 })).toEqual({ pierce: false, brittleWin: false });
  });
});

describe('beforeDestroy (Ward)', () => {
  const env = fxEnv();
  it('prevents once for the monster\'s own active Ward only', () => {
    const b = new StateBuilder(FX);
    const ox = b.card('fx-warded-ox', 0);
    const used = b.card('fx-warded-ox', 0);
    const plain = b.card('fx-ember-whelp', 0);
    const s = b.place(0, 0, ox).place(0, 1, used, { wardUsed: true }).place(0, 2, plain).build();
    const d = new Dispatcher(env, s, sink());
    expect(d.beforeDestroy({ iid: ox, cause: 'effect', by: -1 })).toBe('prevent');
    expect(d.beforeDestroy({ iid: used, cause: 'effect', by: -1 })).toBe('allow');
    // another monster's Ward never protects a neighbour
    expect(d.beforeDestroy({ iid: plain, cause: 'combat', by: -1 })).toBe('allow');
  });
  it('face-down Ward is inactive (D-037); off-board monsters are not protected', () => {
    const b = new StateBuilder(FX);
    const hidden = b.card('fx-warded-ox', 0);
    const off = b.card('fx-warded-ox', 0);
    const s = b.place(0, 0, hidden, { faceDown: true, pos: 1 }).build();
    const d = new Dispatcher(env, s, sink());
    expect(d.beforeDestroy({ iid: hidden, cause: 'effect', by: -1 })).toBe('allow');
    expect(d.beforeDestroy({ iid: off, cause: 'effect', by: -1 })).toBe('allow');
  });
  it('stops at the first prevent in bit order', () => {
    const calls: string[] = [];
    const pc = buildContent({
      ...FX_SPEC,
      keywords: [
        ...FX_SPEC.keywords,
        kwdef('fx-p1', { beforeDestroy: () => { calls.push('p1'); return 'allow'; } }),
        kwdef('fx-p2', { beforeDestroy: () => { calls.push('p2'); return 'prevent'; } }),
        kwdef('fx-p3', { beforeDestroy: () => { calls.push('p3'); return 'prevent'; } }),
      ],
      defs: [...FX_SPEC.defs, { id: 'fx-p-card', type: 'monster', power: 1, guard: 1, element: 'fx-ember', kind: 'fx-beast', kw: ['fx-p3', 'fx-p1', 'fx-p2'] }],
    });
    const b = new StateBuilder(pc);
    const m = b.card('fx-p-card', 0);
    const s = b.place(0, 0, m).build();
    expect(new Dispatcher(createEnv(pc, TEST_GLOBALS, [], true), s, sink()).beforeDestroy({ iid: m, cause: 'effect', by: -1 })).toBe('prevent');
    expect(calls).toEqual(['p1', 'p2']);
  });
});

describe('query folds', () => {
  const env = fxEnv();
  it('attackTargets: Sentinels become the only targets; face-down Sentinels do not count (D-037, D-038)', () => {
    const b = new StateBuilder(FX);
    const atk = b.card('fx-ember-whelp', 0);
    const wall = b.card('fx-sentinel-wall', 1);
    const other = b.card('fx-umbra-beast', 1);
    const s1 = b.place(0, 0, atk).place(1, 0, other).place(1, 1, wall).build();
    expect(attackTargets(env, s1, atk, 1)).toEqual([wall]);
    const b2 = new StateBuilder(FX);
    const atk2 = b2.card('fx-ember-whelp', 0);
    const o2 = b2.card('fx-umbra-beast', 1);
    const hw2 = b2.card('fx-sentinel-wall', 1);
    const s2 = b2.place(0, 0, atk2).place(1, 0, o2).place(1, 1, hw2, { faceDown: true, pos: 1 }).build();
    expect(attackTargets(env, s2, atk2, 1)).toEqual([o2, hw2]);
  });
  it('attackTargets: empty board gives no targets; no Sentinel gives all in slot order', () => {
    const b = new StateBuilder(FX);
    const atk = b.card('fx-ember-whelp', 0);
    expect(attackTargets(env, b.place(0, 0, atk).build(), atk, 1)).toEqual([]);
    const s = new StateBuilder(FX);
    const a2 = s.card('fx-ember-whelp', 0);
    const x2 = s.card('fx-umbra-beast', 1);
    const y2 = s.card('fx-tide-sprite', 1);
    expect(attackTargets(env, s.place(0, 0, a2).place(1, 2, x2).place(1, 0, y2).build(), a2, 1)).toEqual([y2, x2]);
  });
  it('restrictTargets query context exposes the attacker and the defender as self', () => {
    const seenCtx: { self: number; attacker: number; isAtk: boolean }[] = [];
    const rc = buildContent({
      ...FX_SPEC,
      keywords: [
        ...FX_SPEC.keywords,
        kwdef('fx-r', { restrictTargets: (q) => { seenCtx.push({ self: q.self, attacker: q.attacker, isAtk: q.isAttacker(q.attacker) }); return false; } }),
      ],
      defs: [...FX_SPEC.defs, { id: 'fx-r-card', type: 'monster', power: 1, guard: 1, element: 'fx-ember', kind: 'fx-beast', kw: ['fx-r'] }],
    });
    const b = new StateBuilder(rc);
    const atk = b.card('fx-ember-whelp', 0);
    const d = b.card('fx-r-card', 1);
    attackTargets(createEnv(rc, TEST_GLOBALS, [], true), b.place(0, 0, atk).place(1, 1, d).build(), atk, 1);
    expect(seenCtx).toEqual([{ self: d, attacker: atk, isAtk: true }]);
  });
  it('QueryCtx.num reads CONTENT_NUMBERS then core globals (D-171)', () => {
    const seen: number[] = [];
    const rc = buildContent({
      ...FX_SPEC,
      keywords: [
        ...FX_SPEC.keywords,
        kwdef('fx-n', { staticPower: (q) => { seen.push(q.num('FX_ONLY_NUMBER'), q.num('HAUNT_PENALTY')); return q.num('FX_ONLY_NUMBER'); } }),
      ],
      defs: [...FX_SPEC.defs, { id: 'fx-n-card', type: 'monster', power: 1, guard: 1, element: 'fx-ember', kind: 'fx-beast', kw: ['fx-n'] }],
    });
    const g = withGlobals({ CONTENT_NUMBERS: { FX_ONLY_NUMBER: 6 } });
    const b = new StateBuilder(rc);
    const m = b.card('fx-n-card', 0);
    const s = b.place(0, 0, m).build();
    expect(effectivePower(s, createEnv(rc, g, [], true), m)).toBe(7);
    expect(seen).toEqual([6, g.HAUNT_PENALTY]);
  });
  it('mustAttack is an OR over active keywords (Vain)', () => {
    const b = new StateBuilder(FX);
    const vain = b.card('fx-relic-vain', 1);
    const plain = b.card('fx-relic-slow', 1);
    const hidden = b.card('fx-relic-vain', 1);
    const s = b.place(1, 0, vain).place(1, 1, plain).place(1, 2, hidden, { faceDown: true, pos: 1 }).build();
    expect(mustAttack(env, s, vain)).toBe(true);
    expect(mustAttack(env, s, plain)).toBe(false);
    expect(mustAttack(env, s, hidden)).toBe(false);
    expect(mustAttack(env, s, 999)).toBe(false);
  });
  it('summonRequirement: Covetous requires a sacrifice; others are normal', () => {
    const b = new StateBuilder(FX);
    const cov = b.card('fx-relic-covetous', 1);
    const norm = b.card('fx-relic-slow', 1);
    const s = b.hand(1, cov, norm).build();
    expect(summonRequirement(env, s, cov, 1, fxKw(FX, 'fx-covetous'))).toEqual({ kind: 'sacrifice', appraised: true, zones: ['board', 'vault'] });
    expect(summonRequirement(env, s, norm, 1, fxKw(FX, 'fx-slow'))).toEqual({ kind: 'normal' });
    expect(summonRequirement(env, s, norm, 1, 0)).toEqual({ kind: 'normal' });
  });
  it('summonRequirement: most restrictive wins (zones intersect)', () => {
    const rc = buildContent({
      ...FX_SPEC,
      keywords: [
        ...FX_SPEC.keywords,
        kwdef('fx-s1', { summonRequirement: () => ({ kind: 'sacrifice', appraised: true, zones: ['board', 'vault'] }) }),
        kwdef('fx-s2', { summonRequirement: () => ({ kind: 'sacrifice', appraised: true, zones: ['vault'] }) }),
        kwdef('fx-s3', { summonRequirement: () => ({ kind: 'normal' }) }),
      ],
      defs: FX_SPEC.defs,
    });
    const s = new StateBuilder(rc).build();
    expect(summonRequirement(createEnv(rc, TEST_GLOBALS, [], true), s, 0, 0, fxKw(rc, 'fx-s1', 'fx-s2', 'fx-s3'))).toEqual({
      kind: 'sacrifice', appraised: true, zones: ['vault'],
    });
  });
});

describe('globals reach the hooks', () => {
  it('Haunt queues the penalty as a symbolic ref resolved later (D-120)', () => {
    const e = fxEnv(withGlobals({ HAUNT_PENALTY: 9 }));
    const b = new StateBuilder(FX).turn(2);
    const killer = b.card('fx-ember-whelp', 1);
    const shade = b.card('fx-haunt-shade', 0);
    const s = b.place(1, 0, killer).build();
    const sk = sink();
    new Dispatcher(e, s, sk).onDestroyed({ iid: shade, side: 0, slot: 0, cause: 'combat', by: killer, power: 3, guard: 3, kw: fxKw(FX, 'fx-haunt'), sym: -1 });
    expect(sk.queued[0]?.effect).toMatchObject({ op: 'modifyStats', power: '-$HAUNT_PENALTY' });
  });
});

describe('live state in contexts and the trap-only spendTrap (D-186)', () => {
  const sc = buildContent({
    ...FX_SPEC,
    defs: [
      ...FX_SPEC.defs,
      { id: 'fx-spender', type: 'trap' },
      { id: 'fx-reader', type: 'trap' },
      { id: 'fx-bad-spender', type: 'monster', power: 1, guard: 1, element: 'fx-ember', kind: 'fx-beast', kw: ['fx-spend-kw'] },
    ],
    keywords: [...FX_SPEC.keywords, kwdef('fx-spend-kw', { onSummon: (ctx) => (ctx as unknown as { spendTrap(): void }).spendTrap() })],
  });
  const spender = sc.index.get('fx-spender') as number;
  const reader = sc.index.get('fx-reader') as number;
  const seen: (number | null)[] = [];
  const hooks: (TrapHooks | null)[] = [];
  hooks[spender] = { onSummon: (ctx) => ctx.spendTrap() };
  // Reads the player's trap slot 0 after the spender (slot 0) already left it.
  hooks[reader] = { onSummon: (ctx) => void seen.push(ctx.s.sides[0].traps[0]?.iid ?? null) };
  const env = createEnv(sc, TEST_GLOBALS, hooks, true);

  it('a trap subscriber sees the writes of the subscribers before it (would fail with a captured state)', () => {
    seen.length = 0;
    const b = new StateBuilder(sc).turn(2);
    const t0 = b.card('fx-spender', 0);
    const t1 = b.card('fx-reader', 0);
    const h = harness(b.setTrap(0, 0, t0).setTrap(0, 1, t1).build(), env);
    h.run.dispatcher().onSummon({ iid: 0, side: 0, slot: 0, covetous: false });
    expect(seen).toEqual([null]); // a captured state would still show t0
    expect(h.done().sides[0].traps.map((t) => t?.iid ?? null)).toEqual([null, t1]);
  });

  it('a keyword hook cannot spend a trap', () => {
    const b = new StateBuilder(sc).turn(2);
    const m = b.card('fx-bad-spender', 0);
    const h = harness(b.place(0, 0, m).build(), env);
    expect(() => h.run.dispatcher().onSummon({ iid: m, side: 0, slot: 0, covetous: false })).toThrow(EngineError);
  });
});
