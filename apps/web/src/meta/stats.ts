// Everything the Stats ledger shows, derived from the per-day records (D-247). The streak reading is D-248:
// consecutive calendar days with a win, a loss or a missed day ends it, and an unplayed today does not.
import type { DayRecord } from '../persistence/meta';

const DAY_MS = 86_400_000;

function dayNumber(iso: string): number {
  const [y, m, d] = iso.split('-').map(Number);
  return Math.round(Date.UTC(y ?? 1970, (m ?? 1) - 1, d ?? 1) / DAY_MS);
}

export function addDays(iso: string, n: number): string {
  const t = new Date((dayNumber(iso) + n) * DAY_MS);
  const p = (x: number, w = 2): string => String(x).padStart(w, '0');
  return `${p(t.getUTCFullYear(), 4)}-${p(t.getUTCMonth() + 1)}-${p(t.getUTCDate())}`;
}

export interface Summary {
  readonly played: number;
  readonly won: number;
  /** whole percent, 0 when nothing is played */
  readonly winPct: number;
  readonly current: number;
  readonly best: number;
  /** mean of (rounds - par) over won duels, one decimal; null with no wins */
  readonly avgVsPar: number | null;
  readonly stars: number;
  /** wins per round count: index r holds the count for r rounds (index 0 unused) */
  readonly byRounds: readonly number[];
  readonly lost: number;
}

export function streaks(days: Readonly<Record<string, DayRecord>>, today: string): { current: number; best: number } {
  const wins = Object.keys(days)
    .filter((d) => days[d]?.won === true)
    .map(dayNumber)
    .sort((a, b) => a - b);
  let best = 0;
  let run = 0;
  let prev = Number.NaN;
  const lastOfRun = new Map<number, number>(); // last day number of a run -> its length
  for (const n of wins) {
    run = n === prev + 1 ? run + 1 : 1;
    prev = n;
    best = Math.max(best, run);
    lastOfRun.set(n, run);
  }
  const t = dayNumber(today);
  // a streak is live when it ends today, or yesterday while today is still unplayed
  const live = days[today] === undefined ? lastOfRun.get(t - 1) : lastOfRun.get(t);
  return { current: live ?? 0, best };
}

export function summarize(days: Readonly<Record<string, DayRecord>>, today: string, maxRounds: number): Summary {
  const all = Object.keys(days).map((d) => days[d] as DayRecord);
  const wonDays = all.filter((d) => d.won);
  const byRounds = new Array<number>(maxRounds + 1).fill(0);
  for (const d of wonDays) byRounds[Math.min(d.rounds, maxRounds)] = (byRounds[Math.min(d.rounds, maxRounds)] ?? 0) + 1;
  const { current, best } = streaks(days, today);
  const avg = wonDays.length === 0 ? null : Math.round((wonDays.reduce((s, d) => s + d.rounds - d.par, 0) / wonDays.length) * 10) / 10;
  return {
    played: all.length,
    won: wonDays.length,
    winPct: all.length === 0 ? 0 : Math.round((wonDays.length / all.length) * 100),
    current,
    best,
    avgVsPar: avg,
    stars: all.reduce((s, d) => s + d.stars, 0),
    byRounds,
    lost: all.length - wonDays.length,
  };
}
