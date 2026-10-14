import { describe, expect, it } from 'vitest';
import { FX, fxEnv } from '../../test-utils/fixture';
import { withGlobals } from '../../test-utils/globals';
import { StateBuilder } from '../../test-utils/state';
import { EngineError } from '../errors';
import { Tx } from '../tx';
import type { Effect } from '../types/effects';
import type { GameEvent } from '../types/events';
import type { GameState, Iid, Side } from '../types/state';
import { EffectQueue, nextOwnTurn, runEffect } from './run';
import type { EffectHost, QueuedEffect } from './run';
import { makeRefs } from './targets';

const env = fxEnv();

interface Rec {
  host: EffectHost;
  events: GameEvent[];
  destroyed: { iids: readonly Iid[]; by: Iid | -1 }[];
  life: number;
}
function recHost(): Rec {
  const rec: Rec = {
    events: [],
    destroyed: [],
    life: 0,
    host: {
      emit: (ev) => rec.events.push(ev),
      destroy: (iids, by) => rec.destroyed.push({ iids, by }),
      lifeChanged: () => {
        rec.life++;
      },
    },
  };
  return rec;
}

const q = (effect: Effect, side: Side = 0, refs = makeRefs({}), source: Iid = 0): QueuedEffect => ({ effect, refs, side, source });

function run(s: GameState, qe: QueuedEffect, e = env): { next: GameState; rec: Rec } {
  const tx = new Tx(s);
  const rec = recHost();
  runEffect(tx, e, qe, rec.host);
  return { next: tx.commit(), rec };
}

describe('nextOwnTurn (D-069)', () => {
  it('is turn+2 on the controller\'s turn and turn+1 on the opponent\'s', () => {
    const s = new StateBuilder(FX).turn(2).build();
    expect(nextOwnTurn(s, env, 0)).toBe(4);
    expect(nextOwnTurn(s, env, 1)).toBe(3);
  });
});

describe('draw', () => {
  it('draws n ignoring the draw cap and hand size, emitting CardDrawn(byEffect)', () => {
    const b = new StateBuilder(FX);
    const cards = [1, 2, 3, 4, 5, 6, 7].map(() => b.card('fx-ember-whelp', 0));
    b.hand(0, cards[0] as number, cards[1] as number, cards[2] as number, cards[3] as number, cards[4] as number);
    b.deck(0, cards[5] as number, cards[6] as number);
    const s = b.build();
    const { next, rec } = run(s, q({ op: 'draw', who: 'self', n: '$SCRYING_DRAW' }));
    expect(next.sides[0].hand).toHaveLength(7);
    expect(next.sides[0].deck).toEqual([]);
    expect(rec.events).toEqual([
      { e: 'CardDrawn', side: 0, iid: cards[5], byEffect: true },
      { e: 'CardDrawn', side: 0, iid: cards[6], byEffect: true },
    ]);
    expect(s.sides[0].hand).toHaveLength(5);
  });
  it('emits DrawSkipped when the deck runs out; opponent targets the other side', () => {
    const b = new StateBuilder(FX);
    const c = b.card('fx-ember-whelp', 1);
    const s = b.deck(1, c).build();
    const { next, rec } = run(s, q({ op: 'draw', who: 'opponent', n: 3 }, 0));
    expect(next.sides[1].hand).toEqual([c]);
    expect(rec.events.at(-1)).toEqual({ e: 'DrawSkipped', side: 1, reason: 'deckEmpty' });
  });
  it('n <= 0 does nothing', () => {
    const s = new StateBuilder(FX).build();
    expect(run(s, q({ op: 'draw', who: 'self', n: 0 })).next).toBe(s);
  });
});

describe('damage / heal', () => {
  it('damage lowers life, emits Damage, notifies the host', () => {
    const s = new StateBuilder(FX).build();
    const { next, rec } = run(s, q({ op: 'damage', who: 'opponent', n: '$SIPHON_DRAIN' }, 0, makeRefs({}), 7));
    expect(next.sides[1].life).toBe(22);
    expect(rec.events).toEqual([{ e: 'Damage', side: 1, amount: 3, source: 7, lifeAfter: 22 }]);
    expect(rec.life).toBe(1);
  });
  it('heal has no life cap (D-019)', () => {
    const s = new StateBuilder(FX).build();
    const { next, rec } = run(s, q({ op: 'heal', who: 'self', n: 3 }, 0, makeRefs({}), 5));
    expect(next.sides[0].life).toBe(23);
    expect(rec.events).toEqual([{ e: 'LifeGained', side: 0, amount: 3, source: 5, lifeAfter: 23 }]);
  });
  it('damage may take life below zero (win check is the host\'s job)', () => {
    const s = new StateBuilder(FX).life(1, 2).build();
    expect(run(s, q({ op: 'damage', who: 'opponent', n: 5 })).next.sides[1].life).toBe(-3);
  });
});

