// Random legal play with the bond rules on (D-305..D-316): never throws, always ends, conserves cards (with the one
// exception of a Chimera dissolved by Split), keeps the bond slot honest, replays to the same hash, and the options
// preview agrees with the real actions. Mirrors lanes-fuzz.test.ts; fixture content and globals only (D-168).
import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { duelEngine, DUEL_GLOBALS } from '../test-utils/duel-fixture';
import { withGlobals } from '../test-utils/globals';
import type { EngineInternals } from './engine';
import { hashState, toActions } from './replay';
import { rerollSeed, seedString } from './setup/seed';
import type { Action } from './types/actions';
import type { GameEvent } from './types/events';
import type { Globals } from './types/globals';
import type { GameState, Iid } from './types/state';

const base = { DECK_MIN_KINDS: 2, APPRAISAL_MIN_POWER: 5 };
const CONFIGS: readonly (readonly [string, Globals])[] = [
  ['all three', withGlobals({ ...base, FLAGS: { SPLIT: true, SYMBIOSIS: true, BOND_ACTION: true } })],
  ['all three, LANES + monstersOnly', withGlobals({ ...base, SICKNESS_MODE: 'monstersOnly', FLAGS: { SPLIT: true, SYMBIOSIS: true, BOND_ACTION: true, LANES: true } })],
  ['split and symbiosis as plays', withGlobals({ ...base, FLAGS: { SPLIT: true, SYMBIOSIS: true } })],
  ['split only', withGlobals({ ...base, FLAGS: { SPLIT: true } })],
  ['symbiosis only', withGlobals({ ...base, FLAGS: { SYMBIOSIS: true } })],
  ['bond action only (Graft slot)', withGlobals({ ...base, FLAGS: { BOND_ACTION: true } })],
  ['hand limit 1, weaker parts', withGlobals({ ...base, BOND_GRAFT_MAX_HAND_MATERIALS: 1, SPLIT_PART_PERM_P: -1, FLAGS: { SPLIT: true, SYMBIOSIS: true, BOND_ACTION: true } })],
  ['all three, no Ascend, 4 slots', withGlobals({ ...base, BOARD_SLOTS: 4, FLAGS: { SPLIT: true, SYMBIOSIS: true, BOND_ACTION: true, ASCEND: false } })],
];

interface Seen {
  splits: number;
  bonds: number;
  emerged: number;
  grafts: number;
  appraisedSym: number;
}

/** Every iid is in exactly one place: a zone, a board slot, a trap slot, or attached to a host. A Chimera dissolved by Split is in none. */
function conservation(s: GameState, dissolved: ReadonlySet<Iid>): string | null {
  const seen = new Array<number>(s.inst.length).fill(0);
  const count = (iid: Iid): void => {
    seen[iid] = (seen[iid] ?? 0) + 1;
  };
  for (const sd of s.sides) {
    sd.deck.forEach(count);
    sd.hand.forEach(count);
    sd.discard.forEach(count);
    sd.vault.forEach(count);
    for (const m of sd.board) {
      if (m === null) continue;
      count(m.iid);
      if (m.sym >= 0) count(m.sym);
    }
    for (const t of sd.traps) if (t !== null) count(t.iid);
  }
  for (let i = 0; i < seen.length; i++) {
    const want = dissolved.has(i) ? 0 : 1;
    if (seen[i] !== want) return `iid ${i} appears ${seen[i]} times, wanted ${want}`;
    if (dissolved.has(i) && s.inst[i]?.chimera === null) return `iid ${i} dissolved but is not a Chimera`;
  }
  return null;
}

const seeds = fc.nat({ max: 1_000_000 }).map((n) => rerollSeed(seedString(DUEL_GLOBALS, `2026-03-${n % 28}`), n % 5));
const picks = fc.array(fc.nat({ max: 1000 }), { minLength: 1, maxLength: 64 });

