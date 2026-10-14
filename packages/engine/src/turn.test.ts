import fc from 'fast-check';
import { beforeEach, describe, expect, it } from 'vitest';
import { withGlobals } from '../test-utils/globals';
import { PC, pipeEnv, PENV, SPY } from '../test-utils/pipeline-fixture';
import { allCards, harness } from '../test-utils/run';
import { StateBuilder } from '../test-utils/state';
import { effectivePower } from './stats';
import { drawStep, endTurn, startTurn } from './turn';
import type { GameEvent } from './types/events';
import type { GameState, Iid, Side } from './types/state';

beforeEach(() => {
  SPY.length = 0;
});

const ev = <K extends GameEvent['e']>(events: readonly GameEvent[], k: K): Extract<GameEvent, { e: K }>[] =>
  events.filter((e): e is Extract<GameEvent, { e: K }> => e.e === k);

/** A state at `turn` where `side` holds `hand` cards in hand and `deck` in the deck (whelps). */
function drawing(side: Side, hand: number, deck: number, turn: number = side) {
  const b = new StateBuilder(PC).turn(turn);
  const h: Iid[] = [];
  const d: Iid[] = [];
  for (let i = 0; i < hand; i++) h.push(b.card('fx-ember-whelp', side));
  for (let i = 0; i < deck; i++) d.push(b.card('fx-ember-whelp', side));
  return { s: b.hand(side, ...h).deck(side, ...d).build(), h, d };
}

describe('draw step (D-011, D-013)', () => {
  it.each([
    // hand, deck, expected drawn
    [3, 10, 2],
    [4, 10, 1],
    [5, 10, 0],
    [7, 10, 0],
    [0, 10, 2],
    [3, 1, 1],
    [3, 0, 0],
  ])('hand %i, deck %i draws %i', (hand, deck, drawn) => {
    const { s, d } = drawing(0, hand, deck);
    const h = harness(s, PENV);
    drawStep(h.run, 0);
    const n = h.done();
    expect(n.sides[0].hand.length).toBe(hand + drawn);
    expect(n.sides[0].deck.length).toBe(deck - drawn);
    expect(n.sides[0].hand.slice(hand)).toEqual(d.slice(0, drawn)); // top of the deck = index 0, appended in draw order (D-107)
    expect(ev(h.events, 'CardDrawn').map((e) => e.iid)).toEqual(d.slice(0, drawn));
    expect(ev(h.events, 'CardDrawn').every((e) => !e.byEffect)).toBe(true);
  });
  it('emits DrawSkipped(handFull) when the hand is full and DrawSkipped(deckEmpty) when the deck runs short', () => {
    const full = drawing(0, 5, 10);
    const h = harness(full.s, PENV);
    drawStep(h.run, 0);
    expect(ev(h.events, 'DrawSkipped')).toEqual([{ e: 'DrawSkipped', side: 0, reason: 'handFull' }]);
    const short = drawing(0, 3, 1);
    const h2 = harness(short.s, PENV);
    drawStep(h2.run, 0);
    expect(ev(h2.events, 'DrawSkipped')).toEqual([{ e: 'DrawSkipped', side: 0, reason: 'deckEmpty' }]);
    const none = drawing(0, 0, 2);
    const h3 = harness(none.s, PENV);
    drawStep(h3.run, 0);
    expect(ev(h3.events, 'DrawSkipped')).toEqual([]);
  });
  it('draw limits are globals', () => {
    const env = pipeEnv(withGlobals({ MAX_DRAW_PER_TURN: 4, HAND_SIZE: 6 }));
    const { s } = drawing(0, 3, 10);
    const h = harness(s, env);
    drawStep(h.run, 0);
    expect(h.done().sides[0].hand).toHaveLength(6 - 0); // min(4, 6-3=3) = 3 more
  });
  it('a deck-less side draws nothing and never loses (D-013)', () => {
    const { s } = drawing(1, 2, 0, 1);
    const h = harness(s, PENV);
    drawStep(h.run, 1);
    expect(h.done().result).toBeNull();
  });
});

