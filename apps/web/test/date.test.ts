import { describe, expect, it } from 'vitest';
import { isValidDate, localDate, resolveDate } from '../src/daily/date';

describe('date', () => {
  it('formats the local date with padding', () => {
    expect(localDate(new Date(2026, 0, 5, 23, 59))).toBe('2026-01-05');
  });
  it('accepts only real calendar dates', () => {
    expect(isValidDate('2026-02-28')).toBe(true);
    expect(isValidDate('2026-02-30')).toBe(false);
    expect(isValidDate('26-02-01')).toBe(false);
  });
  it('lets ?date= override, and ignores a bad override', () => {
    const now = new Date(2026, 9, 15, 12);
    expect(resolveDate('?date=2027-03-04', now)).toBe('2027-03-04');
    expect(resolveDate('?date=nope', now)).toBe('2026-10-15');
    expect(resolveDate('', now)).toBe('2026-10-15');
  });
});
