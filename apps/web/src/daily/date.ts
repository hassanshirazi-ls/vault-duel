// The local calendar date of the daily duel (DESIGN.md "Daily loop"). `?date=YYYY-MM-DD` overrides it in dev builds only (D-262).
const ISO_DATE = /^(\d{4})-(\d{2})-(\d{2})$/;

export function isValidDate(text: string): boolean {
  const m = ISO_DATE.exec(text);
  if (m === null) return false;
  const [y, mo, d] = [Number(m[1]), Number(m[2]), Number(m[3])];
  const probe = new Date(Date.UTC(y, mo - 1, d));
  return probe.getUTCFullYear() === y && probe.getUTCMonth() === mo - 1 && probe.getUTCDate() === d;
}

/** The reset hour as a whole hour 0..23 (D-104); anything else falls back to local midnight. */
function resetHour(h: number): number {
  return Number.isInteger(h) && h >= 0 && h <= 23 ? h : 0;
}

/** The start of the duel day `now` belongs to: the most recent local `resetHour` o'clock (calendar arithmetic, so DST days work). */
function dayStart(now: Date, hour: number): Date {
  const start = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  start.setHours(hour, 0, 0, 0);
  if (now.getTime() < start.getTime()) {
    start.setDate(start.getDate() - 1);
    start.setHours(hour, 0, 0, 0);
  }
  return start;
}

/** The date of the duel running at `now`: with a reset hour of 4, 02:00 on Oct 21 is still the Oct 20 duel (D-104). */
export function localDate(now: Date, resetHourLocal = 0): string {
  const d = dayStart(now, resetHour(resetHourLocal));
  const p = (n: number, w = 2): string => String(n).padStart(w, '0');
  return `${p(d.getFullYear(), 4)}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}

/** The override from a query string when it is a real date, else today's local date. */
export function resolveDate(search: string, now: Date, resetHourLocal = 0): string {
  const override = new URLSearchParams(search).get('date');
  return override !== null && isValidDate(override) ? override : localDate(now, resetHourLocal);
}

/** Whole minutes from `now` until the next reset (local midnight by default), when the next daily duel opens (never less than 1). */
export function minutesToNextDuel(now: Date, resetHourLocal = 0): number {
  const next = dayStart(now, resetHour(resetHourLocal));
  next.setDate(next.getDate() + 1);
  next.setHours(resetHour(resetHourLocal), 0, 0, 0);
  return Math.max(1, Math.ceil((next.getTime() - now.getTime()) / 60000));
}

/** "14h 12m", or "42m" under an hour. */
export function formatCountdown(minutes: number): string {
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return h > 0 ? `${h}h ${m}m` : `${m}m`;
}
