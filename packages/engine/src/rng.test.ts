import { describe, expect, it } from 'vitest';
import fc from 'fast-check';
import { cyrb128, Sfc32 } from './rng';

describe('cyrb128', () => {
  it('is deterministic and returns four uint32', () => {
    const a = cyrb128('vault-duel:2026-10-14:0.1.0#0');
    expect(cyrb128('vault-duel:2026-10-14:0.1.0#0')).toEqual(a);
    expect(a).toHaveLength(4);
    for (const w of a) {
      expect(Number.isInteger(w)).toBe(true);
      expect(w).toBeGreaterThanOrEqual(0);
      expect(w).toBeLessThan(2 ** 32);
    }
  });
  it('known-answer vectors', () => {
    expect(cyrb128('')).toEqual(KAT_CYRB_EMPTY);
    expect(cyrb128('vault-duel:2026-10-14:0.1.0#0')).toEqual(KAT_CYRB_SEED);
  });
  it('distinguishes nearby seeds', () => {
    expect(cyrb128('a#0')).not.toEqual(cyrb128('a#1'));
  });
});

describe('Sfc32', () => {
  it('known-answer sequence', () => {
    const r = Sfc32.from('vault-duel:2026-10-14:0.1.0#0/engine');
    const out: number[] = [];
    for (let i = 0; i < 8; i++) out.push(r.next());
    expect(out).toEqual(KAT_SFC_SEQ);
  });
  it('same key gives the same stream, different purposes differ', () => {
    const a = Sfc32.from('k/deck');
    const b = Sfc32.from('k/deck');
    const c = Sfc32.from('k/engine');
    const sa = Array.from({ length: 20 }, () => a.next());
    expect(Array.from({ length: 20 }, () => b.next())).toEqual(sa);
    expect(Array.from({ length: 20 }, () => c.next())).not.toEqual(sa);
  });
  it('restore resumes exactly from state()', () => {
    const a = Sfc32.from('resume');
    for (let i = 0; i < 7; i++) a.next();
    const b = Sfc32.restore(a.state());
    for (let i = 0; i < 50; i++) expect(b.next()).toBe(a.next());
  });
  it('restore(g.state()) continues the same stream as g', () => {
    const g = Sfc32.from('continue');
    const h = Sfc32.restore(g.state());
    expect(h.state()).toEqual(g.state());
    for (let i = 0; i < 100; i++) {
      expect(h.next()).toBe(g.next());
      expect(h.int(7)).toBe(g.int(7));
    }
  });
  it('next() is uint32', () => {
    fc.assert(
      fc.property(fc.string(), (s) => {
        const r = Sfc32.from(s);
        for (let i = 0; i < 20; i++) {
          const v = r.next();
          if (!Number.isInteger(v) || v < 0 || v >= 2 ** 32) return false;
        }
        return true;
      }),
    );
  });
  it('int(n) stays in [0, n)', () => {
    fc.assert(
      fc.property(fc.string(), fc.integer({ min: 1, max: 1_000_000 }), (s, n) => {
        const r = Sfc32.from(s);
        for (let i = 0; i < 20; i++) {
          const v = r.int(n);
          if (!Number.isInteger(v) || v < 0 || v >= n) return false;
        }
        return true;
      }),
    );
  });
  it('int(1) is always 0', () => {
    const r = Sfc32.from('one');
    for (let i = 0; i < 100; i++) expect(r.int(1)).toBe(0);
  });
  it('int(6) is roughly uniform', () => {
    const N = 60000;
    const real = [0, 0, 0, 0, 0, 0];
    const r = Sfc32.from('uniform');
    for (let i = 0; i < N; i++) {
      const k = r.int(6);
      real[k] = (real[k] ?? 0) + 1;
    }
    for (const c of real) expect(Math.abs(c - N / 6)).toBeLessThan(N / 6 * 0.05);
  });
  it('state() is JSON-serializable uint32 x4', () => {
    const s = Sfc32.from('x').state();
    expect(JSON.parse(JSON.stringify(s))).toEqual(s);
  });
});

describe('shuffle', () => {
  it('known-answer', () => {
    const arr = Array.from({ length: 10 }, (_, i) => i);
    Sfc32.from('vault-duel:2026-10-14:0.1.0#0/shuffle-player').shuffle(arr);
    expect(arr).toEqual(KAT_SHUFFLE);
  });
  it('is a permutation', () => {
    fc.assert(
      fc.property(fc.string(), fc.array(fc.integer(), { maxLength: 40 }), (seed, xs) => {
        const ys = xs.slice();
        Sfc32.from(seed).shuffle(ys);
        const sort = (a: number[]) => a.slice().sort((p, q) => p - q);
        return JSON.stringify(sort(ys)) === JSON.stringify(sort(xs));
      }),
    );
  });
  it('is seed-stable', () => {
    fc.assert(
      fc.property(fc.string(), fc.array(fc.integer(), { maxLength: 40 }), (seed, xs) => {
        const a = xs.slice();
        const b = xs.slice();
        Sfc32.from(seed).shuffle(a);
        Sfc32.from(seed).shuffle(b);
        return JSON.stringify(a) === JSON.stringify(b);
      }),
    );
  });
  it('handles empty and single-element arrays without consuming randomness', () => {
    const r = Sfc32.from('e');
    const before = r.state();
    r.shuffle([]);
    r.shuffle([1]);
    expect(r.state()).toEqual(before);
  });
});

// Known-answer vectors, pinned from the §12.1 reference implementation.
const KAT_CYRB_EMPTY: [number, number, number, number] = [41608494, 3485963809, 1435736333, 1262568316];
const KAT_CYRB_SEED: [number, number, number, number] = [915038431, 1524068168, 2727014587, 3270920581];
const KAT_SFC_SEQ: number[] = [
  3151870838, 3390495249, 2837667472, 2808842897, 3296037417, 2032727205, 3397347769, 783360388,
];
const KAT_SHUFFLE: number[] = [1, 3, 2, 9, 5, 7, 6, 4, 0, 8];
