// Property tests (ARCHITECTURE.md §17): random seeds x random legal-action walks.
import fc from 'fast-check';
import { beforeAll, describe, expect, it } from 'vitest';
import { DC_TWIST, DUEL_GLOBALS, duelEngine } from '../test-utils/duel-fixture';
import { ALT_GLOBALS, withGlobals } from '../test-utils/globals';
import { moodOf } from './mood';
import { hashState, toActions } from './replay';
import { rerollSeed, seedString } from './setup/seed';
import { redactState } from './view/redact';
import type { Action } from './types/actions';
import type { GameState, Iid, Side } from './types/state';
import type { EngineInternals } from './engine';
import type { Globals } from './types/globals';
import type { GameEvent } from './types/events';

// The suites run under TEST_GLOBALS (via DUEL_GLOBALS) and ALT_GLOBALS (D-168): `engine` and `g` are bound per case in beforeAll.
const GLOBAL_CASES: readonly (readonly [string, Globals])[] = [
  ['TEST_GLOBALS', DUEL_GLOBALS],
  ['ALT_GLOBALS', withGlobals({ ...ALT_GLOBALS })],
];
let engine: EngineInternals;
let g: Globals;
const MAX_STEPS = 4000;

/** Every iid sits in exactly one zone (§4 conservation). */
function conservation(s: GameState): string | null {
  const seen: number[] = new Array<number>(s.inst.length).fill(0);
  const count = (iid: Iid): void => {
    seen[iid] = (seen[iid] ?? 0) + 1;
  };
  for (const sd of s.sides) {
    sd.deck.forEach(count);
    sd.hand.forEach(count);
    sd.discard.forEach(count);
    sd.vault.forEach(count);
    sd.aside.forEach(count);
    for (const m of sd.board) if (m !== null) count(m.iid);
    for (const t of sd.traps) if (t !== null) count(t.iid);
    if (sd.board.length !== g.BOARD_SLOTS || sd.traps.length !== g.TRAP_SLOTS) return 'zone length';
  }
  const bad = seen.findIndex((n) => n !== 1);
  return bad < 0 ? null : `iid ${bad} appears ${seen[bad]} times`;
}

/** Choose by `picks`; after 60 actions in one turn, take the last legal action (endTurn / cancel) so walks end. */
function walk(seed: string, picks: readonly number[], check: (s: GameState, legal: Action[]) => void): GameState {
  let s = engine.newGame(seed).state;
  let turnActions = 0;
  let lastTurn = -1;
  for (let i = 0; i < MAX_STEPS && s.result === null; i++) {
    const legal = engine.getLegalActions(s);
    expect(legal.length).toBeGreaterThan(0); // the side to move is never stuck
    check(s, legal);
    if (s.turn !== lastTurn) {
      lastTurn = s.turn;
      turnActions = 0;
    }
    turnActions++;
    const pick = turnActions > 60 ? legal.length - 1 : (picks[i % picks.length] ?? 0) % legal.length;
    s = engine.applyAction(s, legal[pick] as Action).state;
  }
  return s;
}

const seeds = fc.nat({ max: 1_000_000 }).map((n) => rerollSeed(seedString(g, `2026-01-${n % 28}`), n % 5));
const picks = fc.array(fc.nat({ max: 1000 }), { minLength: 1, maxLength: 64 });

