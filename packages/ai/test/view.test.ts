// The Collector's view (ARCHITECTURE.md §13.1): what it reports, and that its choices are the engine's legal actions 1:1.
import { describe, expect, it } from 'vitest';
import { createEngine } from '@vault-duel/engine';
import { createCollector, createGreedy, botAction } from '../src';
import { CONTENT, GLOBALS as LIVE, SEED } from './helpers';
import { createWorld, mon, Scene } from './world';

const world = createWorld([
  mon('c-brute', 'C', 7, 3, 'fire', ['pierce']),
  mon('c-tether', 'C', 8, 4, 'void', ['tethered']),
  mon('c-vain', 'C', 6, 3, 'void', ['vain']),
  mon('p-small', 'P', 3, 3, 'air'),
  mon('p-ward', 'P', 5, 3, 'water', ['ward']),
  mon('p-hidden', 'P', 4, 4, 'void'),
]);

describe('collectorView fields', () => {
  const sc = new Scene(world, 7)
    .board(1, 0, 'c-tether', { permP: 1 })
    .board(1, 1, 'c-vain')
    .hand(1, 'c-brute', 'c-gilt', 'c-case')
    .trap(1, 0, 'c-claim')
    .discard(1, 'c-brute')
    .vault(1, 'p-small')
    .board(0, 0, 'p-ward')
    .board(0, 1, 'p-hidden', { faceDown: true })
    .hand(0, 'p-small', 'p-small')
    .trap(0, 1, 'c-case')
    .life(0, 13)
    .life(1, 11);
  const s = sc.state();
  const v = world.collector.view(s);

  it('reports turn, round, lives and mood from the state', () => {
    expect(v.turn).toBe(7);
    expect(v.round).toBe(4);
    expect(v.myLife).toBe(11);
    expect(v.foeLife).toBe(13);
    expect(v.mood).toBe(0);
    expect(v.appraisalRoundsLeft).toEqual([6, 9]);
  });

  it('shows his own side in full, with effective stats', () => {
    expect(v.hand.map((c) => c.id)).toEqual(['c-brute', 'c-gilt', 'c-case']);
    expect(v.hand[0]).toMatchObject({ type: 'monster', power: 7, guard: 3, element: 'fire', keywords: ['pierce'], flaw: null });
    expect(v.hand[1]).toMatchObject({ type: 'spell', drawOnly: false });
    expect(v.hand[2]).toMatchObject({ type: 'trap' });
    // c-tether: 8 Power + 1 permanent, and Tethered is off with two monsters on his board.
    expect(v.board[0]).toMatchObject({ slot: 0, power: 9, guard: 4, pos: 'atk', forced: false });
    expect(v.board[0]?.card.flaw).toBe('tethered');
    expect(v.board[1]).toMatchObject({ forced: true });
    expect(v.board[2]).toBeNull();
    expect(v.traps.map((t) => t?.id ?? null)).toEqual(['c-claim', null]);
    expect(v.discard.map((c) => c.id)).toEqual(['c-brute']);
    expect(v.vault.map((c) => c.id)).toEqual(['p-small']);
  });

  it('shows the opponent only publicly: a face-down monster is a slot, a trap is an occupied slot, a hand is a count', () => {
    expect(v.foeBoard[0]).toMatchObject({ faceDown: false, slot: 0, id: 'p-ward', power: 5, guard: 3, pos: 'atk', wardActive: true });
    expect(v.foeBoard[1]).toEqual({ faceDown: true, slot: 1 });
    expect(v.foeBoard[2]).toBeNull();
    expect(v.foeTrapSlots).toEqual([false, true]);
    expect(v.foeHandCount).toBe(2);
    expect(JSON.stringify(v)).not.toContain('p-hidden');
  });

  it('Tethered shows its penalty when the monster is alone', () => {
    const alone = new Scene(world, 7).board(1, 0, 'c-tether');
    expect(world.collector.view(alone.state()).board[0]?.power).toBe(6);
  });

  it('previewAttack answers from public information, unknown for a face-down target', () => {
    // c-vain (void 6/3) attacks p-ward (water 5/3, attack position): 6 > 5 destroys, but Ward absorbs it.
    const est = v.previewAttack(1, 0);
    expect(est).toMatchObject({ known: true, aP: 6, dStat: 5, destroysDefender: false, stripsWard: true, losesAttacker: false, foeLifeLoss: 1 });
    expect(v.previewAttack(1, 1)).toEqual({ known: false });
    expect(v.previewAttack(2, 0)).toEqual({ known: false }); // empty slot
  });

  it('previewSummon applies the post-summon stats and the flaw facts', () => {
    const brute = v.hand[0];
    if (brute === undefined) throw new Error('no card');
    const pv = v.previewSummon(brute);
    expect(pv).not.toBeNull();
    expect(pv?.power).toBe(7);
    expect(pv?.slow).toBe(false);
  });
});

describe('choices are the engine legal actions, one to one', () => {
  it('in every state of a few duels', () => {
    const collector = createCollector({ content: CONTENT, globals: LIVE });
    const engine = createEngine(CONTENT, LIVE, { intent: collector.intentPolicy });
    const kind = { reposition: 'reposition', summon: 'summon', summonCovetous: 'summonCovetous', cast: 'cast', setTrap: 'setTrap', attack: 'attack', endTurn: 'endTurn' } as const;
    for (let i = 0; i < 8; i++) {
      const bot = createGreedy();
      let s = engine.newGame(SEED(i)).state;
      let n = 0;
      while (s.result === null && n++ < 400) {
        if ((s.turn & 1) === 1 && s.step !== 'mulligan') {
          const legal = engine.getLegalActions(s);
          const v = collector.view(s);
          expect(v.choices.length).toBe(legal.length);
          legal.forEach((a, k) => {
            const c = v.choices[k];
            expect(c?.index).toBe(k);
            const want = a.t in kind ? kind[a.t as keyof typeof kind] : 'other';
            expect(c?.t).toBe(want);
          });
        }
        const a = (s.turn & 1) === 0 || s.step === 'mulligan' ? botAction(bot, collector.brain, s) : collector.act(s);
        s = engine.applyAction(s, a).state;
      }
    }
  });

  it('runs on an engine in dev mode, where committed states are frozen', () => {
    const collector = createCollector({ content: CONTENT, globals: LIVE });
    const engine = createEngine(CONTENT, LIVE, { intent: collector.intentPolicy }, { dev: true });
    for (let i = 0; i < 6; i++) {
      const bot = createGreedy();
      let s = engine.newGame(SEED(i)).state;
      while (s.result === null) {
        const a = (s.turn & 1) === 0 || s.step === 'mulligan' ? botAction(bot, collector.brain, s) : collector.act(s);
        s = engine.applyAction(s, a).state;
      }
    }
  });
});
