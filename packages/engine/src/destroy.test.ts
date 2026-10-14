import fc from 'fast-check';
import { beforeEach, describe, expect, it } from 'vitest';
import { allCards, harness } from '../test-utils/run';
import { PC, PENV, SPY } from '../test-utils/pipeline-fixture';
import { StateBuilder } from '../test-utils/state';
import { destroyBatch } from './destroy';
import { RoundFlag } from './types/state';
import type { GameEvent } from './types/events';
import type { GameState, Iid } from './types/state';

beforeEach(() => {
  SPY.length = 0;
});

const ev = <K extends GameEvent['e']>(events: readonly GameEvent[], k: K): Extract<GameEvent, { e: K }>[] =>
  events.filter((e): e is Extract<GameEvent, { e: K }> => e.e === k);

describe('destroyBatch: zone moves (§5.5, D-043, D-047)', () => {
  it('removes the monster from the board and puts it in its owner\'s discard', () => {
    const b = new StateBuilder(PC);
    const a = b.card('fx-ember-whelp', 0);
    const s = b.place(0, 1, a, { permP: 2, wardUsed: true }).build();
    const h = harness(s, PENV);
    expect(destroyBatch(h.run, [a], 'effect')).toEqual([a]);
    const n = h.done();
    expect(n.sides[0].board[1]).toBeNull();
    expect(n.sides[0].discard).toEqual([a]);
    expect(h.events).toEqual([{ e: 'Destroyed', iid: a, side: 0, cause: 'effect', by: -1 }]);
    expect(s.sides[0].board[1]?.iid).toBe(a); // the input state is untouched
  });

  it('a stolen monster goes to its OWNER\'s discard and is not a player loss (D-047, D-048)', () => {
    const b = new StateBuilder(PC);
    const stolen = b.card('fx-ember-whelp', 0); // owned by the player, controlled by the Collector
    const s = b.place(1, 0, stolen, { appraised: true }).build();
    const h = harness(s, PENV);
    destroyBatch(h.run, [stolen], 'effect');
    const n = h.done();
    expect(n.sides[0].discard).toEqual([stolen]);
    expect(n.sides[1].discard).toEqual([]);
    expect(ev(h.events, 'Destroyed')[0]?.side).toBe(1); // controller at destruction
    expect(n.track.round[1]).toBe(0); // LostMonster is for player-controlled monsters only
  });

  it('marks RoundFlag.LostMonster in the current round for player-controlled monsters', () => {
    const b = new StateBuilder(PC).turn(5); // round 3
    const a = b.card('fx-ember-whelp', 0);
    const c = b.card('fx-ember-whelp', 0);
    const s = b.place(0, 0, a).place(0, 1, c).build();
    const h = harness(s, PENV);
    destroyBatch(h.run, [a, c], 'effect');
    const n = h.done();
    expect(n.track.round[2]).toBe(RoundFlag.LostMonster);
    expect(n.track.round.filter((x) => x !== 0)).toHaveLength(1);
  });

  it('ignores monsters that are not on a board and duplicates', () => {
    const b = new StateBuilder(PC);
    const a = b.card('fx-ember-whelp', 0);
    const gone = b.card('fx-ember-whelp', 0);
    const s = b.place(0, 0, a).hand(0, gone).build();
    const h = harness(s, PENV);
    expect(destroyBatch(h.run, [gone, a, a], 'effect')).toEqual([a]);
    expect(h.done().sides[0].discard).toEqual([a]);
  });

  it('an empty batch writes nothing', () => {
    const s = new StateBuilder(PC).build();
    const h = harness(s, PENV);
    expect(destroyBatch(h.run, [], 'effect')).toEqual([]);
    expect(h.done()).toBe(s);
  });
});

