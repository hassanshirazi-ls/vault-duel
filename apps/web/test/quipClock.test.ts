import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { QUIP_FADE_MS, QUIP_MS, scheduleQuip } from '../src/ui/quipClock';
import type { QuipPhase } from '../src/ui/quipClock';

// The wiring Duel.tsx uses: a quip is live until the clock says 'gone' for ITS key.
function harness() {
  let clock: { key: number; phase: QuipPhase } | null = null;
  const set = (key: number, phase: QuipPhase) => {
    clock = { key, phase };
  };
  const live = (key: number) => !(clock?.key === key && clock.phase === 'gone');
  return { set, live, fading: (key: number) => clock?.key === key && clock.phase === 'fading' };
}

describe('the quip clock (D-373)', () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it('fades for the last stretch, then is gone', () => {
    const h = harness();
    scheduleQuip(1, h.set);
    vi.advanceTimersByTime(QUIP_MS - QUIP_FADE_MS - 1);
    expect(h.live(1) && !h.fading(1)).toBe(true);
    vi.advanceTimersByTime(1);
    expect(h.fading(1)).toBe(true);
    vi.advanceTimersByTime(QUIP_FADE_MS);
    expect(h.live(1)).toBe(false);
  });

  it('a new quip after an Undo (same action count, fresh key) is live', () => {
    const h = harness();
    scheduleQuip(1, h.set);
    vi.advanceTimersByTime(QUIP_MS);
    expect(h.live(1)).toBe(false);
    scheduleQuip(2, h.set);
    expect(h.live(2)).toBe(true);
    vi.advanceTimersByTime(QUIP_MS - 1);
    expect(h.live(2)).toBe(true);
  });

  it('a restart inside the window cancels the old timers and gets a full time', () => {
    const h = harness();
    const cancel = scheduleQuip(1, h.set);
    vi.advanceTimersByTime(4000);
    cancel();
    scheduleQuip(2, h.set);
    vi.advanceTimersByTime(QUIP_MS - 1);
    expect(h.live(2)).toBe(true);
    expect(h.live(1)).toBe(true);
    vi.advanceTimersByTime(1);
    expect(h.live(2)).toBe(false);
  });
});
