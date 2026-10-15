// Month grid for the Binder's Signatures tab. Pure date arithmetic on `YYYY-MM-DD` strings; weeks start on Monday.
export interface MonthCell {
  readonly date: string;
  readonly day: number;
}

export interface Month {
  readonly year: number;
  readonly month: number; // 1-12
  /** leading blanks before day 1, Monday-first */
  readonly lead: number;
  readonly days: readonly MonthCell[];
}

const p2 = (n: number): string => String(n).padStart(2, '0');

export function monthOf(iso: string): { year: number; month: number } {
  const [y, m] = iso.split('-').map(Number);
  return { year: y ?? 1970, month: m ?? 1 };
}

export function shiftMonth(m: { year: number; month: number }, by: number): { year: number; month: number } {
  const idx = m.year * 12 + (m.month - 1) + by;
  return { year: Math.floor(idx / 12), month: (idx % 12) + 1 };
}

export function buildMonth(year: number, month: number): Month {
  const count = new Date(Date.UTC(year, month, 0)).getUTCDate();
  const firstDow = new Date(Date.UTC(year, month - 1, 1)).getUTCDay(); // 0 = Sunday
  return {
    year,
    month,
    lead: (firstDow + 6) % 7,
    days: Array.from({ length: count }, (_, i) => ({ date: `${String(year).padStart(4, '0')}-${p2(month)}-${p2(i + 1)}`, day: i + 1 })),
  };
}
