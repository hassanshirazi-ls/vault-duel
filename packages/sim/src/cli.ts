// `sim quick | full | seed` (ARCHITECTURE.md §15). Defaults for the game and date counts come from the globals
// SIM_QUICK_GAMES, SIM_FULL_GAMES and SIM_SEED_CHECK_DATES, after the `--set` overrides have been applied.
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { checkKey } from '@vault-duel/ai';
import { OverridesError } from '@vault-duel/content';
import { ContentOverrideError } from './overrides';
import type { ContentOverrides } from './overrides';
import { addDays, dateRange, parseArgs, UsageError, USAGE } from './args';
import type { CliOptions } from './args';
import { mergeAll } from './aggregate';
import type { Aggregate } from './aggregate';
import { checkDates, summarise } from './difficulty-batch';
import type { SeedCheck } from './difficulty-batch';
import { balanceJobs } from './plan';
import { defaultWorkers, Pool } from './pool';
import { buildReport, writeReport } from './report';
import type { PerfInfo, Report, SeedRow } from './report';
import { buildManifest, inspectManifest, serializeManifest } from './seeds';
import { loadContext } from './world';
import type { SimContext } from './world';

const REPORTS_DIR = fileURLToPath(new URL('../../../docs/reports', import.meta.url));

/** Today as YYYY-MM-DD in local time (D-115: the default start date, and the date in a report's file name). */
function today(): string {
  const now = new Date();
  const p = (n: number): string => String(n).padStart(2, '0');
  return `${now.getFullYear()}-${p(now.getMonth() + 1)}-${p(now.getDate())}`;
}

const SEEDS_FILE = fileURLToPath(new URL('../../../apps/web/public/seeds.json', import.meta.url));

const log = (text: string): void => void process.stderr.write(`${text}\n`);

function seedRows(check: SeedCheck): SeedRow[] {
  return check.setups.map((s) => ({
    date: s.date,
    k: s.k,
    winRate: s.difficulty.winRate,
    stars: s.difficulty.stars,
    par: s.difficulty.par,
    check: s.difficulty.check,
    tried: check.candidates.filter((c) => c.date === s.date).length,
  }));
}

async function balanceRun(opts: CliOptions, ctx: SimContext, pool: Pool, games: number, dates: readonly string[]): Promise<{ aggregate: Aggregate; perf: Omit<PerfInfo, 'seedCheck'> }> {
  const parts: Aggregate[] = [];
  const byBot: PerfInfo['byBot'][number][] = [];
  let wall = 0;
  let busy = 0;
  let duels = 0;
  for (const bot of opts.bots) {
    const jobs = balanceJobs(ctx, bot, games, dates);
    log(`${bot}: ${jobs.length} duels over ${dates.length} dates`);
    const { aggregate, stats } = await pool.duels(jobs);
    parts.push(aggregate);
    wall += stats.wallMs / 1000;
    busy += stats.busyMs / 1000;
    duels += stats.duels;
    byBot.push({ bot, duels: stats.duels, busySeconds: stats.busyMs / 1000, duelsPerSecondPerCore: stats.duels / (stats.busyMs / 1000) });
  }
  return {
    aggregate: mergeAll(parts),
    perf: { workers: pool.size, duels, wallSeconds: wall, duelsPerSecond: duels / wall, duelsPerSecondPerCore: duels / busy, byBot },
  };
}

function summary(report: Report): string {
  const lines = [`\n${report.command}: ${report.results.targets.length + 1} metrics`];
  for (const m of [...report.results.targets, report.perf.metric]) {
    lines.push(`  ${m.id.padEnd(9)} ${m.name.padEnd(36)} ${m.bot.padEnd(13)} ${m.value === null ? 'n/a' : m.value.toFixed(3).padStart(8)}  target ${m.target}  ${m.verdict.toUpperCase()}`);
  }
  for (const a of [...report.results.anomalies, ...report.perf.anomalies]) lines.push(`  ANOMALY: ${a}`);
  return lines.join('\n');
}