describe('modifyStats', () => {
  function setup(turn = 2) {
    const b = new StateBuilder(FX).turn(turn);
    const m = b.card('fx-umbra-beast', 0);
    return { s: b.place(0, 1, m).build(), m };
  }
  it('permanent changes permP/permG; negative global refs work', () => {
    const { s, m } = setup();
    const { next, rec } = run(s, q({ op: 'modifyStats', target: 'chosen', power: '-$HAUNT_PENALTY', guard: 1, duration: 'permanent' }, 0, makeRefs({ chosen: m }), 9));
    const mon = next.sides[0].board[1];
    expect(mon?.permP).toBe(-2);
    expect(mon?.permG).toBe(1);
    expect(s.sides[0].board[1]?.permP).toBe(0);
    expect(rec.events).toEqual([{ e: 'StatsModified', iid: m, p: -2, g: 1, duration: 'permanent', source: 9 }]);
  });
  it('thisTurn expires after the current turn', () => {
    const { s, m } = setup(2);
    const { next } = run(s, q({ op: 'modifyStats', target: 'chosen', power: '$BLOODLUST_POWER', duration: 'thisTurn' }, 0, makeRefs({ chosen: m })));
    expect(next.sides[0].board[1]?.timed).toEqual([{ p: 3, g: 0, until: 2 }]);
  });
  it('untilEndOfYourNextTurn: turn+2 on own turn, turn+1 on the opponent\'s (D-069)', () => {
    const { s, m } = setup(2);
    const own = run(s, q({ op: 'modifyStats', target: 'chosen', power: 2, guard: 2, duration: 'untilEndOfYourNextTurn' }, 0, makeRefs({ chosen: m }))).next;
    expect(own.sides[0].board[1]?.timed[0]?.until).toBe(4);
    const { s: s3, m: m3 } = setup(3);
    const opp = run(s3, q({ op: 'modifyStats', target: 'chosen', power: 2, duration: 'untilEndOfYourNextTurn' }, 0, makeRefs({ chosen: m3 }))).next;
    expect(opp.sides[0].board[1]?.timed[0]?.until).toBe(4);
  });
  it('untilYourNextTurn lasts through the turn before the controller\'s next one', () => {
    const { s, m } = setup(2);
    const { next } = run(s, q({ op: 'modifyStats', target: 'chosen', power: 1, duration: 'untilYourNextTurn' }, 0, makeRefs({ chosen: m })));
    expect(next.sides[0].board[1]?.timed[0]?.until).toBe(3);
  });
  it('appends to existing timed mods without mutating them', () => {
    const b = new StateBuilder(FX).turn(2);
    const m = b.card('fx-umbra-beast', 0);
    const s = b.place(0, 0, m, { timed: [{ p: 1, g: 0, until: 2 }] }).build();
    const { next } = run(s, q({ op: 'modifyStats', target: 'chosen', power: 1, duration: 'thisTurn' }, 0, makeRefs({ chosen: m })));
    expect(next.sides[0].board[0]?.timed).toHaveLength(2);
    expect(s.sides[0].board[0]?.timed).toHaveLength(1);
  });
  it('fizzles when the target is not on a board or the ref is unbound', () => {
    const b = new StateBuilder(FX);
    const m = b.card('fx-umbra-beast', 0);
    const s = b.discard(0, m).build();
    expect(run(s, q({ op: 'modifyStats', target: 'chosen', power: 1, duration: 'permanent' }, 0, makeRefs({ chosen: m }))).next).toBe(s);
    expect(run(s, q({ op: 'modifyStats', target: 'destroyer', power: 1, duration: 'permanent' })).next).toBe(s);
  });
  it('does nothing for a zero change', () => {
    const { s, m } = setup();
    expect(run(s, q({ op: 'modifyStats', target: 'chosen', duration: 'permanent' }, 0, makeRefs({ chosen: m }))).next).toBe(s);
  });
});

describe('destroy', () => {
  it('hands the target to the host with no destroyer; fizzles off-board', () => {
    const b = new StateBuilder(FX);
    const m = b.card('fx-umbra-beast', 1);
    const gone = b.card('fx-umbra-beast', 1);
    const s = b.place(1, 0, m).build();
    const hit = run(s, q({ op: 'destroy', target: 'chosen' }, 0, makeRefs({ chosen: m })));
    expect(hit.rec.destroyed).toEqual([{ iids: [m], by: -1 }]);
    const miss = run(s, q({ op: 'destroy', target: 'chosen' }, 0, makeRefs({ chosen: gone })));
    expect(miss.rec.destroyed).toEqual([]);
  });
});

