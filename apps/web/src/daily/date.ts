// The local calendar date of the daily duel (DESIGN.md "Daily loop"). `?date=YYYY-MM-DD` overrides it in dev builds only (D-262).
const ISO_DATE = /^(\d{4})-(\d{2})-(\d{2})$/;

export function isValidDate(text: string): boolean {
  const m = ISO_DATE.exec(text);
  if (m === null) return false;
  const [y, mo, d] = [Number(m[1]), Number(m[2]), Number(m[3])];
  const probe = new Date(Date.UTC(y, mo - 1, d));
  return probe.getUTCFullYear() === y && probe.getUTCMonth() === mo - 1 && probe.getUTCDate() === d;
}

export function localDate(now: Date): string {
  const p = (n: number, w = 2): string => String(n).padStart(w, '0');
  return `${p(now.getFullYear(), 4)}-${p(now.getMonth() + 1)}-${p(now.getDate())}`;
}

/** The override from a query string when it is a real date, else today's local date. */
export function resolveDate(search: string, now: Date): string {
  const override = new URLSearchParams(search).get('date');
  return override !== null && isValidDate(override) ? override : localDate(now);
}

/** Whole minutes from `now` until the next local midnight, when the next daily duel opens (never less than 1). */
export function minutesToNextDuel(now: Date): number {
  const midnight = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1);
  return Math.max(1, Math.ceil((midnight.getTime() - now.getTime()) / 60000));
}

/** "14h 12m", or "42m" under an hour. */
export function formatCountdown(minutes: number): string {
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return h > 0 ? `${h}h ${m}m` : `${m}m`;
}