describe.each(GLOBAL_CASES)('random legal walks (§17) under %s', (_name, caseGlobals) => {
  beforeAll(() => {
    g = caseGlobals;
    engine = duelEngine(caseGlobals);
  });

  it('(1)(2)(3)(5) every chosen legal action applies, cards are conserved, the game ends within 2 x MAX_ROUNDS turns', () => {
    fc.assert(
      fc.property(seeds, picks, (seed, ps) => {
        const end = walk(seed, ps, (s) => {
          expect(conservation(s)).toBeNull();
          expect(s.turn).toBeLessThan(2 * g.MAX_ROUNDS);
          expect(s.collector.mood).toBe(moodOf(s.sides[1].life, g));
        });
        expect(end.result).not.toBeNull();
        expect(end.step).toBe('over');
        expect(conservation(end)).toBeNull();
      }),
      { numRuns: 40 },
    );
  });

  it('(1) every legal action applies without throwing, at every step of a walk', () => {
    fc.assert(
      fc.property(seeds, picks, (seed, ps) => {
        walk(seed, ps, (s, legal) => {
          for (const a of legal) engine.applyAction(s, a);
        });
      }),
      { numRuns: 6 },
    );
  });

  it('(4) replaying the logged actions hashes equal to the state', () => {
    fc.assert(
      fc.property(seeds, picks, fc.nat({ max: 120 }), (seed, ps, cut) => {
        let s = engine.newGame(seed).state;
        for (let i = 0; i < cut && s.result === null; i++) {
          const legal = engine.getLegalActions(s);
          s = engine.applyAction(s, legal[(ps[i % ps.length] ?? 0) % legal.length] as Action).state;
        }
        expect(hashState(engine.replay(seed, toActions(s)))).toBe(hashState(s));
      }),
      { numRuns: 40 },
    );
  });

  it('(7) isLegal agrees with membership in getLegalActions, including nearby illegal actions', () => {
    fc.assert(
      fc.property(seeds, picks, fc.nat({ max: 80 }), (seed, ps, cut) => {
        let s = engine.newGame(seed).state;
        for (let i = 0; i < cut && s.result === null; i++) {
          const legal = engine.getLegalActions(s);
          s = engine.applyAction(s, legal[(ps[i % ps.length] ?? 0) % legal.length] as Action).state;
        }
        const legal = engine.getLegalActions(s);
        expect(engine.countLegal(s)).toBe(legal.length);
        for (const a of legal) expect(engine.isLegal(s, a)).toBe(true);
        const probes: Action[] = [
          { t: 'endTurn' }, { t: 'keep' }, { t: 'redraw' }, { t: 'graftBegin' }, { t: 'graftCancel' }, { t: 'graftPosition', pos: 1 },
          ...[0, 1, 2, 5, 30, 44].flatMap((n): Action[] => [
            { t: 'summon', c: n, mode: 'atk' }, { t: 'summon', c: n, mode: 'down' }, { t: 'reposition', m: n },
            { t: 'setTrap', c: n }, { t: 'cast', c: n, target: -1 }, { t: 'attack', a: n, target: -1 }, { t: 'attack', a: n, target: 30 },
          ]),
        ];
        for (const p of probes) {
          const inList = legal.some((a) => JSON.stringify(a) === JSON.stringify(p));
          expect(engine.isLegal(s, p)).toBe(inList);
        }
      }),
      { numRuns: 40 },
    );
  });

  it('the same seed and picks give the same final hash (determinism) and a JSON-serializable state', () => {
    fc.assert(
      fc.property(seeds, picks, (seed, ps) => {
        const a = walk(seed, ps, () => undefined);
        const b = walk(seed, ps, () => undefined);
        expect(hashState(a)).toBe(hashState(b));
        expect(JSON.parse(JSON.stringify(a))).toEqual(a);
      }),
      { numRuns: 15 },
    );
  });

  it('the input state is never mutated by applyAction (dev freeze would throw; compare hashes anyway)', () => {
    fc.assert(
      fc.property(seeds, picks, (seed, ps) => {
        walk(seed, ps, (s, legal) => {
          const before = hashState(s);
          engine.applyAction(s, legal[(ps[0] ?? 0) % legal.length] as Action);
          expect(hashState(s)).toBe(before);
        });
      }),
      { numRuns: 5 },
    );
  });
});

// ---- (8) previewCombat equals the pipeline (D-209) ----------------------------------------------------------

const PREVIEW_ALT = withGlobals({ DECK_MIN_KINDS: 2, APPRAISAL_MIN_POWER: 5, ELEMENT_BONUS: 3, STAT_FLOOR: 1, ASCEND_POWER: 1, UNSTABLE_BONUS: 2 });
const TWIST = withGlobals({ DECK_MIN_KINDS: 2, APPRAISAL_MIN_POWER: 5, FLAGS: { WEEKLY_TWIST: true } });

interface PreviewCase {
  readonly name: string;
  readonly eng: EngineInternals;
  readonly opts: { readonly twist?: number };
}
const PREVIEW_CASES: readonly PreviewCase[] = [
  { name: 'TEST_GLOBALS', eng: duelEngine(), opts: {} },
  { name: 'alternate globals', eng: duelEngine(PREVIEW_ALT), opts: {} },
  { name: 'fixture twist', eng: duelEngine(TWIST, { dev: true }, DC_TWIST), opts: { twist: 0 } },
];

function checkAttackPreview(eng: EngineInternals, s: GameState, a: Extract<Action, { t: 'attack' }>): boolean {
  const aSide = (s.sides[0].board.some((m) => m?.iid === a.a) ? 0 : 1) as Side;
  const target = a.target;
  if (target >= 0) {
    const tm = s.sides[(1 - aSide) as Side].board.find((m) => m?.iid === target);
    if (tm === undefined || tm === null || tm.faceDown) return false;
  }
  const pv = eng.previewCombat(s, a.a, target);
  if (!pv.known) throw new Error('a face-up target must be known');
  const r = eng.applyAction(s, a);
  const ev: readonly GameEvent[] = r.events;
  if (ev.some((e) => e.e === 'AttackCancelled')) return false;
  const lifeDelta = (side: Side): number => s.sides[side].life - r.state.sides[side].life;
  if (target < 0) {
    // dealDamage emits nothing for an amount of 0, so compare the summed Damage amounts, not an event count
    const dealt = ev.reduce((n, e) => (e.e === 'Damage' ? n + e.amount : n), 0);
    expect(dealt).toBe(pv.outcome.dmgToDefender);
    expect(pv.direct).toBe(true);
    return true;
  }
  const cr = ev.find((e): e is Extract<GameEvent, { e: 'CombatResolved' }> => e.e === 'CombatResolved');
  if (cr === undefined) return false; // fizzled
  expect(pv.direct).toBe(false);
  expect({ aP: cr.aP, dStat: cr.dStat, advantage: cr.advantage, pierce: cr.pierce, brittle: cr.brittle }).toEqual({
    aP: pv.aP, dStat: pv.dStat, advantage: pv.advantage, pierce: pv.pierce, brittle: pv.brittle,
  });
  const destroyed = [...(pv.outcome.destroyAttacker ? [a.a] : []), ...(pv.outcome.destroyDefender ? [target] : [])];
  expect(cr.destroyed).toEqual(destroyed);
  const dmgOn = (side: Side): number =>
    ev.reduce((n, e) => (e.e === 'Damage' && e.side === side ? n + e.amount : n), 0);
  expect(dmgOn(aSide)).toBe(pv.outcome.dmgToAttacker);
  expect(dmgOn((1 - aSide) as Side)).toBe(pv.outcome.dmgToDefender);
  expect(lifeDelta(aSide)).toBe(pv.outcome.dmgToAttacker); // no healing in these fixtures' combat triggers
  expect(lifeDelta((1 - aSide) as Side)).toBe(pv.outcome.dmgToDefender);
  return true;
}