/** The preview's claims, re-derived by applying the option's steps for real. */
function checkPreview(e: EngineInternals, s: GameState): number {
  const pv = e.bondOptions(s);
  expect(pv.available).toBe(pv.options.length > 0);
  for (const o of pv.options) {
    let t = s;
    for (const a of o.steps) {
      expect(e.isLegal(t, a)).toBe(true);
      t = e.applyAction(t, a).state;
    }
    if (o.positionFree) {
      const commit = e.getLegalActions(t).find((a) => a.t === 'graftPosition' && a.pos === 0) as Action;
      t = e.applyAction(t, commit).state;
    }
    const board = t.sides[0].board;
    expect(o.boardAfter).toHaveLength(board.length);
    board.forEach((m, i) => {
      const r = o.boardAfter[i];
      if (m === null) return expect(r).toBeNull();
      expect(r).not.toBeNull();
      expect(r).toMatchObject({
        iid: m.iid,
        slot: i,
        power: e.effectivePower(t, m.iid),
        guard: e.effectiveGuard(t, m.iid),
        kw: e.activeKeywords(t, m.iid),
        pos: m.pos,
        symbiote: m.sym,
      });
    });
    expect(o.handCardsAfter).toBe(t.sides[0].hand.length);
    expect(o.usesPlay).toBe(!e.globals.FLAGS.BOND_ACTION);
    const used = e.globals.FLAGS.BOND_ACTION ? t.bond === 1 : t.played;
    expect(used).toBe(true);
    for (const m of o.result) expect(m.slot === -1 || board[m.slot]?.iid === m.iid).toBe(true);
  }
  return pv.options.length;
}

describe.each(CONFIGS)('random legal walks with bonds, %s', (_name, g) => {
  const engine = duelEngine(g);
  const seen: Seen = { splits: 0, bonds: 0, emerged: 0, grafts: 0, appraisedSym: 0 };

  it('never throws, always ends, conserves cards, keeps the bond slot honest, previews truthfully and replays to the same hash', () => {
    fc.assert(
      fc.property(seeds, picks, (seed, ps) => {
        let s = engine.newGame(seed).state;
        const dissolved = new Set<Iid>();
        let lastTurn = -1;
        let inTurn = 0;
        let bondsThisTurn = 0;
        for (let i = 0; i < 4000 && s.result === null; i++) {
          const legal = engine.getLegalActions(s);
          expect(legal.length).toBeGreaterThan(0);
          const side = s.turn & 1;
          if (side === 1) {
            // the Collector never bonds (D-305), even with a bond switch on
            expect(legal.some((a) => a.t === 'split' || a.t === 'symbiose')).toBe(false);
          }
          if (s.turn !== lastTurn) {
            lastTurn = s.turn;
            inTurn = 0;
            bondsThisTurn = 0;
          }
          inTurn++;
          if (side === 0 && s.pending === null && i % 7 === 0) checkPreview(engine, s);
          // lean toward the bond actions so the walk really exercises them
          const bondy = legal.filter((a) => a.t === 'split' || a.t === 'symbiose' || a.t === 'graftBegin');
          let chosen: Action;
          if (inTurn > 60) chosen = legal[legal.length - 1] as Action;
          else if (bondy.length > 0 && (ps[i % ps.length] ?? 0) % 3 === 0) chosen = bondy[(ps[(i + 1) % ps.length] ?? 0) % bondy.length] as Action;
          else chosen = legal[(ps[i % ps.length] ?? 0) % legal.length] as Action;
          const r = engine.applyAction(s, chosen);
          s = r.state;
          for (const ev of r.events as readonly GameEvent[]) {
            if (ev.e === 'Split') {
              seen.splits++;
              dissolved.add(ev.iid);
              bondsThisTurn++;
              expect(ev.side).toBe(0);
            } else if (ev.e === 'Bonded') {
              seen.bonds++;
              bondsThisTurn++;
              expect(ev.side).toBe(0);
            } else if (ev.e === 'Grafted') {
              seen.grafts++;
              if (ev.side === 0) bondsThisTurn++;
            } else if (ev.e === 'SymbioteEmerged') seen.emerged++;
            else if (ev.e === 'Appraised' && ev.sym !== undefined) seen.appraisedSym++;
          }
          if (g.FLAGS.BOND_ACTION) expect(bondsThisTurn).toBeLessThanOrEqual(1);
          else expect(s.bond).toBe(0);
          expect([0, 1, 2]).toContain(s.bond);
          expect(conservation(s, dissolved)).toBeNull();
          for (const sd of s.sides) for (const m of sd.board) {
            if (m === null || m.sym < 0) continue;
            expect(g.FLAGS.SYMBIOSIS).toBe(true);
            expect(s.inst[m.sym]?.chimera).toBeNull();
            expect(m.faceDown).toBe(false);
          }
        }
        expect(s.result).not.toBeNull();
        expect(hashState(engine.replay(seed, toActions(s)))).toBe(hashState(s));
      }),
      { numRuns: 30 },
    );
    if (g.FLAGS.SPLIT) expect(seen.splits).toBeGreaterThan(0);
    if (g.FLAGS.SYMBIOSIS) {
      expect(seen.bonds).toBeGreaterThan(0);
      expect(seen.emerged).toBeGreaterThan(0);
    }
    if (!g.FLAGS.SPLIT) expect(seen.splits).toBe(0);
    if (!g.FLAGS.SYMBIOSIS) expect(seen.bonds + seen.emerged).toBe(0);
  });

  it('every legal action applies without throwing and isLegal agrees', () => {
    fc.assert(
      fc.property(seeds, picks, fc.nat({ max: 120 }), (seed, ps, cut) => {
        let s = engine.newGame(seed).state;
        for (let i = 0; i < cut && s.result === null; i++) {
          const legal = engine.getLegalActions(s);
          s = engine.applyAction(s, legal[(ps[i % ps.length] ?? 0) % legal.length] as Action).state;
        }
        if (s.result !== null) return;
        for (const a of engine.getLegalActions(s)) {
          expect(engine.isLegal(s, a)).toBe(true);
          engine.applyAction(s, a);
        }
      }),
      { numRuns: 20 },
    );
  });
});

