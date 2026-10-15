// Decision noise (D-094): seeded, reproducible, and exactly "the second best with probability epsilon".
import { describe, expect, it } from 'vitest';
import { createNoise, noiseKey } from '../src';

const SCORES = [3, 9, 1, 7, 9];

describe('noise (D-094)', () => {
  it('keys the stream by seed string, reroll and run index', () => {
    expect(noiseKey('vault-duel:2026-01-01:0.1.0', 4, 17)).toBe('vault-duel:2026-01-01:0.1.0#4/noise/17');
  });

  it('gives the same picks for the same key and epsilon, other picks for another key', () => {
    const draw = (key: string): number[] => {
      const n = createNoise(key, 0.5);
      return Array.from({ length: 60 }, () => (n.swerve() ? 1 : 0));
    };
    expect(draw('a')).toEqual(draw('a'));
    expect(draw('a')).not.toEqual(draw('b'));
    const pick = (key: string): number[] => {
      const n = createNoise(key, 0.5);
      return Array.from({ length: 60 }, () => n.pick(SCORES));
    };
    expect(pick('a')).toEqual(pick('a'));
  });

  it('with epsilon 0 always picks the best (the first of equals)', () => {
    const n = createNoise('zero', 0);
    for (let i = 0; i < 200; i++) expect(n.pick(SCORES)).toBe(1);
  });

  it('with epsilon 1 always picks the second best, which can equal the best in score', () => {
    const n = createNoise('one', 1);
    for (let i = 0; i < 50; i++) expect(n.pick(SCORES)).toBe(4);
    expect(createNoise('one', 1).pick([5, 2, 4])).toBe(2);
  });

  it('swerves at about the rate it was given', () => {
    const n = createNoise('rate', 0.25);
    let hits = 0;
    const N = 20_000;
    for (let i = 0; i < N; i++) if (n.swerve()) hits++;
    expect(Math.abs(hits / N - 0.25)).toBeLessThan(0.02);
  });

  it('handles a single option and no option', () => {
    expect(createNoise('s', 1).pick([4])).toBe(0);
    expect(createNoise('s', 1).pick([])).toBe(0);
  });

  it('takes one draw per pick whatever the option count, so the stream does not depend on it', () => {
    const a = createNoise('align', 0.5);
    const b = createNoise('align', 0.5);
    for (let i = 0; i < 40; i++) {
      a.pick([1]);
      b.pick(SCORES);
    }
    expect(a.swerve()).toBe(b.swerve());
  });
});