describe('(8) previewCombat equals CombatResolved and Damage (D-209)', () => {
  it('regression: a 0-Power direct attack emits no Damage event (fixture twist)', () => {
    const pc = PREVIEW_CASES[2] as PreviewCase;
    const ps = [637, 269, 92, 105, 982, 0, 871, 0, 505, 529, 898];
    let s = pc.eng.newGame('vault-duel:2026-01-26:0.0.0-fixture#4', pc.opts).state;
    for (let i = 0; i < MAX_STEPS && s.result === null; i++) {
      const legal = pc.eng.getLegalActions(s);
      if (s.sides.every((sd) => sd.traps.every((t) => t === null))) {
        for (const a of legal) if (a.t === 'attack') checkAttackPreview(pc.eng, s, a);
      }
      s = pc.eng.applyAction(s, legal[(ps[i % ps.length] ?? 0) % legal.length] as Action).state;
    }
  });
  for (const pc of PREVIEW_CASES) {
    it(`under ${pc.name}`, () => {
      let checked = 0;
      fc.assert(
        fc.property(seeds, picks, (seed, ps) => {
          let s = pc.eng.newGame(seed, pc.opts).state;
          for (let i = 0; i < MAX_STEPS && s.result === null; i++) {
            const legal = pc.eng.getLegalActions(s);
            const trapFree = s.sides.every((sd) => sd.traps.every((t) => t === null));
            if (trapFree) {
              for (const a of legal) if (a.t === 'attack' && checkAttackPreview(pc.eng, s, a)) checked++;
            }
            s = pc.eng.applyAction(s, legal[(ps[i % ps.length] ?? 0) % legal.length] as Action).state;
          }
        }),
        { numRuns: 25 },
      );
      expect(checked).toBeGreaterThan(20); // the walks do reach attacks
    });
  }
});

// ---- (9) redaction hides exactly the hidden information (D-209) ----------------------------------------------

/** The same state with every hidden zone of both sides perturbed (deck and hand reordered, trap `set` turns changed). */
function perturbHidden(s: GameState): GameState {
  const sides = s.sides.map((sd) => ({
    ...sd,
    deck: [...sd.deck].reverse(),
    hand: [...sd.hand].reverse(),
    traps: sd.traps.map((t) => (t === null ? null : { ...t, set: t.set + 7 })),
  }));
  return { ...s, sides: [sides[0], sides[1]] as unknown as GameState['sides'], log: null };
}

describe.each(GLOBAL_CASES)('(9) redactState under %s', (_name, caseGlobals) => {
  beforeAll(() => {
    g = caseGlobals;
    engine = duelEngine(caseGlobals);
  });

  it('states that differ only in hidden information hash equal after redaction, for either viewer', () => {
    fc.assert(
      fc.property(seeds, picks, fc.nat({ max: 150 }), (seed, ps, cut) => {
        let s = engine.newGame(seed).state;
        for (let i = 0; i < cut && s.result === null; i++) {
          const legal = engine.getLegalActions(s);
          s = engine.applyAction(s, legal[(ps[i % ps.length] ?? 0) % legal.length] as Action).state;
        }
        const t = perturbHidden(s);
        for (const v of [0, 1] as const) {
          // the viewer's own hand and traps are visible to him, so only the opponent's are perturbed
          const sv = redactState(s, v);
          const own = { ...t, sides: v === 0 ? [s.sides[0], t.sides[1]] : [t.sides[0], s.sides[1]] } as GameState;
          expect(hashState(redactState(own, v))).toBe(hashState(sv));
        }
      }),
      { numRuns: 40 },
    );
  });
  it('visible information still changes the hash', () => {
    const s = engine.newGame('vault-duel:2026-01-05').state;
    const hurt: GameState = { ...s, sides: [{ ...s.sides[0], life: s.sides[0].life - 1 }, s.sides[1]] };
    expect(hashState(redactState(hurt, 0))).not.toBe(hashState(redactState(s, 0)));
  });
});
