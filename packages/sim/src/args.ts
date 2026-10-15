// Command-line parsing (ARCHITECTURE.md §15). Pure: it checks the shape of the arguments, not the values of the globals;
// defaults that come from globals (SIM_QUICK_GAMES and the others) are filled in by the CLI after the `--set` overrides apply.
import { BOT_IDS, isBotId } from './jobs';
import type { BotId } from './jobs';

export type Command = 'quick' | 'full' | 'seed';

export interface CliOptions {
  readonly command: Command;
  /** games per bot; undefined means the command's SIM_*_GAMES global */
  readonly games: number | undefined;
  /** consecutive dates; undefined means SIM_SEED_CHECK_DATES */
  readonly seedDates: number | undefined;
  /** first date, YYYY-MM-DD; undefined means the CLI's default start date */
  readonly from: string | undefined;
  readonly bots: readonly BotId[];
  readonly sets: readonly string[];
  readonly workers: number | undefined;
  readonly out: string | undefined;
  /** the date of `sim seed` */
  readonly date: string | undefined;
  /** `sim full --ab <id>`: not implemented (Phase 3) */
  readonly ab: string | undefined;
}

export class UsageError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'UsageError';
  }
}

export const USAGE = `usage:
  sim quick [--games N] [--seed-dates N] [--from DATE] [--bots expert,novice] [--set K=V]... [--workers N] [--out DIR]
  sim full  [--games N] [--seed-dates N] [--from DATE] [--bots ...] [--set K=V]... [--workers N] [--out DIR]
  sim seed  <YYYY-MM-DD> [--set K=V]... [--workers N]
bots: ${BOT_IDS.join(', ')}`;

const DATE = /^\d{4}-\d{2}-\d{2}$/;

/** True for a real calendar date written YYYY-MM-DD. */
export function isDate(text: string): boolean {
  if (!DATE.test(text)) return false;
  const [y, m, d] = text.split('-').map(Number) as [number, number, number];
  const at = new Date(Date.UTC(y, m - 1, d));
  return at.getUTCFullYear() === y && at.getUTCMonth() === m - 1 && at.getUTCDate() === d;
}

function positiveInt(flag: string, text: string): number {
  if (!/^\d+$/.test(text) || Number(text) < 1) throw new UsageError(`${flag} needs a whole number of at least 1, got "${text}"`);
  return Number(text);
}

const VALUE_FLAGS = ['--games', '--seed-dates', '--from', '--bots', '--set', '--workers', '--out', '--ab'] as const;

export function parseArgs(argv: readonly string[]): CliOptions {
  const [command, ...rest] = argv;
  if (command !== 'quick' && command !== 'full' && command !== 'seed') {
    throw new UsageError(command === undefined ? 'missing command' : `unknown command "${command}"`);
  }
  let games: number | undefined;
  let seedDates: number | undefined;
  let from: string | undefined;
  let bots: BotId[] | undefined;
  const sets: string[] = [];
  let workers: number | undefined;
  let out: string | undefined;
  let date: string | undefined;
  let ab: string | undefined;

  for (let i = 0; i < rest.length; i++) {
    const arg = rest[i] as string;
    if (!arg.startsWith('--')) {
      if (command !== 'seed' || date !== undefined) throw new UsageError(`unexpected argument "${arg}"`);
      date = arg;
      continue;
    }
    const eq = arg.indexOf('=');
    const flag = eq < 0 ? arg : arg.slice(0, eq);
    if (!(VALUE_FLAGS as readonly string[]).includes(flag)) throw new UsageError(`unknown flag "${flag}"`);
    let value: string;
    if (eq >= 0) value = arg.slice(eq + 1);
    else {
      const next = rest[++i];
      if (next === undefined) throw new UsageError(`${flag} needs a value`);
      value = next;
    }
    switch (flag) {
      case '--games':
        games = positiveInt(flag, value);
        break;
      case '--seed-dates':
        seedDates = positiveInt(flag, value);
        break;
      case '--workers':
        workers = positiveInt(flag, value);
        break;
      case '--from':
        if (!isDate(value)) throw new UsageError(`--from needs a date YYYY-MM-DD, got "${value}"`);
        from = value;
        break;
      case '--bots': {
        const ids = value.split(',').filter((id) => id !== '');
        if (ids.length === 0) throw new UsageError('--bots needs at least one bot');
        const unique: BotId[] = [];
        for (const id of ids) {
          if (!isBotId(id)) throw new UsageError(`unknown bot "${id}" (use ${BOT_IDS.join(', ')})`);
          if (!unique.includes(id)) unique.push(id);
        }
        bots = unique;
        break;
      }
      case '--set':
        sets.push(value);
        break;
      case '--out':
        out = value;
        break;
      case '--ab':
        ab = value;
        break;
    }
  }
  if (command === 'seed') {
    if (date === undefined) throw new UsageError('sim seed needs a date: sim seed YYYY-MM-DD');
    if (!isDate(date)) throw new UsageError(`sim seed needs a date YYYY-MM-DD, got "${date}"`);
  }
  if (ab !== undefined && command !== 'full') throw new UsageError('--ab belongs to sim full');
  return { command, games, seedDates, from, bots: bots ?? ['expert', 'novice'], sets, workers, out, date, ab };
}

/** The date `n` days after `date` (UTC calendar arithmetic). */
export function addDays(date: string, n: number): string {
  const [y, m, d] = date.split('-').map(Number) as [number, number, number];
  return new Date(Date.UTC(y, m - 1, d + n)).toISOString().slice(0, 10);
}

/** `count` consecutive dates from `from`. */
export function dateRange(from: string, count: number): string[] {
  return Array.from({ length: count }, (_, i) => addDays(from, i));
}
