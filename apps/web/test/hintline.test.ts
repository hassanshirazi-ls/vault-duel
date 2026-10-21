import { describe, expect, it } from 'vitest';
import { hintLine } from '../src/view/hintline';

const base = { blocked: false, selecting: false, telegraph: false, quipLive: false };

describe('the line above the hand (D-373)', () => {
  it('your turn: selection hint > quip > intent echo', () => {
    expect(hintLine({ ...base, selecting: true, quipLive: true })).toBe('selection');
    expect(hintLine({ ...base, quipLive: true })).toBe('quip');
    expect(hintLine(base)).toBe('echo');
  });
  it('his turn: telegraph > quip > the acting text', () => {
    expect(hintLine({ ...base, blocked: true, telegraph: true, quipLive: true })).toBe('telegraph');
    expect(hintLine({ ...base, blocked: true, quipLive: true })).toBe('quip');
    expect(hintLine({ ...base, blocked: true })).toBe('acting');
  });
});