describe('destroyBatch: ordering (§5.5)', () => {
  function twoBoards(turn: number) {
    const b = new StateBuilder(PC).turn(turn);
    const p0 = b.card('fx-ember-whelp', 0);
    const p2 = b.card('fx-ember-whelp', 0);
    const c0 = b.card('fx-ember-whelp', 1);
    const c1 = b.card('fx-ember-whelp', 1);
    const s = b.place(0, 0, p0).place(0, 2, p2).place(1, 0, c0).place(1, 1, c1).build();
    return { s, p0, p2, c0, c1 };
  }
  it('active side first, then slot order, whatever order the caller listed them in', () => {
    const { s, p0, p2, c0, c1 } = twoBoards(2); // player active
    const h = harness(s, PENV);
    destroyBatch(h.run, [c1, p2, c0, p0], 'effect');
    expect(ev(h.events, 'Destroyed').map((e) => e.iid)).toEqual([p0, p2, c0, c1]);
    expect(h.done().sides[0].discard).toEqual([p0, p2]);
  });
  it('Collector active: his monsters first', () => {
    const { s, p0, p2, c0, c1 } = twoBoards(3);
    const h = harness(s, PENV);
    destroyBatch(h.run, [p0, c1, p2, c0], 'effect');
    expect(ev(h.events, 'Destroyed').map((e) => e.iid)).toEqual([c0, c1, p0, p2]);
  });
});

describe('destroyBatch: Ward replacement (D-033..D-035, D-044, D-133, D-134)', () => {
  it('prevents the first destruction, sets wardUsed, emits WardBroken; the second destruction goes through', () => {
    const b = new StateBuilder(PC);
    const ox = b.card('fx-warded-ox', 1);
    const s = b.place(1, 0, ox).build();
    const h = harness(s, PENV);
    expect(destroyBatch(h.run, [ox], 'effect')).toEqual([]);
    const mid = h.tx.state;
    expect(mid.sides[1].board[0]?.wardUsed).toBe(true);
    expect(h.events).toEqual([{ e: 'WardBroken', iid: ox }]);
    expect(destroyBatch(h.run, [ox], 'effect')).toEqual([ox]);
    expect(h.done().sides[1].board[0]).toBeNull();
  });

  it('Ward prevents every cause of destruction (D-044)', () => {
    for (const cause of ['combat', 'effect', 'unstable'] as const) {
      const b = new StateBuilder(PC);
      const ox = b.card('fx-warded-ox', 0);
      const h = harness(b.place(0, 0, ox).build(), PENV);
      expect(destroyBatch(h.run, [ox], cause)).toEqual([]);
    }
  });

  it('a used Ward switches off every beforeDestroy bit, not just the one that answered (D-133)', () => {
    const b = new StateBuilder(PC);
    const ox = b.card('fx-ward2-ox', 0); // two replacement keywords
    const h = harness(b.place(0, 0, ox).build(), PENV);
    expect(destroyBatch(h.run, [ox], 'effect')).toEqual([]);
    expect(destroyBatch(h.run, [ox], 'effect')).toEqual([ox]); // the second bit does not save it
    expect(ev(h.events, 'WardBroken')).toHaveLength(1);
  });

  it('asks only the destroyed monster: a neighbour\'s Ward does not protect it (D-134)', () => {
    const b = new StateBuilder(PC);
    const ox = b.card('fx-warded-ox', 0);
    const whelp = b.card('fx-ember-whelp', 0);
    const h = harness(b.place(0, 0, ox).place(0, 1, whelp).build(), PENV);
    expect(destroyBatch(h.run, [whelp], 'effect')).toEqual([whelp]);
    expect(h.tx.state.sides[0].board[0]?.wardUsed).toBe(false);
  });

  it('a Ward-saved monster in a batch stays while the others go; no onDestroyed for it', () => {
    const b = new StateBuilder(PC);
    const ox = b.card('fx-warded-ox', 0);
    const spy = b.card('fx-spy-card', 0);
    const h = harness(b.place(0, 0, ox).place(0, 1, spy).build(), PENV);
    expect(destroyBatch(h.run, [ox, spy], 'effect')).toEqual([spy]);
    const n = h.done();
    expect(n.sides[0].board[0]?.iid).toBe(ox);
    expect(n.sides[0].board[1]).toBeNull();
    expect(ev(h.events, 'Destroyed').map((e) => e.iid)).toEqual([spy]);
    expect(SPY.filter((x) => x.startsWith('onDestroyed')).length).toBe(1); // spy's own hook only
  });

  it('Ward is not active on a face-down monster (D-037): it is simply destroyed', () => {
    const b = new StateBuilder(PC);
    const ox = b.card('fx-warded-ox', 0);
    const h = harness(b.place(0, 0, ox, { faceDown: true, pos: 1 }).build(), PENV);
    expect(destroyBatch(h.run, [ox], 'effect')).toEqual([ox]);
  });
});

