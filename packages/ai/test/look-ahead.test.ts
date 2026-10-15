// The look-ahead helper (D-209): one redacted copy, refusal of any action that targets a face-down opponent monster,
// and answers that come from the engine's queries.
import { describe, expect, it } from 'vitest';
import { createGreedy, lookAhead, playerView } from '../src';
import { botAction } from '../src';
import { createWorld, mon, Scene } from './world';
import type { Scene as SceneT } from './world';

const world = createWorld([
  mon('c-brute', 'C', 7, 3, 'fire'),
  mon('c-swift', 'C', 7, 3, 'void', ['swift']),
  mon('c-slow', 'C', 6, 5, 'water', ['slow']),
  mon('p-hidden', 'P', 3, 3, 'void'),
  mon('p-open', 'P', 2, 2, 'void'),
  mon('p-brute', 'P', 7, 3, 'fire'),
]);
const brain = world.collector.brain;
const collectorTurn = (): SceneT => new Scene(world, 7);
const playerTurn = (): SceneT => new Scene(world, 4);

describe('refusal (D-209)', () => {
  it('refuses an attack and a cast that target a face-down foe monster, and allows the same on a face-up one', () => {
    const sc = collectorTurn().board(1, 0, 'c-brute').hand(1, 'c-smite').board(0, 0, 'p-hidden', { faceDown: true }).board(0, 1, 'p-open');
    const s = sc.state();
    const la = lookAhead(brain, s, 1);
    const legal = brain.engine.getLegalActions(s);
    const onHidden = (a: (typeof legal)[number]): boolean => (a.t === 'attack' || a.t === 'cast') && a.target === s.sides[0].board[0]?.iid;
    const hidden = legal.filter(onHidden);
    expect(hidden.length).toBeGreaterThanOrEqual(1); // the engine lists them: it needs the identity for legality
    for (const a of hidden) expect(la.after(a)).toBeNull();
    for (const a of legal.filter((x) => (x.t === 'attack' || x.t === 'cast') && !onHidden(x) && x.target >= 0)) expect(la.after(a)).not.toBeNull();
  });

  it('winsAfter is false for a refused action', () => {
    const sc = collectorTurn().board(1, 0, 'c-brute').board(0, 0, 'p-hidden', { faceDown: true }).life(0, 3);
    const s = sc.state();
    const la = lookAhead(brain, s, 1);
    const onHidden = brain.engine.getLegalActions(s).find((a) => a.t === 'attack' && a.target >= 0);
    expect(onHidden).toBeDefined();
    expect(la.winsAfter(onHidden as never)).toBe(false);
  });

  it('does not touch the state it is given and shares one copy between questions', () => {
    const s = collectorTurn().board(1, 0, 'c-brute').board(0, 0, 'p-open').hand(0, 'p-brute').state();
    const before = JSON.stringify(s);
    const la = lookAhead(brain, s, 1);
    la.winningAttacks();
    for (const a of brain.engine.getLegalActions(s)) la.after(a);
    expect(JSON.stringify(s)).toBe(before);
  });
});

describe('previewSummon (D-209, D-212)', () => {
  it('applies the summon to the copy: Slow is the restriction fold, a plain monster is not Slow', () => {
    const s = collectorTurn().hand(1, 'c-slow', 'c-brute').state();
    const la = lookAhead(brain, s, 1);
    const iid = (id: string): number => s.sides[1].hand.find((i) => world.content.ids[(s.inst[i] as { def: number }).def] === id) as number;
    expect(la.previewSummon(iid('c-slow'))).toMatchObject({ power: 6, guard: 5, slow: true });
    expect(la.previewSummon(iid('c-brute'))).toMatchObject({ power: 7, guard: 3, slow: false });
  });

  it('gives no preview without a free slot', () => {
    const sc = collectorTurn().hand(1, 'c-brute').board(1, 0, 'c-swift').board(1, 1, 'c-swift').board(1, 2, 'c-swift');
    const s = sc.state();
    expect(lookAhead(brain, s, 1).previewSummon(s.sides[1].hand[0] as number)).toBeNull();
  });

  it('asAttacker is the engine preview; a face-down foe is unknown', () => {
    const sc = collectorTurn().hand(1, 'c-brute').board(0, 0, 'p-open').board(0, 1, 'p-hidden', { faceDown: true });
    const s = sc.state();
    const pv = lookAhead(brain, s, 1).previewSummon(s.sides[1].hand[0] as number);
    expect(pv?.asAttacker(0)).toMatchObject({ known: true, aP: 7 });
    expect(pv?.asAttacker(1)).toEqual({ known: false });
  });
});

describe('greedy and a refused look-ahead (D-222)', () => {
  it('PlayerView.after is null for an attack on a face-down Collector monster, and greedy still plays', () => {
    const s = playerTurn().board(0, 0, 'p-brute').board(1, 0, 'c-brute', { faceDown: true }).state();
    const v = playerView(brain, s);
    const i = v.legal.findIndex((a) => a.t === 'attack' && a.target === s.sides[1].board[0]?.iid);
    expect(i).toBeGreaterThanOrEqual(0);
    expect(v.after(i)).toBeNull();
    expect(botAction(createGreedy(), brain, s)).toBeDefined();
  });

  it('a refused attack scores as the current position, so it never beats a real gain', () => {
    const sc = playerTurn().board(0, 0, 'p-brute').board(1, 0, 'c-brute', { faceDown: true }).hand(0, 'p-open');
    const s = sc.state();
    // summoning adds a card to the board; the refused attack (scored as "no change") must not outrank it
    expect(sc.fmt(s, botAction(createGreedy(), brain, s))).toMatch(/^summon p-open/);
  });
});
