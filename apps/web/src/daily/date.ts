// The local calendar date of the daily duel (DESIGN.md "Daily loop"). `?date=YYYY-MM-DD` overrides it (dev setting).
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
