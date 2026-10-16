// Random legal play with the new rules on (D-280..D-284): never throws, always ends, cards are conserved, and a replay of
// the logged actions hashes equal. Mirrors properties.test.ts; fixture content and globals only (D-168).
import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { duelEngine, DUEL_GLOBALS } from '../test-utils/duel-fixture';
import { withGlobals } from '../test-utils/globals';
import { hashState, toActions } from './replay';
import { rerollSeed, seedString } from './setup/seed';
import type { Action } from './types/actions';
import type { Globals } from './types/globals';
import type { GameState, Iid } from './types/state';

const base = { DECK_MIN_KINDS: 2, APPRAISAL_MIN_POWER: 5 };
const CONFIGS: readonly (readonly [string, Globals])[] = [
  ['LANES + monstersOnly', withGlobals({ ...base, SICKNESS_MODE: 'monstersOnly', FLAGS: { LANES: true } })],
  ['LANES only', withGlobals({ ...base, FLAGS: { LANES: true } })],
  ['monstersOnly only', withGlobals({ ...base, SICKNESS_MODE: 'monstersOnly' })],
  [
    'LANES, no swap, reach 0, move range 2',
    withGlobals({ ...base, SENTINEL_REACH: 0, LANE_MOVE_RANGE: 2, SICKNESS_MODE: 'monstersOnly', FLAGS: { LANES: true, LANE_SWAP: false } }),
  ],
];

function conserved(s: GameState): boolean {
  const seen = new Array<number>(s.inst.length).fill(0);
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
  }
  return seen.every((n) => n === 1);
}

const seeds = fc.nat({ max: 1_000_000 }).map((n) => rerollSeed(seedString(DUEL_GLOBALS, `2026-02-${n % 28}`), n % 5));
const picks = fc.array(fc.nat({ max: 1000 }), { minLength: 1, maxLength: 64 });

describe.each(CONFIGS)('random legal walks, %s', (_name, g) => {
  const engine = duelEngine(g);
  let moves = 0;

  it('never throws, always ends, conserves cards, keeps lane legality consistent, and replays to the same hash', () => {
    fc.assert(
      fc.property(seeds, picks, (seed, ps) => {
        let s = engine.newGame(seed).state;
        let lastTurn = -1;
        let inTurn = 0;
        for (let i = 0; i < 4000 && s.result === null; i++) {
          const legal = engine.getLegalActions(s);
          expect(legal.length).toBeGreaterThan(0);
          for (const a of legal) {
            if (a.t === 'summon' || a.t === 'summonCovetous') expect(a.lane !== undefined).toBe(g.FLAGS.LANES);
            if (a.t === 'moveLane') expect(g.FLAGS.LANES).toBe(true);
            if (a.t === 'attack' && g.FLAGS.LANES && a.target >= 0) {
              const at = (s.sides[s.turn & 1] as GameState['sides'][0]).board.findIndex((m) => m?.iid === a.a);
              const row = (s.sides[1 - (s.turn & 1)] as GameState['sides'][0]).board;
              const lane = row.findIndex((m) => m?.iid === a.target);
              // the target is across, or a Sentinel within reach of the attacker's lane
              expect(Math.abs(lane - at)).toBeLessThanOrEqual(Math.max(0, g.SENTINEL_REACH));
            }
          }
          if (s.turn !== lastTurn) {
            lastTurn = s.turn;
            inTurn = 0;
          }
          inTurn++;
          const pick = inTurn > 60 ? legal.length - 1 : (ps[i % ps.length] ?? 0) % legal.length;
          const chosen = legal[pick] as Action;
          if (chosen.t === 'moveLane') moves++;
          s = engine.applyAction(s, chosen).state;
          expect(conserved(s)).toBe(true);
        }
        expect(s.result).not.toBeNull();
        expect(hashState(engine.replay(seed, toActions(s)))).toBe(hashState(s));
      }),
      { numRuns: 25 },
    );
    if (g.FLAGS.LANES) expect(moves).toBeGreaterThan(0); // the walk really exercises lane moves
  });

  it('every legal action applies without throwing (isLegal agrees)', () => {
    fc.assert(
      fc.property(seeds, picks, fc.nat({ max: 80 }), (seed, ps, cut) => {
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

describe('replay determinism with the new rules on', () => {
  it('the same seed and the same picks give identical logs and hashes, twice', () => {
    const g = CONFIGS[0]?.[1] as Globals;
    const engine = duelEngine(g);
    const play = (): GameState => {
      let s = engine.newGame('lanes-replay').state;
      for (let i = 0; i < 4000 && s.result === null; i++) {
        const legal = engine.getLegalActions(s);
        s = engine.applyAction(s, legal[(i * 7 + (i >> 2)) % legal.length] as Action).state;
      }
      return s;
    };
    const a = play();
    const b = play();
    expect(hashState(a)).toBe(hashState(b));
    expect(toActions(a)).toEqual(toActions(b));
    expect(hashState(engine.replay('lanes-replay', toActions(a)))).toBe(hashState(a));
    expect(toActions(a).some((x) => x.t === 'summon' && x.lane !== undefined)).toBe(true);
  });

  it('a lane-bearing log survives JSON round-trip', () => {
    const engine = duelEngine(CONFIGS[0]?.[1] as Globals);
    let s = engine.newGame('lanes-json').state;
    for (let i = 0; i < 60 && s.result === null; i++) {
      const legal = engine.getLegalActions(s);
      s = engine.applyAction(s, legal[i % legal.length] as Action).state;
    }
    const wire = JSON.parse(JSON.stringify(toActions(s))) as Action[];
    expect(hashState(engine.replay('lanes-json', wire))).toBe(hashState(s));
  });
});
