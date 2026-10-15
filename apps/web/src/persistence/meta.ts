// Local stats and Binder records (D-247, D-238). Both are small versioned JSON values in browser storage. They are
// keyed by calendar date, so recording the same day twice changes nothing (a reload after the Result is safe), and
// every number on the Stats page is derived from them (see meta/stats.ts) rather than kept as a counter that could drift.
// A record written by a newer build (`v` above ours) is read as empty and never overwritten.
import { getJson } from './storage';
import type { KV } from './storage';

export const STATS_VERSION = 1;
export const BINDER_VERSION = 1;
export const STATS_KEY = 'vd:stats';
export const BINDER_KEY = 'vd:binder';

export interface DayRecord {
  readonly won: boolean;
  /** rounds played when the duel ended */
  readonly rounds: number;
  readonly par: number;
  /** the player's life at the end (0 on a loss) */
  readonly life: number;
  /** bonus objectives met, 0..OBJECTIVE_STARS_MAX */
  readonly stars: number;
}

export interface StatsRecord {
  readonly v: typeof STATS_VERSION;
  /** the first counted result of each date, `YYYY-MM-DD` -> record */
  readonly days: Readonly<Record<string, DayRecord>>;
}

export interface BinderRecord {
  readonly v: typeof BINDER_VERSION;
  /** won date -> signature card id */
  readonly signatures: Readonly<Record<string, string>>;
  /** Chimera family id -> the date it was first discovered */
  readonly families: Readonly<Record<string, string>>;
}

export const emptyStats = (): StatsRecord => ({ v: STATS_VERSION, days: {} });
export const emptyBinder = (): BinderRecord => ({ v: BINDER_VERSION, signatures: {}, families: {} });

const DATE = /^\d{4}-\d{2}-\d{2}$/;
const isObj = (x: unknown): x is Record<string, unknown> => typeof x === 'object' && x !== null && !Array.isArray(x);
const isCount = (x: unknown): x is number => typeof x === 'number' && Number.isInteger(x) && x >= 0;

function cleanDay(x: unknown): DayRecord | null {
  if (!isObj(x)) return null;
  const { won, rounds, par, life, stars } = x;
  if (typeof won !== 'boolean' || !isCount(rounds) || rounds < 1 || !isCount(par) || !isCount(life) || !isCount(stars)) return null;
  return { won, rounds, par, life, stars };
}

/** Keeps only well-formed entries, so one bad value never costs the player the rest. */
function readStats(raw: unknown): StatsRecord | null {
  if (!isObj(raw) || typeof raw['v'] !== 'number' || raw['v'] > STATS_VERSION || !isObj(raw['days'])) return null;
  const days: Record<string, DayRecord> = {};
  for (const date of Object.keys(raw['days'])) {
    const d = DATE.test(date) ? cleanDay(raw['days'][date]) : null;
    if (d !== null) days[date] = d;
  }
  return { v: STATS_VERSION, days };
}

function readBinder(raw: unknown): BinderRecord | null {
  if (!isObj(raw) || typeof raw['v'] !== 'number' || raw['v'] > BINDER_VERSION) return null;
  const signatures: Record<string, string> = {};
  if (isObj(raw['signatures'])) {
    for (const k of Object.keys(raw['signatures'])) {
      const x = raw['signatures'][k];
      if (DATE.test(k) && typeof x === 'string' && x !== '') signatures[k] = x;
    }
  }
  const families: Record<string, string> = {};
  if (isObj(raw['families'])) {
    for (const k of Object.keys(raw['families'])) {
      const x = raw['families'][k];
      if (k !== '' && typeof x === 'string' && DATE.test(x)) families[k] = x;
    }
  }
  return { v: BINDER_VERSION, signatures, families };
}

export function loadStats(kv: KV): StatsRecord {
  return readStats(getJson(kv, STATS_KEY)) ?? emptyStats();
}

export function loadBinder(kv: KV): BinderRecord {
  return readBinder(getJson(kv, BINDER_KEY)) ?? emptyBinder();
}

/** True when storage holds a value from a newer build, which this build must leave alone. */
function newerOnDisk(kv: KV, key: string, version: number): boolean {
  const raw = getJson(kv, key);
  return isObj(raw) && typeof raw['v'] === 'number' && raw['v'] > version;
}

function write(kv: KV, key: string, version: number, value: unknown): boolean {
  if (newerOnDisk(kv, key, version)) return false;
  return kv.set(key, JSON.stringify(value));
}

export interface DailyOutcome {
  readonly date: string;
  readonly day: DayRecord;
  /** the day's signature card id, added to the Binder on a win */
  readonly signature: string;
  /** Chimera family ids grafted in this duel (a loss counts too) */
  readonly families: readonly string[];
}

export interface Recorded {
  readonly stats: StatsRecord;
  readonly binder: BinderRecord;
  /** false when the date was already recorded; nothing was written */
  readonly fresh: boolean;
  readonly newFamilies: readonly string[];
}

/** Records the daily duel's result. Only the daily calls this; Practice never does (D-247). Idempotent per date. */
export function recordDaily(kv: KV, outcome: DailyOutcome): Recorded {
  const stats = loadStats(kv);
  const binder = loadBinder(kv);
  if (stats.days[outcome.date] !== undefined) return { stats, binder, fresh: false, newFamilies: [] };
  const nextStats: StatsRecord = { v: STATS_VERSION, days: { ...stats.days, [outcome.date]: outcome.day } };
  const newFamilies = [...new Set(outcome.families)].filter((f) => binder.families[f] === undefined);
  const families = { ...binder.families };
  for (const f of newFamilies) families[f] = outcome.date;
  const signatures = outcome.day.won ? { ...binder.signatures, [outcome.date]: outcome.signature } : binder.signatures;
  const nextBinder: BinderRecord = { v: BINDER_VERSION, signatures, families };
  write(kv, STATS_KEY, STATS_VERSION, nextStats);
  write(kv, BINDER_KEY, BINDER_VERSION, nextBinder);
  return { stats: nextStats, binder: nextBinder, fresh: true, newFamilies };
}
