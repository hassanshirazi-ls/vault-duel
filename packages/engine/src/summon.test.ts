import fc from 'fast-check';
import { beforeEach, describe, expect, it } from 'vitest';
import { PC, PENV, SPY } from '../test-utils/pipeline-fixture';
import { allCards, harness } from '../test-utils/run';
import { StateBuilder } from '../test-utils/state';
import { EngineError } from './errors';
import { freeBoardSlot, freeTrapSlot, requirementOf, sacrificeCandidates, setTrap, summon, summonCovetous } from './summon';
import type { SummonMode } from './types/actions';

beforeEach(() => {
  SPY.length = 0;
});

describe('summon (§5, D-014, D-021)', () => {
  it.each([
    ['atk', 0, false],
    ['grd', 1, false],
    ['down', 1, true],
  ] as const)('mode %s: hand -> leftmost free slot, pos %i, faceDown %s', (mode, pos, faceDown) => {
    const b = new StateBuilder(PC);
    const filler = b.card('fx-ember-whelp', 0);
    const c = b.card('fx-umbra-beast', 0);
    const s = b.hand(0, c).place(0, 0, filler).build();
    const h = harness(s, PENV);
    expect(summon(h.run, c, mode)).toBe(1);
    const n = h.done();
    expect(n.sides[0].hand).toEqual([]);
    expect(n.sides[0].board[1]).toEqual({
      iid: c, pos, faceDown, entered: 2, repositioned: -1, attacked: -1, wardUsed: false,
      permP: 0, permG: 0, timed: [], unstableUntil: -1, shroudUntil: -1, appraised: false,
    });
    expect(n.played).toBe(true);
    expect(n.step).toBe('attack');
    expect(h.events).toEqual([{ e: 'Summoned', side: 0, iid: c, slot: 1, pos, faceDown }]);
  });

  it('takes the leftmost gap, not the end of the board', () => {
    const b = new StateBuilder(PC);
    const a = b.card('fx-ember-whelp', 0);
    const c = b.card('fx-ember-whelp', 0);
    const d = b.card('fx-umbra-beast', 0);
    const s = b.hand(0, d).place(0, 0, a).place(0, 2, c).build();
    const h = harness(s, PENV);
    expect(summon(h.run, d, 'atk')).toBe(1);
  });

  it('the Collector summons onto his own board on his turn', () => {
    const b = new StateBuilder(PC).turn(3);
    const c = b.card('fx-relic-slow', 1);
    const h = harness(b.hand(1, c).build(), PENV);
    summon(h.run, c, 'atk');
    const n = h.done();
    expect(n.sides[1].board[0]).toMatchObject({ iid: c, entered: 3 });
    expect(n.sides[0].board).toEqual([null, null, null]);
  });

  it('fires onSummon (covetous: false) after the monster entered; a face-down summon fires nothing (D-037)', () => {
    const b = new StateBuilder(PC);
    const spy = b.card('fx-spy-card', 0);
    const h = harness(b.hand(0, spy).build(), PENV);
    summon(h.run, spy, 'atk');
    expect(SPY).toEqual([`onSummon:false@${spy}`]);
    SPY.length = 0;
    const c = new StateBuilder(PC);
    const down = c.card('fx-spy-card', 0);
    const h3 = harness(c.hand(0, down).build(), PENV);
    summon(h3.run, down, 'down');
    expect(SPY).toEqual([]);
  });

  it('other monsters\' onSummon hooks run too, active side first (§8.3.1)', () => {
    const b = new StateBuilder(PC);
    const onBoard = b.card('fx-spy-card', 0);
    const foe = b.card('fx-spy-card', 1);
    const c = b.card('fx-spy-card', 0);
    const h = harness(b.hand(0, c).place(0, 0, onBoard).place(1, 0, foe).build(), PENV);
    summon(h.run, c, 'grd');
    expect(SPY).toEqual([`onSummon:false@${onBoard}`, `onSummon:false@${c}`, `onSummon:false@${foe}`]);
  });

  it('throws EngineError for a card that is not in hand or a full board, leaving the input state intact', () => {
    const b = new StateBuilder(PC);
    const c = b.card('fx-umbra-beast', 0);
    const f1 = b.card('fx-ember-whelp', 0);
    const f2 = b.card('fx-ember-whelp', 0);
    const f3 = b.card('fx-ember-whelp', 0);
    const s = b.hand(0, c).place(0, 0, f1).place(0, 1, f2).place(0, 2, f3).build();
    const h = harness(s, PENV);
    expect(() => summon(h.run, c, 'atk')).toThrow(EngineError);
    expect(() => summon(harness(s, PENV).run, 999, 'atk')).toThrow(EngineError);
    expect(s.sides[0].hand).toEqual([c]);
  });
});