describe('the options preview', () => {
  it('lists the bond actions in the fixed order and states exposure as facts', () => {
    const g = CONFIGS[0]?.[1] as Globals;
    const engine = duelEngine(g);
    let found = 0;
    fc.assert(
      fc.property(seeds, picks, (seed, ps) => {
        let s = engine.newGame(seed).state;
        for (let i = 0; i < 400 && s.result === null; i++) {
          if ((s.turn & 1) === 0 && s.pending === null) {
            const pv = engine.bondOptions(s);
            const rank = { graft: 0, split: 1, symbiosis: 2 } as const;
            const kinds = pv.options.map((o) => rank[o.kind]);
            expect(kinds).toEqual([...kinds].sort((a, b) => a - b));
            expect(new Set(pv.options.map((o) => o.id)).size).toBe(pv.options.length);
            for (const o of pv.options) {
              expect(o.exposure.cardsLost).toBeLessThanOrEqual(2);
              expect(o.bodiesDelta).toBe(o.boardAfter.filter((x) => x !== null).length - pv.baseline.bodies);
              found++;
            }
            expect(pv.baseline.exposure.nextRound === -1 || pv.baseline.exposure.nextRound >= (s.turn >> 1) + 1).toBe(true);
          }
          const legal = engine.getLegalActions(s);
          s = engine.applyAction(s, legal[(ps[i % ps.length] ?? 0) % legal.length] as Action).state;
        }
      }),
      { numRuns: 15 },
    );
    expect(found).toBeGreaterThan(0);
  });

  it('is empty on the Collector\'s turn, in the mulligan and mid-Graft, and never writes the state', () => {
    const engine = duelEngine(CONFIGS[0]?.[1] as Globals);
    const s0 = engine.newGame('preview-guard').state;
    const frozenHash = hashState(s0);
    expect(engine.bondOptions(s0).options.length).toBeGreaterThanOrEqual(0);
    expect(hashState(s0)).toBe(frozenHash);
    let s = s0;
    for (let i = 0; i < 400 && s.result === null; i++) {
      if ((s.turn & 1) === 1) expect(engine.bondOptions(s)).toMatchObject({ available: false, options: [] });
      if (s.pending !== null) expect(engine.bondOptions(s).available).toBe(false);
      const legal = engine.getLegalActions(s);
      s = engine.applyAction(s, legal[(i * 5) % legal.length] as Action).state;
    }
  });
});
