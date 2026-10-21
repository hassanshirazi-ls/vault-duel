// The precomputed daily-seed manifest (D-236). `buildManifest` turns checked days into the file's shape; `inspectManifest`
// is the `--check` report. Neither plays a duel: the rating comes from `checkDates`, which runs ai's own prepareDay.
import type { CheckKey, DailySetup } from '@vault-duel/ai';
import { addDays, dateRange } from './args';

export interface ManifestRating {
  readonly k: number;
  readonly winRate: number;
  readonly stars: 1 | 2 | 3;
  readonly par: number;
  readonly check: 'accepted' | 'fallback';
}

export interface Manifest extends CheckKey {
  readonly days: Readonly<Record<string, ManifestRating>>;
}

/** Dates ascending, fixed key order, so the bytes depend only on the ratings (never on worker count or completion order). */
export function buildManifest(key: CheckKey, setups: readonly DailySetup[]): Manifest {
  const days: Record<string, ManifestRating> = {};
  for (const s of [...setups].sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0))) {
    const d = s.difficulty;
    days[s.date] = { k: s.k, winRate: d.winRate, stars: d.stars, par: d.par, check: d.check };
  }
  return { contentHash: key.contentHash, globalsHash: key.globalsHash, expertHash: key.expertHash, days };
}

export const serializeManifest = (m: Manifest): string => `${JSON.stringify(m, null, 2)}\n`;

/** The same acceptance rules as the web reader (apps/web/src/daily/manifest.ts parseManifest); duplicated, not imported. */
export function parseManifestText(text: string): Manifest | null {
  let v: unknown;
  try {
    v = JSON.parse(text);
  } catch {
    return null;
  }
  const isObj = (x: unknown): x is Record<string, unknown> => typeof x === 'object' && x !== null && !Array.isArray(x);
  if (!isObj(v) || !isObj(v['days'])) return null;
  const { contentHash, globalsHash, expertHash } = v;
  if (typeof contentHash !== 'string' || typeof globalsHash !== 'string' || typeof expertHash !== 'string') return null;
  const days: Record<string, ManifestRating> = {};
  for (const [date, raw] of Object.entries(v['days'])) {
    if (!isObj(raw)) return null;
    const { k, winRate, stars, par, check } = raw;
    if (typeof k !== 'number' || !Number.isInteger(k) || k < 0) return null;
    if (typeof winRate !== 'number' || typeof par !== 'number') return null;
    if (stars !== 1 && stars !== 2 && stars !== 3) return null;
    if (check !== 'accepted' && check !== 'fallback') return null;
    days[date] = { k, winRate, stars, par, check };
  }
  return { contentHash, globalsHash, expertHash, days };
}

export interface ManifestInspection {
  readonly status: 'match' | 'mismatch' | 'missing' | 'unreadable';
  /** hashes that differ from the current key */
  readonly differing: readonly string[];
  readonly range: { readonly first: string; readonly last: string; readonly count: number } | null;
  /** of the next `horizon` days from today (today included), the dates the manifest lacks */
  readonly missingAhead: readonly string[];
  readonly lines: readonly string[];
}

export const HORIZON_DAYS = 30;

/** The regenerate command: from yesterday, since Practice plays yesterday's vault (D-375), then 90 days ahead. */
export const regenerateHint = (today: string): string => `pnpm seeds --from ${addDays(today, -1)} --days 91`;

/** `text` is the file's content, or null when there is no file. Never throws: a stale manifest is a warning (D-236). */
export function inspectManifest(text: string | null, key: CheckKey, today: string, path: string): ManifestInspection {
  const warn = (status: 'missing' | 'unreadable', msg: string): ManifestInspection => ({
    status,
    differing: [],
    range: null,
    missingAhead: dateRange(today, HORIZON_DAYS),
    lines: [`WARNING: ${msg} The app will rate every day on the device. Regenerate with: ${regenerateHint(today)}`],
  });
  if (text === null) return warn('missing', `no seeds manifest at ${path}.`);
  const m = parseManifestText(text);
  if (m === null) return warn('unreadable', `the seeds manifest at ${path} is not a valid manifest.`);
  const differing = (['contentHash', 'globalsHash', 'expertHash'] as const).filter((h) => m[h] !== key[h]);
  const dates = Object.keys(m.days).sort();
  const range = dates.length === 0 ? null : { first: dates[0] as string, last: dates[dates.length - 1] as string, count: dates.length };
  const missingAhead = dateRange(today, HORIZON_DAYS).filter((d) => m.days[d] === undefined);
  const lines = [`seeds manifest ${path}: ${range === null ? 'no days' : `${range.count} days, ${range.first} to ${range.last}`}`];
  if (differing.length > 0) {
    lines.push(`WARNING: the manifest was made for a different build (${differing.join(', ')} differ), so the app ignores it and rates every day on the device. Regenerate with: ${regenerateHint(today)}`);
  }
  if (missingAhead.length > 0) {
    lines.push(`${differing.length > 0 ? 'note' : 'WARNING'}: ${missingAhead.length} of the next ${HORIZON_DAYS} days from ${today} are not in the manifest (${missingAhead[0]}${missingAhead.length > 1 ? ` ..` : ''}).`);
  }
  if (m.days[addDays(today, -1)] === undefined) {
    lines.push(`note: yesterday (${addDays(today, -1)}) is not in the manifest, so Practice rates it on the device. Regenerate with: ${regenerateHint(today)}`);
  }
  if (differing.length === 0 && missingAhead.length === 0) lines.push(`manifest matches this build and covers the next ${HORIZON_DAYS} days.`);
  return { status: differing.length > 0 ? 'mismatch' : 'match', differing, range, missingAhead, lines };
}
