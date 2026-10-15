import { describe, expect, it } from 'vitest';
import { buildFeedbackUrl, buildLabel } from '../src/view/feedback';
import { HOWTO_KEY, HOWTO_VERSION, howToSeen, markHowToSeen } from '../src/persistence/howto';
import { memoryStorage } from '../src/persistence/storage';
import type { KV } from '../src/persistence/storage';

const P = { date: '2026-10-15', seed: 'vault-duel:2026-10-15:0.1.0', build: 'abc1234+0.1.0' };

describe('feedback link builder', () => {
  it('appends date, seed and build', () => {
    const u = new URL(buildFeedbackUrl('https://tally.so/r/test', P) as string);
    expect(u.origin + u.pathname).toBe('https://tally.so/r/test');
    expect(u.searchParams.get('date')).toBe(P.date);
    expect(u.searchParams.get('seed')).toBe(P.seed);
    expect(u.searchParams.get('build')).toBe(P.build);
  });
  it('keeps existing params and replaces ours instead of duplicating', () => {
    const u = new URL(buildFeedbackUrl('https://tally.so/r/x?transparentBackground=1&date=old', P) as string);
    expect(u.searchParams.get('transparentBackground')).toBe('1');
    expect(u.searchParams.getAll('date')).toEqual([P.date]);
  });
  it('encodes awkward values', () => {
    const u = buildFeedbackUrl('https://tally.so/r/x', { ...P, seed: 'a b&c=d#e' }) as string;
    expect(new URL(u).searchParams.get('seed')).toBe('a b&c=d#e');
  });
  it('hides the link for unset, empty, malformed or non-https bases', () => {
    for (const base of [undefined, '', '   ', 'tally.so/r/x', 'http://tally.so/r/x', 'javascript:alert(1)']) {
      expect(buildFeedbackUrl(base, P)).toBeNull();
    }
  });
  it('formats the build label', () => {
    expect(buildLabel('abc1234', '0.1.0')).toBe('abc1234+0.1.0');
  });
});

describe('How to play seen flag', () => {
  it('is unseen, then seen after marking', () => {
    const kv = memoryStorage();
    expect(howToSeen(kv)).toBe(false);
    markHowToSeen(kv);
    expect(howToSeen(kv)).toBe(true);
  });
  it('shows again when the stored version is older or the value is corrupt', () => {
    const kv = memoryStorage();
    kv.set(HOWTO_KEY, JSON.stringify({ v: HOWTO_VERSION - 1 }));
    expect(howToSeen(kv)).toBe(false);
    kv.set(HOWTO_KEY, 'not json');
    expect(howToSeen(kv)).toBe(false);
  });
  it('survives a storage that throws', () => {
    const boom: KV = {
      get() {
        throw new Error('denied');
      },
      set() {
        throw new Error('full');
      },
      remove() {
        throw new Error('denied');
      },
    };
    expect(howToSeen(boom)).toBe(false);
    expect(() => markHowToSeen(boom)).not.toThrow();
  });
});
