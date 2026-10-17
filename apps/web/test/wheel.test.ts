import * as content from '@vault-duel/content';
import { describe, expect, it } from 'vitest';
import { loadGameContent } from '../src/content/load';
import type { ElementInfo } from '../src/content/load';
import { advantagePair, howToQuiz } from '../src/view/howto';
import { cycleOrder, edgePath, nodePoints, wheelLayout, wheelSummary } from '../src/view/wheel';
import { formatCountdown, minutesToNextDuel } from '../src/daily/date';

const el = (id: string, beats: string[]): ElementInfo => ({ id, name: id, color: '#000', icon: 'flame', beats });
const ctx = () => {
  const r = loadGameContent(content);
  if (!r.ok) throw new Error(r.lines.join('\n'));
  return r.ctx;
};

describe('element wheel layout (D-271)', () => {
  it('puts a five-element cycle in clockwise order, each arrow to the next node', () => {
    // content order is scrambled on purpose: a beats c beats e beats b beats d beats a
    const els = [el('a', ['c']), el('b', ['d']), el('c', ['e']), el('d', ['a']), el('e', ['b'])];
    expect(cycleOrder(els)?.map((e) => e.id)).toEqual(['a', 'c', 'e', 'b', 'd']);
    const layout = wheelLayout(els);
    expect(layout.cycle).toBe(true);
    expect(layout.edges.map((e) => [e.from, e.to, e.twoWay])).toEqual([[0, 1, false], [1, 2, false], [2, 3, false], [3, 4, false], [4, 0, false]]);
    // clockwise on screen: the second node is to the right of the first (the first is at the top)
    const pts = nodePoints(5, 100);
    expect(pts[0]?.y).toBeLessThan(-99);
    expect(pts[1]?.x).toBeGreaterThan(0);
    expect(wheelSummary(layout)).toContain('a beats c');
  });

  it('the shipped matrix is a single five-element cycle', () => {
    const els = [...ctx().elements.values()];
    const layout = wheelLayout(els);
    expect(layout.cycle).toBe(true);
    expect(layout.edges.every((e) => !e.twoWay)).toBe(true);
    expect(layout.edges).toHaveLength(els.length);
  });

  it('falls back to content order with a two-way pair for the pre-flip matrix, and draws without error', () => {
    // the ring before the 2026-10-16 flip: ember>gale>tide>ember, lumen<>umbra
    const beats: Record<string, string[]> = { ember: ['gale'], gale: ['tide'], tide: ['ember'], lumen: ['umbra'], umbra: ['lumen'] };
    const els = [...ctx().elements.values()].map((e) => ({ ...e, beats: beats[e.id] ?? e.beats }));
    const layout = wheelLayout(els);
    expect(layout.cycle).toBe(false);
    expect(layout.order.map((e) => e.id)).toEqual(els.map((e) => e.id));
    const two = layout.edges.filter((e) => e.twoWay);
    expect(two).toHaveLength(1);
    expect(new Set([layout.order[two[0]?.from ?? 0]?.id, layout.order[two[0]?.to ?? 0]?.id])).toEqual(new Set(['lumen', 'umbra']));
    expect(layout.edges.length).toBe(els.reduce((n, e) => n + e.beats.length, 0) - 1);
    const pts = nodePoints(layout.order.length, 150);
    for (const e of layout.edges) expect(edgePath(pts, e.from, e.to, 27, 4, 150, 40).d).toMatch(/^M-?[\d.]+ -?[\d.]+[AQL]/);
  });

  it('a ring that is not a single cycle (two loops) is not drawn as one', () => {
    const els = [el('a', ['b']), el('b', ['a']), el('c', ['d']), el('d', ['c'])];
    expect(cycleOrder(els)).toBeNull();
  });

  it('finds an advantage pair for the combat demo and quiz from the matrix', () => {
    const c = ctx();
    const pair = advantagePair(c);
    expect(pair?.attacker.beats).toContain(pair?.defender.id);
    const quiz = howToQuiz(c, 'combat');
    expect(quiz?.answers.filter((a) => a.right)).toHaveLength(1);
  });
});

describe('every Try it has exactly one right answer', () => {
  it.each(['goal', 'cards', 'combat', 'graft', 'appraisal', 'winning'] as const)('%s', (id) => {
    const q = howToQuiz(ctx(), id);
    expect(q?.answers.filter((a) => a.right)).toHaveLength(1);
    expect(q?.answers.length).toBeGreaterThanOrEqual(2);
    expect(`${q?.question}${q?.why}`).not.toMatch(/[{}|]/);
  });
});

describe('next duel countdown', () => {
  it('counts to local midnight', () => {
    expect(minutesToNextDuel(new Date(2026, 9, 16, 9, 48, 0))).toBe(14 * 60 + 12);
    expect(minutesToNextDuel(new Date(2026, 9, 16, 23, 59, 30))).toBe(1);
    expect(formatCountdown(14 * 60 + 12)).toBe('14h 12m');
    expect(formatCountdown(42)).toBe('42m');
  });
});