describe('destroyBatch: last-known information and onDestroyed (D-122)', () => {
  it('LKI is taken before any removal: Tethered power counts the whole board; slot and side recorded', () => {
    const b = new StateBuilder(PC).turn(3); // Collector active
    const teth = b.card('fx-relic-tether', 1); // 6/3, -2 Power while alone
    const buddy = b.card('fx-spy-card', 1);
    const spy2 = b.card('fx-spy-card', 0);
    const s = b.place(1, 1, teth).place(1, 2, buddy).place(0, 0, spy2).build();
    const h = harness(s, PENV);
    destroyBatch(h.run, [teth, buddy], 'effect');
    // buddy's own hook sees itself as the destroyed monster (LKI kw selects it): power 1, guard 1, slot 2
    expect(SPY).toContain(`onDestroyed:${buddy}/1/1/2@${buddy}`);
    // the bystander's hook sees both destruction events, tether first (batch order: slot 1 then slot 2)
    expect(SPY.filter((x) => x.endsWith(`@${spy2}`))).toEqual([`onDestroyed:${teth}/6/3/1@${spy2}`, `onDestroyed:${buddy}/1/1/2@${spy2}`]);
  });

  it('the destroyed monster\'s own hooks run by LKI.kw, even though it is no longer on a board', () => {
    const b = new StateBuilder(PC);
    const moth = b.card('fx-echo-spy', 0);
    const h = harness(b.place(0, 0, moth).build(), PENV);
    destroyBatch(h.run, [moth], 'effect');
    expect(SPY).toEqual([`onDestroyed:${moth}/2/2/0@${moth}`]);
    // Echo (queued effect) ran after the dispatch: back in the owner's hand, not the discard
    const n = h.done();
    expect(n.sides[0].hand).toEqual([moth]);
    expect(n.sides[0].discard).toEqual([]);
    expect(ev(h.events, 'ReturnedToHand')).toHaveLength(1);
  });

  it('a face-down monster has LKI.kw = 0: its own keywords do not fire (D-037)', () => {
    const b = new StateBuilder(PC);
    const moth = b.card('fx-echo-spy', 0);
    const h = harness(b.place(0, 0, moth, { faceDown: true, pos: 1 }).build(), PENV);
    destroyBatch(h.run, [moth], 'effect');
    expect(SPY).toEqual([]);
    expect(h.done().sides[0].discard).toEqual([moth]); // Echo did not return it
  });

  it('Echo returns a stolen monster to its owner\'s hand (D-046)', () => {
    const b = new StateBuilder(PC);
    const moth = b.card('fx-echo-moth', 0);
    const h = harness(b.place(1, 0, moth, { appraised: true }).build(), PENV);
    destroyBatch(h.run, [moth], 'effect');
    const n = h.done();
    expect(n.sides[0].hand).toEqual([moth]);
    expect(n.sides[1].hand).toEqual([]);
  });

  it('records the destroyer for combat batches; none for effects (D-045)', () => {
    const b = new StateBuilder(PC);
    const a = b.card('fx-ember-whelp', 0);
    const t = b.card('fx-ember-whelp', 1);
    const s = b.place(0, 0, a).place(1, 0, t).build();
    const h = harness(s, PENV);
    destroyBatch(h.run, [a, t], 'combat', [
      { victim: t, by: a },
      { victim: a, by: t },
    ]);
    expect(ev(h.events, 'Destroyed')).toEqual([
      { e: 'Destroyed', iid: a, side: 0, cause: 'combat', by: t },
      { e: 'Destroyed', iid: t, side: 1, cause: 'combat', by: a },
    ]);
  });

  it('Haunt: the survivor loses Power; in a mutual destruction nobody is left to haunt (D-045)', () => {
    const b = new StateBuilder(PC);
    const shade = b.card('fx-haunt-shade', 1);
    const killer = b.card('fx-ember-whelp', 0);
    const s = b.place(1, 0, shade).place(0, 0, killer).build();
    const h = harness(s, PENV);
    destroyBatch(h.run, [shade], 'combat', [{ victim: shade, by: killer }]);
    expect(h.done().sides[0].board[0]?.permP).toBe(-2);

    const b2 = new StateBuilder(PC);
    const shade2 = b2.card('fx-haunt-shade', 1);
    const killer2 = b2.card('fx-ember-whelp', 0);
    const h2 = harness(b2.place(1, 0, shade2).place(0, 0, killer2).build(), PENV);
    destroyBatch(h2.run, [shade2, killer2], 'combat', [{ victim: shade2, by: killer2 }]);
    expect(ev(h2.events, 'StatsModified')).toEqual([]);
  });

  it('effects queued by onDestroyed run after the dispatch; a nested destruction is its own batch (FIFO)', () => {
    const b = new StateBuilder(PC);
    const av = b.card('fx-avenger', 1);
    const killer = b.card('fx-ember-whelp', 0);
    const s = b.place(1, 0, av).place(0, 0, killer).build();
    const h = harness(s, PENV);
    destroyBatch(h.run, [av], 'combat', [{ victim: av, by: killer }]);
    const n = h.done();
    expect(n.sides[0].board[0]).toBeNull(); // the avenger took its destroyer with it
    expect(ev(h.events, 'Destroyed').map((e) => [e.iid, e.cause])).toEqual([
      [av, 'combat'],
      [killer, 'effect'],
    ]);
  });

  it('game over inside onDestroyed drops the remaining dispatches (§8.3.5)', () => {
    const b = new StateBuilder(PC).life(1, 50);
    const bomb = b.card('fx-bomb', 1);
    const spy = b.card('fx-spy-card', 1);
    const s = b.life(0, 20).place(1, 0, bomb).place(1, 1, spy).build();
    // the bomb deals 99 to the opponent (the player), ending the game; the spy's onDestroyed is dropped
    const h = harness(s, PENV);
    destroyBatch(h.run, [bomb, spy], 'effect');
    const n = h.done();
    expect(n.result?.reason).toBe('playerDefeated');
    expect(n.step).toBe('over');
    expect(SPY).toEqual([]); // the spy's own onDestroyed (second in the batch) never ran
  });
});