describe('startTurn (§5.2, D-016)', () => {
  it('emits TurnStarted, draws, resets the step and the play', () => {
    const b = new StateBuilder(PC).turn(2).step('attack');
    const hand = b.card('fx-ember-whelp', 0);
    const top = b.card('fx-umbra-beast', 0);
    const s = b.hand(0, hand).deck(0, top).build();
    const h = harness({ ...s, played: true }, PENV);
    startTurn(h.run);
    const n = h.done();
    expect(h.events[0]).toEqual({ e: 'TurnStarted', turn: 2, round: 2, side: 0 });
    expect(n.sides[0].hand).toEqual([hand, top]);
    expect(n.step).toBe('main');
    expect(n.played).toBe(false);
  });

  it('round 1 draws nothing from a full hand (D-012)', () => {
    const { s } = drawing(0, 5, 19, 0);
    const h = harness(s, PENV);
    startTurn(h.run);
    expect(ev(h.events, 'CardDrawn')).toEqual([]);
  });

  it('Shroud expires lazily at the start of the active side\'s turn: event, no state write', () => {
    const b = new StateBuilder(PC).turn(2);
    const a = b.card('fx-ember-whelp', 0);
    const c = b.card('fx-ember-whelp', 0);
    const d = b.card('fx-ember-whelp', 0);
    const foe = b.card('fx-ember-whelp', 1);
    const s = b
      .place(0, 0, a, { shroudUntil: 2 })
      .place(0, 1, c, { shroudUntil: 4 })
      .place(0, 2, d, { shroudUntil: 3 })
      .place(1, 0, foe, { shroudUntil: 2 })
      .build();
    const h = harness(s, PENV);
    startTurn(h.run);
    expect(ev(h.events, 'ShroudExpired')).toEqual([{ e: 'ShroudExpired', iid: a }]);
    expect(h.done().sides[0].board).toEqual(s.sides[0].board);
  });

  it('dispatches onTurnStart in §8.3.1 order, before the draw', () => {
    const b = new StateBuilder(PC).turn(2);
    const mine = b.card('fx-spy-card', 0);
    const theirs = b.card('fx-spy-card', 1);
    const s = b.place(0, 0, mine).place(1, 0, theirs).deck(0, b.card('fx-ember-whelp', 0)).build();
    const h = harness(s, PENV);
    startTurn(h.run);
    expect(SPY).toEqual([`onTurnStart@${mine}`, `onTurnStart@${theirs}`]);
    const names = h.events.map((e) => e.e);
    expect(names.indexOf('TurnStarted')).toBeLessThan(names.indexOf('CardDrawn'));
  });

  describe('Appraisal call (D-075)', () => {
    const attempts = (turn: number, env = PENV): GameEvent[] => {
      const { s } = drawing((turn & 1) as Side, 2, 5, turn);
      const h = harness(s, env);
      startTurn(h.run);
      return h.events;
    };
    const rounds = (turn: number, env = PENV): number[] =>
      ev(attempts(turn, env), 'AppraisalAttempt').map((e) => e.round);
    it('only at the start of a Collector turn in APPRAISAL_ROUNDS (3, 6, 9), before his draw', () => {
      for (const t of [4, 10, 16]) expect(rounds(t)).toEqual([]); // the player's turns of those rounds
      for (const t of [1, 3, 7, 9, 23]) expect(rounds(t)).toEqual([]); // Collector turns of other rounds
      expect([5, 11, 17].map((t) => rounds(t))).toEqual([[3], [6], [9]]);
      const names = attempts(5).map((e) => e.e);
      expect(names.indexOf('AppraisalAttempt')).toBeLessThan(names.indexOf('CardDrawn'));
      expect(names.indexOf('TurnStarted')).toBeLessThan(names.indexOf('AppraisalAttempt'));
    });
    it('respects FLAGS.APPRAISAL and APPRAISAL_ROUNDS being globals', () => {
      expect(rounds(5, pipeEnv(withGlobals({ FLAGS: { APPRAISAL: false } })))).toEqual([]);
      expect(rounds(7, pipeEnv(withGlobals({ APPRAISAL_ROUNDS: [4] })))).toEqual([4]);
    });
    it('with no eligible monster the step fails and the turn goes on', () => {
      const { s } = drawing(1, 2, 5, 5);
      const h = harness(s, PENV);
      startTurn(h.run);
      expect(ev(h.events, 'AppraisalFailed')).toHaveLength(1);
    });
  });

  describe('intent (D-016 step 4, D-095, D-096)', () => {
    it('is computed on player turns only, after the draw, and stored with IntentSet', () => {
      const seen: number[] = [];
      const { s } = drawing(0, 3, 5, 2);
      const h = harness(s, PENV, {
        intent: (st) => {
          seen.push(st.sides[0].hand.length);
          return 'guard';
        },
      });
      startTurn(h.run);
      expect(seen).toEqual([5]); // the policy ran after the player's draw
      expect(h.done().collector.intent).toBe('guard');
      expect(ev(h.events, 'IntentSet')).toEqual([{ e: 'IntentSet', intent: 'guard' }]);
    });
    it('is not recomputed on Collector turns, and respects FLAGS.INTENTS', () => {
      const policy = (): 'attack' => 'attack';
      const col = drawing(1, 2, 5, 3);
      const h = harness(col.s, PENV, { intent: policy });
      startTurn(h.run);
      expect(h.done().collector.intent).toBeNull();
      const off = harness(drawing(0, 2, 5, 2).s, pipeEnv(withGlobals({ FLAGS: { INTENTS: false } })), { intent: policy });
      startTurn(off.run);
      expect(off.done().collector.intent).toBeNull();
    });
  });
});