describe('setTrap', () => {
  it('moves the card to the leftmost free trap slot, set this turn, and uses the play', () => {
    const b = new StateBuilder(PC);
    const t1 = b.card('fx-trap-snare', 0);
    const t2 = b.card('fx-trap-mirror', 0);
    const s = b.hand(0, t2).setTrap(0, 0, t1, 0).build();
    const h = harness(s, PENV);
    expect(setTrap(h.run, t2)).toBe(1);
    const n = h.done();
    expect(n.sides[0].traps[1]).toEqual({ iid: t2, set: 2 });
    expect(n.sides[0].hand).toEqual([]);
    expect(n.played).toBe(true);
    expect(n.step).toBe('attack');
    expect(h.events).toEqual([{ e: 'TrapSet', side: 0, iid: t2, slot: 1 }]);
  });
  it('fails on full trap slots', () => {
    const b = new StateBuilder(PC);
    const t = [0, 1, 2].map(() => b.card('fx-trap-snare', 0));
    const s = b.hand(0, t[2] as number).setTrap(0, 0, t[0] as number).setTrap(0, 1, t[1] as number).build();
    expect(() => setTrap(harness(s, PENV).run, t[2] as number)).toThrow(EngineError);
  });
  it('slot helpers', () => {
    const b = new StateBuilder(PC);
    const c = b.card('fx-ember-whelp', 0);
    const s = b.place(0, 0, c).build();
    expect(freeBoardSlot(s, 0)).toBe(1);
    expect(freeBoardSlot(s, 1)).toBe(0);
    expect(freeTrapSlot(s, 0)).toBe(0);
  });
});