describe('destroyBatch: card conservation (property, §4)', () => {
  const NAMES = [
    'fx-ember-whelp', 'fx-warded-ox', 'fx-echo-moth', 'fx-haunt-shade', 'fx-relic-tether', 'fx-avenger',
    'fx-spy-card', 'fx-ward2-ox', 'fx-echo-spy', 'fx-bomb',
  ] as const;
  const cell = fc.option(fc.integer({ min: 0, max: NAMES.length - 1 }), { nil: null });

  function build(cells: (number | null)[], turn: number, extras: number): { s: GameState; onBoard: Iid[] } {
    const b = new StateBuilder(PC).turn(turn).life(0, 500).life(1, 500);
    const onBoard: Iid[] = [];
    cells.forEach((c, i) => {
      if (c === null) return;
      const side = i < 3 ? 0 : 1;
      const iid = b.card(NAMES[c] as string, side);
      b.place(side, i % 3, iid, { wardUsed: false });
      onBoard.push(iid);
    });
    for (let i = 0; i < extras; i++) {
      const side = i % 2 === 0 ? 0 : 1;
      const d = b.card('fx-ember-whelp', side);
      if (i % 3 === 0) b.hand(side, d);
      else if (i % 3 === 1) b.deck(side, d);
      else b.discard(side, d);
    }
    return { s: b.build(), onBoard };
  }

  it('every iid stays in exactly one zone through a destroy batch (Ward, Echo, avengers included)', () => {
    fc.assert(
      fc.property(
        fc.array(cell, { minLength: 6, maxLength: 6 }),
        fc.subarray([0, 1, 2, 3, 4, 5]),
        fc.constantFrom('combat', 'effect', 'unstable'),
        fc.constantFrom(2, 3),
        fc.integer({ min: 0, max: 6 }),
        (cells, picks, cause, turn, extras) => {
          const { s, onBoard } = build(cells, turn, extras);
          const before = allCards(s);
          const h = harness(s, PENV);
          const listed: Iid[] = [];
          cells.forEach((c, i) => {
            if (c !== null && picks.includes(i)) listed.push(onBoard[cells.slice(0, i).filter((x) => x !== null).length] as Iid);
          });
          const destroyed = destroyBatch(h.run, listed, cause);
          const n = h.done();
          expect(allCards(n)).toEqual(before);
          // every destroyed monster left the board (it may have moved on, e.g. Echo)
          for (const iid of destroyed) {
            for (const sd of n.sides) for (const m of sd.board) expect(m?.iid).not.toBe(iid);
          }
          expect(new Set(allCards(n)).size).toBe(before.length);
        },
      ),
      { numRuns: 300 },
    );
  });
});