describe('endTurn (§5.3, D-017)', () => {
  it('onTurnEnd hooks, then TurnEnded, then the other side\'s turn starts', () => {
    const b = new StateBuilder(PC).turn(2);
    const mine = b.card('fx-spy-card', 0);
    const theirs = b.card('fx-spy-card', 1);
    const s = b.place(0, 0, mine).place(1, 0, theirs).deck(1, b.card('fx-ember-whelp', 1)).build();
    const h = harness(s, PENV);
    endTurn(h.run);
    const n = h.done();
    expect(SPY).toEqual([`onTurnEnd@${mine}`, `onTurnEnd@${theirs}`, `onTurnStart@${theirs}`, `onTurnStart@${mine}`]);
    expect(h.events.map((e) => e.e)).toEqual(['TurnEnded', 'TurnStarted', 'CardDrawn', 'DrawSkipped']);
    expect(h.events[0]).toEqual({ e: 'TurnEnded', turn: 2 });
    expect(h.events[1]).toEqual({ e: 'TurnStarted', turn: 3, round: 2, side: 1 });
    expect(n.turn).toBe(3);
    expect(n.step).toBe('main');
    expect(n.played).toBe(false);
  });

  describe('Unstable expiry (D-017, D-062)', () => {
    it('destroys every monster due this turn on both boards, active side first, in slot order (cause unstable, no destroyer)', () => {
      const b = new StateBuilder(PC).turn(2);
      const p0 = b.card('fx-ember-whelp', 0);
      const p1 = b.card('fx-ember-whelp', 0);
      const p2 = b.card('fx-ember-whelp', 0);
      const c0 = b.card('fx-ember-whelp', 1);
      const c1 = b.card('fx-ember-whelp', 1);
      const s = b
        .place(0, 0, p0, { unstableUntil: 4 }) // a later turn: stays
        .place(0, 1, p1, { unstableUntil: 2 })
        .place(0, 2, p2, { unstableUntil: 2 })
        .place(1, 0, c0, { unstableUntil: 2 }) // it is the Collector\'s monster but "due" by absolute index (D-062)
        .place(1, 1, c1)
        .build();
      const h = harness(s, PENV);
      endTurn(h.run);
      const n = h.done();
      expect(ev(h.events, 'UnstableExpired').map((e) => e.iid)).toEqual([p1, p2, c0]);
      expect(ev(h.events, 'Destroyed')).toEqual([
        { e: 'Destroyed', iid: p1, side: 0, cause: 'unstable', by: -1 },
        { e: 'Destroyed', iid: p2, side: 0, cause: 'unstable', by: -1 },
        { e: 'Destroyed', iid: c0, side: 1, cause: 'unstable', by: -1 },
      ]);
      expect(n.sides[0].board.map((m) => m?.iid ?? null)).toEqual([p0, null, null]);
      expect(n.sides[1].board.map((m) => m?.iid ?? null)).toEqual([null, c1, null]);
      expect(n.sides[0].discard).toEqual([p1, p2]);
      expect(n.track.round[1]).toBe(4); // RoundFlag.LostMonster in round 2
      const names = h.events.map((e) => e.e);
      expect(names.indexOf('Destroyed')).toBeLessThan(names.indexOf('TurnEnded'));
    });
    it('is a real destruction: Echo returns the Chimera-like monster to hand', () => {
      const b = new StateBuilder(PC).turn(2);
      const moth = b.card('fx-echo-moth', 0);
      const h = harness(b.place(0, 0, moth, { unstableUntil: 2 }).build(), PENV);
      endTurn(h.run);
      expect(h.done().sides[0].hand).toEqual([moth]);
    });
    it('Ward replaces the expiry destruction (D-044): the monster survives with Ward spent', () => {
      const b = new StateBuilder(PC).turn(2);
      const ox = b.card('fx-warded-ox', 0);
      const h = harness(b.place(0, 0, ox, { unstableUntil: 2 }).build(), PENV);
      endTurn(h.run);
      const n = h.done();
      expect(n.sides[0].board[0]).toMatchObject({ iid: ox, wardUsed: true });
      expect(ev(h.events, 'WardBroken')).toHaveLength(1);
      expect(ev(h.events, 'Destroyed')).toEqual([]);
    });
    it('D-152 (A): a Ward-saved Unstable Chimera loses the bonus, stays, and is never re-checked', () => {
      const b = new StateBuilder(PC).turn(2);
      const ox = b.card('fx-warded-ox', 0, { element: 0, kw: 0, ascended: false, materials: [] });
      const h = harness(b.place(0, 0, ox, { unstableUntil: 2 }).build(), PENV);
      expect(effectivePower(h.tx.state, PENV, ox)).toBe(4 + PENV.g.UNSTABLE_BONUS);
      endTurn(h.run);
      const names = h.events.map((e) => e.e).filter((e) => e === 'UnstableExpired' || e === 'WardBroken' || e === 'Destroyed');
      expect(names).toEqual(['UnstableExpired', 'WardBroken']);
      const n = h.done();
      expect(n.sides[0].board[0]).toMatchObject({ iid: ox, wardUsed: true, unstableUntil: -1 });
      expect(effectivePower(n, PENV, ox)).toBe(4); // back to base
      // later turn ends: not due, not destroyed
      let cur = n;
      for (let i = 0; i < 4; i++) {
        const h2 = harness(cur, PENV);
        endTurn(h2.run);
        expect(ev(h2.events, 'UnstableExpired')).toEqual([]);
        expect(ev(h2.events, 'Destroyed')).toEqual([]);
        cur = h2.done();
      }
      expect(cur.sides[0].board[0]?.iid).toBe(ox);
    });
    it('Haunt fizzles: expiry has no destroyer (D-045)', () => {
      const b = new StateBuilder(PC).turn(2);
      const shade = b.card('fx-haunt-shade', 0);
      const other = b.card('fx-ember-whelp', 1);
      const h = harness(b.place(0, 0, shade, { unstableUntil: 2 }).place(1, 0, other).build(), PENV);
      endTurn(h.run);
      expect(h.done().sides[1].board[0]?.permP).toBe(0);
    });
  });

  it('ModifierExpired for monsters whose last turn it is; no state cleanup (D-031)', () => {
    const b = new StateBuilder(PC).turn(2);
    const a = b.card('fx-ember-whelp', 0);
    const c = b.card('fx-ember-whelp', 0);
    const foe = b.card('fx-ember-whelp', 1);
    const s = b
      .place(0, 0, a, { timed: [{ p: 3, g: 0, until: 2 }] })
      .place(0, 1, c, { timed: [{ p: 2, g: 2, until: 4 }] })
      .place(1, 0, foe, { timed: [{ p: 1, g: 0, until: 2 }] })
      .build();
    const h = harness(s, PENV);
    endTurn(h.run);
    expect(ev(h.events, 'ModifierExpired').map((e) => e.iid)).toEqual([a, foe]);
    expect(h.done().sides[0].board[0]?.timed).toEqual([{ p: 3, g: 0, until: 2 }]);
  });

  describe('round-12 seal (D-017)', () => {
    it('after the Collector\'s turn in round 12 with no winner the vault seals and the player loses', () => {
      const b = new StateBuilder(PC).turn(23);
      const s = b.deck(0, b.card('fx-ember-whelp', 0)).build();
      const h = harness(s, PENV);
      endTurn(h.run);
      const n = h.done();
      expect(n.result).toEqual({ winner: 1, reason: 'vaultSealed', round: 12 });
      expect(n.step).toBe('over');
      expect(n.turn).toBe(23);
      expect(h.events.map((e) => e.e)).toEqual(['TurnEnded', 'VaultSealed', 'GameOver']);
      expect(n.sides[0].deck).toHaveLength(1); // no new turn started: nobody drew
    });
    it('the player\'s round-12 turn (t = 22) just passes the turn', () => {
      const h = harness(new StateBuilder(PC).turn(22).build(), PENV);
      endTurn(h.run);
      const n = h.done();
      expect(n.result).toBeNull();
      expect(n.turn).toBe(23);
      expect(n.step).toBe('main');
    });
    it('MAX_ROUNDS is a global', () => {
      const env = pipeEnv(withGlobals({ MAX_ROUNDS: 3 }));
      const h = harness(new StateBuilder(PC).turn(5).build(), env);
      endTurn(h.run);
      expect(h.done().result).toEqual({ winner: 1, reason: 'vaultSealed', round: 3 });
      const h2 = harness(new StateBuilder(PC).turn(4).build(), env);
      endTurn(h2.run);
      expect(h2.done().result).toBeNull();
    });
    it('a winner decided in the last end step is not overwritten by the seal', () => {
      const b = new StateBuilder(PC).turn(23);
      const bomb = b.card('fx-bomb', 1); // Unstable expiry destroys it; it deals 99 to the player
      const h = harness(b.place(1, 0, bomb, { unstableUntil: 23 }).build(), PENV);
      endTurn(h.run);
      const n = h.done();
      expect(n.result?.reason).toBe('playerDefeated');
      expect(ev(h.events, 'VaultSealed')).toEqual([]);
      expect(ev(h.events, 'TurnEnded')).toEqual([]); // the game ended mid end step
    });
    it('a Collector defeated at the last moment still means a player win', () => {
      const b = new StateBuilder(PC).turn(22).life(1, 1);
      const bomb = b.card('fx-bomb', 0); // the player's bomb: its death deals 99 to the Collector
      const h = harness(b.place(0, 0, bomb, { unstableUntil: 22 }).build(), PENV);
      endTurn(h.run);
      expect(h.done().result).toEqual({ winner: 0, reason: 'collectorDefeated', round: 12 });
    });
  });

  it('is atomic: the input state is never written', () => {
    const b = new StateBuilder(PC).turn(2);
    const a = b.card('fx-ember-whelp', 0);
    const s = b.place(0, 0, a, { unstableUntil: 2 }).build(); // deep-frozen by the builder
    const h = harness(s, PENV);
    expect(() => endTurn(h.run)).not.toThrow();
    expect(s.turn).toBe(2);
    expect(s.sides[0].board[0]?.iid).toBe(a);
  });
});