describe('Covetous summon (D-054, D-055, D-058, D-137)', () => {
  /** Collector turn; the ace in hand; optional board/vault contents. */
  function setup(opts: { board?: { id: string; appraised: boolean; slot: number }[]; vault?: string[]; ace?: string; owner?: 0 | 1 }) {
    const b = new StateBuilder(PC).turn(3);
    const ace = b.card(opts.ace ?? 'fx-ace', 1);
    b.hand(1, ace);
    const board = (opts.board ?? []).map((x) => {
      const iid = b.card(x.id, opts.owner ?? 0);
      b.place(1, x.slot, iid, { appraised: x.appraised, entered: 1 });
      return iid;
    });
    const vault = (opts.vault ?? []).map((id) => {
      const iid = b.card(id, 0);
      b.vault(1, iid);
      return iid;
    });
    return { s: b.build(), ace, board, vault };
  }

  it('candidates: own board in slot order (appraised only), then the vault in vault order', () => {
    const { s, ace, board, vault } = setup({
      board: [
        { id: 'fx-ember-whelp', appraised: true, slot: 0 },
        { id: 'fx-umbra-beast', appraised: false, slot: 1 },
      ],
      vault: ['fx-echo-moth', 'fx-tide-sprite'],
    });
    expect(sacrificeCandidates(s, PENV, 1, ace)).toEqual([board[0], vault[0], vault[1]]);
  });

  it('with a full board the vault is not offered (no free slot after), board candidates are', () => {
    const { s, ace, board } = setup({
      board: [
        { id: 'fx-ember-whelp', appraised: true, slot: 0 },
        { id: 'fx-umbra-beast', appraised: false, slot: 1 },
        { id: 'fx-lumen-seer', appraised: true, slot: 2 },
      ],
      vault: ['fx-echo-moth'],
    });
    expect(sacrificeCandidates(s, PENV, 1, ace)).toEqual([board[0], board[2]]);
  });

  it('candidate order never follows the zones array of the Flaw (zones: [vault, board] still lists the board first)', () => {
    const { s, ace, board, vault } = setup({
      ace: 'fx-relic-cov-vb',
      board: [{ id: 'fx-ember-whelp', appraised: true, slot: 1 }],
      vault: ['fx-echo-moth'],
    });
    expect(sacrificeCandidates(s, PENV, 1, ace)).toEqual([board[0], vault[0]]);
  });

  it('zones filter: vault-only and board-only requirements; an empty intersection means unsummonable', () => {
    const base = {
      board: [{ id: 'fx-ember-whelp', appraised: true, slot: 0 }],
      vault: ['fx-echo-moth'],
    };
    const v = setup({ ...base, ace: 'fx-relic-cov-vault' });
    expect(sacrificeCandidates(v.s, PENV, 1, v.ace)).toEqual([v.vault[0]]);
    const bo = setup({ ...base, ace: 'fx-relic-cov-board' });
    expect(sacrificeCandidates(bo.s, PENV, 1, bo.ace)).toEqual([bo.board[0]]);
    const none = setup({ ...base, ace: 'fx-relic-cov-none' });
    expect(requirementOf(none.s, PENV, 1, none.ace)).toEqual({ kind: 'sacrifice', appraised: true, zones: [] });
    expect(sacrificeCandidates(none.s, PENV, 1, none.ace)).toEqual([]);
  });

  it('a normal card has no sacrifice candidates; a normal requirement', () => {
    const { s, ace } = setup({ ace: 'fx-relic-slow', board: [{ id: 'fx-ember-whelp', appraised: true, slot: 0 }] });
    expect(requirementOf(s, PENV, 1, ace)).toEqual({ kind: 'normal' });
    expect(sacrificeCandidates(s, PENV, 1, ace)).toEqual([]);
  });

  it('no Appraised monster anywhere -> the ace is a dead card (D-055)', () => {
    const { s, ace } = setup({ board: [{ id: 'fx-ember-whelp', appraised: false, slot: 0 }] });
    expect(sacrificeCandidates(s, PENV, 1, ace)).toEqual([]);
  });

  it('sacrificing a board monster: slot freed, sacrificed card to its owner\'s discard, no hooks, ace enters', () => {
    const { s, ace, board } = setup({
      board: [
        { id: 'fx-umbra-beast', appraised: false, slot: 0 },
        { id: 'fx-echo-spy', appraised: true, slot: 1 }, // Echo + spy: neither must fire (not destruction)
      ],
    });
    const h = harness(s, PENV);
    expect(summonCovetous(h.run, ace, board[1] as number, 'grd')).toBe(1); // the freed slot is the leftmost free
    const n = h.done();
    expect(n.sides[1].board[1]).toMatchObject({ iid: ace, pos: 1, faceDown: false, entered: 3 });
    expect(n.sides[0].discard).toEqual([board[1]]); // owner = player (D-047)
    expect(n.sides[0].hand).toEqual([]); // Echo did not return it
    expect(n.sides[1].hand).toEqual([]);
    expect(n.played).toBe(true);
    expect(n.step).toBe('attack');
    expect(h.events.map((e) => e.e)).toEqual(['Sacrificed', 'Summoned', 'CovetousSummoned']);
    expect(h.events[0]).toEqual({ e: 'Sacrificed', iid: board[1], reason: 'covetous', from: 'board' });
    expect(h.events[2]).toEqual({ e: 'CovetousSummoned', iid: ace, sacrificed: board[1], slot: 1 });
    expect(SPY.filter((x) => x.startsWith('onDestroyed'))).toEqual([]);
  });

  it('sacrificing from the vault: removed from the vault, player\'s discard, ace takes the leftmost free slot', () => {
    const { s, ace, vault } = setup({ vault: ['fx-echo-moth'], board: [{ id: 'fx-umbra-beast', appraised: false, slot: 0 }] });
    const h = harness(s, PENV);
    expect(summonCovetous(h.run, ace, vault[0] as number, 'atk')).toBe(1);
    const n = h.done();
    expect(n.sides[1].vault).toEqual([]);
    expect(n.sides[0].discard).toEqual([vault[0]]);
    expect(h.events[0]).toEqual({ e: 'Sacrificed', iid: vault[0], reason: 'covetous', from: 'vault' });
  });

  it('fires onSummon with covetous: true; marks Track.unpriced for the ace only', () => {
    const { s, ace, board } = setup({ board: [{ id: 'fx-ember-whelp', appraised: true, slot: 0 }] });
    const h = harness(s, PENV);
    summonCovetous(h.run, ace, board[0] as number, 'atk');
    expect(h.done().track.unpriced).toBe(true);

    const other = setup({ ace: 'fx-relic-cov-vb', board: [{ id: 'fx-ember-whelp', appraised: true, slot: 0 }] });
    const h2 = harness(other.s, PENV);
    summonCovetous(h2.run, other.ace, other.board[0] as number, 'atk');
    expect(h2.done().track.unpriced).toBe(false);
  });

  it('onSummon sees covetous: true', () => {
    const b = new StateBuilder(PC).turn(3);
    const spy = b.card('fx-spy-card', 1);
    const ace = b.card('fx-ace', 1);
    const sac = b.card('fx-ember-whelp', 0);
    const s = b.hand(1, ace).place(1, 0, sac, { appraised: true }).place(1, 1, spy).build();
    summonCovetous(harness(s, PENV).run, ace, sac, 'atk');
    expect(SPY).toEqual([`onSummon:true@${spy}`]);
  });

  it('rejects a sacrifice that is nowhere or on the other board', () => {
    const { s, ace } = setup({});
    expect(() => summonCovetous(harness(s, PENV).run, ace, 0, 'atk')).toThrow(EngineError);
    const b = new StateBuilder(PC).turn(3);
    const a2 = b.card('fx-ace', 1);
    const foe = b.card('fx-ember-whelp', 0);
    const s2 = b.hand(1, a2).place(0, 0, foe).build();
    expect(() => summonCovetous(harness(s2, PENV).run, a2, foe, 'atk')).toThrow(EngineError);
  });
});

