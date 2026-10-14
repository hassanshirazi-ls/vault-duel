// Property tests (ARCHITECTURE.md §17): random seeds x random legal-action walks.
import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { DUEL_GLOBALS, duelEngine } from '../test-utils/duel-fixture';
import { moodOf } from './mood';
import { hashState, toActions } from './replay';
import { rerollSeed, seedString } from './setup/seed';
import type { Action } from './types/actions';
import type { GameState, Iid } from './types/state';

const engine = duelEngine();
const g = DUEL_GLOBALS;
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

describe('random legal walks (§17)', () => {
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
