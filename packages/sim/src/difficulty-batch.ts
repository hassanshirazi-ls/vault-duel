// The difficulty check across the worker pool (ARCHITECTURE.md §15; D-228, D-225). It does not re-implement the check:
// ai's prepareDay/rateSeed run unchanged, with a DuelRunner that answers from a cache. When rateSeed asks for a duel the
// cache lacks, the runner throws; the driver then plays that whole candidate (SIM_RUNS_PER_SEED duels) on the pool for
// every date that is waiting, stores the outcomes, and re-runs prepareDay. Dates therefore advance together, one reroll
// per round, and all the cores stay busy. The cache key carries expertHash (D-225), so a cache never outlives the weights.
import { checkKey, prepareDay } from '@vault-duel/ai';
import type { DailySetup, DuelJob, DuelOutcome, DuelRunner } from '@vault-duel/ai';
import type { Pool, RunStats } from './pool';
import type { SimContext } from './world';

/** A runner that has no answer yet: `job` names the first duel of the candidate that must be played. */
class MissingDuel extends Error {
  constructor(readonly job: DuelJob) {
    super(`duel not yet played: ${job.seedString}#${job.k}/${job.runIndex}`);
  }
}

export interface CandidateRecord {
  readonly date: string;
  readonly k: number;
  readonly winRate: number;
}

export interface SeedCheck {
  readonly setups: readonly DailySetup[];
  /** every candidate that was played, by date then k */
  readonly candidates: readonly CandidateRecord[];
  readonly expertHash: string;
  readonly duels: number;
  readonly stats: RunStats;
}

export interface SeedCheckSummary {
  readonly dates: number;
  readonly candidates: number;
  readonly rejected: number;
  /** rejected candidates / candidates tried (the share of seeds the check threw away) */
  readonly rejectionRate: number;
  readonly datesNeedingReroll: number;
  readonly meanRerolls: number;
  readonly fallbacks: number;
  /** candidate win rates in tenths: bin i holds [i/10, (i+1)/10), the last bin includes 1 */
  readonly winRateHistogram: readonly number[];
}

export const WINRATE_BINS = 10;

export function summarise(check: Pick<SeedCheck, 'setups' | 'candidates'>): SeedCheckSummary {
  const dates = check.setups.length;
  let tried = 0;
  let rerolls = 0;
  let needing = 0;
  let fallbacks = 0;
  for (const setup of check.setups) {
    const fallback = setup.difficulty.check === 'fallback';
    const candidates = check.candidates.filter((c) => c.date === setup.date).length;
    tried += candidates;
    const rejectedHere = fallback ? candidates : candidates - 1;
    rerolls += rejectedHere;
    if (rejectedHere > 0) needing++;
    if (fallback) fallbacks++;
  }
  const histogram = new Array<number>(WINRATE_BINS).fill(0);
  for (const c of check.candidates) {
    const bin = Math.min(WINRATE_BINS - 1, Math.floor(c.winRate * WINRATE_BINS));
    histogram[bin] = (histogram[bin] as number) + 1;
  }
  return {
    dates,
    candidates: tried,
    rejected: rerolls,
    rejectionRate: tried === 0 ? Number.NaN : rerolls / tried,
    datesNeedingReroll: needing,
    meanRerolls: dates === 0 ? Number.NaN : rerolls / dates,
    fallbacks,
    winRateHistogram: histogram,
  };
}

export type CheckProgress = (info: { round: number; waiting: number; candidates: number }) => void;

/** Runs prepareDay for each date on the pool. Results are the same as `prepareDay` with ai's own runner (D-228). */
export async function checkDates(
  pool: Pool,
  ctx: SimContext,
  dates: readonly string[],
  onProgress?: CheckProgress,
): Promise<SeedCheck> {
  const hash = checkKey(ctx).expertHash;
  const runs = ctx.globals.SIM_RUNS_PER_SEED;
  const key = (seedString: string, k: number, runIndex: number): string => `${hash}|${seedString}|${k}|${runIndex}`;
  const cache = new Map<string, DuelOutcome>();
  const runner: DuelRunner = (job) => {
    const hit = cache.get(key(job.seedString, job.k, job.runIndex));
    if (hit === undefined) throw new MissingDuel(job);
    return hit;
  };
  const setups = new Map<string, DailySetup>();
  const candidates: CandidateRecord[] = [];
  const total: RunStats = { busyMs: 0, wallMs: 0, duels: 0 };
  let round = 0;
  for (;;) {
    const need = new Map<string, DuelJob>();
    const owners = new Map<string, string>();
    for (const date of dates) {
      if (setups.has(date)) continue;
      try {
        setups.set(date, prepareDay(ctx, date, runner));
      } catch (error) {
        if (!(error instanceof MissingDuel)) throw error;
        const id = `${error.job.seedString}|${error.job.k}`;
        need.set(id, error.job);
        owners.set(id, date);
      }
    }
    if (need.size === 0) break;
    const jobs: DuelJob[] = [];
    const order: { id: string; job: DuelJob }[] = [];
    for (const [id, first] of need) {
      order.push({ id, job: first });
      for (let runIndex = 0; runIndex < runs; runIndex++) jobs.push({ ...first, runIndex });
    }
    onProgress?.({ round, waiting: need.size, candidates: candidates.length });
    const { outcomes, stats } = await pool.rate(jobs);
    total.busyMs += stats.busyMs;
    total.wallMs += stats.wallMs;
    total.duels += stats.duels;
    let at = 0;
    for (const { id, job } of order) {
      let wins = 0;
      for (let runIndex = 0; runIndex < runs; runIndex++) {
        const outcome = outcomes[at++] as DuelOutcome;
        cache.set(key(job.seedString, job.k, runIndex), outcome);
        if (outcome.won) wins++;
      }
      const date = owners.get(id) as string;
      candidates.push({ date, k: job.k, winRate: wins / runs });
    }
    round++;
  }
  candidates.sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : a.k - b.k));
  return {
    setups: dates.map((d) => setups.get(d) as DailySetup),
    candidates,
    expertHash: hash,
    duels: total.duels,
    stats: total,
  };
}