describe('properties', () => {
  it('summon / setTrap conserve cards and keep zone sizes within limits', () => {
    fc.assert(
      fc.property(
        fc.array(fc.option(fc.constantFrom('fx-ember-whelp', 'fx-umbra-beast', 'fx-warded-ox'), { nil: null }), { minLength: 3, maxLength: 3 }),
        fc.constantFrom<SummonMode>('atk', 'grd', 'down'),
        (cells, mode) => {
          const b = new StateBuilder(PC);
          cells.forEach((id, i) => {
            if (id !== null) b.place(0, i, b.card(id, 0));
          });
          const c = b.card('fx-echo-moth', 0);
          const t = b.card('fx-trap-snare', 0);
          const s = b.hand(0, c, t).build();
          const before = allCards(s);
          const full = cells.every((x) => x !== null);
          const h = harness(s, PENV);
          if (full) {
            expect(() => summon(h.run, c, mode)).toThrow(EngineError);
          } else {
            summon(h.run, c, mode);
            const n = h.done();
            expect(allCards(n)).toEqual(before);
            expect(n.sides[0].board).toHaveLength(3);
          }
          const h2 = harness(s, PENV);
          setTrap(h2.run, t);
          expect(allCards(h2.done())).toEqual(before);
        },
      ),
      { numRuns: 100 },
    );
  });
});