describe('returnToHand', () => {
  it('moves a discard card to its OWNER\'s hand (D-046)', () => {
    const b = new StateBuilder(FX);
    const m = b.card('fx-echo-moth', 0);
    const s = b.discard(0, m).build();
    const { next, rec } = run(s, q({ op: 'returnToHand', target: 'self' }, 1, makeRefs({ self: m }), m));
    expect(next.sides[0].hand).toEqual([m]);
    expect(next.sides[0].discard).toEqual([]);
    expect(rec.events).toEqual([{ e: 'ReturnedToHand', iid: m, side: 0, from: 'discard', source: m }]);
  });
  it('moves a board monster to its owner\'s hand and clears the slot', () => {
    const b = new StateBuilder(FX);
    const m = b.card('fx-ember-whelp', 0);
    const s = b.place(1, 2, m).build(); // controlled by side 1 (stolen)
    const { next, rec } = run(s, q({ op: 'returnToHand', target: 'chosen' }, 1, makeRefs({ chosen: m })));
    expect(next.sides[1].board[2]).toBeNull();
    expect(next.sides[0].hand).toEqual([m]);
    expect(rec.events[0]).toMatchObject({ e: 'ReturnedToHand', side: 0, from: 'board' });
  });
  it('a card in neither place fizzles', () => {
    const b = new StateBuilder(FX);
    const m = b.card('fx-ember-whelp', 0);
    const s = b.hand(0, m).build();
    expect(run(s, q({ op: 'returnToHand', target: 'chosen' }, 0, makeRefs({ chosen: m }))).next).toBe(s);
  });
  it('FLAGS.CHIMERA_TO_HAND=false keeps Chimeras in the discard (M-12)', () => {
    const b = new StateBuilder(FX);
    const ch = b.card('fx-family-hybrid', 0, { element: 0, kw: 0, ascended: false, materials: [] });
    const s = b.discard(0, ch).build();
    const off = fxEnv(withGlobals({ FLAGS: { CHIMERA_TO_HAND: false } }));
    expect(run(s, q({ op: 'returnToHand', target: 'chosen' }, 0, makeRefs({ chosen: ch })), off).next).toBe(s);
    expect(run(s, q({ op: 'returnToHand', target: 'chosen' }, 0, makeRefs({ chosen: ch }))).next.sides[0].hand).toEqual([ch]);
  });
});

describe('changePosition', () => {
  it('sets the position without touching `repositioned` (D-024)', () => {
    const b = new StateBuilder(FX).turn(2);
    const m = b.card('fx-ember-whelp', 1);
    const s = b.place(1, 0, m, { pos: 0, repositioned: 1 }).build();
    const { next, rec } = run(s, q({ op: 'changePosition', target: 'attacker', to: 'guard' }, 0, makeRefs({ attacker: m }), 3));
    expect(next.sides[1].board[0]?.pos).toBe(1);
    expect(next.sides[1].board[0]?.repositioned).toBe(1);
    expect(rec.events).toEqual([{ e: 'PositionChanged', iid: m, pos: 1, source: 3 }]);
  });
  it('is a no-op when already in that position, and fizzles on face-down monsters', () => {
    const b = new StateBuilder(FX);
    const m = b.card('fx-ember-whelp', 1);
    const h = b.card('fx-ember-whelp', 1);
    const s = b.place(1, 0, m, { pos: 1 }).place(1, 1, h, { pos: 1, faceDown: true }).build();
    expect(run(s, q({ op: 'changePosition', target: 'chosen', to: 'guard' }, 0, makeRefs({ chosen: m }))).next).toBe(s);
    expect(run(s, q({ op: 'changePosition', target: 'chosen', to: 'attack' }, 0, makeRefs({ chosen: h }))).next).toBe(s);
  });
});

describe('preventAppraisal', () => {
  it('shrouds until the controller\'s next turn starts', () => {
    const b = new StateBuilder(FX).turn(2);
    const m = b.card('fx-ember-whelp', 0);
    const s = b.place(0, 0, m).build();
    const { next, rec } = run(s, q({ op: 'preventAppraisal', target: 'chosen', duration: 'untilYourNextTurn' }, 0, makeRefs({ chosen: m })));
    expect(next.sides[0].board[0]?.shroudUntil).toBe(4);
    expect(rec.events).toEqual([{ e: 'ShroudApplied', iid: m, until: 4 }]);
  });
  it('never shortens an existing shroud', () => {
    const b = new StateBuilder(FX).turn(2);
    const m = b.card('fx-ember-whelp', 0);
    const s = b.place(0, 0, m, { shroudUntil: 9 }).build();
    const { next } = run(s, q({ op: 'preventAppraisal', target: 'chosen', duration: 'untilYourNextTurn' }, 0, makeRefs({ chosen: m })));
    expect(next.sides[0].board[0]?.shroudUntil).toBe(9);
  });
});

