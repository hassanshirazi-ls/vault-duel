import { describe, expect, it } from 'vitest';
import { isValidDate, localDate, minutesToNextDuel, resolveDate } from '../src/daily/date';

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

describe('reset hour (D-104)', () => {
  it('0 equals local midnight', () => {
    expect(localDate(new Date(2026, 9, 21, 0, 30), 0)).toBe('2026-10-21');
    expect(localDate(new Date(2026, 9, 21, 23, 59), 0)).toBe('2026-10-21');
    expect(minutesToNextDuel(new Date(2026, 9, 20, 22, 0))).toBe(120);
    expect(minutesToNextDuel(new Date(2026, 9, 20, 22, 0), 0)).toBe(120);
  });
  it('4 keeps 02:00 on the previous duel and counts down to 04:00', () => {
    expect(localDate(new Date(2026, 9, 21, 2, 0), 4)).toBe('2026-10-20');
    expect(localDate(new Date(2026, 9, 21, 3, 59), 4)).toBe('2026-10-20');
    expect(localDate(new Date(2026, 9, 21, 4, 0), 4)).toBe('2026-10-21');
    expect(localDate(new Date(2026, 0, 1, 1, 0), 4)).toBe('2025-12-31');
    expect(minutesToNextDuel(new Date(2026, 9, 21, 2, 0), 4)).toBe(120);
    expect(minutesToNextDuel(new Date(2026, 9, 21, 5, 0), 4)).toBe(23 * 60);
    expect(resolveDate('', new Date(2026, 9, 21, 2, 0), 4)).toBe('2026-10-20');
    expect(resolveDate('?date=2027-03-04', new Date(2026, 9, 21, 2, 0), 4)).toBe('2027-03-04');
  });
  it('uses calendar hours across a DST change', () => {
    // The countdown must equal the real elapsed time to the next reset wall-clock time, whatever the zone does.
    for (const [y, m, d] of [[2026, 2, 8], [2026, 2, 29], [2026, 9, 25], [2026, 10, 1]] as const) {
      const now = new Date(y, m, d, 1, 0);
      const target = new Date(y, m, d, 4, 0);
      expect(minutesToNextDuel(now, 4)).toBe(Math.ceil((target.getTime() - now.getTime()) / 60000));
      expect(localDate(now, 4)).toBe(localDate(new Date(y, m, d - 1, 12), 0));
      expect(localDate(target, 4)).toBe(localDate(new Date(y, m, d, 12), 0));
    }
  });
  it('ignores an invalid hour', () => {
    expect(localDate(new Date(2026, 9, 21, 2, 0), 99)).toBe('2026-10-21');
    expect(localDate(new Date(2026, 9, 21, 2, 0), 1.5)).toBe('2026-10-21');
  });
});