describe('a whole duel of endTurns (property)', () => {
  it('turns advance by one, cards are conserved, hands never exceed what the draw rule allows, and the game seals at 24 turns', () => {
    fc.assert(
      fc.property(fc.integer({ min: 0, max: 24 }), fc.integer({ min: 0, max: 10 }), fc.integer({ min: 0, max: 8 }), (deckSize, handSize, start) => {
        const b = new StateBuilder(PC).turn(start);
        for (const side of [0, 1] as const) {
          for (let i = 0; i < deckSize; i++) b.deck(side, b.card('fx-ember-whelp', side));
          for (let i = 0; i < handSize; i++) b.hand(side, b.card('fx-ember-whelp', side));
        }
        let s: GameState = b.build();
        const before = allCards(s);
        let turns = 0;
        while (s.result === null) {
          const h = harness(s, PENV);
          const hands = [s.sides[0].hand.length, s.sides[1].hand.length];
          endTurn(h.run);
          const n = h.done();
          expect(allCards(n)).toEqual(before);
          if (n.result === null) {
            expect(n.turn).toBe(s.turn + 1);
            const side = n.turn & 1;
            const grew = n.sides[side as Side].hand.length - (hands[side] as number);
            expect(grew).toBeGreaterThanOrEqual(0);
            expect(grew).toBeLessThanOrEqual(2);
            expect(grew).toBeLessThanOrEqual(Math.max(0, 5 - (hands[side] as number)));
          }
          s = n;
          turns++;
          expect(turns).toBeLessThanOrEqual(24);
        }
        expect(s.turn).toBe(23);
        expect(s.result).toMatchObject({ reason: 'vaultSealed' });
      }),
      { numRuns: 60 },
    );
  });
});