describe('Effect.if guards', () => {
  it('skips the effect when the guard fails on its target, runs it when it holds', () => {
    const b = new StateBuilder(FX);
    const m = b.card('fx-umbra-beast', 0); // P5
    const s = b.place(0, 0, m).build();
    const guarded = (lte: number): Effect => ({ op: 'modifyStats', target: 'chosen', power: 1, duration: 'permanent', if: { powerLte: lte } });
    expect(run(s, q(guarded(4), 0, makeRefs({ chosen: m }))).next).toBe(s);
    expect(run(s, q(guarded(5), 0, makeRefs({ chosen: m }))).next.sides[0].board[0]?.permP).toBe(1);
  });
  it('Haunt shape: onBoard guard fizzles when the destroyer left the board', () => {
    const b = new StateBuilder(FX);
    const d = b.card('fx-umbra-beast', 1);
    const s = b.discard(1, d).build();
    const e: Effect = { op: 'modifyStats', target: 'destroyer', power: '-$HAUNT_PENALTY', duration: 'permanent', if: { onBoard: true } };
    expect(run(s, q(e, 0, makeRefs({ destroyer: d }))).next).toBe(s);
  });
});

describe('cancelAttack', () => {
  it('is never run from the queue (D-122)', () => {
    const s = new StateBuilder(FX).build();
    expect(() => run(s, q({ op: 'cancelAttack' }))).toThrow(EngineError);
  });
});

describe('EffectQueue', () => {
  it('runs FIFO, including effects queued while draining', () => {
    const b = new StateBuilder(FX);
    const s = b.build();
    const tx = new Tx(s);
    const queue = new EffectQueue();
    const order: string[] = [];
    const host: EffectHost = {
      emit: (ev) => order.push(ev.e === 'Damage' ? `dmg${ev.amount}` : ev.e),
      destroy: () => undefined,
      lifeChanged: () => {
        if (order.length === 1) queue.queue(q({ op: 'damage', who: 'opponent', n: 3 })); // queued mid-drain
      },
    };
    queue.queue(q({ op: 'damage', who: 'opponent', n: 1 }));
    queue.queue(q({ op: 'damage', who: 'opponent', n: 2 }));
    queue.drain(tx, env, host);
    expect(order).toEqual(['dmg1', 'dmg2', 'dmg3']);
    expect(queue.length).toBe(0);
  });
  it('drops the rest once a result is set (§8.3.5)', () => {
    const s = new StateBuilder(FX).build();
    const tx = new Tx(s);
    const queue = new EffectQueue();
    let ran = 0;
    const host: EffectHost = {
      emit: () => undefined,
      destroy: () => undefined,
      lifeChanged: () => {
        ran++;
        tx.set('result', { winner: 0, reason: 'collectorDefeated', round: 1 });
      },
    };
    queue.queue(q({ op: 'damage', who: 'opponent', n: 1 }));
    queue.queue(q({ op: 'damage', who: 'opponent', n: 1 }));
    queue.drain(tx, env, host);
    expect(ran).toBe(1);
    expect(queue.length).toBe(0);
  });
  it('a chain longer than MAX_TRIGGER_CHAIN throws EngineError (§8.3.7)', () => {
    const s = new StateBuilder(FX).build();
    const tx = new Tx(s);
    const queue = new EffectQueue();
    const host: EffectHost = {
      emit: () => undefined,
      destroy: () => undefined,
      lifeChanged: () => queue.queue(q({ op: 'heal', who: 'self', n: 1 })), // each effect queues another
    };
    queue.queue(q({ op: 'heal', who: 'self', n: 1 }));
    expect(() => queue.drain(tx, env, host)).toThrow(EngineError);
    expect(queue.length).toBe(0);
  });
  it('the base state is untouched after a drain', () => {
    const s = new StateBuilder(FX).build();
    const tx = new Tx(s);
    const queue = new EffectQueue();
    queue.queue(q({ op: 'damage', who: 'opponent', n: 4 }));
    queue.drain(tx, env, recHost().host);
    expect(tx.commit().sides[1].life).toBe(21);
    expect(s.sides[1].life).toBe(25);
  });
});