async function main(argv: readonly string[]): Promise<number> {
  let opts: CliOptions;
  try {
    opts = parseArgs(argv);
  } catch (error) {
    if (error instanceof UsageError) {
      process.stderr.write(`sim: ${error.message}\n${USAGE}\n`);
      return 2;
    }
    throw error;
  }
  if (opts.ab !== undefined) {
    process.stderr.write('sim full --ab: not implemented (proposal A/B runs are Phase 3)\n');
    return 2;
  }
  const content: ContentOverrides = { ring: opts.ring, collector: opts.collector };
  let ctx: SimContext;
  try {
    ctx = loadContext(opts.sets, content);
  } catch (error) {
    if (error instanceof OverridesError) {
      process.stderr.write(`sim: bad --set\n${error.message}\n`);
      return 2;
    }
    if (error instanceof ContentOverrideError) {
      process.stderr.write(`sim: ${error.message}\n`);
      return 2;
    }
    throw error;
  }
  const g = ctx.globals;
  if (opts.command === 'seeds' && opts.check) {
    const path = opts.out ?? SEEDS_FILE;
    const text = ((): string | null => {
      try {
        return readFileSync(path, 'utf8');
      } catch {
        return null;
      }
    })();
    process.stdout.write(`${inspectManifest(text, checkKey(ctx), today(), path).lines.join('\n')}\n`);
    return 0; // a stale manifest is a warning, never an error (D-236)
  }
  const workers = opts.workers ?? defaultWorkers();
  const from = opts.from ?? today();
  const outDir = opts.out ?? REPORTS_DIR;
  const pool = await Pool.create(workers, opts.sets, content);
  try {
    if (opts.command === 'seeds') {
      const dates = dateRange(opts.from as string, opts.days as number);
      const path = opts.out ?? SEEDS_FILE;
      log(`seeds: ${dates.length} dates from ${dates[0]} to ${dates[dates.length - 1]}, ${workers} workers`);
      const start = performance.now();
      const check = await checkDates(pool, ctx, dates, (p) => log(`  round ${p.round}: ${p.waiting} candidates (${p.waiting * g.SIM_RUNS_PER_SEED} duels), ${dates.length - p.waiting} dates not waiting`));
      const seconds = (performance.now() - start) / 1000;
      const manifest = buildManifest(checkKey(ctx), check.setups);
      mkdirSync(dirname(path), { recursive: true });
      writeFileSync(path, serializeManifest(manifest));
      const fallback = check.setups.filter((s) => s.difficulty.check === 'fallback');
      process.stdout.write(
        `dates ${dates.length}, accepted ${dates.length - fallback.length}, fallback ${fallback.length}${fallback.length > 0 ? ` (${fallback.map((s) => s.date).join(', ')})` : ''}, duels ${check.duels}, ${seconds.toFixed(1)} s on ${workers} workers\nwrote ${path}\n`,
      );
      return 0;
    }
    if (opts.command === 'seed') {
      const date = opts.date as string;
      const start = performance.now();
      const check = await checkDates(pool, ctx, [date], (p) => log(`candidate ${p.candidates + 1}: ${g.SIM_RUNS_PER_SEED} duels`));
      const seconds = (performance.now() - start) / 1000;
      const setup = check.setups[0] as (typeof check.setups)[number];
      const out: string[] = [`seed ${setup.seedString} (expertHash ${check.expertHash})`];
      for (const c of check.candidates) {
        const ok = c.winRate >= g.SEED_WINRATE_MIN && c.winRate <= g.SEED_WINRATE_MAX;
        out.push(`  k=${String(c.k).padStart(2)}  win rate ${(c.winRate * 100).toFixed(1).padStart(5)}%  ${ok ? 'accepted' : 'rejected'}`);
      }
      out.push(`check: ${setup.difficulty.check}, k=${setup.k}, rerolls=${setup.k}, win rate ${(setup.difficulty.winRate * 100).toFixed(1)}%`);
      out.push(`stars: ${setup.difficulty.stars}, par: ${setup.difficulty.par}, twist: ${setup.twist}`);
      out.push(`deck: ${setup.deckList.join(', ')}`);
      out.push(`signature: ${setup.signature}; objectives: ${setup.objectives.join(', ')}`);
      out.push(`${check.duels} duels in ${seconds.toFixed(1)} s on ${workers} workers (${(check.duels / seconds).toFixed(0)} duels/s)`);
      process.stdout.write(`${out.join('\n')}\n`);
      return 0;
    }

    const games = opts.games ?? (opts.command === 'quick' ? g.SIM_QUICK_GAMES : g.SIM_FULL_GAMES);
    const dateCount = opts.seedDates ?? g.SIM_SEED_CHECK_DATES;
    const dates = dateRange(from, dateCount);
    log(`${opts.command}: ${games} games per bot, ${dateCount} dates from ${from} (to ${addDays(from, dateCount - 1)}), ${workers} workers`);
    const balance = await balanceRun(opts, ctx, pool, games, dates);
    let check: SeedCheck | null = null;
    let perf: PerfInfo = { ...balance.perf, seedCheck: null };
    if (opts.command === 'full' || opts.seedCheck) {
      log(`difficulty check: ${dateCount} dates, ${g.SIM_RUNS_PER_SEED} duels per candidate`);
      check = await checkDates(pool, ctx, dates, (p) => log(`  round ${p.round}: ${p.waiting} candidates (${p.waiting * g.SIM_RUNS_PER_SEED} duels)`));
      perf = { ...perf, seedCheck: { duels: check.duels, wallSeconds: check.stats.wallMs / 1000, duelsPerSecondPerCore: check.duels / (check.stats.busyMs / 1000) } };
    }
    const report = buildReport({
      command: opts.command,
      date: today(),
      args: { games, seedDates: dateCount, from, bots: opts.bots },
      globals: g,
      sets: opts.sets,
      contentOverrides: ctx.contentOverrides,
      globalsHash: checkKey(ctx).globalsHash,
      contentHash: ctx.content.hash,
      contentVersion: ctx.content.version,
      expertHash: checkKey(ctx).expertHash,
      aggregate: balance.aggregate,
      bots: opts.bots,
      perf,
      seedSummary: check === null ? null : summarise(check),
      seedRows: check === null ? [] : seedRows(check),
    });
    const paths = writeReport(report, outDir);
    process.stdout.write(`${summary(report)}\n\nwrote ${paths.md}\nwrote ${paths.json}\n`);
    return 0;
  } finally {
    await pool.close();
  }
}

process.exitCode = await main(process.argv.slice(2));
