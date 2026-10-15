// Aggregation is commutative and associative; medians and percentiles come from histograms.
import { describe, expect, it } from 'vitest';
import { bump, bumpBin, child, mean, median, mergeAll, mergeInto, percentile, stableJson } from '../src/aggregate';
import type { Aggregate } from '../src/aggregate';

function sample(seed: number): Aggregate {
  const a: Aggregate = {};
  const bot = child(child(a, 'bots'), seed % 2 === 0 ? 'x' : 'y');
  bump(bot, 'games', seed + 1);
  bumpBin(bot, 'rounds', 5, seed % 5, seed + 2);
  bump(child(child(bot, 'cards'), `c${seed % 3}`), 'played', seed);
  return a;
}

describe('mergeAll', () => {
  const parts = [0, 1, 2, 3, 4, 5, 6].map(sample);

  it('gives the same result in any order and any grouping', () => {
    const forward = stableJson(mergeAll(parts));
    expect(stableJson(mergeAll([...parts].reverse()))).toBe(forward);
    const shuffled = [parts[3], parts[0], parts[6], parts[2], parts[5], parts[1], parts[4]] as Aggregate[];
    expect(stableJson(mergeAll(shuffled))).toBe(forward);
    const left = mergeAll(parts.slice(0, 3));
    const right = mergeAll(parts.slice(3));
    expect(stableJson(mergeAll([right, left]))).toBe(forward);
  });

  it('adds counts and histogram bins, and copies keys one side lacks', () => {
    const t = mergeAll([{ n: 1, h: [1, 2], sub: { a: 1 } }, { n: 4, h: [3, 0], sub: { b: 2 } }, { m: 1 }]);
    expect(t).toEqual({ n: 5, h: [4, 2], sub: { a: 1, b: 2 }, m: 1 });
  });

  it('does not alias the source histograms', () => {
    const a: Aggregate = { h: [1, 1] };
    const t: Aggregate = {};
    mergeInto(t, a);
    mergeInto(t, a);
    expect(a).toEqual({ h: [1, 1] });
    expect(t).toEqual({ h: [2, 2] });
  });

  it('refuses histograms of different lengths', () => {
    expect(() => mergeAll([{ h: [1, 2] }, { h: [1] }])).toThrow('bins');
  });
});

describe('histogram statistics', () => {
  // bins 0..5 hold the sample 1,1,2,2,2,4,5
  const bins = [0, 2, 3, 0, 1, 1];
  const sorted = [1, 1, 2, 2, 2, 4, 5];

  it('median of an odd count is the middle value', () => {
    expect(median(bins)).toBe(2);
  });

  it('median of an even count is the mean of the two middle values', () => {
    expect(median([0, 1, 0, 1])).toBe(2);
    expect(median([0, 2, 2])).toBe(1.5);
  });

  it('percentile is the nearest rank of the expanded sample', () => {
    for (const p of [0.01, 0.25, 0.5, 0.75, 0.9, 1]) {
      expect(percentile(bins, p)).toBe(sorted[Math.max(1, Math.ceil(p * sorted.length)) - 1]);
    }
  });

  it('matches the sorted sample for any histogram', () => {
    const hist = [3, 0, 5, 1, 0, 2, 4];
    const values = hist.flatMap((n, i) => new Array<number>(n).fill(i));
    const mid = values.length >> 1;
    const expected = values.length % 2 === 1 ? (values[mid] as number) : ((values[mid - 1] as number) + (values[mid] as number)) / 2;
    expect(median(hist)).toBe(expected);
    expect(mean(hist)).toBeCloseTo(values.reduce((a, b) => a + b, 0) / values.length, 12);
  });

  it('is NaN for an empty histogram', () => {
    expect(median([0, 0])).toBeNaN();
    expect(percentile([0, 0], 0.5)).toBeNaN();
    expect(mean([])).toBeNaN();
  });
});

describe('stableJson', () => {
  it('sorts keys at every depth', () => {
    expect(stableJson({ b: 1, a: { d: 1, c: [{ z: 1, y: 2 }] } }, 0)).toBe('{"a":{"c":[{"y":2,"z":1}],"d":1},"b":1}');
  });
});
